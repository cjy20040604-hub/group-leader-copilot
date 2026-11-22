import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { isMock, transcribeSegment } from '@/lib/llm';
import { ASR_MAX_BYTES, ASR_MAX_SECONDS, base64Bytes } from '@/lib/live/asr-request';

// 会议室实时转写：浏览器按静音切好一段 16kHz WAV（Base64）→ 百炼 ASR → 文字
// 声音转文字只能靠模型（AI）；什么时候开录、哪段送去识别是规则（浏览器端 VAD，Auto）
export async function POST(req: NextRequest) {
  if (isMock()) {
    return NextResponse.json({ error: '离线演示不转文字，请用「演示录音」' }, { status: 409 });
  }
  const body = await req.json().catch(() => ({}));
  const audio = String(body.audio ?? '');
  const seconds = Number(body.seconds ?? 0);
  if (!audio) return NextResponse.json({ error: '没有音频' }, { status: 400 });
  if (base64Bytes(audio) > ASR_MAX_BYTES || seconds > ASR_MAX_SECONDS) {
    return NextResponse.json({ error: '单段音频超过 10 MB 或 5 分钟' }, { status: 413 });
  }
  // 识别上下文：课程名 + 花名册（人名、别名），提高「浩然」「ER 图」这类词的识别率
  const course = body.courseId ? db.select().from(schema.courses).where(eq(schema.courses.id, body.courseId)).get() : null;
  const members = db.select().from(schema.members).all();
  const names = members.flatMap((m) => [m.name, ...(JSON.parse(m.aliasesJson) as string[])]);
  const context = `这是一场大学小组作业讨论会${course ? `，课程：${course.name}` : ''}。参会人：${names.join('、')}。`;
  try {
    const r = await transcribeSegment(audio, seconds, { context, meetingId: typeof body.sessionId === 'string' ? body.sessionId : null });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: `转写失败：${(e as Error).message}` }, { status: 502 });
  }
}
