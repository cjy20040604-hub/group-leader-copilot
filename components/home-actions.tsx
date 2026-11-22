'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Select, SectionTitle } from '@/components/ui';
import { PlusIcon } from '@/components/icons';

type CourseOpt = { id: string; name: string; color: string };
type MemberOpt = { id: string; name: string };

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '操作失败');
  return data;
}

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

// 首页「会议安排」：组长自己新建、删除；确认纪要时约的下次会也会自动出现在这里
export function ScheduleCard({ courses, ledCourseIds, items, today }: {
  courses: CourseOpt[];
  ledCourseIds: string[];
  items: { id: string; courseId: string; date: string }[];
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ledCourses = courses.filter((c) => ledCourseIds.includes(c.id));
  const isLeader = ledCourses.length > 0;
  const [courseId, setCourseId] = useState(ledCourses[0]?.id ?? '');
  const [date, setDate] = useState(today);
  const [error, setError] = useState('');
  const courseOf = (id: string) => courses.find((c) => c.id === id);

  async function add() {
    setError('');
    try { await send('/api/schedule', 'POST', { courseId, date }); setOpen(false); router.refresh(); } catch (e) { setError((e as Error).message); }
  }
  async function remove(id: string) {
    setError('');
    try { await send(`/api/schedule?id=${encodeURIComponent(id)}`, 'DELETE'); router.refresh(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <section aria-label="会议安排">
      <SectionTitle aside={isLeader && !open && <Button size="sm" variant="outline" onClick={() => setOpen(true)}><PlusIcon />安排会议</Button>}>会议安排</SectionTitle>
      <Card className="divide-y divide-slate-100">
        {open && (
          <div className="flex flex-wrap items-center gap-2 px-5 py-3">
            <Select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="text-xs" aria-label="会议课程">
              {ledCourses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className="text-xs" aria-label="会议日期" />
            <Button size="sm" disabled={!courseId || !date} onClick={add}>安排</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>取消</Button>
          </div>
        )}
        {items.length === 0 && !open && <p className="px-5 py-4 text-sm text-slate-400">还没有安排会议。确认纪要时约好的下次会会自动加进来。</p>}
        {items.map((m) => {
          const c = courseOf(m.courseId);
          return (
            <div key={m.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: c?.color ?? '#64748b' }} aria-hidden />
              <span className="flex-1">{c?.name ?? m.courseId} · {m.date === today ? '今天' : md(m.date)}</span>
              <Link href={`/app/meeting/live?course=${m.courseId}`} className="text-xs text-brand-600 hover:underline">{m.date === today ? '进会议室' : '会前准备'}</Link>
              {ledCourseIds.includes(m.courseId) && <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => remove(m.id)} aria-label={`取消 ${c?.name} ${m.date} 的会`}>删除</button>}
            </div>
          );
        })}
        {error && <p className="px-5 py-2 text-xs text-red-600">{error}</p>}
      </Card>
    </section>
  );
}

// 首页「最紧急的事」旁边的新建任务（组长用）
export function QuickNewTask({ courses, rosters }: { courses: CourseOpt[]; rosters: Record<string, MemberOpt[]> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');

  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}><PlusIcon />新建任务</Button>;
  async function add() {
    setError('');
    try {
      await send('/api/tasks', 'POST', { courseId, title, ownerId: ownerId || null, dueDate: dueDate || null });
      setTitle(''); setOwnerId(''); setDueDate(''); setOpen(false); router.refresh();
    } catch (e) { setError((e as Error).message); }
  }
  return (
    <Card className="mt-2 flex w-full flex-wrap items-center gap-2 p-2">
      <Select value={courseId} onChange={(e) => { setCourseId(e.target.value); setOwnerId(''); }} className="text-xs" aria-label="新任务课程">
        {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="要做什么" className="min-w-40 flex-1 text-xs" aria-label="新任务内容" />
      <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="text-xs" aria-label="新任务负责人">
        <option value="">待认领</option>
        {(rosters[courseId] ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </Select>
      <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="text-xs" aria-label="新任务 DDL" />
      <Button size="sm" disabled={!title.trim()} onClick={add}>添加</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>取消</Button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </Card>
  );
}

export function DeleteTaskButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button disabled={busy} className="text-xs text-slate-400 hover:text-red-600" aria-label={`删除任务 ${title}`}
      onClick={async () => {
        if (!window.confirm(`删除「${title}」？相关提醒和进度记录会一起删掉。`)) return;
        setBusy(true);
        try { await send('/api/tasks', 'DELETE', { id }); router.refresh(); } finally { setBusy(false); }
      }}>删除</button>
  );
}
