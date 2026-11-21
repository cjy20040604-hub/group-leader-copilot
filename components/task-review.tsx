'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Badge, Input, Select, EmptyState, cx } from '@/components/ui';
import { BriefingButton } from '@/components/briefing-button';
import { RISK_LABEL, STATUS_LABEL, type TaskStatus } from '@/lib/risk';
import type { ReviewTask, FeedItem, CarryItem } from '@/lib/review';
import type { TaskAction } from '@/lib/task-flow';

type Member = { id: string; name: string; role: string };
type User = { id: string; name: string; role: 'leader' | 'member' };
type Inbox = { review: ReviewTask[]; extensions: ReviewTask[]; blocked: ReviewTask[]; silent: ReviewTask[]; unclaimed: ReviewTask[]; total: number };
type CourseReview = {
  course: { id: string; name: string; color: string };
  lastMeeting: { id: string; date: string; title: string } | null;
  doneSince: ReviewTask[]; inProgress: ReviewTask[]; blocked: ReviewTask[]; awaiting: ReviewTask[];
  carry: CarryItem[]; updatesSince: number;
};

type Props = {
  user: User; demoNow: string; members: Member[]; tasks: ReviewTask[];
  nudges: Record<string, string>; reminderTaskIds: string[]; reminderLinks?: Record<string, string>;
} & (
  | { mode: 'leader'; inbox: Inbox; feed: FeedItem[]; reviews: CourseReview[] }
  | { mode: 'member'; mine: ReviewTask[]; doneMine: ReviewTask[]; unclaimed: ReviewTask[]; feed: FeedItem[] }
);

const CARRY_LABEL: Record<CarryItem['kind'], string> = {
  blocked: '卡住', overdue: '过期', extension: '延期申请', unclaimed: '没人认领', silent: '没动静', review: '待确认', question: '待定',
};
const CARRY_TONE: Record<CarryItem['kind'], 'red' | 'yellow' | 'blue' | 'slate' | 'purple'> = {
  blocked: 'red', overdue: 'red', extension: 'yellow', unclaimed: 'yellow', silent: 'yellow', review: 'blue', question: 'purple',
};

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const when = (iso: string) => `${md(iso)} ${iso.slice(11, 16)}`;

function useAct() {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  async function act(taskId: string, action: TaskAction): Promise<boolean> {
    setBusy(taskId + action.type);
    const res = await fetch('/api/tasks/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId, action }) });
    setBusy('');
    if (!res.ok) {
      alert((await res.json()).error ?? '操作失败');
      return false;
    }
    router.refresh();
    return true;
  }
  async function assign(taskId: string, ownerId: string) {
    const res = await fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: taskId, ownerId, status: 'in_progress' }) });
    if (!res.ok) alert((await res.json()).error ?? '操作失败');
    router.refresh();
  }
  return { act, assign, busy };
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function CopyButton({ text, label, reminderId }: { text: string; label: string; reminderId?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button size="sm" variant="outline" onClick={async () => { await copyText(reminderId ? `${text}\n点这里回复进度：${window.location.origin}/r/${reminderId}` : text); setDone(true); setTimeout(() => setDone(false), 1500); }}>
      {done ? '已复制' : label}
    </Button>
  );
}

