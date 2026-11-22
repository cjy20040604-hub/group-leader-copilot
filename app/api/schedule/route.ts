import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { canLead } from '@/lib/auth';
import { getDemoNow, toLocalISO, dateOnly } from '@/lib/time';
import { addScheduled, removeScheduled, DATE_RE } from '@/lib/schedule';

// 安排会议 / 取消安排：确定性代码，不调 LLM；只有组长能改
export async function POST(req: NextRequest) {
  const body = await req.json();
  const courseId = String(body.courseId ?? '');
  if (!canLead(courseId)) return NextResponse.json({ error: '只有这个小组的组长能安排会议' }, { status: 403 });
  const date = String(body.date ?? '');
  if (!DATE_RE.test(date)) return NextResponse.json({ error: '请选择日期' }, { status: 400 });
  if (!db.select().from(schema.courses).where(eq(schema.courses.id, courseId)).get()) return NextResponse.json({ error: '课程不存在' }, { status: 400 });
  const nowISO = toLocalISO(getDemoNow());
  if (date < dateOnly(nowISO)) return NextResponse.json({ error: '不能安排在今天之前' }, { status: 400 });
  return NextResponse.json({ ok: true, id: addScheduled(courseId, date, nowISO) });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? '';
  const item = db.select().from(schema.scheduledMeetings).where(eq(schema.scheduledMeetings.id, id)).get();
  if (item && !canLead(item.courseId)) return NextResponse.json({ error: '只有这个小组的组长能取消会议' }, { status: 403 });
  if (!removeScheduled(id)) return NextResponse.json({ error: '这场会已经不在了' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
