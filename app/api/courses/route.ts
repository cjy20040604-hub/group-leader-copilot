import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth';

// 课程/小组新建：确定性 CRUD，不调 LLM
const COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2'];

export async function POST(req: NextRequest) {
  // 谁都能新建小组：建的人就是这个组的组长（同一个人可以在别的课里只是组员）
  const user = getCurrentUser();
  const body = await req.json();
  const name = String(body.name ?? '').trim();
  if (!name || name.length > 30) return NextResponse.json({ error: '名称必填，且不超过 30 字' }, { status: 400 });
  const all = db.select().from(schema.courses).all();
  if (all.some((c) => c.name === name)) return NextResponse.json({ error: '已有同名的课程/小组' }, { status: 400 });
  const id = `c-${Date.now()}`;
  const color = COLORS[all.length % COLORS.length];
  db.insert(schema.courses).values({ id, name, color }).run();
  const people = new Set(db.select().from(schema.members).all().map((m) => m.id));
  const memberIds: string[] = Array.isArray(body.memberIds) ? body.memberIds.filter((m: unknown) => typeof m === 'string' && people.has(m) && m !== user.id) : [];
  db.insert(schema.courseMembers).values([{ courseId: id, memberId: user.id, role: 'leader' }, ...memberIds.map((m) => ({ courseId: id, memberId: m, role: 'member' }))]).run();
  return NextResponse.json({ ok: true, id, name, color });
}