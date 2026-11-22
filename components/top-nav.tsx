'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Badge, Select, cx } from '@/components/ui';
import { MicIcon } from '@/components/icons';
import { ReminderNotifier } from '@/components/reminder-notifier';

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

  async function switchUser(id: string) {
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current_user: id }) });
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-ink-line bg-ink text-cream-50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 pt-3 lg:h-14 lg:flex-nowrap lg:py-0">
        <Link href="/app" className="flex shrink-0 items-center gap-2 text-[15px] font-medium tracking-tight text-cream-50">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600 text-[11px] font-semibold text-white" aria-hidden>减</span>
          组长减负
        </Link>
        <nav className="order-last -mx-4 flex w-full gap-1 overflow-x-auto px-4 lg:order-none lg:mx-0 lg:w-auto lg:px-0" aria-label="主导航">
          {NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined}
                className={cx('relative flex items-center whitespace-nowrap px-2.5 py-3 text-sm transition-colors lg:h-14 lg:py-0', active ? 'font-medium text-cream-50' : 'text-cream-400 hover:text-cream-50')}>
                {n.label}
                {active && <span className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-[#e8c77a]" aria-hidden />}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/app/meeting/new" className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-cream-50 ring-1 ring-inset ring-cream-50/30 hover:bg-white/5">导入转写</Link>
          <Link href="/app/meeting/live" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-cream-50 px-3 py-1.5 text-sm font-medium text-ink hover:bg-white">
            <MicIcon />
            开会
          </Link>
        </div>
      </div>
      <div className="border-t border-ink-line bg-ink-raised">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-xs text-cream-200">
          <span className="tabular-nums">演示时间 {demoNow.slice(0, 16).replace('T', ' ')}</span>
          {mock && <span title="离线演示：示例数据是一个 5 人小组三门课的一周，AI 结果为预置或规则生成，不调用模型"><span className="rounded px-1.5 py-px text-cream-200 ring-1 ring-inset ring-cream-50/30">离线演示</span></span>}
          {reminderCount > 0 && <Link href="/app/tasks" className="text-[#f2b880] hover:underline">{reminderCount} 条提醒待处理</Link>}
          <ReminderNotifier userId={currentUserId} />
          <label className="ml-auto flex items-center gap-1.5">
            身份
            <Select value={currentUserId} onChange={(e) => switchUser(e.target.value)} aria-label="切换身份" className="py-1 pl-2 pr-7 text-xs">
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
