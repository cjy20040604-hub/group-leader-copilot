import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth';

// 课程/小组新建：确定性 CRUD，不调 LLM
const COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2'];

export async function POST(req: NextRequest) {
  if (getCurrentUser().role !== 'leader') return NextResponse.json({ error: '只有组长能新建课程/小组' }, { status: 403 });
  const body = await req.json();
  const name = String(body.name ?? '').trim();
  if (!name || name.length > 30) return NextResponse.json({ error: '名称必填，且不超过 30 字' }, { status: 400 });
  const all = db.select().from(schema.courses).all();
  if (all.some((c) => c.name === name)) return NextResponse.json({ error: '已有同名的课程/小组' }, { status: 400 });
  const id = `c-${Date.now()}`;
  db.insert(schema.courses).values({ id, name, color: COLORS[all.length % COLORS.length] }).run();
  return NextResponse.json({ ok: true, id });
}