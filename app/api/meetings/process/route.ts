import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { processMeeting } from '@/lib/pipeline';
import { db, schema } from '@/lib/db/client';
import { getSetting } from '@/lib/time';
import { getPlan, meetingsUsed, canAddMeeting } from '@/lib/plans';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const quota = canAddMeeting(getPlan(String(body.courseId ?? '')).tier, meetingsUsed(String(body.courseId ?? '')));
    if (!quota.ok) return NextResponse.json({ error: quota.reason, code: 'quota' }, { status: 402 });
    const draft = await processMeeting({
      courseId: body.courseId,
      date: body.date,
      transcript: body.transcript ?? '',
      title: body.title,
      meetingId: typeof body.meetingId === 'string' ? body.meetingId : undefined,
    });
    // 会议室草稿被整理过了就清掉，免得再进页面重复整理
    if (typeof body.meetingId === 'string' && getSetting('live_draft')?.includes(`"sessionId":"${body.meetingId}"`)) {
      db.delete(schema.settings).where(eq(schema.settings.key, 'live_draft')).run();
    }
    return NextResponse.json(draft);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}