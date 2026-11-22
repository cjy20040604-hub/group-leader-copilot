import Link from 'next/link';
import { db, schema } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth';
import { getDemoNow, toLocalISO, dateOnly, formatCN } from '@/lib/time';
import { listScheduled } from '@/lib/schedule';
import { myCourseIds, ledCourseIds, rosterByCourse } from '@/lib/membership';
import { ScheduleCard, QuickNewTask, DeleteTaskButton } from '@/components/home-actions';
import { visibleReminders } from '@/lib/reminders';
import { riskLevel, dueText, STATUS_LABEL, type TaskStatus } from '@/lib/risk';
import { Card, Badge, EmptyState, PageHeader, SectionTitle, RiskDot } from '@/components/ui';
import { loadReviewTasks, leaderInbox, courseReview } from '@/lib/review';
import { NewCourseCard } from '@/components/new-course-card';
import { memberLoads } from '@/lib/multi-course';
import { MemberLoadPanel } from '@/components/week-board';
import { ReminderChip } from '@/components/reminder-card';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const now = getDemoNow();
  const user = getCurrentUser();
  // 只看自己所在的小组；组长视图只覆盖自己当组长的小组（不同课的组员可以不一样）
  const myIds = myCourseIds(user.id);
  const ledIds = ledCourseIds(user.id);
  const courses = db.select().from(schema.courses).all().filter((c) => myIds.includes(c.id));
  const members = db.select().from(schema.members).all();
  const rosters = rosterByCourse();
  const allTasks = db.select().from(schema.tasks).all().filter((t) => myIds.includes(t.courseId));
  const meetings = db.select().from(schema.meetings).all();
  const reminders = visibleReminders(user);
  const today = dateOnly(toLocalISO(now));

  const visible = allTasks.filter((t) => ledIds.includes(t.courseId) || t.ownerId === user.id);
  const open = visible.filter((t) => t.status !== 'done');
  const inbox = ledIds.length ? leaderInbox(loadReviewTasks(now).filter((t) => ledIds.includes(t.courseId))) : null;
  const ranked = open
    .map((t) => ({ ...t, risk: riskLevel({ dueDate: t.dueDate, status: t.status as TaskStatus, lastUpdateAt: t.lastUpdateAt, blocked: Boolean(t.blocker) }, now) }))
    .sort((a, b) => {
      const order = { red: 0, yellow: 1, green: 2 };
      return order[a.risk] - order[b.risk] || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
    });
  const top = ranked[0];

  const scheduled = listScheduled(today).filter((m) => myIds.includes(m.courseId));
  const isLeader = ledIds.length > 0;
  const courseOpts = courses.map((c) => ({ id: c.id, name: c.name, color: c.color }));
  const ledOpts = courseOpts.filter((c) => ledIds.includes(c.id));

  const topReminder = top ? reminders.find((r) => r.taskId === top.id) : undefined;
  const loads = isLeader ? memberLoads(now, { ledCourseIds: ledIds, myCourseIds: myIds }) : [];
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? '待认领';
  const courseOf = (id: string) => courses.find((c) => c.id === id);

  const inboxParts = inbox ? ([['等确认完成', inbox.review.length], ['延期申请', inbox.extensions.length], ['卡住了', inbox.blocked.length], ['48 小时没动静', inbox.silent.length], ['没人认领', inbox.unclaimed.length]] as const).filter(([, n]) => n > 0) : [];

  return (
    <div className="space-y-10">
      <PageHeader title="本周我要盯的事"
        lede={isLeader ? `${user.name}，你在 ${courses.length} 个小组里，其中 ${ledIds.length} 个当组长。这一页只放要你出手的事。` : `${user.name}，这是你自己的任务。`} />

      {inbox && inbox.total > 0 && (
        <Link href="/app/tasks" className="group block">
          <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 p-5 transition-colors group-hover:border-brand-500">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-medium tabular-nums tracking-tight text-slate-900">{inbox.total}</span>
              <span className="text-sm text-slate-600">件待我处理</span>
            </div>
            <div className="flex flex-1 flex-wrap gap-1.5">
              {inboxParts.map(([l, n]) => <Badge key={l} tone="slate">{l} {n}</Badge>)}
            </div>
            <span className="text-sm font-medium text-brand-600 group-hover:text-brand-700">去处理</span>
          </Card>
        </Link>
      )}
      {!inbox && open.length > 0 && (
        <Link href="/app/tasks" className="group block">
          <Card className="flex items-center gap-4 p-5 transition-colors group-hover:border-brand-500">
            <p className="flex-1 text-sm text-slate-700">你手上有 <b className="tabular-nums text-slate-900">{open.length}</b> 件待办：做完、卡住、要延期，点一下就同步给组长。</p>
            <span className="text-sm font-medium text-brand-600">去更新</span>
          </Card>
        </Link>
      )}

      <section aria-label="最紧急的事">
        <SectionTitle aside={<>
          {ranked.length > 1 && <Link href="/app/tasks" className="text-xs text-slate-500 hover:text-slate-900">全部 {ranked.length} 件</Link>}
          {isLeader && <QuickNewTask courses={ledOpts} rosters={rosters} />}
        </>}>最紧急的事</SectionTitle>
        {!top ? (
          <EmptyState title="没有未完成任务" hint="新建一个，或者开会让 AI 从纪要里抽" />
        ) : (
          <Card className="flex flex-wrap items-center gap-x-4 gap-y-3 p-5">
            <RiskDot level={top.risk} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium text-slate-900">{top.title}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {nameOf(top.ownerId)}，{dueText(top.dueDate, now)}，{STATUS_LABEL[top.status as TaskStatus]}
                {top.progressNote ? `：「${top.progressNote}」` : ''}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><span className="h-2 w-2 rounded-full" style={{ background: courseOf(top.courseId)?.color }} aria-hidden />{courseOf(top.courseId)?.name}</span>
            <Link href={`/app/c/${top.courseId}`} className="text-xs text-slate-500 hover:text-slate-900">看板</Link>
            {ledIds.includes(top.courseId) && <DeleteTaskButton id={top.id} title={top.title} />}
            {topReminder && <ReminderChip isLeader={isLeader}
              r={{ id: topReminder.id, message: topReminder.message, kind: topReminder.kind, fireDate: topReminder.fireDate, respondedAt: topReminder.respondedAt, response: topReminder.response }} />}
          </Card>
        )}
      </section>

      {isLeader && <MemberLoadPanel loads={loads} />}

      <ScheduleCard courses={courseOpts} ledCourseIds={ledIds} items={scheduled.map((m) => ({ id: m.id, courseId: m.courseId, date: m.date }))} today={today} />

      <section aria-label="课程入口">
        <SectionTitle>我的课程</SectionTitle>
        <div className="grid gap-4 md:grid-cols-3">
          {courses.map((c) => {
            const cOpenTasks = allTasks.filter((t) => t.courseId === c.id && t.status !== 'done');
            const cMeetings = meetings.filter((m) => m.courseId === c.id).length;
            const cRisk = cOpenTasks.map((t) => riskLevel({ dueDate: t.dueDate, status: t.status as TaskStatus, lastUpdateAt: t.lastUpdateAt, blocked: Boolean(t.blocker) }, now));
            const cReview = courseReview(c.id, now);
            const cNext = scheduled.find((m) => m.courseId === c.id);
            const reds = cRisk.filter((r) => r === 'red').length;
            const yellows = cRisk.filter((r) => r === 'yellow').length;
            return (
              <Link key={c.id} href={`/app/c/${c.id}`} className="group">
                <Card className="relative h-full overflow-hidden p-5 transition-colors group-hover:border-slate-400">
                  <span className="absolute inset-x-0 top-0 h-1" style={{ background: c.color }} aria-hidden />
                  <p className="text-[15px] font-medium text-slate-900">{c.name}</p>
                  <dl className="mt-4 grid grid-cols-3 gap-2">
                    <div><dt className="text-[11px] text-slate-400">纪要</dt><dd className="text-lg font-medium tabular-nums text-slate-900">{cMeetings}</dd></div>
                    <div><dt className="text-[11px] text-slate-400">未完成</dt><dd className="text-lg font-medium tabular-nums text-slate-900">{cOpenTasks.length}</dd></div>
                    <div><dt className="text-[11px] text-slate-400">带到下次会</dt><dd className="text-lg font-medium tabular-nums text-slate-900">{cReview.carry.length}</dd></div>
                  </dl>
                  <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    {reds > 0 && <span className="inline-flex items-center gap-1.5"><RiskDot level="red" />{reds}</span>}
                    {yellows > 0 && <span className="inline-flex items-center gap-1.5"><RiskDot level="yellow" />{yellows}</span>}
                    <span>{cNext ? `下次会 ${formatCN(cNext.date)}` : '还没安排下次会'}</span>
                  </p>
                </Card>
              </Link>
            );
          })}
          <NewCourseCard people={members.filter((m) => m.id !== user.id).map((m) => ({ id: m.id, name: m.name }))} />
        </div>
      </section>
    </div>
  );
}
