import Link from 'next/link';
import { db, schema } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth';
import { getDemoNow, toLocalISO, dateOnly, formatCN } from '@/lib/time';
import { listScheduled } from '@/lib/schedule';
import { ScheduleCard, QuickNewTask, DeleteTaskButton } from '@/components/home-actions';
import { visibleReminders } from '@/lib/reminders';
import { riskLevel, dueText, STATUS_LABEL, RISK_LABEL, type TaskStatus } from '@/lib/risk';
import { Card, Badge, EmptyState } from '@/components/ui';
import { loadReviewTasks, leaderInbox, courseReview } from '@/lib/review';
import { NewCourseCard } from '@/components/new-course-card';
import { memberLoads } from '@/lib/multi-course';
import { MemberLoadPanel } from '@/components/week-board';
import { ReminderChip } from '@/components/reminder-card';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const now = getDemoNow();
  const user = getCurrentUser();
  const courses = db.select().from(schema.courses).all();
  const members = db.select().from(schema.members).all();
  const allTasks = db.select().from(schema.tasks).all();
  const meetings = db.select().from(schema.meetings).all();
  const reminders = visibleReminders(user);
  const today = dateOnly(toLocalISO(now));

  const visible = user.role === 'leader' ? allTasks : allTasks.filter((t) => t.ownerId === user.id);
  const open = visible.filter((t) => t.status !== 'done');
  const inbox = user.role === 'leader' ? leaderInbox(loadReviewTasks(now)) : null;
  const ranked = open
    .map((t) => ({ ...t, risk: riskLevel({ dueDate: t.dueDate, status: t.status as TaskStatus, lastUpdateAt: t.lastUpdateAt, blocked: Boolean(t.blocker) }, now) }))
    .sort((a, b) => {
      const order = { red: 0, yellow: 1, green: 2 };
      return order[a.risk] - order[b.risk] || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
    });
  const top = ranked[0];

  const scheduled = listScheduled(today);
  const isLeader = user.role === 'leader';
  const courseOpts = courses.map((c) => ({ id: c.id, name: c.name, color: c.color }));

  const topReminder = top ? reminders.find((r) => r.taskId === top.id) : undefined;
  const loads = user.role === 'leader' ? memberLoads(now) : [];
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? '待认领';
  const courseOf = (id: string) => courses.find((c) => c.id === id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">本周我要盯的事</h1>
        <p className="mt-1 text-sm text-slate-500">
          {user.role === 'leader' ? `${user.name}，${courses.length} 门课并行，这一屏帮你装下所有进度。` : `${user.name}，这是你自己的任务。`}
        </p>
      </div>

      {inbox && inbox.total > 0 && (
        <Link href="/app/tasks" className="block">
          <Card className="flex flex-wrap items-center gap-2 border-brand-200 bg-brand-50 p-3 hover:border-brand-500">
            <p className="text-sm font-medium text-brand-800">📥 待我处理 {inbox.total} 件</p>
            <p className="flex-1 text-xs text-brand-700">
              {[['等确认完成', inbox.review.length], ['延期申请', inbox.extensions.length], ['卡住了', inbox.blocked.length], ['48 小时没动静', inbox.silent.length], ['没人认领', inbox.unclaimed.length]]
                .filter(([, n]) => Number(n) > 0).map(([l, n]) => `${l} ${n}`).join(' · ')}
            </p>
            <span className="text-xs text-brand-700">去处理 →</span>
          </Card>
        </Link>
      )}
      {!inbox && open.length > 0 && (
        <Link href="/app/tasks" className="block">
          <Card className="flex items-center gap-2 border-brand-200 bg-brand-50 p-3 hover:border-brand-500">
            <p className="flex-1 text-sm text-brand-800">你手上有 {open.length} 件待办：做完、卡住、要延期，点一下就同步给组长</p>
            <span className="text-xs text-brand-700">去更新 →</span>
          </Card>
        </Link>
      )}

      <section aria-label="最紧急的事">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-sm font-semibold text-slate-700">🚨 最紧急的事</h2>
          {ranked.length > 1 && <Link href="/app/tasks" className="text-xs text-brand-600 hover:underline">全部 {ranked.length} 件 →</Link>}
          {isLeader && <QuickNewTask courses={courseOpts} members={members.map((m) => ({ id: m.id, name: m.name }))} />}
        </div>
        {!top ? (
          <EmptyState title="没有未完成任务" hint="新建一个，或者开会让 AI 从纪要里抽" />
        ) : (
          <Card className="flex flex-wrap items-center gap-3 p-3">
            <span className="text-lg" aria-label={`风险 ${top.risk}`}>{RISK_LABEL[top.risk]}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{top.title}</p>
              <p className="text-xs text-slate-500">
                {nameOf(top.ownerId)} · {dueText(top.dueDate, now)} · {STATUS_LABEL[top.status as TaskStatus]}
                {top.progressNote ? ` · 「${top.progressNote}」` : ''}
              </p>
            </div>
            <Badge tone="blue">{courseOf(top.courseId)?.name}</Badge>
            <Link href={`/app/c/${top.courseId}`} className="text-xs text-brand-600 hover:underline">看板 →</Link>
            {isLeader && <DeleteTaskButton id={top.id} title={top.title} />}
            {topReminder && <ReminderChip isLeader={isLeader}
              r={{ id: topReminder.id, message: topReminder.message, kind: topReminder.kind, fireDate: topReminder.fireDate, respondedAt: topReminder.respondedAt, response: topReminder.response }} />}
          </Card>
        )}
      </section>

      {isLeader && <MemberLoadPanel loads={loads} />}

      <ScheduleCard courses={courseOpts} items={scheduled.map((m) => ({ id: m.id, courseId: m.courseId, date: m.date }))} today={today} isLeader={isLeader} />

      <section aria-label="课程入口">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">📚 我的课程</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {courses.map((c) => {
            const cOpenTasks = allTasks.filter((t) => t.courseId === c.id && t.status !== 'done');
            const cOpen = cOpenTasks.length;
            const cMeetings = meetings.filter((m) => m.courseId === c.id).length;
            const cRisk = cOpenTasks.map((t) => riskLevel({ dueDate: t.dueDate, status: t.status as TaskStatus, lastUpdateAt: t.lastUpdateAt, blocked: Boolean(t.blocker) }, now));
            const cReview = courseReview(c.id, now);
            const cNext = scheduled.find((m) => m.courseId === c.id);
            return (
              <Link key={c.id} href={`/app/c/${c.id}`}>
                <Card className="p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: c.color }} aria-hidden />
                    <p className="font-medium">{c.name}</p>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{cMeetings} 场纪要 · {cOpen} 个未完成任务</p>
                  <p className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-slate-500">
                    {cRisk.includes('red') && <span className="text-red-600">🔴 {cRisk.filter((r) => r === 'red').length}</span>}
                    {cRisk.includes('yellow') && <span className="text-yellow-700">🟡 {cRisk.filter((r) => r === 'yellow').length}</span>}
                    <span>带到下次会 {cReview.carry.length} 条</span>
                    {cNext && <span>下次会 {formatCN(cNext.date)}</span>}
                  </p>
                </Card>
              </Link>
            );
          })}
          {user.role === 'leader' && <NewCourseCard />}
        </div>
      </section>
    </div>
  );
}