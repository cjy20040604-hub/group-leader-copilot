import { NextRequest, NextResponse } from 'next/server';
import { isMock, logUsage, asrModelName } from '@/lib/llm';
import { asrCostFor, asrPrice } from '@/config/pricing';
import { setSetting } from '@/lib/time';

// 会议结束：① 把转写存成草稿，跳到纪要整理页自动处理；② Mock 演示录音没真调语音模型，
// 按「这段会如果真录音」的时长记一条 ASR 估算，成本看板才看得到这块（真实模式每段已在 /api/asr/live 记过）
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const transcript = String(body.transcript ?? '').slice(0, 200_000);
  const sessionId = typeof body.sessionId === 'string' && /^m-live-\d+$/.test(body.sessionId) ? body.sessionId : null;
  if (!transcript.trim() || !sessionId || !body.courseId) return NextResponse.json({ error: '没有可整理的转写' }, { status: 400 });
  const seconds = Math.max(0, Math.min(4 * 3600, Math.round(Number(body.seconds ?? 0))));
  const source = body.source === 'mic' ? 'mic' : 'demo';
  setSetting('live_draft', JSON.stringify({
    courseId: String(body.courseId), date: String(body.date ?? ''), transcript, sessionId, source, seconds,
    lines: Number(body.lines ?? 0), hints: Number(body.hints ?? 0),
  }));

  if (source !== 'demo' || !isMock() || seconds === 0) return NextResponse.json({ ok: true, logged: false });
  const model = asrModelName() || 'qwen3-asr-flash';
  const cost = asrCostFor(model, seconds);
  logUsage({ model, audioSeconds: seconds, feature: 'asr', cost, meetingId: sessionId });
  return NextResponse.json({ ok: true, logged: true, seconds, cost, priceNote: asrPrice(model).note });
}
