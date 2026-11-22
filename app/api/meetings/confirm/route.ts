import { NextRequest, NextResponse } from 'next/server';
import { confirmMeeting, type Draft } from '@/lib/pipeline';
import { canLead } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!canLead((body.draft as Draft)?.courseId)) return NextResponse.json({ error: '只有这个小组的组长能确认纪要' }, { status: 403 });
    const result = await confirmMeeting(body.draft as Draft, body.edits);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}