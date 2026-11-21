// 三门课并行：未来 7 天一张表 + 组员跨课负载（确定性规则，不调 LLM）
import { db, schema } from '@/lib/db/client';
import { daysUntilDue, dateOnly, toLocalISO } from '@/lib/time-utils';
import { STATUS_LABEL, type TaskStatus } from '@/lib/risk';

export interface AgendaItem {
  kind: 'ddl' | 'meeting';
  date: string;
  courseId: string; courseName: string; courseColor: string;
  title: string;
  ownerId: string | null; ownerName: string;
  status?: string;
  taskId?: string;
}

export interface AgendaDay { date: string; label: string; items: AgendaItem[] }

export interface MemberLoad {
  memberId: string; name: string;
  items: AgendaItem[];      // 未来 7 天内到期的未完成任务（含已过期）
  courses: number;          // 涉及几门课
  overloaded: boolean;
  reason: string | null;
}

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function shift(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return dateOnly(toLocalISO(d));
}

export function loadAgenda(now: Date, opts: { days?: number; ownerId?: string } = {}) {
  const days = opts.days ?? 7;
  const today = dateOnly(toLocalISO(now));
  const end = shift(today, days - 1);
  const courses = new Map(db.select().from(schema.courses).all().map((c) => [c.id, c]));
  const members = new Map(db.select().from(schema.members).all().map((m) => [m.id, m]));
  const tasks = db.select().from(schema.tasks).all().filter((t) => t.status !== 'done' && t.dueDate);
  const meetings = db.select().from(schema.meetings).all();

  const items: AgendaItem[] = [];
  for (const t of tasks) {
    if (opts.ownerId && t.ownerId !== opts.ownerId) continue;
    if (t.dueDate! > end) continue; // 已过期的也列出来（放在「已过期」一栏）
    const c = courses.get(t.courseId);
    items.push({
      kind: 'ddl', date: t.dueDate!, courseId: t.courseId, courseName: c?.name ?? t.courseId, courseColor: c?.color ?? '#64748b',
      title: t.title, ownerId: t.ownerId, ownerName: members.get(t.ownerId ?? '')?.name ?? '待认领',
      status: STATUS_LABEL[t.status as TaskStatus] ?? t.status, taskId: t.id,
    });
  }
  // 每门课最近一次纪要里约的下次会
  for (const c of courses.values()) {
    const last = meetings.filter((m) => m.courseId === c.id && m.nextMeeting).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (last?.nextMeeting && last.nextMeeting >= today && last.nextMeeting <= end) {
      items.push({ kind: 'meeting', date: last.nextMeeting, courseId: c.id, courseName: c.name, courseColor: c.color, title: `${c.name}组会`, ownerId: null, ownerName: '全组' });
    }
  }

  const overdue = items.filter((i) => i.date < today).sort((a, b) => a.date.localeCompare(b.date));
  const dayList: AgendaDay[] = [];
  for (let k = 0; k < days; k++) {
    const date = shift(today, k);
    const wd = WEEK[new Date(`${date}T00:00:00`).getDay()];
    dayList.push({
      date,
      label: k === 0 ? `今天 ${wd}` : k === 1 ? `明天 ${wd}` : `${Number(date.slice(5, 7))}/${Number(date.slice(8))} ${wd}`,
      items: items.filter((i) => i.date === date).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'meeting' ? -1 : 1)),
    });
  }
  return { today, overdue, days: dayList, courseCount: courses.size };
}

// 组员这周的担子：未来 7 天（含已过期未完成）到期 ≥ 2 件、且跨 ≥ 2 门课 → 跨课撞车；≥ 3 件 → 太满
export function memberLoads(now: Date): MemberLoad[] {
  const { overdue, days } = loadAgenda(now);
  const ddl = [...overdue, ...days.flatMap((d) => d.items)].filter((i) => i.kind === 'ddl' && i.ownerId);
  const members = db.select().from(schema.members).all();
  return members.map((m) => {
    const items = ddl.filter((i) => i.ownerId === m.id).sort((a, b) => a.date.localeCompare(b.date));
    const { courses, reason } = assessLoad(items);
    return { memberId: m.id, name: m.name, items, courses, overloaded: Boolean(reason), reason };
  }).sort((a, b) => Number(b.overloaded) - Number(a.overloaded) || b.items.length - a.items.length);
}

// 负载判定（纯函数）：≥ 3 件 → 太满；≥ 2 件且跨 ≥ 2 门课 → 跨课撞车
export function assessLoad(items: { date: string; courseId: string }[]): { courses: number; reason: string | null } {
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  const courses = new Set(sorted.map((i) => i.courseId)).size;
  if (sorted.length >= 3) return { courses, reason: `这周有 ${sorted.length} 件要交` };
  if (sorted.length >= 2 && courses >= 2) {
    const gap = Math.abs(daysUntilDue(sorted[1].date, new Date(`${sorted[0].date}T00:00:00`)));
    return { courses, reason: `${courses} 门课各有 DDL，前后只隔 ${gap} 天` };
  }
  return { courses, reason: null };
}
