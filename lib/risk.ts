import { daysUntilDue, hoursSince } from '@/lib/time-utils';

export type TaskStatus = 'unclaimed' | 'in_progress' | 'awaiting_review' | 'done';
export type RiskLevel = 'red' | 'yellow' | 'green';

export interface RiskInput {
  dueDate: string | null;
  status: TaskStatus;
  lastUpdateAt: string | null;
  blocked?: boolean; // 组员标了「卡住了」
}

// 风险灯规则（确定性代码，禁止 LLM）：
// 🔴 已过 DDL 未完成；或距 DDL ≤ 1 天且状态不是 待审核/已完成
// 🟡 距 DDL ≤ 3 天且 48 小时内没更新；或负责人待认领
// 卡住的任务：至少 🟡；距 DDL ≤ 3 天还卡着 → 🔴（组员主动求助，组长该出手了）
// 🟢 其他
export function riskLevel(task: RiskInput, now: Date): RiskLevel {
  if (task.status === 'done') return 'green';
  // 红灯规则先判：没人认领的任务过期了也是红，不能因为「待认领」只亮黄
  const d = task.dueDate ? daysUntilDue(task.dueDate, now) : null;
  if (d !== null && d < 0) return 'red';
  if (d !== null && d <= 1 && task.status !== 'awaiting_review') return 'red';
  if (task.blocked && task.status !== 'awaiting_review' && d !== null && d <= 3) return 'red';
  if (task.status === 'unclaimed') return 'yellow';
  if (task.blocked && task.status !== 'awaiting_review') return 'yellow';
  if (d !== null && d <= 3 && hoursSince(task.lastUpdateAt, now) > 48) return 'yellow';
  return 'green';
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  unclaimed: '待认领',
  in_progress: '进行中',
  awaiting_review: '待审核',
  done: '已完成',
};

export const RISK_LABEL: Record<RiskLevel, string> = { red: '🔴', yellow: '🟡', green: '🟢' };

// 看板/简报用：已完成的任务不再说「已过期 N 天」
export function taskDueText(task: { dueDate: string | null; status: string }, now: Date): string {
  if (task.status === 'done') return task.dueDate ? `已完成（原定 ${task.dueDate.slice(5).replace('-', '/')}）` : '已完成';
  return dueText(task.dueDate, now);
}

export function dueText(dueDate: string | null, now: Date): string {
  if (!dueDate) return '日期待定';
  const d = daysUntilDue(dueDate, now);
  if (d < 0) return `已过期 ${-d} 天（${dueDate}）`;
  if (d === 0) return '今天截止';
  if (d === 1) return '明天截止';
  return `${d} 天后截止（${dueDate}）`;
}

// 催办文案：模板优先，不花钱
export function nudgeMessage(opts: { owner: string; course: string; task: string; dueText: string; status: string }): string {
  const raw = opts.dueText.replace(/（.*）/, '').replace(/截止$/, '');
  const duePart = raw.startsWith('已过期') || raw === '日期待定' ? `${raw}，` : `${raw}截止，`;
  return `@${opts.owner} ${opts.course} 的「${opts.task}」${duePart}目前状态：${opts.status}，需要帮忙吗？`;
}