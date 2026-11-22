import { getDemoNow } from '@/lib/time';
import { loadMetrics } from '@/lib/metrics';
import { Card, Badge, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { tone: 'green' | 'red' | 'slate' | 'blue'; label: string }> = {
  ok: { tone: 'green', label: '达标' }, bad: { tone: 'red', label: '未达标' }, na: { tone: 'slate', label: '数据不足' }, track: { tone: 'blue', label: '跟踪' },
};

export default function MetricsPage() {
  const { metrics, weeks } = loadMetrics(getDemoNow());
  const max = Math.max(1, ...weeks.map((w) => w.total));
  return (
    <div className="space-y-8">
      <PageHeader title="成功指标" lede="全部从业务数据直接算，不调模型。目标值是假设，待验证。" />

      <Card className="p-6">
        <p className="text-sm text-slate-500">北极星</p>
        <p className="mt-0.5 text-[15px] font-semibold text-slate-900">每周确认的决定数</p>
        <div className="mt-3 flex items-end gap-4" aria-label="最近 4 周确认的决定数">
          {weeks.map((w) => (
            <div key={w.label} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-sm font-semibold tabular-nums text-slate-900">{w.total}</span>
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

      <div className="grid gap-4 md:grid-cols-2">
        {metrics.map((m) => (
          <Card key={m.key} className="space-y-1.5 p-5" title={`为什么看它：${m.why}\n数据来源：${m.source}`}>
            <div className="flex items-center gap-2">
              <p className="flex-1 text-sm font-semibold">{m.name}</p>
              <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge>
            </div>
            <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{m.value}</p>
            <p className="text-xs text-slate-500">目标：{m.target}{m.detail ? ` · ${m.detail}` : ''}</p>
            <p className="text-xs text-slate-600">{m.definition}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
