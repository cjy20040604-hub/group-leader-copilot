'use client';

import { useState } from 'react';
import { Card, Input, Select } from '@/components/ui';
import { computeEconomics, marginAtScale, PRO, ASR_FILE, ASR_REALTIME, type EconInputs } from '@/lib/unit-economics';

// 单位经济计算器：改假设，立刻看到每组成本、边际贡献、盈亏平衡（确定性代码，不调模型）
const FIELDS: { key: keyof EconInputs; label: string; step: number; min: number; suffix?: string }[] = [
  { key: 'meetingsPerSemester', label: '每组每学期会议', step: 1, min: 0, suffix: '次' },
  { key: 'meetingHours', label: '每次会时长', step: 0.5, min: 0, suffix: '小时' },
  { key: 'qaPerSemester', label: '每组每学期问答', step: 10, min: 0, suffix: '次' },
  { key: 'recordedHours', label: '每组每学期实时转写', step: 1, min: 0, suffix: '小时' },
  { key: 'pricePerSemester', label: '定价', step: 1, min: 0, suffix: '元/组/学期' },
  { key: 'freeToPaid', label: '体验版小组 : 付费组', step: 1, min: 0, suffix: ': 1' },
  { key: 'freeMeetingsPerSemester', label: '体验版额度', step: 1, min: 0, suffix: '次/学期' },
  { key: 'fixedPerMonth', label: '固定成本', step: 10, min: 0, suffix: '元/月' },
];

const yuan = (n: number, d = 2) => (Number.isFinite(n) ? `¥${n.toFixed(d)}` : '—');
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function UnitEconCalculator() {
  const [v, setV] = useState<EconInputs>(PRO);
  const r = computeEconomics(v);
  const set = (key: keyof EconInputs, raw: string) => {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) setV((prev) => ({ ...prev, [key]: n }));
  };
  return (
    <Card className="space-y-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FIELDS.map((f) => (
          <label key={f.key} className="text-xs text-slate-500">
            {f.label}
            <span className="mt-1 flex items-center gap-1">
              <Input type="number" min={f.min} step={f.step} value={v[f.key]} onChange={(e) => set(f.key, e.target.value)} className="py-1 text-sm" aria-label={f.label} />
              {f.suffix && <span className="shrink-0 text-[11px]">{f.suffix}</span>}
            </span>
          </label>
        ))}
        <label className="text-xs text-slate-500">
          转写方式
          <Select value={String(v.asrPerSecond)} onChange={(e) => set('asrPerSecond', e.target.value)} className="mt-1 w-full py-1 text-sm" aria-label="转写方式">
            <option value={String(ASR_FILE)}>录音文件识别 ¥{ASR_FILE}/秒</option>
            <option value={String(ASR_REALTIME)}>会议室实时转写 ¥{ASR_REALTIME}/秒</option>
          </Select>
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['每组变动成本', yuan(r.variableCost), `模型 ${yuan(r.modelCost)} + 转写 ${yuan(r.asrCost)}`],
          ['每个体验版小组', yuan(r.freeCostPerUser), '每学期模型成本'],
          ['每组边际贡献', yuan(r.contribution), `净收入 ${yuan(r.netRevenue)}（扣通道费 ${pct(v.paymentFeeRate)}）`],
          ['单组贡献率', pct(r.unitMargin), '不含固定成本'],
          ['盈亏平衡', Number.isFinite(r.breakEvenGroups) ? `${r.breakEvenGroups} 组` : '亏损', `固定成本 ${yuan(r.fixedPerSemester, 0)}/学期`],
          ['500 组时整体毛利', pct(marginAtScale(v, 500)), `200 组时 ${pct(marginAtScale(v, 200))}`],
        ].map(([title, value, hint]) => (
          <div key={title} className="rounded-lg bg-slate-50 p-2">
            <p className="text-[11px] text-slate-500">{title}</p>
            <p className={`text-lg font-medium ${title === '盈亏平衡' && value === '亏损' ? 'text-red-600' : ''}`}>{value}</p>
            <p className="text-[11px] text-slate-400">{hint}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400">单价是百炼原价（见上表）；会议次数、时长、问答、录音、体验版小组比例、固定成本、通道费都是假设 · 待验证。体验版按每学期 {v.freeMeetingsPerSemester} 次纪要、只用文字稿算。</p>
    </Card>
  );
}
