import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { answerQuestion } from '@/lib/rag/answer';

export async function POST(req: NextRequest) {
  const { courseId, question } = await req.json();
  if (!courseId || !question?.trim()) return NextResponse.json({ error: '先选课程再提问' }, { status: 400 });
  const res = await answerQuestion(courseId, question.trim());
  // 出处只能来自本课程：记忆条目 + 原文分块（L2）
  const memoryRows = res.citations.length
    ? db.select().from(schema.memoryItems)
      .where(and(eq(schema.memoryItems.courseId, courseId), inArray(schema.memoryItems.id, res.citations))).all()
    : [];
  const chunkRows = res.citations.length
    ? db.select().from(schema.transcriptChunks)
      .where(and(eq(schema.transcriptChunks.courseId, courseId), inArray(schema.transcriptChunks.id, res.citations))).all()
    : [];
  const meetingDate = (id: string) => db.select().from(schema.meetings).where(eq(schema.meetings.id, id)).get()?.date ?? '';
  const citationRows = [
    ...memoryRows.map(({ embedding: _e, ...r }) => r),
    ...chunkRows.map((c) => {
      const quote = res.quotes?.[c.id] ?? c.text.split('\n')[0];
      return { id: c.id, meetingId: c.meetingId, meetingDate: meetingDate(c.meetingId), type: 'transcript', text: quote, evidence: quote, status: 'active' };
    }),
  ];
  return NextResponse.json({ ...res, results: undefined, chunks: undefined, citationRows });
}
