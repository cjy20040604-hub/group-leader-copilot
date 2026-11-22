'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@/components/ui';

export type PlanTier = 'free' | 'notes' | 'pro' | 'bundle';
export interface PlanRow {
  courseId: string; courseName: string; color: string;
  tier: PlanTier; tierLabel: string;
  payerName: string | null; split: 'single' | 'aa'; groupSize: number;
  meetingsUsed: number; freeMeetings: number;
  recordMinutesUsed: number; recordMinutesQuota: number; addonMinutes: number;
  isLeader: boolean;
}
export interface Prices { notes: number; pro: number; bundle: number; addon: number; addonHours: number; proHours: number }

// 套餐与付款（演示，不接支付、不扣款）：付钱的人可以是组里任何人，也可以 AA；确认决定的仍是组长
// 纪要版只管纪要；专业版多 8 小时会议室实时转写；加时包哪档都能买；实时转写用完照常录音、散会后整理
export function PlanManager({ rows, canBundle, prices }: { rows: PlanRow[]; canBundle: boolean; prices: Prices }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [aa, setAa] = useState<Record<string, boolean>>({});

  async function call(body: object, key: string) {
    setBusy(key); setError('');
    const res = await fetch('/api/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy('');
    if (!res.ok) { setError(data.error ?? '操作失败'); return; }
    router.refresh();
  }

  const priceOf = (t: PlanTier) => (t === 'pro' ? prices.pro : t === 'bundle' ? prices.bundle : prices.notes);

  function usage(r: PlanRow) {
    if (r.tier === 'free') return `本学期纪要 ${r.meetingsUsed} / ${r.freeMeetings} 次，不含实时转写`;
    if (r.recordMinutesQuota === 0) return '纪要不限次，不含实时转写（可以加购）';
    const out = r.recordMinutesUsed >= r.recordMinutesQuota;
    return `纪要不限次，实时转写 ${r.recordMinutesUsed} / ${r.recordMinutesQuota} 分钟${r.addonMinutes ? `（含加时包 ${r.addonMinutes / 60} 小时）` : ''}${out ? '，用完了：照常录音，散会后整理' : ''}`;
  }

  return (
    <Card className="divide-y divide-slate-100">
      {rows.map((r) => {
        const split = aa[r.courseId] ? 'aa' : 'single';
        return (
          <div key={r.courseId} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
            <div className="min-w-40">
              <p className="flex items-center gap-2 text-[15px] font-medium text-slate-900"><span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} aria-hidden />{r.courseName}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {r.tierLabel}
                {r.tier !== 'free' && r.payerName && (r.split === 'aa' ? `，${r.payerName}发起 AA（${r.groupSize} 人每人约 ${(priceOf(r.tier) / r.groupSize).toFixed(2)} 元）` : `，${r.payerName}付款`)}
              </p>
            </div>
            <p className="flex-1 text-xs tabular-nums text-slate-500">{usage(r)}</p>
            <div className="flex flex-wrap items-center gap-2">
              {r.tier === 'free' && (
                <>
                  <Button size="sm" disabled={!!busy} onClick={() => call({ courseId: r.courseId, tier: 'notes', split }, `${r.courseId}-n`)}>开纪要版 {prices.notes} 元</Button>
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => call({ courseId: r.courseId, tier: 'pro', split }, `${r.courseId}-p`)}>开专业版 {prices.pro} 元</Button>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input type="checkbox" className="accent-brand-600" checked={!!aa[r.courseId]} onChange={(e) => setAa({ ...aa, [r.courseId]: e.target.checked })} />全组 AA
                  </label>
                </>
              )}
              {(r.tier === 'notes' || r.tier === 'bundle') && (
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => call({ courseId: r.courseId, tier: 'pro', split: r.split }, `${r.courseId}-p`)}>升专业版（含 {prices.proHours} 小时实时转写）</Button>
              )}
              {r.tier !== 'free' && (
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => call({ courseId: r.courseId, addon: true }, `${r.courseId}-a`)}>加时包 {prices.addonHours} 小时 {prices.addon} 元</Button>
              )}
              {r.tier === 'pro' && (
                <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => call({ courseId: r.courseId, tier: 'notes', split: r.split }, `${r.courseId}-n`)}>改成纪要版</Button>
              )}
              {r.tier !== 'free' && (
                <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => call({ courseId: r.courseId, tier: 'free' }, `${r.courseId}-f`)}>改回体验版</Button>
              )}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        {canBundle && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => call({ bundle: true }, 'bundle')}>多组包：我当组长的小组都开纪要版（{prices.bundle} 元）</Button>}
        <p className="text-xs text-slate-400">演示：不接支付、不扣款。付款的人只决定用不用，确认决定、审批延期仍是这个组的组长。</p>
      </div>
      {error && <p className="px-5 pb-4 text-xs text-red-600">{error}</p>}
    </Card>
  );
}
