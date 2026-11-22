'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@/components/ui';
import { clearSeenReminders } from '@/components/reminder-notifier';

export function TimeTravel({ demoNow }: { demoNow: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  // 重置 Demo 数据后，上一次快进留下的提示已经不对了
  useEffect(() => {
    const clear = () => setInfo('');
    window.addEventListener('demo:reset', clear);
    return () => window.removeEventListener('demo:reset', clear);
  }, []);

  async function act(action: 'shift' | 'reset', days?: number) {
    setBusy(true);
    if (action === 'reset') clearSeenReminders(); // 拨回去以后再快进，同一批提醒要能重新弹出来
    const res = await fetch('/api/time', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, days }) });
    const data = await res.json();
    if (res.ok) {
      const when = data.demoNow.replace('T', ' ').slice(0, 16);
      setInfo(action === 'reset'
        ? `已回到 ${when}。再点「+1 天」「+3 天」，到期提醒会重新弹出来。`
        : `现在是 ${when}${data.remindersCreated ? `，新生成 ${data.remindersCreated} 条提醒，右下角会弹出来` : '，这段时间没有新的到期提醒'}。`);
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
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function reset() {
    if (!window.confirm('重置会清空所有演示改动，重新生成种子数据，演示时间也回到 11 月 19 日。确定吗？')) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/reset', { method: 'POST' }).catch(() => null);
    const data = await res?.json().catch(() => ({})) ?? {};
    setBusy(false);
    if (!res?.ok) { setMsg({ ok: false, text: data.error ?? '重置失败，请再试一次' }); return; }
    clearSeenReminders();
    window.dispatchEvent(new Event('demo:reset'));
    setMsg({ ok: true, text: `已重置：数据回到初始状态，演示时间回到 ${String(data.demoNow ?? '2026-11-19T09:00').replace('T', ' ').slice(0, 16)}。` });
    router.refresh();
    window.dispatchEvent(new Event('reminders:check'));
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="danger" size="sm" disabled={busy} onClick={reset}>{busy ? '重置中…' : '重置 Demo 数据'}</Button>
      {msg && <p className={`text-xs ${msg.ok ? 'text-brand-700' : 'text-red-600'}`} role="status">{msg.text}</p>}
    </div>
  );
}