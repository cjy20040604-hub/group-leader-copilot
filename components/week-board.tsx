import Link from 'next/link';
import { Card, cx } from '@/components/ui';
import type { AgendaDay, AgendaItem, MemberLoad } from '@/lib/multi-course';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

function Item({ i }: { i: AgendaItem }) {
  return (
    <li className="flex items-start gap-1.5 text-xs leading-snug">
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: i.courseColor }} aria-hidden />
      <span className={cx(i.kind === 'meeting' && 'font-medium text-brand-700')}>
        {i.kind === 'meeting' ? `🗓 ${i.title}` : `${i.ownerName}「${i.title}」`}
        {i.kind === 'ddl' && i.status && <span className="text-slate-400"> · {i.status}</span>}
      </span>
    </li>
  );
}

// 未来 7 天：三门课的 DDL 和组会放在一张表里（确定性汇总）；空的日子不占地方
export function WeekBoard({ overdue, days, title }: { overdue: AgendaItem[]; days: AgendaDay[]; title: string }) {
  const busy = days.filter((d) => d.items.length > 0);
  return (
    <section aria-label="未来 7 天">
      <h2 className="mb-2 text-sm font-semibold text-slate-700">{title}</h2>
      <Card className="divide-y divide-slate-100 p-0">
        {overdue.length > 0 && (
          <div className="flex gap-3 bg-red-50 px-3 py-2">
            <p className="w-20 shrink-0 text-[11px] font-semibold text-red-700">已过期</p>
            <ul className="space-y-1">{overdue.map((i, k) => <Item key={k} i={i} />)}</ul>
          </div>
        )}
        {busy.map((d) => (
          <div key={d.date} className={cx('flex gap-3 px-3 py-2', d.label.startsWith('今天') && 'bg-brand-50')}>
            <p className="w-20 shrink-0 text-[11px] font-semibold text-slate-600">{d.label}</p>
            <ul className="space-y-1">{d.items.map((i, k) => <Item key={k} i={i} />)}</ul>
          </div>
        ))}
        {overdue.length === 0 && busy.length === 0 && <p className="px-3 py-3 text-xs text-slate-400">未来 7 天没有 DDL，也没有安排会议。</p>}
      </Card>
    </section>
  );
}

// 只有有人跨课撞 DDL 时才出现
export function MemberLoadPanel({ loads }: { loads: MemberLoad[] }) {
  const hot = loads.filter((l) => l.overloaded);
  if (hot.length === 0) return null;
  return (
    <section aria-label="组员这周的担子">
      <h2 className="mb-2 text-sm font-semibold text-slate-700">👥 有人这周撞 DDL</h2>
      <Card className="space-y-2 p-3">
        {hot.map((l) => (
          <div key={l.memberId} className="rounded-lg bg-yellow-50 p-2 text-xs text-yellow-900">
            <p className="font-medium">⚠️ {l.name}：{l.reason}</p>
            <ul className="mt-1 space-y-0.5">{l.items.map((i, k) => <li key={k}>{md(i.date)} · {i.courseName}「{i.title}」</li>)}</ul>
            <p className="mt-1 text-[11px] text-yellow-700">建议问一句先做哪个，或者把其中一个 DDL 往后挪 → <Link href="/app/tasks" className="underline">任务与回顾</Link></p>
          </div>
        ))}
      </Card>
    </section>
  );
}
