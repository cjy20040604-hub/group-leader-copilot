// 成功指标（确定性计算，不调 LLM）。目标值都是假设 · 待验证
import { db, schema } from '@/lib/db/client';
import { dateOnly, toLocalISO } from '@/lib/time-utils';
import { loadReviewTasks, leaderInbox } from '@/lib/review';

const DAY = 86400000;
const PROGRESS_KINDS = new Set(['progress', 'submit', 'blocked', 'unblocked', 'extension_request', 'claim', 'status']);

export function shiftDate(date: string, days: number) {
  return dateOnly(toLocalISO(new Date(new Date(`${date}T00:00:00`).getTime() + days * DAY)));
}

// 提醒 24 小时内回复率：已触发的提醒里，触发后 24 小时内（以触发日 09:00 起算）被组员点链接回复的比例
export function replyRate(reminders: { fireDate: string; respondedAt: string | null }[], today: string) {
  const fired = reminders.filter((r) => r.fireDate <= today);
  const within = fired.filter((r) => r.respondedAt && new Date(r.respondedAt).getTime() - new Date(`${r.fireDate}T09:00:00`).getTime() <= DAY);
  return { fired: fired.length, replied: fired.filter((r) => r.respondedAt).length, within24h: within.length, rate: fired.length ? within.length / fired.length : null };
}

// 组员自主更新占比：进度类动态里，由任务负责人自己发起（不是组长代改）的比例；组长自己的任务不算
export function selfUpdateShare(
  updates: { taskId: string; actorId: string; kind: string }[],
  ownerOf: (taskId: string) => string | null,
  leaderIds: Set<string>,
) {
  const rel = updates.filter((u) => PROGRESS_KINDS.has(u.kind) && !leaderIds.has(ownerOf(u.taskId) ?? '') && (ownerOf(u.taskId) || u.kind === 'claim'));
  const self = rel.filter((u) => u.actorId === ownerOf(u.taskId));
  return { total: rel.length, self: self.length, rate: rel.length ? self.length / rel.length : null };
}

// 按时完成率：已完成且有 DDL 的任务里，完成日（最后一次更新）不晚于 DDL 的比例
export function onTimeRate(tasks: { status: string; dueDate: string | null; lastUpdateAt: string | null }[]) {
  const done = tasks.filter((t) => t.status === 'done' && t.dueDate && t.lastUpdateAt);
  const onTime = done.filter((t) => dateOnly(t.lastUpdateAt!) <= t.dueDate!);
  return { done: done.length, onTime: onTime.length, rate: done.length ? onTime.length / done.length : null };
}

export interface Metric {
  key: string; name: string; value: string; target: string; status: 'ok' | 'bad' | 'na' | 'track';
  definition: string; why: string; source: string; detail?: string;
}

