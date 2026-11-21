import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth';
import { getDemoNow, toLocalISO, dateOnly } from '@/lib/time';
import { rebuildReminders, scanReminders } from '@/lib/reminders';
import { reindexMemoryItems } from '@/lib/rag/index';
import { syncTaskMemory as syncMemory, insertUpdate } from '@/lib/task-updates';

// 任务增删改：全部确定性代码，不调 LLM
const VALID_STATUS = ['unclaimed', 'in_progress', 'awaiting_review', 'done'];
// 组员只能把自己的任务改成「进行中 / 待审核」；「已完成」要组长确认（在「任务与回顾」页一键通过）
const MEMBER_STATUS = ['in_progress', 'awaiting_review'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  insertUpdate(id, body.courseId, user.id, { kind: 'created', fromStatus: null, toStatus: ownerId ? 'in_progress' : 'unclaimed', note: null, proposedDue: null }, nowISO);
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
  if (user.role !== 'leader' && body.status && body.status !== task.status && !MEMBER_STATUS.includes(body.status)) {
    return NextResponse.json({ error: '做完了请提交「待审核」，由组长确认完成' }, { status: 403 });
  }
  if (body.dueDate && !DATE_RE.test(body.dueDate)) return NextResponse.json({ error: '日期格式应为 YYYY-MM-DD' }, { status: 400 });

  const nowISO = toLocalISO(getDemoNow());
  const patch: Record<string, unknown> = { lastUpdateAt: nowISO };
  if (body.status) patch.status = body.status;
  if (typeof body.progressNote === 'string') patch.progressNote = body.progressNote.slice(0, 100);
  if (body.ownerId !== undefined) patch.ownerId = body.ownerId || null;
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim().slice(0, 60);
  const dueChanged = body.dueDate !== undefined && (body.dueDate || null) !== task.dueDate;
  if (dueChanged) patch.dueDate = body.dueDate || null;

  if (body.status === 'done' || body.status === 'awaiting_review') patch.blocker = null;

  db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, body.id)).run();
  // 动态留痕：看板拖拽改状态、填进度，和「任务与回顾」页的一键操作进同一条时间线
  if (body.status && body.status !== task.status) {
    insertUpdate(task.id, task.courseId, user.id, { kind: 'status', fromStatus: task.status, toStatus: body.status, note: null, proposedDue: null }, nowISO);
  }
  if (typeof patch.progressNote === 'string' && patch.progressNote && patch.progressNote !== task.progressNote) {
    insertUpdate(task.id, task.courseId, user.id, { kind: 'progress', fromStatus: task.status, toStatus: task.status, note: patch.progressNote as string, proposedDue: null }, nowISO);
  }
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
    tx.delete(schema.taskUpdates).where(eq(schema.taskUpdates.taskId, id)).run();
    tx.delete(schema.memoryItems).where(eq(schema.memoryItems.id, id)).run();
    tx.delete(schema.tasks).where(eq(schema.tasks.id, id)).run();
  });
  return NextResponse.json({ ok: true });
}
