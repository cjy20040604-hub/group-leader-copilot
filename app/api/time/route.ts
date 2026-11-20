import { NextRequest, NextResponse } from 'next/server';
import { shiftDemoNow, resetDemoNow, getDemoNowISO } from '@/lib/time';
import { scanReminders } from '@/lib/reminders';
import { isLeader } from '@/lib/auth';

export async function GET() {
  return NextResponse.json({ demoNow: getDemoNowISO() });
}

export async function POST(req: NextRequest) {
  if (!isLeader()) return NextResponse.json({ error: '只有组长能操作时间快进' }, { status: 403 });
  const body = await req.json();
  if (body.action === 'reset') resetDemoNow();
  else if (body.action === 'shift' && [1, 3].includes(body.days)) shiftDemoNow(body.days);
  else return NextResponse.json({ error: '非法操作' }, { status: 400 });
  const { created } = scanReminders();
  return NextResponse.json({ demoNow: getDemoNowISO(), remindersCreated: created });
}