// 一行输入 + 确认：写进度、卡住原因、打回意见、延期理由共用
function InlineForm({ placeholder, submitLabel, withDate, minDate, onSubmit, onCancel }: {
  placeholder: string; submitLabel: string; withDate?: boolean; minDate?: string;
  onSubmit: (text: string, date: string) => Promise<boolean>; onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const [date, setDate] = useState('');
  const disabled = !text.trim() || (withDate && !date);
  return (
    <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={async (e) => { e.preventDefault(); if (!disabled && await onSubmit(text, date)) onCancel(); }}>
      {withDate && <Input type="date" value={date} min={minDate} onChange={(e) => setDate(e.target.value)} className="w-40 py-1 text-xs" aria-label="新的截止日期" />}
      <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={100} className="min-w-48 flex-1 py-1 text-xs" aria-label={placeholder} />
      <Button size="sm" type="submit" disabled={disabled}>{submitLabel}</Button>
      <Button size="sm" variant="ghost" type="button" onClick={onCancel}>取消</Button>
    </form>
  );
}

function TaskHead({ t, reminded, replyId }: { t: ReviewTask; reminded?: boolean; replyId?: string }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <span aria-label={`风险 ${t.risk}`}>{RISK_LABEL[t.risk]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: t.courseColor }} aria-hidden />{t.courseName}</span>
          <span>{t.ownerName}</span>
          <span>{t.dueText}</span>
          <span>{STATUS_LABEL[t.status as TaskStatus] ?? t.status}</span>
          {reminded && (replyId ? <Link href={`/r/${replyId}`}><Badge tone="red">🔔 有提醒 · 点这里回复</Badge></Link> : <Badge tone="red">🔔 有提醒</Badge>)}
        </p>
      </div>
    </div>
  );
}

// ───────────── 组员视图：把「更新一次」做到足够轻 ─────────────

function MyTaskCard({ t, today, reminded, replyId, act, busy }: { t: ReviewTask; today: string; reminded: boolean; replyId?: string; act: ReturnType<typeof useAct>['act']; busy: string }) {
  const [form, setForm] = useState<'' | 'progress' | 'block' | 'extend' | 'submit'>('');
  const leaderSaid = t.lastUpdate?.byLeader && ['review_return', 'extension_rejected', 'extension_approved', 'unblocked'].includes(t.lastUpdate.kind) ? t.lastUpdate : null;
  return (
    <Card className={cx('p-3', t.risk === 'red' && 'border-red-200')}>
      <TaskHead t={t} reminded={reminded} replyId={replyId} />
      {t.progressNote && <p className="mt-2 text-xs text-slate-600">我上次写的进度：「{t.progressNote}」</p>}
      {leaderSaid && (
        <p className="mt-2 rounded-lg bg-blue-50 p-2 text-xs text-blue-800">
          组长{leaderSaid.label}{leaderSaid.note ? `：${leaderSaid.note}` : ''} <span className="text-blue-500">· {when(leaderSaid.createdAt)}</span>
        </p>
      )}
      {t.blocker && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
          <span className="flex-1">🆘 卡住：{t.blocker}（组长已在「待我处理」里看到）</span>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act(t.id, { type: 'unblock' })}>已解决</Button>
        </div>
      )}
      {t.pending && <p className="mt-2 rounded-lg bg-yellow-50 p-2 text-xs text-yellow-800">📅 已申请延到 {md(t.pending.proposedDue)}，等组长回复</p>}

      {t.status === 'awaiting_review' ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <span className="flex-1">✅ 已交给组长确认</span>
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act(t.id, { type: 'start' })}>撤回继续改</Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" disabled={!!busy} onClick={() => setForm(form === 'submit' ? '' : 'submit')}>✅ 做完了</Button>
          <Button size="sm" variant="outline" onClick={() => setForm(form === 'progress' ? '' : 'progress')}>✏️ 写进度</Button>
          {!t.blocker && <Button size="sm" variant="outline" onClick={() => setForm(form === 'block' ? '' : 'block')}>🆘 卡住了</Button>}
          {!t.pending && <Button size="sm" variant="outline" onClick={() => setForm(form === 'extend' ? '' : 'extend')}>📅 申请延期</Button>}
        </div>
      )}
      {form === 'submit' && <InlineForm placeholder="交了什么、放在哪（选填也行，直接点提交）" submitLabel="提交给组长确认" onCancel={() => setForm('')}
        onSubmit={(text) => act(t.id, { type: 'submit', note: text })} />}
      {form === 'progress' && <InlineForm placeholder="一句话：做到哪了" submitLabel="保存" onCancel={() => setForm('')}
        onSubmit={(text) => act(t.id, { type: 'progress', note: text })} />}
      {form === 'block' && <InlineForm placeholder="卡在哪、需要谁帮忙" submitLabel="告诉组长" onCancel={() => setForm('')}
        onSubmit={(text) => act(t.id, { type: 'block', reason: text })} />}
      {form === 'extend' && <InlineForm withDate minDate={t.dueDate && t.dueDate > today ? t.dueDate : today} placeholder="为什么要延期" submitLabel="发给组长" onCancel={() => setForm('')}
        onSubmit={(text, date) => act(t.id, { type: 'request_extension', proposedDue: date, reason: text })} />}
      {form === 'submit' && <div className="mt-1"><Button size="sm" variant="ghost" className="text-[11px]" onClick={async () => { if (await act(t.id, { type: 'submit' })) setForm(''); }}>不写备注，直接提交</Button></div>}
    </Card>
  );
}

