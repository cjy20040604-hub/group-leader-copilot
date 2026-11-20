import { NextRequest, NextResponse } from 'next/server';
import { processMeeting } from '@/lib/pipeline';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const draft = await processMeeting({
      courseId: body.courseId,
      date: body.date,
      transcript: body.transcript ?? '',
      title: body.title,
    });
    return NextResponse.json(draft);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}