'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Badge, Input, Select, cx } from '@/components/ui';
import { PlusIcon } from '@/components/icons';

interface Member { id: string; name: string; aliasesJson: string }
interface Course { id: string; name: string; color: string }
type Role = 'leader' | 'member';
interface Props {
  members: Member[];
  courses: Course[];                                  // 当前用户所在的小组
  memberships: Record<string, Record<string, Role>>;  // courseId → memberId → 角色
  ledCourseIds: string[];                             // 当前用户当组长的小组：只有这些列能改
  currentUserId: string;
}
interface Draft { name: string; aliases: string }

const emptyDraft: Draft = { name: '', aliases: '' };

// 花名册 + 小组成员：一个人可以在 A 课当组长、在 B 课当组员，也可以不在某门课的小组里
export function RosterManager({ members, courses, memberships, ledCourseIds, currentUserId }: Props) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);
  const [newCourses, setNewCourses] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canManage = ledCourseIds.length > 0;

  async function call(url: string, method: string, body: object): Promise<boolean> {
    setBusy(true);
    setError('');
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? '保存失败'); return false; }
    router.refresh();
    return true;
  }

  const aliasesOf = (m: Member) => (JSON.parse(m.aliasesJson) as string[]).join('、');
  const roleLabel = (r?: Role) => (r === 'leader' ? '组长' : r === 'member' ? '组员' : '不在本组');

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            <th className="px-4 py-2.5 font-normal">成员</th>
            <th className="px-4 py-2.5 font-normal">别名（转写里的称呼）</th>
            {courses.map((c) => (
              <th key={c.id} className="whitespace-nowrap px-4 py-2.5 font-normal">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c.color }} aria-hidden />{c.name}</span>
              </th>
            ))}
            {canManage && <th className="px-4 py-2.5 font-normal" />}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-b border-slate-100 last:border-0">
              {editingId === m.id ? (
                <>
                  <td className="px-4 py-2"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="text-xs" aria-label="成员姓名" /></td>
                  <td className="px-4 py-2"><Input value={draft.aliases} onChange={(e) => setDraft({ ...draft, aliases: e.target.value })} className="text-xs" aria-label="成员别名" placeholder="逗号分隔" /></td>
                </>
              ) : (
                <>
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-900">{m.name}{m.id === currentUserId && <Badge tone="blue" className="ml-1.5">当前身份</Badge>}</td>
                  <td className="px-4 py-2.5 text-slate-500">{aliasesOf(m) || '—'}</td>
                </>
              )}
              {courses.map((c) => {
                const role = memberships[c.id]?.[m.id];
                const editable = ledCourseIds.includes(c.id);
                return (
                  <td key={c.id} className="px-4 py-2">
                    {editable ? (
                      <Select value={role ?? ''} disabled={busy} aria-label={`${m.name}在${c.name}的角色`}
                        className={cx('py-1 pl-2 pr-7 text-xs', !role && 'text-slate-400')}
                        onChange={(e) => void call('/api/course-members', 'PUT', { courseId: c.id, memberId: m.id, role: e.target.value || null })}>
                        <option value="leader">组长</option>
                        <option value="member">组员</option>
                        <option value="">不在本组</option>
                      </Select>
                    ) : <span className={cx('text-xs', role ? 'text-slate-700' : 'text-slate-400')}>{roleLabel(role)}</span>}
                  </td>
                );
              })}
              {canManage && (
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  {editingId === m.id ? (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" disabled={busy} onClick={async () => { if (await call('/api/members', 'PATCH', { id: m.id, ...draft })) setEditingId(null); }}>保存</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setError(''); }}>取消</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => { setEditingId(m.id); setDraft({ name: m.name, aliases: (JSON.parse(m.aliasesJson) as string[]).join('，') }); setError(''); }}>改名</Button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {adding && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
          <Input value={newDraft.name} onChange={(e) => setNewDraft({ ...newDraft, name: e.target.value })} className="w-32 text-xs" aria-label="新成员姓名" placeholder="姓名" />
          <Input value={newDraft.aliases} onChange={(e) => setNewDraft({ ...newDraft, aliases: e.target.value })} className="w-44 text-xs" aria-label="新成员别名" placeholder="别名，逗号分隔" />
          <span className="text-xs text-slate-500">加进：</span>
          {courses.filter((c) => ledCourseIds.includes(c.id)).map((c) => (
            <label key={c.id} className="inline-flex items-center gap-1 text-xs text-slate-700">
              <input type="checkbox" checked={newCourses.has(c.id)} onChange={() => setNewCourses((prev) => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} />{c.name}
            </label>
          ))}
          <Button size="sm" disabled={busy || !newDraft.name.trim()} onClick={async () => {
            if (await call('/api/members', 'POST', { ...newDraft, courseIds: [...newCourses] })) { setAdding(false); setNewDraft(emptyDraft); setNewCourses(new Set()); }
          }}>添加</Button>
          <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setError(''); }}>取消</Button>
        </div>
      )}
      {canManage && !adding && (
        <div className="border-t border-slate-100 px-4 py-3">
          <Button size="sm" variant="outline" onClick={() => { setAdding(true); setEditingId(null); }}><PlusIcon />添加成员</Button>
        </div>
      )}
      {error && <p className="px-4 pb-3 text-xs text-red-600">{error}</p>}
      {!canManage && <p className="px-4 pb-3 text-xs text-slate-400">只有组长能改自己小组的成员。</p>}
    </Card>
  );
}