function FeedList({ feed, empty }: { feed: FeedItem[]; empty: string }) {
  if (feed.length === 0) return <p className="text-xs text-slate-400">{empty}</p>;
  return (
    <ol className="space-y-2">
      {feed.map((f) => (
        <li key={f.id} className="text-xs leading-relaxed">
          <span className="text-slate-400">{when(f.createdAt)}</span>{' '}
          <span className="font-medium text-slate-700">{f.actorName}</span>{' '}
          <span className="text-slate-600">{f.label}</span>{' '}
          <span className="text-slate-700">「{f.taskTitle}」</span>
          {f.proposedDue && <span className="text-slate-500">（{md(f.proposedDue)}）</span>}
          {f.note && <span className="block text-slate-500">「{f.note}」</span>}
        </li>
      ))}
    </ol>
  );
}

// ───────────── 组长视图：只看例外 ─────────────

function InboxSection({ title, hint, items, children }: { title: string; hint: string; items: ReviewTask[]; children: (t: ReviewTask) => React.ReactNode }) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700">{title}（{items.length}）<span className="ml-2 text-xs font-normal text-slate-400">{hint}</span></h3>
      {items.map((t) => <Card key={t.id} className="p-3">{children(t)}</Card>)}
    </section>
  );
}

function ReviewActions({ t, act, busy }: { t: ReviewTask; act: ReturnType<typeof useAct>['act']; busy: string }) {
  const [returning, setReturning] = useState(false);
  return (
    <>
      <TaskHead t={t} />
      {t.progressNote && <p className="mt-2 text-xs text-slate-600">{t.ownerName}：「{t.progressNote}」</p>}
      <div className="mt-2 flex gap-1.5">
        <Button size="sm" disabled={!!busy} onClick={() => act(t.id, { type: 'approve' })}>确认完成</Button>
        <Button size="sm" variant="outline" onClick={() => setReturning(!returning)}>打回…</Button>
      </div>
      {returning && <InlineForm placeholder="还差什么" submitLabel="打回" onCancel={() => setReturning(false)} onSubmit={(text) => act(t.id, { type: 'return', note: text })} />}
    </>
  );
}

function ExtensionActions({ t, act, busy }: { t: ReviewTask; act: ReturnType<typeof useAct>['act']; busy: string }) {
  const [rejecting, setRejecting] = useState(false);
  const p = t.pending!;
  return (
    <>
      <TaskHead t={t} />
      <p className="mt-2 text-xs text-slate-700">
        {t.ownerName}想从 <b>{t.dueDate ? md(t.dueDate) : '未定'}</b> 延到 <b>{md(p.proposedDue)}</b>：「{p.reason}」<span className="text-slate-400"> · {when(p.createdAt)}</span>
      </p>
      <div className="mt-2 flex gap-1.5">
        <Button size="sm" disabled={!!busy} onClick={() => act(t.id, { type: 'approve_extension', updateId: p.id })}>同意，改到 {md(p.proposedDue)}</Button>
        <Button size="sm" variant="outline" onClick={() => setRejecting(!rejecting)}>不同意…</Button>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">同意后 DDL 自动改，D-3 / D-1 提醒按新日期重排</p>
      {rejecting && <InlineForm placeholder="说一句原因" submitLabel="回复" onCancel={() => setRejecting(false)} onSubmit={(text) => act(t.id, { type: 'reject_extension', updateId: p.id, note: text })} />}
    </>
  );
}

