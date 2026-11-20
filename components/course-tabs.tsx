'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Select, Input, cx, EmptyState } from '@/components/ui';
import { AskPanel } from '@/components/ask-panel';
import { BriefingButton } from '@/components/briefing-button';
import { riskLevel, taskDueText, RISK_LABEL, type TaskStatus } from '@/lib/risk';

export interface TaskRow {
  id: string; courseId: string; meetingId: string; title: string; ownerId: string | null;
  dueDate: string | null; status: string; lastUpdateAt: string | null; progressNote: string | null;
}
export interface MeetingRow { id: string; date: string; title: string; }
export interface MemberRow { id: string; name: string; role: string; }

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'unclaimed', label: '待认领' },
  { status: 'in_progress', label: '进行中' },
  { status: 'awaiting_review', label: '待审核' },
  { status: 'done', label: '已完成' },
];

export function CourseTabs({ course, meetings, tasks, members, currentUserId, isLeader, demoNow }: {
  course: { id: string; name: string; color: string };
  meetings: MeetingRow[];
  tasks: TaskRow[];
  members: MemberRow[];
  currentUserId: string;
  isLeader: boolean;
  demoNow: string;
}) {
  const [tab, setTab] = useState<'minutes' | 'kanban' | 'ask'>('kanban');
  const router = useRouter();
  const now = new Date(demoNow);
  const visible = isLeader ? tasks : tasks.filter((t) => t.ownerId === currentUserId);
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? '待认领';

  async function callTasks(method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>) {
    const res = await fetch('/api/tasks', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? '操作失败');
    }
    router.refresh();
    return res.ok;
  }
  const updateTask = (id: string, patch: Record<string, unknown>) => callTasks('PATCH', { id, ...patch });
  async function deleteTask(id: string, title: string) {
    if (!confirm(`删除任务「${title}」？它的提醒也会一起删掉，不能撤销。`)) return;
    await callTasks('DELETE', { id });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="h-3 w-3 rounded-full" style={{ background: course.color }} aria-hidden />
        <h1 className="text-xl font-bold">{course.name}</h1>
        <div className="ml-auto"><BriefingButton courseId={course.id} /></div>
      </div>

      <div role="tablist" aria-label="课程页签" className="flex gap-1 border-b border-slate-200">
        {([['minutes', '纪要列表'], ['kanban', '任务看板'], ['ask', '问问上次']] as const).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={cx('px-4 py-2 text-sm', tab === key ? 'border-b-2 border-brand-600 font-medium text-brand-700' : 'text-slate-500 hover:text-slate-700')}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'minutes' && (
        <div className="space-y-2">
          {meetings.length === 0 && <EmptyState title="还没有纪要" hint="去「新建会议」粘贴转写" />}
          {meetings.map((m) => (
            <Link key={m.id} href={`/app/meeting/${m.id}`}>
              <Card className="flex items-center justify-between p-3 hover:border-brand-500">
                <div>
                  <p className="text-sm font-medium">{m.title}</p>
                  <p className="text-xs text-slate-500">{m.date}</p>
                </div>
                <span className="text-xs text-brand-600">查看 →</span>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {tab === 'kanban' && (
        <div>
          {!isLeader && <p className="mb-2 text-xs text-slate-500">组员视图：只显示你的任务，可拖拽改状态、填一句进度。</p>}
          {isLeader && <NewTaskForm members={members} onCreate={(t) => callTasks('POST', { courseId: course.id, ...t })} />}
          <div className="grid gap-3 md:grid-cols-4">
            {COLUMNS.map((col) => {
              const colTasks = visible.filter((t) => t.status === col.status);
              return (
                <div key={col.status} role="list" aria-label={col.label}
                  className="rounded-xl bg-slate-100 p-2"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData('text/task-id');
                    if (id) updateTask(id, { status: col.status });
                  }}>
                  <p className="mb-2 px-1 text-xs font-semibold text-slate-600">{col.label}（{colTasks.length}）</p>
                  <div className="space-y-2">
                    {colTasks.map((t) => {
                      const risk = riskLevel({ dueDate: t.dueDate, status: t.status as TaskStatus, lastUpdateAt: t.lastUpdateAt }, now);
                      return (
                        <Card key={t.id} draggable
                          onDragStart={(e) => e.dataTransfer.setData('text/task-id', t.id)}
                          className="cursor-grab p-2.5 active:cursor-grabbing">
                          <div className="flex items-start gap-1.5">
                            <span aria-label={`风险 ${risk}`}>{RISK_LABEL[risk]}</span>
                            <p className="text-xs font-medium leading-snug">{t.title}</p>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">{nameOf(t.ownerId)} · {taskDueText(t, now)}</p>
                          {t.progressNote && <p className="mt-1 text-[11px] text-slate-400">「{t.progressNote}」</p>}
                          <div className="mt-2 flex gap-1">
                            <Select value={t.status} onChange={(e) => updateTask(t.id, { status: e.target.value })} className="flex-1 px-1 py-0.5 text-[11px]" aria-label="改状态">
                              {COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
                            </Select>
                            {isLeader && t.status === 'unclaimed' && (
                              <Select value="" onChange={(e) => e.target.value && updateTask(t.id, { ownerId: e.target.value, status: 'in_progress' })} className="px-1 py-0.5 text-[11px]" aria-label="认领">
                                <option value="">认领…</option>
                                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                              </Select>
                            )}
                          </div>
                          <ProgressNote taskId={t.id} initial={t.progressNote ?? ''} onSave={(note) => updateTask(t.id, { progressNote: note })} />
                          {isLeader && (
                            <div className="mt-1 flex items-center gap-1">
                              <Input type="date" value={t.dueDate ?? ''} onChange={(e) => updateTask(t.id, { dueDate: e.target.value || null })}
                                className="px-1 py-0.5 text-[11px]" aria-label={`改「${t.title}」的 DDL`} title="改 DDL（提醒会按新日期重建）" />
                              <Button size="sm" variant="ghost" className="px-1.5 py-0.5 text-[11px]" onClick={() => deleteTask(t.id, t.title)} aria-label={`删除「${t.title}」`}>删除</Button>
                            </div>
                          )}
                        </Card>
                      );
                    })}
                    {colTasks.length === 0 && <p className="px-1 py-3 text-center text-[11px] text-slate-400">拖任务到这里</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'ask' && <AskPanel courseId={course.id} />}
    </div>
  );
}

function NewTaskForm({ members, onCreate }: { members: MemberRow[]; onCreate: (t: { title: string; ownerId: string | null; dueDate: string | null }) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  if (!open) return <Button size="sm" variant="outline" className="mb-3" onClick={() => setOpen(true)}>+ 新建任务</Button>;
  return (
    <Card className="mb-3 flex flex-wrap items-center gap-2 p-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="要做什么" className="min-w-48 flex-1 text-xs" aria-label="新任务内容" />
      <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="text-xs" aria-label="新任务负责人">
        <option value="">待认领</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </Select>
      <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="text-xs" aria-label="新任务 DDL" />
      <Button size="sm" disabled={!title.trim()} onClick={async () => {
        if (await onCreate({ title, ownerId: ownerId || null, dueDate: dueDate || null })) { setTitle(''); setOwnerId(''); setDueDate(''); setOpen(false); }
      }}>添加</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>取消</Button>
    </Card>
  );
}

function ProgressNote({ taskId, initial, onSave }: { taskId: string; initial: string; onSave: (note: string) => void }) {
  const [note, setNote] = useState(initial);
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return <button className="mt-1 text-[11px] text-brand-600 hover:underline" onClick={() => setEditing(true)}>✏️ 填一句进度</button>;
  }
  return (
    <div className="mt-1 flex gap-1">
      <Input value={note} onChange={(e) => setNote(e.target.value)} className="px-1.5 py-0.5 text-[11px]" placeholder="一句进度…" aria-label={`任务 ${taskId} 进度`} />
      <Button size="sm" variant="outline" className="px-1.5 py-0.5 text-[11px]" onClick={() => { onSave(note); setEditing(false); }}>存</Button>
    </div>
  );
}