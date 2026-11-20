import { NextRequest, NextResponse } from 'next/server';
import { generateBriefing } from '@/lib/rag/briefing';

export async function POST(req: NextRequest) {
  const { courseId } = await req.json();
  if (!courseId) return NextResponse.json({ error: '缺少 courseId' }, { status: 400 });
  const res = await generateBriefing(courseId);
  return NextResponse.json({ ...res, degraded: !res.aiGenerated });
}
