import { NextRequest, NextResponse } from 'next/server';
import { detectDuplicateAgenda } from '@/lib/rag/search';
import { recordMetric } from '@/lib/metrics-events';

export async function POST(req: NextRequest) {
  const { courseId, agenda } = await req.json();
  if (!courseId || !agenda?.trim()) return NextResponse.json({ matches: [] });
  const matches = await detectDuplicateAgenda(courseId, agenda.trim());
  // 成功指标：会前议程撞上已有决议 = 拦下一次重复讨论
  if (matches[0]) recordMetric('dup_blocked', { courseId, detail: `会前议程：${agenda.trim()} → ${matches[0].text}` });
  return NextResponse.json({ matches });
}