export function loadMetrics(now: Date) {
  const today = dateOnly(toLocalISO(now));
  const weekStart = shiftDate(today, -6);
  const courses = db.select().from(schema.courses).all();
  const members = db.select().from(schema.members).all();
  const leaderIds = new Set(members.filter((m) => m.role === 'leader').map((m) => m.id));
  const tasks = db.select().from(schema.tasks).all();
  const owner = new Map(tasks.map((t) => [t.id, t.ownerId]));
  const decisions = db.select().from(schema.memoryItems).all().filter((m) => m.type === 'decision');

  // 北极星：每周被组长确认的决定数（按会议日期分周，最近 4 周）
  const weeks = [3, 2, 1, 0].map((k) => {
    const end = shiftDate(today, -7 * k);
    const start = shiftDate(end, -6);
    const items = decisions.filter((d) => d.meetingDate >= start && d.meetingDate <= end);
    return {
      label: k === 0 ? '最近 7 天' : `${Number(start.slice(5, 7))}/${Number(start.slice(8))}–${Number(end.slice(5, 7))}/${Number(end.slice(8))}`,
      total: items.length,
      byCourse: courses.map((c) => ({ name: c.name, color: c.color, n: items.filter((d) => d.courseId === c.id).length })),
    };
  });
  const thisWeek = weeks[3].total;
  const activeCourses = courses.filter((c) => decisions.some((d) => d.courseId === c.id)).length || courses.length;

  const rr = replyRate(db.select().from(schema.reminders).all(), today);
  const su = selfUpdateShare(db.select().from(schema.taskUpdates).all(), (id) => owner.get(id) ?? null, leaderIds);
  const ot = onTimeRate(tasks);
  const dup = db.select().from(schema.metricEvents).all().filter((e) => e.kind === 'dup_blocked');
  const dupWeek = dup.filter((e) => dateOnly(e.createdAt) >= weekStart).length;
  const inbox = leaderInbox(loadReviewTasks(now));

  const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);
  const metrics: Metric[] = [
    {
      key: 'north', name: '北极星：每周确认的决定数', value: `${thisWeek} 条`, target: `每门有会的课每周 ≥ 1 条（${activeCourses} 门课 → ≥ ${activeCourses} 条）`,
      status: thisWeek >= activeCourses ? 'ok' : thisWeek === 0 ? 'bad' : 'bad',
      definition: '最近 7 天召开的会里，被组长勾选确认、写进记忆库的决议条数。', why: '产品承诺的第一件事就是「会上说的话变成确认过的决定」。这个数涨，说明小组在用它开会、组长在用它拍板；它不涨，后面的任务和提醒都无从谈起。',
      source: 'memory_items（type = decision，按会议日期）',
    },
    {
      key: 'reply', name: '提醒 24 小时内回复率', value: pct(rr.rate), target: '≥ 60%', status: rr.rate === null ? 'na' : rr.rate >= 0.6 ? 'ok' : 'bad',
      definition: '已触发的 D-3 / D-1 / 过期提醒里，组员在 24 小时内点链接回复的比例。', why: '组长减负的前提是组员自己回。回复率低，组长还得私聊一个个问。',
      source: 'reminders.responded_at', detail: `已触发 ${rr.fired} 条，回复 ${rr.replied} 条（24 小时内 ${rr.within24h} 条）`,
    },
    {
      key: 'self', name: '组员自主更新占比', value: pct(su.rate), target: '≥ 70%', status: su.rate === null ? 'na' : su.rate >= 0.7 ? 'ok' : 'bad',
      definition: '组员任务的进度类动态（认领、写进度、做完了、卡住、申请延期、改状态）里，由负责人自己发起的比例。', why: '这个比例越高，组长越不用替人改状态、追进度。',
      source: 'task_updates', detail: `${su.self} / ${su.total} 条`,
    },
    {
      key: 'ontime', name: '按时完成率', value: pct(ot.rate), target: '≥ 80%', status: ot.rate === null ? 'na' : ot.rate >= 0.8 ? 'ok' : 'bad',
      definition: '已完成且有 DDL 的任务里，完成那天不晚于 DDL 的比例。', why: '提醒和风险灯最终要体现在「没人临 DDL 掉链子」。',
      source: 'tasks（status = done 的最后更新日期 vs due_date）', detail: `${ot.onTime} / ${ot.done} 件`,
    },
    {
      key: 'dup', name: '重复讨论被拦下', value: `${dupWeek} 次（累计 ${dup.length}）`, target: '跟踪，不设目标', status: 'track',
      definition: '会前议程查重、会中「这事定过了」命中已有决议的次数。', why: '每拦下一次，就少一次「上次不是定了吗」的重复讨论；长期降下来说明大家开始先查再议。',
      source: 'metric_events（kind = dup_blocked）',
    },
    {
      key: 'inbox', name: '组长「待我处理」积压', value: `${inbox.total} 件`, target: '≤ 3 件', status: inbox.total <= 3 ? 'ok' : 'bad',
      definition: '等确认完成、延期申请、卡住、48 小时没动静、没人认领的合计。', why: '护栏指标：如果积压一直高，说明例外太多，组长还是被拖住了。',
      source: 'lib/review.ts leaderInbox', detail: `确认 ${inbox.review.length} · 延期 ${inbox.extensions.length} · 卡住 ${inbox.blocked.length} · 没动静 ${inbox.silent.length} · 没人认领 ${inbox.unclaimed.length}`,
    },
  ];
  return { metrics, weeks, today };
}
