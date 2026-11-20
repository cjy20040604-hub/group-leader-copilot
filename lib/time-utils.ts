// 纯日期工具（无 DB 依赖，客户端组件可安全引用）

export function toLocalISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

// 按日历天计算 due - now（忽略时分秒）
export function daysUntilDue(dueDate: string, now: Date): number {
  const due = new Date(dueDate + 'T00:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

export function hoursSince(iso: string | null, now: Date): number {
  if (!iso) return Infinity;
  return (now.getTime() - new Date(iso).getTime()) / 3600000;
}

export function formatCN(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}`;
}