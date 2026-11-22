'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui';

export interface ReminderView { id: string; message: string; kind: string; fireDate: string; respondedAt: string | null; response: string | null }

const KIND: Record<string, string> = { overdue: '过期提醒', d1: 'D-1 提醒', d3: 'D-3 提醒' };

export async function copyWithLink(message: string, reminderId: string) {
  const text = `${message}\n点这里回复进度：${window.location.origin}/r/${reminderId}`;
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
}

// 提醒卡片：组长复制「带回复链接」的提醒发到群里；组员点链接回复后，这里显示回复内容（提醒闭环）
export function ReminderCard({ r, isLeader }: { r: ReminderView; isLeader: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Card className="p-3">
      <p className="text-xs text-slate-700">{r.message}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <span className="flex-1">{KIND[r.kind] ?? r.kind} · {r.fireDate}</span>
        {r.response
          ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">✓ 已回复：{r.response}</span>
          : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">未回复</span>}
        {isLeader
          ? <button className="text-brand-600 hover:underline" onClick={async () => { await copyWithLink(r.message, r.id); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? '已复制' : '复制（带回复链接）'}</button>
          : <Link href={`/r/${r.id}`} className="text-brand-600 hover:underline">回复进度 →</Link>}
      </div>
    </Card>
  );
}

// 「最紧急的事」卡片里的提醒：组长一键复制带回复链接的提醒，组员直接去回复
export function ReminderChip({ r, isLeader }: { r: ReminderView; isLeader: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <p className="flex w-full flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
      <span>{KIND[r.kind] ?? r.kind}</span>
      {r.response
        ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">✓ 已回复：{r.response}</span>
        : <span className="rounded-full bg-slate-100 px-2 py-0.5">未回复</span>}
      {isLeader
        ? <button className="text-brand-600 hover:underline" onClick={async () => { await copyWithLink(r.message, r.id); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? '已复制' : '复制提醒（带回复链接）'}</button>
        : <Link href={`/r/${r.id}`} className="text-brand-600 hover:underline">回复进度 →</Link>}
    </p>
  );
}
