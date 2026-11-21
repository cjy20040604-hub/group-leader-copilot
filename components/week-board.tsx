import Link from 'next/link';
import { Card, Badge, cx } from '@/components/ui';
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

// 未来 7 天：三门课的 DDL 和组会放在一张表里（确定性汇总）
export function WeekBoard({ overdue, days, title }: { overdue: AgendaItem[]; days: AgendaDay[]; title: string }) {
  return (
    <section aria-label="未来 7 天">
      <h2 className="mb-2 text-sm font-semibold text-slate-700">{title}</h2>
      <Card className="overflow-x-auto p-3">
        <div className="grid min-w-[640px] grid-cols-8 gap-2">
          <div className="rounded-lg bg-red-50 p-2">
            <p className="mb-1 text-[11px] font-semibold text-red-700">已过期（{overdue.length}）</p>
            <ul className="space-y-1">{overdue.map((i, k) => <Item key={k} i={i} />)}</ul>
          </div>
          {days.map((d) => (
            <div key={d.date} className={cx('rounded-lg p-2', d.label.startsWith('今天') ? 'bg-brand-50' : 'bg-slate-50')}>
              <p className="mb-1 text-[11px] font-semibold text-slate-600">{d.label}</p>
              {d.items.length === 0 ? <p className="text-[11px] text-slate-300">—</p> : <ul className="space-y-1">{d.items.map((i, k) => <Item key={k} i={i} />)}</ul>}
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

export function MemberLoadPanel({ loads }: { loads: MemberLoad[] }) {
  const busy = loads.filter((l) => l.items.length > 0);
  const hot = loads.filter((l) => l.overloaded);
  return (
    <section aria-label="组员这周的担子">
      <h2 className="mb-2 text-sm font-semibold text-slate-700">👥 组员这周的担子（跨课一起看）</h2>
      <Card className="space-y-2 p-3">
        {hot.length === 0 && <p className="text-xs text-slate-500">没人这周跨课撞 DDL。</p>}
        {hot.map((l) => (
          <div key={l.memberId} className="rounded-lg bg-yellow-50 p-2 text-xs text-yellow-900">
            <p className="font-medium">⚠️ {l.name}：{l.reason}</p>
            <ul className="mt-1 space-y-0.5">{l.items.map((i, k) => <li key={k}>{md(i.date)} · {i.courseName}「{i.title}」</li>)}</ul>
            <p className="mt-1 text-[11px] text-yellow-700">建议问一句先做哪个，或者把其中一个 DDL 往后挪 → <Link href="/app/tasks" className="underline">任务与回顾</Link></p>
          </div>
        ))}
        <div className="flex flex-wrap gap-1.5">
          {busy.filter((l) => !l.overloaded).map((l) => (
            <Badge key={l.memberId} tone="slate">{l.name} · {l.items.length} 件 · {l.courses} 门课</Badge>
          ))}
          {loads.filter((l) => l.items.length === 0).map((l) => <Badge key={l.memberId} tone="green">{l.name} · 这周没 DDL</Badge>)}
        </div>
      </Card>
    </section>
  );
}
