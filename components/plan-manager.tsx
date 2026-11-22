'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@/components/ui';

export interface PlanRow {
  courseId: string; courseName: string; color: string;
  tier: 'free' | 'pro' | 'bundle'; tierLabel: string;
  payerName: string | null; split: 'single' | 'aa'; groupSize: number;
  meetingsUsed: number; freeMeetings: number;
  recordMinutesUsed: number; recordMinutesQuota: number;
  isLeader: boolean;
}

// 套餐与付款（演示，不接支付、不扣款）：付钱的人可以是组里任何人，也可以 AA；确认决定的仍是组长
export function PlanManager({ rows, canBundle, price, bundlePrice }: { rows: PlanRow[]; canBundle: boolean; price: number; bundlePrice: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function call(body: object, key: string) {
    setBusy(key); setError('');
    const res = await fetch('/api/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy('');
    if (!res.ok) { setError(data.error ?? '操作失败'); return; }
    router.refresh();
  }

  return (
    <Card className="divide-y divide-slate-100">
      {rows.map((r) => (
        <div key={r.courseId} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <div className="min-w-40">
            <p className="flex items-center gap-2 text-[15px] font-medium text-slate-900"><span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} aria-hidden />{r.courseName}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {r.tierLabel}
              {r.tier !== 'free' && r.payerName && (r.split === 'aa' ? `，${r.payerName}发起 AA（${r.groupSize} 人每人约 ${(price / r.groupSize).toFixed(2)} 元）` : `，${r.payerName}付款`)}
            </p>
          </div>
          <p className="flex-1 text-xs tabular-nums text-slate-500">
            {r.tier === 'free'
              ? `本学期纪要 ${r.meetingsUsed} / ${r.freeMeetings} 次，不含录音转写`
              : `本学期录音转写 ${r.recordMinutesUsed} / ${r.recordMinutesQuota} 分钟，纪要不限次`}
          </p>
          <div className="flex flex-wrap gap-2">
            {r.tier === 'free' ? (
              <>
                <Button size="sm" disabled={!!busy} onClick={() => call({ courseId: r.courseId, tier: 'pro', split: 'single' }, `${r.courseId}-s`)}>我来付 {price} 元</Button>
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => call({ courseId: r.courseId, tier: 'pro', split: 'aa' }, `${r.courseId}-a`)}>全组 AA</Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => call({ courseId: r.courseId, tier: 'free' }, `${r.courseId}-f`)}>改回体验版</Button>
            )}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        {canBundle && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => call({ bundle: true }, 'bundle')}>用多组包开通我当组长的全部小组（{bundlePrice} 元）</Button>}
        <p className="text-xs text-slate-400">演示：不接支付、不扣款。付款的人只决定用不用，确认决定、审批延期仍是这个组的组长。</p>
      </div>
      {error && <p className="px-5 pb-4 text-xs text-red-600">{error}</p>}
    </Card>
  );
}
