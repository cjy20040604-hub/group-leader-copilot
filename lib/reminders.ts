import { db, schema } from '@/lib/db/client';
import { eq, ne } from 'drizzle-orm';
import { getDemoNow, dateOnly, toLocalISO } from '@/lib/time';
import { dueText, nudgeMessage, STATUS_LABEL, type TaskStatus } from '@/lib/risk';

// 确定性提醒扫描：D-3 / D-1 / 过期第一天，按 (task_id, kind) 幂等
// 文案按「触发那天」写：快进 3 天后补出来的 D-1 提醒仍然写「明天截止」，和过期提醒不再一模一样
// 任务创建之前的触发日不补（今天建、明天截止的任务不会冒出一条「3 天后截止」）
export function scanReminders(): { created: number } {
  const now = getDemoNow();
  const today = dateOnly(toLocalISO(now));
  const openTasks = db.select().from(schema.tasks).where(ne(schema.tasks.status, 'done')).all();
  const courses = db.select().from(schema.courses).all();
  const members = db.select().from(schema.members).all();
  const existing = new Set(db.select().from(schema.reminders).all().map((r) => `${r.taskId}:${r.kind}`));

  let created = 0;
  for (const task of openTasks) {
    if (!task.dueDate) continue;
    const createdDay = dateOnly(task.createdAt);
    const rules = [
      { kind: 'd3', fireDate: shiftDate(task.dueDate, -3) },
      { kind: 'd1', fireDate: shiftDate(task.dueDate, -1) },
      { kind: 'overdue', fireDate: shiftDate(task.dueDate, 1) },
    ];
    for (const rule of rules) {
      if (rule.fireDate > today || rule.fireDate < createdDay) continue;
      const key = `${task.id}:${rule.kind}`;
      if (existing.has(key)) continue;
      const owner = members.find((m) => m.id === task.ownerId)?.name ?? '待认领';
      const course = courses.find((c) => c.id === task.courseId)?.name ?? task.courseId;
      const fireMoment = new Date(`${rule.fireDate}T09:00:00`);
      const message = nudgeMessage({
        owner, course, task: task.title,
        dueText: dueText(task.dueDate, fireMoment).replace(/（.*）/, ''),
        status: STATUS_LABEL[task.status as TaskStatus],
      });
      db.insert(schema.reminders).values({
        id: `${task.id}-${rule.kind}`,
        taskId: task.id,
        kind: rule.kind,
        fireDate: rule.fireDate,
        message,
        createdAt: toLocalISO(now),
      }).run();
      existing.add(key);
      created++;
    }
  }
  return { created };
}

// 改了 DDL：清掉这条任务的旧提醒，按新 DDL 重新扫
export function rebuildReminders(taskId: string) {
  db.delete(schema.reminders).where(eq(schema.reminders.taskId, taskId)).run();
  return scanReminders();
}

// 页面上该显示的提醒：任务还没做完；组员只看自己的
export function visibleReminders(user: { id: string; role: string }) {
  const tasks = new Map(db.select().from(schema.tasks).all().map((t) => [t.id, t]));
  const severity: Record<string, number> = { overdue: 0, d1: 1, d3: 2 };
  return db.select().from(schema.reminders).all()
    .filter((r) => {
      const t = tasks.get(r.taskId);
      return t && t.status !== 'done' && (user.role === 'leader' || t.ownerId === user.id);
    })
    .sort((a, b) => b.fireDate.localeCompare(a.fireDate) || (severity[a.kind] ?? 9) - (severity[b.kind] ?? 9));
}

function shiftDate(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return dateOnly(toLocalISO(d));
}
