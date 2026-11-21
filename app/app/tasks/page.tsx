import { db, schema } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth';
import { getDemoNow, getDemoNowISO } from '@/lib/time';
import { loadReviewTasks, leaderInbox, loadFeed, courseReview, byUrgency } from '@/lib/review';
import { visibleReminders } from '@/lib/reminders';
import { nudgeMessage, STATUS_LABEL, type TaskStatus } from '@/lib/risk';
import { TaskReview } from '@/components/task-review';

export const dynamic = 'force-dynamic';

export default function TasksPage() {
  const now = getDemoNow();
  const user = getCurrentUser();
  const tasks = loadReviewTasks(now);
  const members = db.select().from(schema.members).all().map((m) => ({ id: m.id, name: m.name, role: m.role }));
  const courses = db.select().from(schema.courses).all();
  const reminderTaskIds = [...new Set(visibleReminders(user).map((r) => r.taskId))];

  // 催办文案：模板，不花钱（和提醒扫描用的是同一个模板）
  const nudges = Object.fromEntries(tasks.map((t) => [t.id, nudgeMessage({
    owner: t.ownerName, course: t.courseName, task: t.title, dueText: t.dueText, status: STATUS_LABEL[t.status as TaskStatus] ?? t.status,
  })]));

  if (user.role === 'leader') {
    return (
      <TaskReview
        mode="leader"
        user={user}
        demoNow={getDemoNowISO()}
        members={members}
        tasks={tasks}
        inbox={leaderInbox(tasks)}
        feed={loadFeed({ limit: 15 })}
        reviews={courses.map((c) => ({ course: { id: c.id, name: c.name, color: c.color }, ...courseReview(c.id, now) }))}
        nudges={nudges}
        reminderTaskIds={reminderTaskIds}
      />
    );
  }

  const mine = tasks.filter((t) => t.ownerId === user.id);
  return (
    <TaskReview
      mode="member"
      user={user}
      demoNow={getDemoNowISO()}
      members={members}
      tasks={tasks}
      mine={mine.filter((t) => t.status !== 'done').sort(byUrgency)}
      doneMine={mine.filter((t) => t.status === 'done').sort((a, b) => (b.lastUpdateAt ?? '').localeCompare(a.lastUpdateAt ?? ''))}
      unclaimed={tasks.filter((t) => !t.ownerId && t.status !== 'done').sort(byUrgency)}
      feed={loadFeed({ limit: 10, ownerId: user.id })}
      nudges={nudges}
      reminderTaskIds={reminderTaskIds}
    />
  );
}
