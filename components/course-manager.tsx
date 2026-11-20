'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input } from '@/components/ui';

interface Props {
  courses: { id: string; name: string; color: string }[];
  isLeader: boolean;
}

export function CourseManager({ courses, isLeader }: Props) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError('');
    const res = await fetch('/api/courses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error ?? '新建失败'); return; }
    setName('');
    router.refresh();
  }

  return (
    <Card className="p-4">
      <ul className="flex flex-wrap gap-2 text-xs">
        {courses.map((c) => (
          <li key={c.id} className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1">
            <span className="h-2 w-2 rounded-full" style={{ background: c.color }} aria-hidden />
            {c.name}
          </li>
        ))}
      </ul>
      {isLeader ? (
        <>
          <div className="mt-3 flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="新课程/小组名，比如：摄影社、毕设小组" aria-label="新课程或小组名称" className="text-xs" />
            <Button onClick={create} disabled={busy || !name.trim()}>{busy ? '新建中…' : '+ 新建'}</Button>
          </div>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          <p className="mt-2 text-[11px] text-slate-400">新课程/小组的记忆从零开始：纪要、任务、问答全套可用，问答查不到会如实说「记录里没找到」。成员共用上方花名册。</p>
        </>
      ) : (
        <p className="mt-2 text-[11px] text-slate-400">只有组长能新建课程/小组。</p>
      )}
    </Card>
  );
}