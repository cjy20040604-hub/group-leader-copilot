'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';
import type { TaskAction } from '@/lib/task-flow';

export function ReminderReply({ reminderId, ownerName, done, awaiting, minDate, responded }: {
  reminderId: string; ownerName: string | null; done: boolean; awaiting: boolean; minDate?: string; responded: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<'' | 'block' | 'extend'>('');
  const [text, setText] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<string | null>(null);

  async function reply(action: TaskAction) {
    setBusy(true);
    setError('');
    const res = await fetch('/api/reminders/reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reminderId, action }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? '回复失败'); return; }
    setSent(data.response);
    router.refresh();
  }

  if (!ownerName) return <p className="text-sm text-slate-600">这个任务还没人认领。<a href="/app/tasks" className="text-brand-600 underline">去认领</a></p>;
  if (done) return <p className="text-sm text-green-700">✅ 已经完成了，不用再回复。</p>;
  if (sent) return <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">已告诉组长：{sent}。<a href="/app/tasks" className="ml-1 underline">看我的全部待办</a></p>;
  return (
    <div className="space-y-2">
      {responded && <p className="text-xs text-slate-500">上次回复：{responded}</p>}
      {awaiting ? <p className="text-sm text-slate-600">已经交给组长确认了，等组长回复就行。</p> : (
        <>
          <p className="text-sm font-medium">{ownerName}，点一下告诉组长：</p>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy} onClick={() => reply({ type: 'progress', note: '收到提醒：在做，能按时交' })}>在做，能按时交</Button>
            <Button disabled={busy} variant="outline" onClick={() => reply({ type: 'submit', note: '收到提醒：做完了' })}>✅ 做完了</Button>
            <Button disabled={busy} variant="outline" onClick={() => setForm(form === 'block' ? '' : 'block')}>🆘 卡住了</Button>
            <Button disabled={busy} variant="outline" onClick={() => setForm(form === 'extend' ? '' : 'extend')}>📅 要延期</Button>
          </div>
          {form === 'block' && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void reply({ type: 'block', reason: text }); }}>
              <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="卡在哪、需要谁帮忙" maxLength={100} className="text-sm" aria-label="卡在哪" />
              <Button type="submit" disabled={busy || !text.trim()}>发送</Button>
            </form>
          )}
          {form === 'extend' && (
            <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim() && date) void reply({ type: 'request_extension', proposedDue: date, reason: text }); }}>
              <Input type="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} className="w-40 text-sm" aria-label="延到哪天" />
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="为什么要延期" maxLength={100} className="min-w-40 flex-1 text-sm" aria-label="延期理由" />
              <Button type="submit" disabled={busy || !text.trim() || !date}>发送</Button>
            </form>
          )}
        </>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
