import Link from 'next/link';
import { Card } from '@/components/ui';
import type { MemberLoad } from '@/lib/multi-course';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

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
