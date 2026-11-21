import { NextRequest, NextResponse } from 'next/server';
import { cueClauses } from '@/lib/live/cues';
import { findSameTopicDecisions } from '@/lib/rag/search';

// 会中「这事定过了」：规则先挑出在提议 / 翻旧账的半句话，再用 embedding 比对本课程现行决议（不调大模型）
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.courseId || !body.text) return NextResponse.json({ hits: [] });
  const hits = [];
  for (const clause of cueClauses(String(body.text))) {
    const found = await findSameTopicDecisions(String(body.courseId), clause, {
      feature: 'live_check', meetingId: typeof body.sessionId === 'string' ? body.sessionId : null,
    });
    if (found[0]) hits.push({ ...found[0], clause });
  }
  return NextResponse.json({ hits });
}
