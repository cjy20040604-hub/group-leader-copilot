import { NextRequest, NextResponse } from 'next/server';
import { generateBriefing } from '@/lib/rag/briefing';
import { getCurrentUser } from '@/lib/auth';
import { roleIn } from '@/lib/membership';

export async function POST(req: NextRequest) {
  const { courseId } = await req.json();
  if (!courseId) return NextResponse.json({ error: '缺少 courseId' }, { status: 400 });
  if (!roleIn(getCurrentUser().id, courseId)) return NextResponse.json({ error: '你不在这个小组，看不到它的记录' }, { status: 403 });
  const res = await generateBriefing(courseId);
  return NextResponse.json({ ...res, degraded: !res.aiGenerated });
}
