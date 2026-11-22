import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { leaderPairs } from '@/lib/membership';
import { hoursSince, formatCN, daysUntilDue } from '@/lib/time-utils';
import { riskLevel, taskDueText, type RiskLevel, type TaskStatus } from '@/lib/risk';
import { UPDATE_LABEL, type UpdateKind } from '@/lib/task-flow';

// 「任务与回顾」的汇总：全部是确定性规则（不调 LLM）
// 例外 = 待确认完成 / 卡住了 / 申请延期 / 48 小时没动静 / 没人认领；组长只看这些

export const SILENT_HOURS = 48;

export interface PendingExt { id: string; proposedDue: string; reason: string | null; createdAt: string }
export interface LastUpdate { kind: string; label: string; note: string | null; actorName: string; createdAt: string; byLeader: boolean }

export interface ReviewTask {
  id: string; courseId: string; courseName: string; courseColor: string; meetingId: string;
  title: string; ownerId: string | null; ownerName: string;
  dueDate: string | null; status: string; blocker: string | null; progressNote: string | null; lastUpdateAt: string | null;
  risk: RiskLevel; dueText: string; silent: boolean;
  pending: PendingExt | null; lastUpdate: LastUpdate | null;
}

export interface FeedItem {
  id: string; taskId: string; taskTitle: string; courseId: string; courseName: string;
  actorId: string; actorName: string; kind: string; label: string;
  note: string | null; proposedDue: string | null; fromStatus: string | null; toStatus: string | null; createdAt: string;
}

export interface CarryItem { kind: 'blocked' | 'overdue' | 'extension' | 'unclaimed' | 'silent' | 'review' | 'question'; text: string; taskId?: string }

function lookups() {
  const courses = db.select().from(schema.courses).all();
  const members = db.select().from(schema.members).all();
  return {
    course: (id: string) => courses.find((c) => c.id === id),
    member: (id: string | null) => members.find((m) => m.id === id),
    leaderPairs: leaderPairs(),
  };
}

export function loadReviewTasks(now: Date, opts: { courseId?: string } = {}): ReviewTask[] {
  const { course, member, leaderPairs: lp } = lookups();
  const tasks = opts.courseId
    ? db.select().from(schema.tasks).where(eq(schema.tasks.courseId, opts.courseId)).all()
    : db.select().from(schema.tasks).all();
  const updates = db.select().from(schema.taskUpdates).orderBy(desc(schema.taskUpdates.createdAt), desc(schema.taskUpdates.id)).all();
  const latest = new Map<string, (typeof updates)[number]>();
  const pending = new Map<string, (typeof updates)[number]>();
  for (const u of updates) {
    if (!latest.has(u.taskId)) latest.set(u.taskId, u);
    if (u.kind === 'extension_request' && u.resolved === 0 && !pending.has(u.taskId)) pending.set(u.taskId, u);
  }
  return tasks.map((t) => {
    const status = t.status as TaskStatus;
    const lu = latest.get(t.id);
    const p = pending.get(t.id);
    const silent = status === 'in_progress' && Boolean(t.ownerId) && !t.blocker && hoursSince(t.lastUpdateAt, now) > SILENT_HOURS;
    return {
      id: t.id, courseId: t.courseId, courseName: course(t.courseId)?.name ?? t.courseId, courseColor: course(t.courseId)?.color ?? '#64748b',
      meetingId: t.meetingId, title: t.title, ownerId: t.ownerId, ownerName: member(t.ownerId)?.name ?? '待认领',
      dueDate: t.dueDate, status: t.status, blocker: t.blocker, progressNote: t.progressNote, lastUpdateAt: t.lastUpdateAt,
      risk: riskLevel({ dueDate: t.dueDate, status, lastUpdateAt: t.lastUpdateAt, blocked: Boolean(t.blocker) }, now),
      dueText: taskDueText(t, now), silent,
      pending: p && p.proposedDue ? { id: p.id, proposedDue: p.proposedDue, reason: p.note, createdAt: p.createdAt } : null,
      lastUpdate: lu ? {
        kind: lu.kind, label: UPDATE_LABEL[lu.kind as UpdateKind] ?? lu.kind, note: lu.note,
        actorName: member(lu.actorId)?.name ?? lu.actorId, createdAt: lu.createdAt, byLeader: lp.has(`${t.courseId}:${lu.actorId}`),
      } : null,
    };
  });
}

const RISK_ORDER: Record<RiskLevel, number> = { red: 0, yellow: 1, green: 2 };
export function byUrgency(a: ReviewTask, b: ReviewTask) {
  return RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
}

// 组长的「待我处理」
export function leaderInbox(tasks: ReviewTask[]) {
  const open = tasks.filter((t) => t.status !== 'done');
  const review = open.filter((t) => t.status === 'awaiting_review').sort(byUrgency);
  const extensions = open.filter((t) => t.pending).sort(byUrgency);
  const blocked = open.filter((t) => t.blocker && t.status !== 'awaiting_review').sort(byUrgency);
  const silent = open.filter((t) => t.silent && !t.pending).sort(byUrgency);
  const unclaimed = open.filter((t) => !t.ownerId).sort(byUrgency);
  return { review, extensions, blocked, silent, unclaimed, total: review.length + extensions.length + blocked.length + silent.length + unclaimed.length };
}

