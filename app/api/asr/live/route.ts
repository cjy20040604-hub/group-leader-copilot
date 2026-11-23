import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { isMock, transcribeSegment } from '@/lib/llm';
import { ASR_MAX_BYTES, ASR_MAX_SECONDS, base64Bytes } from '@/lib/live/asr-request';
import { getPlan, realtimeUsedForQuota, canRecord } from '@/lib/plans';
import { courseRoster } from '@/lib/membership';
import { getSetting, setSetting } from '@/lib/time';

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
  // 实时转写额度：专业版每组每学期 8 小时 + 加时包；其他档位只有加时包（已确认的会 + 这场还没结束的会一起算）
  // 用完返回 402 code 'quota'：前端不中断会议，改成只在本机录音，散会后整理
  const courseId = String(body.courseId ?? '');
  const sessionId = typeof body.sessionId === 'string' && /^m-live-\d+$/.test(body.sessionId) ? body.sessionId : null;
  const sessionSeconds = sessionId ? db.select().from(schema.usageLog).all().filter((l) => l.feature === 'asr' && l.meetingId === sessionId).reduce((a, l) => a + (l.audioSeconds ?? 0), 0) : 0;
  // 记下这场会属于哪门课：没确认成纪要、中途关掉页面，用掉的秒数也算进额度
  if (sessionId && courseId && !getSetting(`live_course:${sessionId}`)) setSetting(`live_course:${sessionId}`, courseId);
  const plan = getPlan(courseId);
  const allowed = canRecord(plan.tier, realtimeUsedForQuota(courseId) + sessionSeconds, seconds, plan.addonSeconds);
  if (!allowed.ok) return NextResponse.json({ error: allowed.reason, code: 'quota' }, { status: 402 });

  // 识别上下文：课程名 + 本组名单（人名、别名）+ 本课常用词（任务名、决议），提高「浩然」「ER 图」这类词的识别率
  // 2026-11-21 真实联调里「ER 图」被识别成「样图」，就是上下文里缺了领域词
  const course = courseId ? db.select().from(schema.courses).where(eq(schema.courses.id, courseId)).get() : null;
  const names = (courseId ? courseRoster(courseId) : []).flatMap((m) => [m.name, ...m.aliases]);
  const terms = courseId ? [...new Set([
    ...db.select().from(schema.tasks).where(eq(schema.tasks.courseId, courseId)).all().map((t) => t.title),
    ...db.select().from(schema.memoryItems).where(eq(schema.memoryItems.courseId, courseId)).all().filter((m) => m.type === 'decision').map((m) => m.text),
  ])].join('；').slice(0, 300) : '';
  const context = `这是一场大学小组作业讨论会${course ? `，课程：${course.name}` : ''}。参会人：${names.join('、')}。${terms ? `这门课常说的词：${terms}。` : ''}`;
  try {
    const r = await transcribeSegment(audio, seconds, { context, meetingId: sessionId });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: `转写失败：${(e as Error).message}` }, { status: 502 });
  }
}
