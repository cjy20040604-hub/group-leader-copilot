import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getDemoNow, toLocalISO, dateOnly } from '@/lib/time';
import { applyTaskAction, type TaskAction, type NewUpdate, type FlowUser, type PendingExtension } from '@/lib/task-flow';
import { rebuildReminders, scanReminders } from '@/lib/reminders';
import { reindexMemoryItems } from '@/lib/rag/index';

// 任务动态落库 + 记忆库同步（确定性代码，不调 LLM）

function memberName(id: string | null) {
  return id ? db.select().from(schema.members).where(eq(schema.members.id, id)).get()?.name ?? '待认领' : '待认领';
}

// 任务在记忆库里有一条同 id 的「待办」条目，问答靠它检索
export function syncTaskMemory(taskId: string, rewriteText = true) {
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

// id 按真实写入顺序递增：演示时间（DEMO_NOW）不动，同一秒里的几次操作也能按先后排
let seq = 0;
export function newUpdateId(_now?: string) {
  seq = (seq + 1) % 1000;
  return `u-${Date.now()}-${String(seq).padStart(3, '0')}`;
}

export function insertUpdate(taskId: string, courseId: string, actorId: string, u: NewUpdate, createdAt: string) {
  db.insert(schema.taskUpdates).values({
    id: newUpdateId(createdAt), taskId, courseId, actorId, kind: u.kind,
    fromStatus: u.fromStatus, toStatus: u.toStatus, note: u.note, proposedDue: u.proposedDue,
    resolved: u.kind === 'extension_request' ? 0 : 1, createdAt,
  }).run();
}

export function pendingExtension(taskId: string): PendingExtension | null {
  const row = db.select().from(schema.taskUpdates)
    .where(and(eq(schema.taskUpdates.taskId, taskId), eq(schema.taskUpdates.kind, 'extension_request'), eq(schema.taskUpdates.resolved, 0)))
    .orderBy(desc(schema.taskUpdates.createdAt)).get();
  return row && row.proposedDue ? { id: row.id, proposedDue: row.proposedDue } : null;
}

export async function recordTaskAction(taskId: string, user: FlowUser, action: TaskAction):
  Promise<{ ok: true } | { ok: false; error: string; code: number }> {
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) return { ok: false, error: '任务不存在', code: 404 };
  const now = toLocalISO(getDemoNow());
  const res = applyTaskAction(task, user, action, { today: dateOnly(now), pending: pendingExtension(taskId) });
  if (!res.ok) return res;

  db.transaction((tx) => {
    tx.update(schema.tasks).set({ ...res.patch, lastUpdateAt: now }).where(eq(schema.tasks.id, taskId)).run();
    if (res.resolveUpdateId) {
      tx.update(schema.taskUpdates).set({ resolved: 1 }).where(eq(schema.taskUpdates.id, res.resolveUpdateId)).run();
    }
    tx.insert(schema.taskUpdates).values({
      id: newUpdateId(now), taskId, courseId: task.courseId, actorId: user.id, kind: res.update.kind,
      fromStatus: res.update.fromStatus, toStatus: res.update.toStatus, note: res.update.note,
      proposedDue: res.update.proposedDue, resolved: res.update.kind === 'extension_request' ? 0 : 1, createdAt: now,
    }).run();
  });

  const contentChanged = res.patch.ownerId !== undefined || res.dueChanged;
  syncTaskMemory(taskId, contentChanged);
  if (contentChanged) await reindexMemoryItems([taskId]);
  if (res.dueChanged) rebuildReminders(taskId); // 批了延期：旧提醒作废，按新 DDL 重建
  else scanReminders();
  return { ok: true };
}
