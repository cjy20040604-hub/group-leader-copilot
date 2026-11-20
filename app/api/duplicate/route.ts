import { NextRequest, NextResponse } from 'next/server';
import { detectDuplicateAgenda } from '@/lib/rag/search';

export async function POST(req: NextRequest) {
  const { courseId, agenda } = await req.json();
  if (!courseId || !agenda?.trim()) return NextResponse.json({ matches: [] });
  const matches = await detectDuplicateAgenda(courseId, agenda.trim());
  return NextResponse.json({ matches });
}