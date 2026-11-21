import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getDemoNow } from '@/lib/time';
import { dueText, STATUS_LABEL, type TaskStatus } from '@/lib/risk';
import { ReminderReply } from '@/components/reminder-reply';

export const dynamic = 'force-dynamic';

// 提醒里的回复链接：组员不用打开整个应用，在这一页点一下就把进度告诉组长
export default async function ReminderReplyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reminder = db.select().from(schema.reminders).where(eq(schema.reminders.id, id)).get();
  const task = reminder ? db.select().from(schema.tasks).where(eq(schema.tasks.id, reminder.taskId)).get() : undefined;
  const course = task ? db.select().from(schema.courses).where(eq(schema.courses.id, task.courseId)).get() : undefined;
  const owner = task?.ownerId ? db.select().from(schema.members).where(eq(schema.members.id, task.ownerId)).get() : undefined;
  const now = getDemoNow();

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-10">
      <p className="text-sm font-bold text-brand-700">组长减负 · 进度回复</p>
      {!reminder || !task ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">这条提醒不存在了，可能任务已被删除。<Link href="/app/tasks" className="ml-1 text-brand-600 underline">看全部待办</Link></div>
      ) : (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs text-slate-500">{course?.name} · 负责人：{owner?.name ?? '待认领'}</p>
          <h1 className="text-lg font-bold">{task.title}</h1>
          <p className="text-sm text-slate-600">{task.status === 'done' ? '已完成' : dueText(task.dueDate, now)} · 现在是「{STATUS_LABEL[task.status as TaskStatus] ?? task.status}」</p>
          <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500">提醒原文：{reminder.message}</p>
          <ReminderReply
            reminderId={reminder.id}
            ownerName={owner?.name ?? null}
            done={task.status === 'done'}
            awaiting={task.status === 'awaiting_review'}
            minDate={task.dueDate ?? undefined}
            responded={reminder.response ? `${reminder.response} · ${reminder.respondedAt?.slice(5, 16).replace('T', ' ')}` : null}
          />
          <p className="text-[11px] text-slate-400">演示：打开这个链接就以负责人的身份回复；正式版会用微信 / 钉钉登录确认是本人。</p>
        </div>
      )}
    </main>
  );
}
