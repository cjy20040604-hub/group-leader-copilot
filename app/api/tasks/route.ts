import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth';
import { getDemoNow, toLocalISO, dateOnly } from '@/lib/time';
import { rebuildReminders, scanReminders } from '@/lib/reminders';
import { reindexMemoryItems } from '@/lib/rag/index';

// 任务增删改：全部确定性代码，不调 LLM
const VALID_STATUS = ['unclaimed', 'in_progress', 'awaiting_review', 'done'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function memberName(id: string | null) {
  return id ? db.select().from(schema.members).where(eq(schema.members.id, id)).get()?.name ?? '待认领' : '待认领';
}

// 任务在记忆库里有一条同 id 的「待办」条目，问答靠它检索
function syncMemory(taskId: string, rewriteText = true) {
  const t = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!t) return;
  const text = `${t.title}（${memberName(t.ownerId)}，${t.dueDate ?? '日期待定'}）`;
  const existing = db.select().from(schema.memoryItems).where(eq(schema.memoryItems.id, taskId)).get();
  if (existing) {
    const status = t.status === 'done' ? 'done' : 'active';
    db.update(schema.memoryItems).set(rewriteText ? { text, status } : { status }).where(eq(schema.memoryItems.id, taskId)).run();
  } else {
    db.insert(schema.memoryItems).values({
      id: taskId, courseId: t.courseId, meetingId: t.meetingId, meetingDate: dateOnly(t.createdAt),
      type: 'action', text, evidence: null, status: 'active',
    }).run();
  }
}

export async function POST(req: NextRequest) {
  const user = getCurrentUser();
  if (user.role !== 'leader') return NextResponse.json({ error: '只有组长能新建任务' }, { status: 403 });
  const body = await req.json();
  const title = String(body.title ?? '').trim();
  if (!body.courseId || !title) return NextResponse.json({ error: '课程和任务内容必填' }, { status: 400 });
  if (body.dueDate && !DATE_RE.test(body.dueDate)) return NextResponse.json({ error: '日期格式应为 YYYY-MM-DD' }, { status: 400 });
  const course = db.select().from(schema.courses).where(eq(schema.courses.id, body.courseId)).get();
  if (!course) return NextResponse.json({ error: '课程不存在' }, { status: 400 });
  const ownerId = body.ownerId && db.select().from(schema.members).where(eq(schema.members.id, body.ownerId)).get() ? body.ownerId : null;

  const nowISO = toLocalISO(getDemoNow());
  const id = `t-${Date.now()}`;
  db.insert(schema.tasks).values({
    id, courseId: body.courseId, meetingId: 'manual', title: title.slice(0, 60), ownerId,
    dueDate: body.dueDate || null, status: ownerId ? 'in_progress' : 'unclaimed', lastUpdateAt: nowISO, createdAt: nowISO,
  }).run();
  syncMemory(id);
  await reindexMemoryItems([id]);
  scanReminders();
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, body.id)).get();
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 });

  const user = getCurrentUser();
  if (user.role !== 'leader' && task.ownerId !== user.id) {
    return NextResponse.json({ error: '组员只能改自己的任务' }, { status: 403 });
  }
  if (body.status && !VALID_STATUS.includes(body.status)) {
    return NextResponse.json({ error: '非法状态' }, { status: 400 });
  }
  if (user.role !== 'leader' && (body.title !== undefined || body.dueDate !== undefined || body.ownerId !== undefined)) {
    return NextResponse.json({ error: '任务内容、DDL、负责人只有组长能改' }, { status: 403 });
  }
  if (body.dueDate && !DATE_RE.test(body.dueDate)) return NextResponse.json({ error: '日期格式应为 YYYY-MM-DD' }, { status: 400 });

  const patch: Record<string, unknown> = { lastUpdateAt: toLocalISO(getDemoNow()) };
  if (body.status) patch.status = body.status;
  if (typeof body.progressNote === 'string') patch.progressNote = body.progressNote.slice(0, 100);
  if (body.ownerId !== undefined) patch.ownerId = body.ownerId || null;
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim().slice(0, 60);
  const dueChanged = body.dueDate !== undefined && (body.dueDate || null) !== task.dueDate;
  if (dueChanged) patch.dueDate = body.dueDate || null;

  db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, body.id)).run();
  const contentChanged = Boolean(patch.title) || patch.ownerId !== undefined || dueChanged;
  syncMemory(body.id, contentChanged);
  if (contentChanged) await reindexMemoryItems([body.id]);
  if (dueChanged) rebuildReminders(body.id); // 改了 DDL：旧提醒作废，按新日期重建
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (getCurrentUser().role !== 'leader') return NextResponse.json({ error: '只有组长能删除任务' }, { status: 403 });
  const { id } = await req.json();
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 });
  db.transaction((tx) => {
    tx.delete(schema.reminders).where(eq(schema.reminders.taskId, id)).run();
    tx.delete(schema.memoryItems).where(eq(schema.memoryItems.id, id)).run();
    tx.delete(schema.tasks).where(eq(schema.tasks.id, id)).run();
  });
  return NextResponse.json({ ok: true });
}
