import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth';
import { ledCourseIds } from '@/lib/membership';
import { parseAliases } from '@/lib/roster';
import { reindexMemoryItems } from '@/lib/rag/index';
import { dueText, nudgeMessage, STATUS_LABEL, type TaskStatus } from '@/lib/risk';

// 花名册增改：确定性 CRUD，不调 LLM。改名要同步记忆条目与催办文案里的负责人名字
const ROLES = ['leader', 'member'];

function propagateRename(memberId: string, name: string): string[] {
  const tasks = db.select().from(schema.tasks).where(eq(schema.tasks.ownerId, memberId)).all();
  const courses = db.select().from(schema.courses).all();
  const reindexIds: string[] = [];
  for (const t of tasks) {
    const mem = db.select().from(schema.memoryItems).where(eq(schema.memoryItems.id, t.id)).get();
    if (mem) {
      db.update(schema.memoryItems).set({ text: `${t.title}（${name}，${t.dueDate ?? '日期待定'}）` }).where(eq(schema.memoryItems.id, t.id)).run();
      reindexIds.push(t.id);
    }
    const course = courses.find((c) => c.id === t.courseId)?.name ?? t.courseId;
    for (const r of db.select().from(schema.reminders).where(eq(schema.reminders.taskId, t.id)).all()) {
      const message = nudgeMessage({
        owner: name, course, task: t.title,
        dueText: dueText(t.dueDate ?? r.fireDate, new Date(`${r.fireDate}T09:00:00`)).replace(/（.*）/, ''),
        status: STATUS_LABEL[t.status as TaskStatus],
      });
      db.update(schema.reminders).set({ message }).where(eq(schema.reminders.id, r.id)).run();
    }
  }
  return reindexIds;
}

export async function POST(req: NextRequest) {
  if (getCurrentUser().role !== 'leader') return NextResponse.json({ error: '只有组长能改花名册' }, { status: 403 });
  const body = await req.json();
  const name = String(body.name ?? '').trim();
  if (!name || name.length > 20) return NextResponse.json({ error: '姓名必填，且不超过 20 字' }, { status: 400 });
  if (db.select().from(schema.members).all().some((m) => m.name === name)) return NextResponse.json({ error: '已有同名成员' }, { status: 400 });
  const aliases = parseAliases(String(body.aliases ?? '')).filter((a) => a !== name);
  const id = `u-${Date.now()}`;
  db.insert(schema.members).values({ id, name, role: 'member', aliasesJson: JSON.stringify(aliases) }).run();
  // 加人时顺手放进你当组长的小组（只能放进自己当组长的组）
  const led = new Set(ledCourseIds(getCurrentUser().id));
  const courseIds: string[] = Array.isArray(body.courseIds) ? body.courseIds.filter((c: unknown) => typeof c === 'string' && led.has(c)) : [];
  if (courseIds.length) db.insert(schema.courseMembers).values(courseIds.map((c) => ({ courseId: c, memberId: id, role: 'member' }))).run();
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(req: NextRequest) {
  if (getCurrentUser().role !== 'leader') return NextResponse.json({ error: '只有组长能改花名册' }, { status: 403 });
  const body = await req.json();
  const member = db.select().from(schema.members).where(eq(schema.members.id, body.id)).get();
  if (!member) return NextResponse.json({ error: '成员不存在' }, { status: 404 });

  const patch: Record<string, unknown> = {};
  let renamed = false;
  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (!name || name.length > 20) return NextResponse.json({ error: '姓名必填，且不超过 20 字' }, { status: 400 });
    if (db.select().from(schema.members).all().some((m) => m.name === name && m.id !== member.id)) return NextResponse.json({ error: '已有同名成员' }, { status: 400 });
    renamed = name !== member.name;
    patch.name = name;
  }
  if (typeof body.aliases === 'string') {
    patch.aliasesJson = JSON.stringify(parseAliases(body.aliases).filter((a) => a !== (patch.name ?? member.name)));
  }
  // 角色按课程设置（/api/course-members），这里只改姓名和昵称
  if (!Object.keys(patch).length) return NextResponse.json({ error: '没有要改的字段' }, { status: 400 });

  db.update(schema.members).set(patch).where(eq(schema.members.id, member.id)).run();
  if (renamed) {
    const ids = propagateRename(member.id, patch.name as string);
    if (ids.length) await reindexMemoryItems(ids);
  }
  return NextResponse.json({ ok: true });
}