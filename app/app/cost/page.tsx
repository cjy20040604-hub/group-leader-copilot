import { db, schema } from '@/lib/db/client';
import { isMock } from '@/lib/llm';
import { PRICING, ASR_PRICES, ASR_PRICE_PER_SECOND, STANDARD_MEETING } from '@/config/pricing';
import { Card, Badge, EmptyState } from '@/components/ui';
import { UnitEconCalculator } from '@/components/unit-econ-calculator';
import { computeEconomics, textCostPerMeeting, qaCost, BASELINE, SENSITIVITY, ASR_FILE, ASR_REALTIME } from '@/lib/unit-economics';

export const dynamic = 'force-dynamic';

const FEATURE_LABEL: Record<string, string> = {
  extract: '纪要抽取', index: '建索引(embedding)', qa: '问答', briefing: '会前简报', asr: '录音转写(ASR)', search: '检索 embedding', duplicate_check: '重复检测 embedding', live_check: '会中查重 embedding', conflict_check: '冲突检测 embedding',
};

// 成本看板按一条线读：用了哪些模型 → 单次服务成本 → 据此定价 → 商业模式成立吗 → 谁使用、谁付钱
// 数字全部来自 config/pricing.ts 和 lib/unit-economics.ts（与 docs/cost-model.md 一致），不调模型
export default function CostPage() {
  const logs = db.select().from(schema.usageLog).all();
  const mock = isMock();

  const per = (tokens: number, yuanPerM: number) => (tokens * yuanPerM) / 1_000_000;
  const ex = PRICING['qwen3.7-plus'];
  const chat = PRICING['qwen-plus'];
  const emb = PRICING['text-embedding-v4'];
  const meetingExtract = per(STANDARD_MEETING.extract.input, ex.input) + per(STANDARD_MEETING.extract.output, ex.output);
  const meetingIndex = per(STANDARD_MEETING.index.tokens, emb.input);
  const meetingBrief = per(STANDARD_MEETING.briefing.input, chat.input) + per(STANDARD_MEETING.briefing.output, chat.output);
  const meetingText = textCostPerMeeting(1);
  const qa = qaCost();
  const asrFileHour = 3600 * ASR_FILE;
  const asrLiveHour = 3600 * ASR_REALTIME;

  const base = computeEconomics(BASELINE);
  const rt = computeEconomics({ ...BASELINE, asrPerSecond: ASR_REALTIME });
  const price = BASELINE.pricePerSemester;
  const groupCost = base.variableCost + STANDARD_MEETING.infraPerSemester; // 只算这个组自己：模型 + 10 小时录音 + 服务器摊销
  const groupMargin = (price - groupCost) / price;

  const total = logs.reduce((a, b) => a + b.costCny, 0);
  const byFeature = new Map<string, { count: number; cost: number; input: number; output: number }>();
  for (const l of logs) {
    const f = byFeature.get(l.feature) ?? { count: 0, cost: 0, input: 0, output: 0 };
    f.count++; f.cost += l.costCny; f.input += l.inputTokens; f.output += l.outputTokens;
    byFeature.set(l.feature, f);
  }

  const yuan = (n: number, d = 2) => `¥${n.toFixed(d)}`;
  const env = (key: string, fallback: string) => process.env[key] || fallback;

  const models = [
    { step: '会后整理纪要（决定 / 待办 / 待定）', model: env('LLM_MODEL_EXTRACT', 'qwen3.7-plus'), price: `输入 ${ex.input} / 输出 ${ex.output} 元每百万 tokens` },
    { step: '问问上次、会前简报', model: env('LLM_MODEL_CHAT', 'qwen-plus'), price: `输入 ${chat.input} / 输出 ${chat.output} 元每百万 tokens` },
    { step: '检索、「这事定过了」查重', model: env('EMBEDDING_MODEL', 'text-embedding-v4'), price: `${emb.input} 元每百万 tokens` },
    { step: '会议室实时转写', model: env('ASR_MODEL', 'qwen3-asr-flash'), price: `${ASR_PRICES['qwen3-asr-flash'].perSecond} 元每秒` },
    { step: '上传录音转写', model: 'paraformer-v2', price: `${ASR_PRICE_PER_SECOND} 元每秒` },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">成本与商业模式</h1>
        <p className="mt-1 text-sm text-slate-500">按这条线看：用了哪些模型 → 单次服务成本 → 据此定价 → 商业模式成立吗 → 谁使用、谁付钱。</p>
      </div>

      <Step n={1} title="用到的模型和单价" note="阿里云百炼华北 2 原价。提醒、风险灯、任务流转、排会这些都是规则，不花模型钱。">
        <Card className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="p-2">环节</th><th className="p-2">模型</th><th className="p-2">单价</th></tr></thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.step} className="border-b border-slate-100 last:border-0"><td className="p-2">{m.step}</td><td className="p-2 font-mono">{m.model}</td><td className="p-2">{m.price}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Step>

      <Step n={2} title="单次服务成本">
        <Card className="space-y-1.5 p-4 text-sm text-slate-700">
          <p>开一场 1 小时组会，整理纪要 + 建索引 + 会前简报合计约 <b>{yuan(meetingText, 3)}</b>（{meetingExtract.toFixed(3)} + {meetingIndex.toFixed(3)} + {meetingBrief.toFixed(4)}）。</p>
          <p>问一次「问问上次」按上限约 <b>{yuan(qa, 4)}</b>（3k 输入 / 0.4k 输出）。</p>
          <p>转写 1 小时录音：会后上传 <b>{yuan(asrFileHour)}</b>，会议室实时 <b>{yuan(asrLiveHour)}</b>；导入腾讯会议、钉钉的文字稿不花转写钱。</p>
        </Card>
      </Step>

      <Step n={3} title="据此定价" note={`一个小组一学期：24 次会 + 200 次提问 + 10 小时录音 + 服务器摊销 ${STANDARD_MEETING.infraPerSemester} 元，成本约 ${yuan(groupCost)}。`}>
        <div className="grid gap-3 md:grid-cols-3">
          <Tier name="体验版" price="免费" lines={['每月 4 次纪要', '不开录音转写', '让小组先用起来']} />
          <Tier name="专业版" price={`${price} 元 / 组 / 学期`} highlight
            lines={[`一人购买、全组使用，可 AA（5 人约 ${(price / 5).toFixed(2)} 元 / 人）`, '含 10 小时录音转写', `成本 ${yuan(groupCost)}，单组毛利约 ${(groupMargin * 100).toFixed(0)}%`]} />
          <Tier name="团体购入版" price="5 / 4 / 3 元 / 人 / 学期" lines={['30–99 / 100–499 / 500 人以上', '学校、学院、社团统一开通', '管理者看板还没做']} />
        </div>
      </Step>

      <Step n={4} title="商业模式成立吗" note={`再把体验版用户的模型成本（每 1 个付费组带 ${BASELINE.freeToPaid} 个）、支付手续费 ${(BASELINE.paymentFeeRate * 100).toFixed(1)}%、每月 ${BASELINE.fixedPerMonth} 元固定成本都算进去。付费率、用量、固定成本都是假设 · 待验证。`}>
        <div className="grid gap-3 md:grid-cols-3">
          <Figure label="每个付费组的边际贡献" value={yuan(base.contribution)} hint={`贡献率 ${(base.unitMargin * 100).toFixed(1)}%`} />
          <Figure label="回本需要的付费组" value={`${base.breakEvenGroups} 组`} hint={`覆盖一学期 ${base.fixedPerSemester} 元固定成本`} />
          <Figure label="录音全走实时转写时" value={`${rt.breakEvenGroups} 组`} hint={`每组贡献降到 ${yuan(rt.contribution)}，所以实时转写只放进付费档、限量`} />
        </div>
        <details className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">展开：每个假设变了，回本组数怎么变</summary>
          <table className="mt-2 w-full text-xs">
            <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="p-2">假设</th><th className="p-2">取值</th><th className="p-2">每组贡献</th><th className="p-2">回本</th></tr></thead>
            <tbody>
              {SENSITIVITY.flatMap((g) => g.rows.map((row, i) => {
                const r = computeEconomics({ ...BASELINE, ...row.patch });
                const isBase = Object.keys(row.patch).length === 0;
                return (
                  <tr key={g.factor + row.value} className={`border-b border-slate-100 ${isBase ? 'text-slate-400' : ''}`}>
                    <td className="p-2">{i === 0 ? g.factor : ''}</td><td className="p-2">{row.label}</td>
                    <td className="p-2">{yuan(r.contribution)}</td>
                    <td className={`p-2 ${Number.isFinite(r.breakEvenGroups) ? '' : 'text-red-600'}`}>{Number.isFinite(r.breakEvenGroups) ? `${r.breakEvenGroups} 组` : '亏损'}</td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </details>
        <details className="mt-2 rounded-lg border border-slate-200 bg-white p-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">展开：自己改假设算一算</summary>
          <div className="mt-2"><UnitEconCalculator /></div>
        </details>
      </Step>

      <Step n={5} title="谁使用，谁付钱">
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="p-4">
            <p className="text-sm font-semibold">谁使用</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              <li>组长：确认决定，只处理例外（延期、没动静、没人认领）</li>
              <li>组员：认领任务，点提醒里的链接回复进度</li>
            </ul>
          </Card>
          <Card className="p-4">
            <p className="text-sm font-semibold">谁付钱</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              <li>小组里任何一个人买，全组用；也可以 AA</li>
              <li>付钱的人和拍板的人分开：确认决定的仍是组长</li>
              <li>规模化以后：学校、学院、社团按人数团体购入</li>
            </ul>
          </Card>
        </div>
      </Step>

      <details className="rounded-lg border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer text-xs font-medium text-slate-600">
          展开：这个 Demo 的调用记录（usage_log，共 {logs.length} 次，{yuan(total, 4)}）{mock ? ' · 离线演示，用量按字数估算' : ''}
        </summary>
        <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
          真实接口实测（2026-11-21，接百炼跑完整条流程）：总花费约 ¥0.153（含调试和多轮评测）。其中演示会议的文字处理 ¥0.0117、问答平均每次 ¥0.0011、实时转写 13 秒 ¥0.0029。
        </p>
        {byFeature.size === 0 ? <div className="mt-2"><EmptyState title="还没有调用记录" hint="处理一场会议或问一个问题试试" /></div> : (
          <table className="mt-2 w-full text-xs">
            <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="p-2">功能</th><th className="p-2">次数</th><th className="p-2">输入 tokens</th><th className="p-2">输出 tokens</th><th className="p-2">总成本</th></tr></thead>
            <tbody>
              {[...byFeature.entries()].map(([f, v]) => (
                <tr key={f} className="border-b border-slate-100">
                  <td className="p-2">{FEATURE_LABEL[f] ?? f}</td><td className="p-2">{v.count}</td>
                  <td className="p-2">{v.input.toLocaleString()}</td><td className="p-2">{v.output.toLocaleString()}</td><td className="p-2">{yuan(v.cost, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </div>
  );
}

function Step({ n, title, note, children }: { n: number; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{n}</span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
      {note && <p className="mt-2 text-xs text-slate-500">{note}</p>}
    </section>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </Card>
  );
}

function Tier({ name, price, lines, highlight }: { name: string; price: string; lines: string[]; highlight?: boolean }) {
  return (
    <Card className={`p-4 ${highlight ? 'border-brand-500 ring-1 ring-brand-500' : ''}`}>
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold">{name}</p>
        {highlight && <Badge tone="blue">主推</Badge>}
      </div>
      <p className="mt-1 text-lg font-bold">{price}</p>
      <ul className="mt-2 space-y-1 text-xs text-slate-600">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
    </Card>
  );
}
