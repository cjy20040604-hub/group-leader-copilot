import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import { toBlob } from './embed';
import { embedTexts } from '@/lib/llm';

// 原文分块：按说话人轮次聚合，约 400 tokens（≈500 字）/块，重叠 50 字
export function chunkTranscript(transcript: string): { text: string; startOffset: number }[] {
  const lines = transcript.split('\n').filter((l) => l.trim());
  const chunks: { text: string; startOffset: number }[] = [];
  let buf = '';
  let bufStart = 0;
  let offset = 0;
  const lineOffsets: number[] = [];
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }
  lines.forEach((line, i) => {
    if (!buf) bufStart = lineOffsets[i];
    buf += (buf ? '\n' : '') + line;
    if (buf.length >= 500) {
      chunks.push({ text: buf, startOffset: bufStart });
      buf = buf.slice(-50);
      bufStart = lineOffsets[i] + line.length - 50;
    }
  });
  if (buf.trim()) chunks.push({ text: buf, startOffset: Math.max(bufStart, 0) });
  return chunks;
}

export async function indexMeeting(meetingId: string): Promise<{ memoryCount: number; chunkCount: number; tokens: number }> {
  const meeting = db.select().from(schema.meetings).where(eq(schema.meetings.id, meetingId)).get();
  if (!meeting) throw new Error(`meeting ${meetingId} not found`);

  const mems = db.select().from(schema.memoryItems).where(eq(schema.memoryItems.meetingId, meetingId)).all();
  const chunks = chunkTranscript(meeting.transcript);

  const memTexts = mems.map((m) => m.text);
  const chunkTexts = chunks.map((c) => c.text);
  const allTexts = [...memTexts, ...chunkTexts];
  const vectors = await embedTexts(allTexts, { feature: 'index', meetingId });

  mems.forEach((m, i) => {
    db.update(schema.memoryItems).set({ embedding: toBlob(vectors[i]) }).where(eq(schema.memoryItems.id, m.id)).run();
  });

  db.delete(schema.transcriptChunks).where(eq(schema.transcriptChunks.meetingId, meetingId)).run();
  chunks.forEach((c, i) => {
    db.insert(schema.transcriptChunks)
      .values({
        id: `${meetingId}-c${i + 1}`,
        meetingId,
        courseId: meeting.courseId,
        startOffset: c.startOffset,
        text: c.text,
        embedding: toBlob(vectors[memTexts.length + i]),
      })
      .run();
  });

  const tokens = allTexts.reduce((s, t) => s + t.length, 0);
  return { memoryCount: mems.length, chunkCount: chunks.length, tokens };
}
// 单条记忆条目（手动新建/修改的任务）重新算向量，问答才能检索到
export async function reindexMemoryItems(ids: string[]): Promise<void> {
  const rows = ids.map((id) => db.select().from(schema.memoryItems).where(eq(schema.memoryItems.id, id)).get()).filter((r) => !!r);
  if (!rows.length) return;
  const vectors = await embedTexts(rows.map((r) => r!.text), { feature: 'index' });
  rows.forEach((r, i) => db.update(schema.memoryItems).set({ embedding: toBlob(vectors[i]) }).where(eq(schema.memoryItems.id, r!.id)).run());
}
