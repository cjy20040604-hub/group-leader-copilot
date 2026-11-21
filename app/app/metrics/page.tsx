import { getDemoNow } from '@/lib/time';
import { loadMetrics } from '@/lib/metrics';
import { Card, Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { tone: 'green' | 'red' | 'slate' | 'blue'; label: string }> = {
  ok: { tone: 'green', label: '达标' }, bad: { tone: 'red', label: '未达标' }, na: { tone: 'slate', label: '数据不足' }, track: { tone: 'blue', label: '跟踪' },
};

export default function MetricsPage() {
  const { metrics, weeks } = loadMetrics(getDemoNow());
  const max = Math.max(1, ...weeks.map((w) => w.total));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">成功指标</h1>
        <p className="mt-1 text-sm text-slate-500">怎么判断这个产品真的帮组长减了负：一个北极星，加上回复、自主更新、按时完成、拦下重复讨论，再用「待我处理积压」做护栏。全部从业务数据直接算，不调模型；目标值是假设 · 待验证。</p>
      </div>

      <Card className="p-4">
        <p className="text-sm font-semibold">北极星：每周确认的决定数</p>
        <div className="mt-3 flex items-end gap-4" aria-label="最近 4 周确认的决定数">
          {weeks.map((w) => (
            <div key={w.label} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-sm font-semibold">{w.total}</span>
              <div className="flex w-full max-w-16 flex-col-reverse overflow-hidden rounded-md bg-slate-100" style={{ height: 120 }}>
                {w.byCourse.filter((c) => c.n > 0).map((c) => (
                  <div key={c.name} title={`${c.name} ${c.n} 条`} style={{ height: `${(c.n / max) * 100}%`, background: c.color }} />
                ))}
              </div>
              <span className="text-[11px] text-slate-500">{w.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
          {weeks[0].byCourse.map((c) => <span key={c.name} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c.color }} aria-hidden />{c.name}</span>)}
        </p>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {metrics.map((m) => (
          <Card key={m.key} className="space-y-1.5 p-4">
            <div className="flex items-center gap-2">
              <p className="flex-1 text-sm font-semibold">{m.name}</p>
              <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge>
            </div>
            <p className="text-2xl font-bold">{m.value}</p>
            <p className="text-xs text-slate-500">目标：{m.target}{m.detail ? ` · ${m.detail}` : ''}</p>
            <p className="text-xs text-slate-600">{m.definition}</p>
            <p className="text-xs text-slate-500">为什么看它：{m.why}</p>
            <p className="text-[11px] text-slate-400">数据来源：{m.source}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