export function loadFeed(opts: { limit?: number; actorId?: string; ownerId?: string; courseId?: string; courseIds?: string[]; since?: string } = {}): FeedItem[] {
  const { course, member } = lookups();
  const tasks = new Map(db.select().from(schema.tasks).all().map((t) => [t.id, t]));
  return db.select().from(schema.taskUpdates).orderBy(desc(schema.taskUpdates.createdAt), desc(schema.taskUpdates.id)).all()
    .filter((u) => (!opts.actorId || u.actorId === opts.actorId)
      && (!opts.ownerId || tasks.get(u.taskId)?.ownerId === opts.ownerId)
      && (!opts.courseId || u.courseId === opts.courseId)
      && (!opts.courseIds || opts.courseIds.includes(u.courseId))
      && (!opts.since || u.createdAt >= opts.since))
    .slice(0, opts.limit ?? 30)
    .map((u) => ({
      id: u.id, taskId: u.taskId, taskTitle: tasks.get(u.taskId)?.title ?? '（已删除的任务）',
      courseId: u.courseId, courseName: course(u.courseId)?.name ?? u.courseId,
      actorId: u.actorId, actorName: member(u.actorId)?.name ?? u.actorId,
      kind: u.kind, label: UPDATE_LABEL[u.kind as UpdateKind] ?? u.kind,
      note: u.note, proposedDue: u.proposedDue, fromStatus: u.fromStatus, toStatus: u.toStatus, createdAt: u.createdAt,
    }));
}

// 回顾：上次会到现在，每门课进展如何、下次会要接着推进什么
export function courseReview(courseId: string, now: Date) {
  const meetings = db.select().from(schema.meetings)
    .where(and(eq(schema.meetings.courseId, courseId), eq(schema.meetings.processed, 1))).all()
    .sort((a, b) => b.date.localeCompare(a.date));
  const last = meetings[0] ?? null;
  const since = last ? `${last.date}T00:00:00` : null;
  const tasks = loadReviewTasks(now, { courseId });
  const open = tasks.filter((t) => t.status !== 'done');
  const doneSince = tasks.filter((t) => t.status === 'done' && since && (t.lastUpdateAt ?? '') >= since);
  const updatesSince = since ? loadFeed({ courseId, since, limit: 200 }).length : 0;
  const questions = db.select().from(schema.memoryItems)
    .where(and(eq(schema.memoryItems.courseId, courseId), eq(schema.memoryItems.type, 'open_question'), eq(schema.memoryItems.status, 'active'))).all();

  // 带到下次会：按「最需要当面说」排序。卡住、延期申请是两件要当面谈的事，各列一条；
  // 过期 / 没人认领 / 没动静 / 待确认是同一个任务的状态，同一任务只列最急的那条
  const carry: CarryItem[] = [];
  const seen = new Set<string>();
  const push = (item: CarryItem) => {
    const key = item.kind === 'blocked' || item.kind === 'extension' ? `${item.kind}:${item.taskId}` : item.taskId ?? item.text;
    if (seen.has(key)) return;
    seen.add(key);
    carry.push(item);
  };
  for (const t of open.filter((x) => x.blocker)) push({ kind: 'blocked', taskId: t.id, text: `${t.ownerName}的「${t.title}」卡住了：${t.blocker}` });
  for (const t of open.filter((x) => x.dueDate && daysUntilDue(x.dueDate, now) < 0)) push({ kind: 'overdue', taskId: t.id, text: `${t.ownerName}的「${t.title}」${t.dueText}` });
  for (const t of open.filter((x) => x.pending)) push({ kind: 'extension', taskId: t.id, text: `${t.ownerName}申请把「${t.title}」延到 ${formatCN(t.pending!.proposedDue)}：${t.pending!.reason ?? ''}` });
  for (const t of open.filter((x) => !x.ownerId)) push({ kind: 'unclaimed', taskId: t.id, text: `「${t.title}」还没人认领` });
  for (const t of open.filter((x) => x.silent)) push({ kind: 'silent', taskId: t.id, text: `${t.ownerName}的「${t.title}」${SILENT_HOURS} 小时没更新（${t.dueText}）` });
  for (const t of open.filter((x) => x.status === 'awaiting_review')) push({ kind: 'review', taskId: t.id, text: `${t.ownerName}的「${t.title}」等确认完成` });
  for (const q of questions) push({ kind: 'question', text: `没拍板：${q.text}` });

  return {
    lastMeeting: last ? { id: last.id, date: last.date, title: last.title } : null,
    since,
    doneSince,
    inProgress: open.filter((t) => t.status === 'in_progress' && !t.blocker),
    blocked: open.filter((t) => t.blocker),
    awaiting: open.filter((t) => t.status === 'awaiting_review'),
    carry,
    updatesSince,
  };
}

export const CARRY_LABEL: Record<CarryItem['kind'], string> = {
  blocked: '卡住', overdue: '过期', extension: '延期申请', unclaimed: '没人认领', silent: '没动静', review: '待确认', question: '待定',
};
