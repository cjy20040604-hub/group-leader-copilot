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
  return NextResponse.json({ ok: true });
}