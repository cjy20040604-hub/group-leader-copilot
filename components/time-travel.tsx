'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@/components/ui';

export function TimeTravel({ demoNow }: { demoNow: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');

  async function act(action: 'shift' | 'reset', days?: number) {
    setBusy(true);
    const res = await fetch('/api/time', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, days }) });
    const data = await res.json();
    if (res.ok) {
      setInfo(`当前虚拟时间：${data.demoNow.replace('T', ' ')}${data.remindersCreated ? `，新生成 ${data.remindersCreated} 条提醒` : ''}`);
      router.refresh();
      window.dispatchEvent(new Event('reminders:check')); // 新提醒马上弹通知
    } else {
      setInfo(data.error ?? '操作失败');
    }
    setBusy(false);
  }

  return (
    <Card className="p-4">
      <h2 className="text-[15px] font-medium text-slate-900">时间快进（DEMO_NOW）</h2>
      <p className="mt-1 text-xs text-slate-500">所有风险灯、DDL、提醒都基于这个虚拟时间。当前：{demoNow.replace('T', ' ')}</p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act('shift', 1)}>+1 天</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act('shift', 3)}>+3 天</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => act('reset')}>重置</Button>
      </div>
      {info && <p className="mt-2 text-xs text-brand-700">{info}</p>}
    </Card>
  );
}

export function ResetDemo() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function reset() {
    if (!window.confirm('重置会清空所有演示改动并重新生成种子数据，确定？')) return;
    setBusy(true);
    await fetch('/api/reset', { method: 'POST' });
    setBusy(false);
    router.refresh();
  }

  return <Button variant="danger" size="sm" disabled={busy} onClick={reset}>{busy ? '重置中…' : '重置 Demo 数据'}</Button>;
}