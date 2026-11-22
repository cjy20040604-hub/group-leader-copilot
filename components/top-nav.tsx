'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect } from 'react';
import { Badge, Select, cx } from '@/components/ui';

interface Props {
  members: { id: string; name: string; role: string }[];
  currentUserId: string;
  demoNow: string;
  mock: boolean;
  reminderCount: number;
}

const NAV = [
  { href: '/app', label: '本周我要盯的事' },
  { href: '/app/tasks', label: '任务与回顾' },
  { href: '/app/ask', label: '问问上次' },
  { href: '/app/cost', label: '成本看板' },
  { href: '/app/metrics', label: '成功指标' },
  { href: '/app/settings', label: '设置' },
];

export function TopNav({ members, currentUserId, demoNow, mock, reminderCount }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const current = members.find((m) => m.id === currentUserId);

  useEffect(() => {
    const timer = setInterval(async () => {
      const res = await fetch('/api/reminders/scan', { method: 'POST' });
      const data = await res.json();
      if (data.created > 0) router.refresh();
    }, 60000);
    return () => clearInterval(timer);
  }, [router]);

  async function switchUser(id: string) {
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current_user: id }) });
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5">
        <Link href="/app" className="text-sm font-bold text-brand-700">组长减负</Link>
        <nav className="flex items-center gap-1" aria-label="主导航">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cx('rounded-lg px-2.5 py-1.5 text-sm', pathname === n.href ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-100')}>
              {n.label}
            </Link>
          ))}
        </nav>
        <Link href="/app/meeting/live" className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">🎙 开会</Link>
        <Link href="/app/meeting/new" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">+ 粘贴转写</Link>
        <div className="ml-auto flex items-center gap-2">
          {reminderCount > 0 && <Badge tone="red">🔔 {reminderCount} 条提醒</Badge>}
          <Badge tone="slate" className="font-mono">🕐 {demoNow.slice(0, 16).replace('T', ' ')}</Badge>
          {mock && <span title="离线演示：示例数据是一个 5 人小组三门课的一周，AI 结果为预置或规则生成，不调用模型"><Badge tone="yellow">离线演示</Badge></span>}
          <label className="flex items-center gap-1 text-xs text-slate-500">
            身份
            <Select value={currentUserId} onChange={(e) => switchUser(e.target.value)} aria-label="切换身份">
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}{m.role === 'leader' ? '（组长）' : ''}</option>
              ))}
            </Select>
          </label>
          {current?.role !== 'leader' && <Badge tone="blue">组员视图</Badge>}
        </div>
      </div>
    </header>
  );
}