import Link from 'next/link';
import { db, schema } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth';
import { getDemoNow, toLocalISO, dateOnly, formatCN } from '@/lib/time';
import { visibleReminders } from '@/lib/reminders';
import { riskLevel, dueText, STATUS_LABEL, RISK_LABEL, type TaskStatus } from '@/lib/risk';
import { Card, Badge, EmptyState } from '@/components/ui';
import { loadReviewTasks, leaderInbox, courseReview } from '@/lib/review';
import { NewCourseCard } from '@/components/new-course-card';
import { loadAgenda, memberLoads } from '@/lib/multi-course';
import { WeekBoard, MemberLoadPanel } from '@/components/week-board';
import { ReminderCard } from '@/components/reminder-card';

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
    })
    .slice(0, 5);

  // 下次会议：取每门课最近一次纪要里约的时间；已经过了还没录纪要的，提示去录，不再当「即将到来」
  const upcoming = courses
    .map((c) => {
      const ms = meetings.filter((m) => m.courseId === c.id && m.nextMeeting).sort((a, b) => b.date.localeCompare(a.date));
      return ms[0] ? { course: c, date: ms[0].nextMeeting!, past: ms[0].nextMeeting! < today } : null;
    })
    .filter(Boolean)
    .sort((a, b) => Number(a!.past) - Number(b!.past) || a!.date.localeCompare(b!.date)) as { course: (typeof courses)[number]; date: string; past: boolean }[];

  const agenda = loadAgenda(now, { ownerId: user.role === 'leader' ? undefined : user.id });
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

      <section aria-label="风险任务 top 5">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">🚨 最紧急的 {ranked.length} 件事</h2>
        {ranked.length === 0 ? (
          <EmptyState title="没有未完成任务" hint="都清完了，去喝杯奶茶吧" />
        ) : (
          <div className="space-y-2">
            {ranked.map((t) => (
              <Card key={t.id} className="flex flex-wrap items-center gap-3 p-3">
                <span className="text-lg" aria-label={`风险 ${t.risk}`}>{RISK_LABEL[t.risk]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="text-xs text-slate-500">
                    {nameOf(t.ownerId)} · {dueText(t.dueDate, now)} · {STATUS_LABEL[t.status as TaskStatus]}
                    {t.progressNote ? ` · 「${t.progressNote}」` : ''}
                  </p>
                </div>
                <Badge tone="blue">{courseOf(t.courseId)?.name}</Badge>
                <Link href={`/app/c/${t.courseId}`} className="text-xs text-brand-600 hover:underline">看板 →</Link>
              </Card>
            ))}
          </div>
        )}
      </section>

      <WeekBoard overdue={agenda.overdue} days={agenda.days}
        title={user.role === 'leader' ? `📅 未来 7 天 · ${agenda.courseCount} 门课一张表` : '📅 我未来 7 天要交的'} />
      {user.role === 'leader' && <MemberLoadPanel loads={loads} />}

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-label="即将到来的会议">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">🗓 即将到来的会议</h2>
          {upcoming.length === 0 ? <EmptyState title="暂无排期" /> : (
            <div className="space-y-2">
              {upcoming.map((u) => (
                <Card key={u.course.id} className="flex items-center justify-between p-3">
                  <div>
                    <p className="text-sm font-medium">{u.course.name}</p>
                    <p className="text-xs text-slate-500">
                      {u.past ? `约在 ${formatCN(u.date)}，已经过了，还没录入这次会的纪要` : u.date === today ? `今天（${u.date}）` : u.date}
                    </p>
                  </div>
                  {u.past
                    ? <Link href="/app/meeting/new" className="text-xs text-brand-600 hover:underline">去录纪要 →</Link>
                    : <Link href={`/app/meeting/live?course=${u.course.id}`} className="text-xs text-brand-600 hover:underline">{u.date === today ? '进会议室（自动开录）→' : '会前准备 →'}</Link>}
                </Card>
              ))}
            </div>
          )}
        </section>

        <section aria-label="最新提醒">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">🔔 最新提醒（{reminders.length}）</h2>
          {reminders.length === 0 ? <EmptyState title="暂无提醒" hint="D-3 / D-1 / 过期第一天自动生成；组长复制时带回复链接，组员点一下就能回复" /> : (
            <div className="space-y-2">
              {reminders.slice(0, 5).map((r) => (
                <ReminderCard key={r.id} isLeader={user.role === 'leader'}
                  r={{ id: r.id, message: r.message, kind: r.kind, fireDate: r.fireDate, respondedAt: r.respondedAt, response: r.response }} />
              ))}
            </div>
          )}
        </section>
      </div>

      <section aria-label="课程入口">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">📚 我的课程</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {courses.map((c) => {
            const cOpenTasks = allTasks.filter((t) => t.courseId === c.id && t.status !== 'done');
            const cOpen = cOpenTasks.length;
            const cMeetings = meetings.filter((m) => m.courseId === c.id).length;
            const cRisk = cOpenTasks.map((t) => riskLevel({ dueDate: t.dueDate, status: t.status as TaskStatus, lastUpdateAt: t.lastUpdateAt, blocked: Boolean(t.blocker) }, now));
            const cReview = courseReview(c.id, now);
            const cNext = upcoming.find((u) => u.course.id === c.id);
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
                    {cNext && <span>{cNext.past ? '上次约的会还没录纪要' : `下次会 ${formatCN(cNext.date)}`}</span>}
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