function CourseReviewCard({ r }: { r: CourseReview }) {
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ background: r.course.color }} aria-hidden />
        <h3 className="font-medium">{r.course.name}</h3>
        <span className="text-xs text-slate-500">{r.lastMeeting ? `上次会 ${md(r.lastMeeting.date)} · 之后 ${r.updatesSince} 条更新` : '还没开过会'}</span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {([['完成', r.doneSince.length, 'text-green-700'], ['进行中', r.inProgress.length, 'text-slate-700'], ['卡住', r.blocked.length, 'text-red-600'], ['待确认', r.awaiting.length, 'text-blue-700']] as const).map(([label, n, tone]) => (
          <div key={label} className="rounded-lg bg-slate-50 py-2">
            <p className={cx('text-lg font-semibold', tone)}>{n}</p>
            <p className="text-[11px] text-slate-500">{label}</p>
          </div>
        ))}
      </div>
      {r.doneSince.length > 0 && <p className="text-xs text-slate-600">上次会后做完：{r.doneSince.map((t) => `${t.ownerName}「${t.title}」`).join('、')}</p>}
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-600">带到下次会（{r.carry.length}）</p>
        {r.carry.length === 0 ? <p className="text-xs text-slate-400">没有遗留，下次会可以直接推进新议题</p> : (
          <ul className="space-y-1">
            {r.carry.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                <Badge tone={CARRY_TONE[c.kind]} className="shrink-0">{CARRY_LABEL[c.kind]}</Badge>
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <Link href={`/app/meeting/live?course=${r.course.id}`} className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700">🎙 进会议室，从这些开始</Link>
        <BriefingButton courseId={r.course.id} />
      </div>
    </Card>
  );
}

export function TaskReview(props: Props) {
  const { act, assign, busy } = useAct();
  const today = props.demoNow.slice(0, 10);
  const reminded = new Set(props.reminderTaskIds);

  if (props.mode === 'member') {
    const { mine, doneMine, unclaimed, feed, user } = props;
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold">{user.name}，你的待办（{mine.length}）</h1>
          <p className="mt-1 text-sm text-slate-500">做完、卡住、要延期，在这里点一下就行，组长那边会实时看到，不用再私聊问你。</p>
        </div>
        <section aria-label="我的待办" className="space-y-2">
          {mine.length === 0 ? <EmptyState title="手上没有未完成的任务" hint="下面有没人认领的，有空可以拿一个" /> :
            mine.map((t) => <MyTaskCard key={t.id} t={t} today={today} reminded={reminded.has(t.id)} replyId={props.reminderLinks?.[t.id]} act={act} busy={busy} />)}
        </section>
        <section aria-label="没人认领" className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">还没人认领（{unclaimed.length}）<span className="ml-2 text-xs font-normal text-slate-400">会上说了「那个谁」的事，谁有空谁拿</span></h2>
          {unclaimed.length === 0 ? <p className="text-xs text-slate-400">都有人负责了</p> : unclaimed.map((t) => (
            <Card key={t.id} className="flex flex-wrap items-center gap-2 p-3">
              <div className="min-w-0 flex-1"><TaskHead t={t} /></div>
              <Button size="sm" disabled={!!busy} onClick={() => act(t.id, { type: 'claim' })}>我来认领</Button>
            </Card>
          ))}
        </section>
        <div className="grid gap-6 md:grid-cols-2">
          <section aria-label="我做完的">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">我做完的（{doneMine.length}）</h2>
            {doneMine.length === 0 ? <p className="text-xs text-slate-400">还没有</p> : (
              <ul className="space-y-1">{doneMine.slice(0, 5).map((t) => <li key={t.id} className="text-xs text-slate-600">✅ {t.courseName} ·「{t.title}」</li>)}</ul>
            )}
          </section>
          <section aria-label="我的任务动态">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">我的任务动态</h2>
            <FeedList feed={feed} empty="还没有动态" />
          </section>
        </div>
      </div>
    );
  }

  const { inbox, feed, reviews, members, nudges } = props;
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? '';
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">任务与回顾</h1>
        <p className="mt-1 text-sm text-slate-500">组员自己更新进度；这里只放需要你拍板的事，再帮你把下次会要接着推进的列出来。</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <h2 className="text-base font-semibold">待我处理（{inbox.total}）</h2>
          {inbox.total === 0 && <EmptyState title="没有要你处理的事" hint="组员都在按计划推进" />}
          <InboxSection title="等你确认完成" hint="点了「做完了」，等你确认" items={inbox.review}>{(t) => <ReviewActions t={t} act={act} busy={busy} />}</InboxSection>
          <InboxSection title="延期申请" hint="同意就自动改 DDL" items={inbox.extensions}>{(t) => <ExtensionActions t={t} act={act} busy={busy} />}</InboxSection>
          <InboxSection title="卡住了" hint="组员主动求助" items={inbox.blocked}>{(t) => (
            <>
              <TaskHead t={t} />
              <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{t.ownerName}：{t.blocker}</p>
              <div className="mt-2 flex gap-1.5">
                <CopyButton label="复制协调消息" text={`@${t.ownerName} 看到「${t.title}」卡在：${t.blocker}。我来协调，今晚给你答复。`} />
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act(t.id, { type: 'unblock', note: '组长已协调' })}>标记已解决</Button>
              </div>
            </>
          )}</InboxSection>
          <InboxSection title={`${48} 小时没动静`} hint="进行中但一直没更新" items={inbox.silent}>{(t) => (
            <>
              <TaskHead t={t} reminded={reminded.has(t.id)} />
              {t.progressNote && <p className="mt-2 text-xs text-slate-500">最后一次进度：「{t.progressNote}」{t.lastUpdateAt && ` · ${when(t.lastUpdateAt)}`}</p>}
              <div className="mt-2 flex items-center gap-2"><CopyButton label={props.reminderLinks?.[t.id] ? '复制催办（带回复链接）' : '复制催办'} text={nudges[t.id]} reminderId={props.reminderLinks?.[t.id]} />{props.reminderLinks?.[t.id] && <span className="text-[11px] text-slate-400">组员点链接回复后，会出现在组员动态里</span>}</div>
            </>
          )}</InboxSection>
          <InboxSection title="没人认领" hint="组员也能自己认领" items={inbox.unclaimed}>{(t) => (
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1"><TaskHead t={t} /></div>
              <Select value="" onChange={(e) => e.target.value && assign(t.id, e.target.value)} className="py-1 text-xs" aria-label={`指派「${t.title}」`}>
                <option value="">指派给…</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </div>
          )}</InboxSection>
        </div>

        <aside aria-label="组员动态" className="space-y-2">
          <h2 className="text-base font-semibold">组员动态</h2>
          <Card className="p-3"><FeedList feed={feed.filter((f) => nameOf(f.actorId) !== props.user.name || f.kind !== 'created')} empty="组员还没有更新" /></Card>
        </aside>
      </div>

      <section aria-label="回顾" className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">回顾：上次会到现在</h2>
          <p className="text-xs text-slate-500">「带到下次会」由规则自动汇总：卡住、过期、延期申请、没人认领、没动静、待确认、没拍板的问题。</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {reviews.map((r) => <CourseReviewCard key={r.course.id} r={r} />)}
        </div>
      </section>
    </div>
  );
}
