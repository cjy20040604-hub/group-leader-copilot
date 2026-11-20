'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Badge, Input, Select } from '@/components/ui';

interface Member { id: string; name: string; role: string; aliasesJson: string }
interface Props { members: Member[]; currentUserId: string; isLeader: boolean }
interface Draft { name: string; role: string; aliases: string }

const emptyDraft: Draft = { name: '', role: 'member', aliases: '' };

export function RosterManager({ members, currentUserId, isLeader }: Props) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(method: 'POST' | 'PATCH', body: object): Promise<boolean> {
    setBusy(true);
    setError('');
    const res = await fetch('/api/members', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error ?? '保存失败'); return false; }
    router.refresh();
    return true;
  }

  const aliasesOf = (m: Member) => (JSON.parse(m.aliasesJson) as string[]).join('、');

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="p-2">成员</th><th className="p-2">角色</th><th className="p-2">别名（转写里的称呼）</th>{isLeader && <th className="p-2">操作</th>}</tr></thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-b border-slate-100">
              {editingId === m.id ? (
                <>
                  <td className="p-2"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="text-xs" aria-label="成员姓名" /></td>
                  <td className="p-2">
                    <Select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} className="text-xs" aria-label="成员角色">
                      <option value="leader">组长</option>
                      <option value="member">组员</option>
                    </Select>
                  </td>
                  <td className="p-2"><Input value={draft.aliases} onChange={(e) => setDraft({ ...draft, aliases: e.target.value })} className="text-xs" aria-label="成员别名" placeholder="逗号分隔" /></td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Button size="sm" disabled={busy} onClick={async () => { if (await send('PATCH', { id: m.id, ...draft })) setEditingId(null); }}>保存</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setError(''); }}>取消</Button>
                    </div>
                  </td>
                </>
              ) : (
                <>
                  <td className="p-2 font-medium">{m.name}{m.id === currentUserId && <Badge tone="blue" className="ml-1">当前身份</Badge>}</td>
                  <td className="p-2">{m.role === 'leader' ? '组长' : '组员'}</td>
                  <td className="p-2 text-slate-500">{aliasesOf(m) || '—'}</td>
                  {isLeader && (
                    <td className="p-2">
                      <Button size="sm" variant="ghost" onClick={() => { setEditingId(m.id); setDraft({ name: m.name, role: m.role, aliases: (JSON.parse(m.aliasesJson) as string[]).join('，') }); setError(''); }}>编辑</Button>
                    </td>
                  )}
                </>
              )}
            </tr>
          ))}
          {adding && (
            <tr className="border-b border-slate-100 bg-slate-50">
              <td className="p-2"><Input value={newDraft.name} onChange={(e) => setNewDraft({ ...newDraft, name: e.target.value })} className="text-xs" aria-label="新成员姓名" placeholder="姓名" /></td>
              <td className="p-2">
                <Select value={newDraft.role} onChange={(e) => setNewDraft({ ...newDraft, role: e.target.value })} className="text-xs" aria-label="新成员角色">
                  <option value="member">组员</option>
                  <option value="leader">组长</option>
                </Select>
              </td>
              <td className="p-2"><Input value={newDraft.aliases} onChange={(e) => setNewDraft({ ...newDraft, aliases: e.target.value })} className="text-xs" aria-label="新成员别名" placeholder="别名，逗号分隔" /></td>
              <td className="p-2">
                <div className="flex gap-1">
                  <Button size="sm" disabled={busy || !newDraft.name.trim()} onClick={async () => { if (await send('POST', newDraft)) { setAdding(false); setNewDraft(emptyDraft); } }}>添加</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setError(''); }}>取消</Button>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {isLeader && !adding && (
        <div className="p-2">
          <Button size="sm" variant="outline" onClick={() => { setAdding(true); setEditingId(null); }}>+ 添加成员</Button>
        </div>
      )}
      {error && <p className="px-2 pb-2 text-xs text-red-600">{error}</p>}
      {!isLeader && <p className="p-2 text-[11px] text-slate-400">只有组长能改花名册。</p>}
    </Card>
  );
}