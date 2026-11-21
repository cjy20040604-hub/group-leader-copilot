import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { setSetting } from '@/lib/time';

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.current_user) {
    const m = db.select().from(schema.members).where(eq(schema.members.id, body.current_user)).get();
    if (!m) return NextResponse.json({ error: '成员不存在' }, { status: 400 });
    setSetting('current_user', body.current_user);
  }
  // 会议室「进来就自动开录」开关
  if (typeof body.auto_record === 'boolean') setSetting('auto_record', body.auto_record ? 'true' : 'false');
  return NextResponse.json({ ok: true });
}