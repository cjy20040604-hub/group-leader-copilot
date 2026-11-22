import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { getDemoNow, dateOnly, toLocalISO } from '@/lib/time';
import { getCurrentUser } from '@/lib/auth';
import { roleIn } from '@/lib/membership';

// 拒答后的「加入下次议程」：确定性写入，不调 LLM
export async function POST(req: NextRequest) {
  const { courseId, question } = await req.json();
  if (!courseId || !question?.trim()) return NextResponse.json({ error: '参数缺失' }, { status: 400 });
  if (!roleIn(getCurrentUser().id, courseId)) return NextResponse.json({ error: '你不在这个小组' }, { status: 403 });
  const now = getDemoNow();
  const id = `agenda-${Date.now()}`;
  db.insert(schema.memoryItems).values({
    id, courseId, meetingId: 'agenda', meetingDate: dateOnly(toLocalISO(now)),
    type: 'open_question', text: `下次议程：${question.trim()}`, status: 'active',
  }).run();
  return NextResponse.json({ ok: true, id });
}