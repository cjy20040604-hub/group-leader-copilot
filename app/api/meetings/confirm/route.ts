import { NextRequest, NextResponse } from 'next/server';
import { confirmMeeting, type Draft } from '@/lib/pipeline';
import { isLeader } from '@/lib/auth';

export async function POST(req: NextRequest) {
  if (!isLeader()) return NextResponse.json({ error: '只有组长能确认纪要' }, { status: 403 });
  try {
    const body = await req.json();
    const result = await confirmMeeting(body.draft as Draft, body.edits);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}