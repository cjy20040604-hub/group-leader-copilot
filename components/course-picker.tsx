'use client';

import { useState } from 'react';
import { Button, Input, Select, cx } from '@/components/ui';

export interface CourseOption { id: string; name: string; color?: string }

const NEW = '__new__';

// 新建课程 / 小组（确定性 CRUD，不调 LLM）：下拉框里的「＋ 新建课程…」和首页的新建卡片共用
export async function createCourse(name: string): Promise<{ ok: true; course: CourseOption } | { ok: false; error: string }> {
  const res = await fetch('/api/courses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error ?? '新建失败' };
  return { ok: true, course: { id: data.id, name: data.name ?? name.trim(), color: data.color } };
}

export function NewCourseForm({ onCreated, onCancel, autoFocus = true, className }: {
  onCreated: (c: CourseOption) => void; onCancel?: () => void; autoFocus?: boolean; className?: string;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    const r = await createCourse(name);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setName('');
    onCreated(r.course);
  }
  return (
    <div className={cx('space-y-1', className)}>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Input autoFocus={autoFocus} value={name} onChange={(e) => setName(e.target.value)} maxLength={30}
          placeholder="课程或小组名，比如：大数据分析、毕设小组" aria-label="新课程或小组名称" className="min-w-40 flex-1 py-1.5 text-xs" />
        <Button size="sm" type="submit" disabled={busy || !name.trim()}>{busy ? '新建中…' : '新建'}</Button>
        {onCancel && <Button size="sm" variant="ghost" type="button" onClick={onCancel}>取消</Button>}
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-[11px] text-slate-400">新课程的记录从零开始：纪要、任务、问答都能用，成员共用花名册。</p>
    </div>
  );
}

// 课程下拉框：最后一项「＋ 新建课程…」，选中后就地展开新建表单，建好自动选中
export function CoursePicker({ courses, value, onChange, onCourseCreated, canCreate, disabled, className, label = '选择课程' }: {
  courses: CourseOption[];
  value: string;
  onChange: (id: string) => void;
  onCourseCreated: (c: CourseOption) => void;
  canCreate: boolean;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-2">
      <Select value={creating ? NEW : value} disabled={disabled} aria-label={label} className={className}
        onChange={(e) => {
          if (e.target.value === NEW) { setCreating(true); return; }
          setCreating(false);
          onChange(e.target.value);
        }}>
        {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        {canCreate && <option value={NEW}>＋ 新建课程…</option>}
      </Select>
      {creating && (
        <NewCourseForm
          onCancel={() => setCreating(false)}
          onCreated={(c) => { setCreating(false); onCourseCreated(c); onChange(c.id); }}
        />
      )}
    </div>
  );
}
