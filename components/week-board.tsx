import Link from 'next/link';
import { Card, SectionTitle } from '@/components/ui';
import type { MemberLoad } from '@/lib/multi-course';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

// 只有有人跨课撞 DDL 时才出现
export function MemberLoadPanel({ loads }: { loads: MemberLoad[] }) {
  const hot = loads.filter((l) => l.overloaded);
  if (hot.length === 0) return null;
  return (
    <section aria-label="组员这周的担子">
      <SectionTitle>有人这周撞 DDL</SectionTitle>
      <div className="space-y-3">
        {hot.map((l) => (
          <Card key={l.memberId} className="border-l-4 border-l-amber-400 p-5">
            <p className="text-[15px] font-medium text-slate-900">{l.name}：{l.reason}</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {l.items.map((i, k) => <li key={k} className="tabular-nums">{md(i.date)}　{i.courseName}「{i.title}」</li>)}
            </ul>
            <p className="mt-3 text-xs text-slate-500">建议先问一句先做哪个，或者把其中一个 DDL 往后挪。<Link href="/app/tasks" className="text-brand-600 hover:underline">去任务与回顾</Link></p>
          </Card>
        ))}
      </div>
    </section>
  );
}
