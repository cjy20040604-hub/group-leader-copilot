import { db, schema } from '@/lib/db/client';
import { isMock } from '@/lib/llm';
import { PRICING, ASR_PRICES, ASR_PRICE_PER_SECOND, STANDARD_MEETING } from '@/config/pricing';
import { EmptyState, cx } from '@/components/ui';
import { UnitEconCalculator } from '@/components/unit-econ-calculator';
import { computeEconomics, textCostPerMeeting, qaCost, BASELINE, SENSITIVITY, ASR_FILE, ASR_REALTIME } from '@/lib/unit-economics';

export const dynamic = 'force-dynamic';

const FEATURE_LABEL: Record<string, string> = {
  extract: '纪要抽取', index: '建索引(embedding)', qa: '问答', briefing: '会前简报', asr: '录音转写(ASR)', search: '检索 embedding', duplicate_check: '重复检测 embedding', live_check: '会中查重 embedding', conflict_check: '冲突检测 embedding',
};

// 成本看板是一条论证链：用了哪些模型 → 单次服务成本 → 据此定价 → 商业模式成立吗 → 谁使用、谁付钱
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
  const infra = STANDARD_MEETING.infraPerSemester;
  const groupCost = base.variableCost + infra; // 只算这个组自己：模型 + 10 小时录音 + 服务器摊销
  const margin = price - groupCost;

  // 「19.9 元里都是什么」：成本三段 + 剩下的毛利
  const anatomy = [
    { label: '模型', note: '24 次会 + 200 次提问', value: base.modelCost, tone: 'bg-slate-700' },
    { label: '录音转写', note: '10 小时，会后上传', value: base.asrCost, tone: 'bg-slate-500' },
    { label: '服务器摊销', note: '每组每学期', value: infra, tone: 'bg-slate-300' },
    { label: '毛利', note: `${((margin / price) * 100).toFixed(0)}%`, value: margin, tone: 'bg-brand-600' },
  ];

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
    { step: '会后整理纪要', model: env('LLM_MODEL_EXTRACT', 'qwen3.7-plus'), price: `${ex.input} / ${ex.output} 元`, unit: '每百万 tokens，输入 / 输出' },
    { step: '问问上次、会前简报', model: env('LLM_MODEL_CHAT', 'qwen-plus'), price: `${chat.input} / ${chat.output} 元`, unit: '每百万 tokens，输入 / 输出' },
    { step: '检索、「这事定过了」', model: env('EMBEDDING_MODEL', 'text-embedding-v4'), price: `${emb.input} 元`, unit: '每百万 tokens' },
    { step: '会议室实时转写', model: env('ASR_MODEL', 'qwen3-asr-flash'), price: `${ASR_PRICES['qwen3-asr-flash'].perSecond} 元`, unit: '每秒' },
    { step: '上传录音转写', model: 'paraformer-v2', price: `${ASR_PRICE_PER_SECOND} 元`, unit: '每秒' },
  ];

  return (
    <div className="mx-auto max-w-4xl pb-10">
      {/* 开头先给结论，再给「19.9 元拆开看」 */}
      <header className="pt-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">成本与商业模式</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
          一个小组一学期的成本约 <Num>{yuan(groupCost)}</Num>，专业版定价 <Num>{price} 元</Num>；
          算上免费用户和固定成本，<Num>{base.breakEvenGroups} 个付费组</Num>回本。
        </p>
      </header>

      <figure className="mt-8 rounded-2xl bg-white p-6 ring-1 ring-slate-200 sm:p-8" aria-label="19.9 元拆开看">
        <figcaption className="flex items-baseline justify-between gap-4">
          <span className="text-sm text-slate-500">专业版 {price} 元拆开看</span>
          <span className="text-sm tabular-nums text-slate-400">每组每学期</span>
        </figcaption>
        <div className="anatomy-bar mt-4 flex h-4 overflow-hidden rounded-full" role="img"
          aria-label={anatomy.map((a) => `${a.label} ${a.value.toFixed(2)} 元`).join('，')}>
          {anatomy.map((a) => (
            <span key={a.label} className={a.tone} style={{ width: `${(a.value / price) * 100}%` }} />
          ))}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {anatomy.map((a) => (
            <div key={a.label}>
              <dt className="flex items-center gap-2 text-xs text-slate-500">
                <span className={cx('h-2 w-2 rounded-full', a.tone)} aria-hidden />{a.label}
              </dt>
              <dd className={cx('mt-1 text-xl font-semibold tabular-nums tracking-tight', a.label === '毛利' ? 'text-brand-700' : 'text-slate-900')}>{yuan(a.value)}</dd>
              <dd className="text-xs text-slate-400">{a.note}</dd>
            </div>
          ))}
        </dl>
      </figure>

      {/* 论证链：五步是真正的先后顺序，左边一条线串起来 */}
      <ol className="mt-12 space-y-14 border-l border-slate-200 pl-8 sm:ml-3">
        <Step n={1} title="用到的模型和单价" note="阿里云百炼华北 2 原价。提醒、风险灯、任务流转、排会都是规则，不花模型钱。">
          <div className="divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
            {models.map((m) => (
              <div key={m.step} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-baseline sm:gap-4">
                <span className="text-sm text-slate-900">{m.step}</span>
                <span className="text-sm text-slate-500">{m.model}</span>
                <span className="text-sm tabular-nums text-slate-900 sm:text-right">{m.price}<span className="ml-1.5 text-xs text-slate-400">{m.unit}</span></span>
              </div>
            ))}
          </div>
        </Step>

        <Step n={2} title="单次服务成本">
          <div className="max-w-2xl space-y-2 text-[15px] leading-relaxed text-slate-700">
            <p>开一场 1 小时组会，整理纪要、建索引、出会前简报，合计约 <Num>{yuan(meetingText, 3)}</Num>
              <span className="text-slate-400">（{meetingExtract.toFixed(3)} + {meetingIndex.toFixed(3)} + {meetingBrief.toFixed(4)}）</span>。</p>
            <p>问一次「问问上次」按上限约 <Num>{yuan(qa, 4)}</Num><span className="text-slate-400">（3k 输入 / 0.4k 输出）</span>。</p>
            <p>转写 1 小时录音：会后上传 <Num>{yuan(asrFileHour)}</Num>，会议室实时 <Num>{yuan(asrLiveHour)}</Num>；导入腾讯会议、钉钉的文字稿不花转写钱。</p>
          </div>
        </Step>

        <Step n={3} title="据此定价" note={`专业版的成本按一组一学期算：24 次会 + 200 次提问 + 10 小时录音 + 服务器摊销 ${infra} 元 ≈ ${yuan(groupCost)}。`}>
          <div className="grid overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 sm:grid-cols-3">
            <Tier name="体验版" price="免费" lines={['每月 4 次纪要', '不开录音转写', '让小组先用起来']} />
            <Tier name="专业版" price={`${price} 元`} unit="每组每学期" featured
              lines={[`一人购买，全组使用`, `可以 AA，5 人每人约 ${(price / 5).toFixed(2)} 元`, '含 10 小时录音转写']} />
            <Tier name="团体购入版" price="5 / 4 / 3 元" unit="每人每学期" lines={['30–99 / 100–499 / 500 人以上', '学校、学院、社团统一开通', '管理者看板还没做']} />
          </div>
        </Step>

        <Step n={4} title="商业模式成立吗">
          <div className="grid gap-6 sm:grid-cols-3">
            <Metric value={yuan(base.contribution)} label="每个付费组的边际贡献" sub={`贡献率 ${(base.unitMargin * 100).toFixed(1)}%`} />
            <Metric value={`${base.breakEvenGroups} 组`} label="回本需要的付费组" sub={`覆盖一学期 ${base.fixedPerSemester} 元固定成本`} accent />
            <Metric value={`${rt.breakEvenGroups} 组`} label="录音全走实时转写时" sub={`每组贡献降到 ${yuan(rt.contribution)}，实时转写只放进付费档、限量`} />
          </div>
          <p className="mt-4 max-w-2xl text-xs leading-relaxed text-slate-500">把免费用户的模型成本（每个付费组带 {BASELINE.freeToPaid} 个）、{(BASELINE.paymentFeeRate * 100).toFixed(1)}% 支付手续费、每月 {BASELINE.fixedPerMonth} 元固定成本都算进去。付费率、用量、固定成本都是假设，待访谈验证。</p>
          <div className="mt-5 space-y-2">
            <Fold title="每个假设变了，回本组数怎么变">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-400"><th className="py-2 font-normal">假设</th><th className="py-2 font-normal">取值</th><th className="py-2 text-right font-normal">每组贡献</th><th className="py-2 text-right font-normal">回本</th></tr></thead>
                <tbody>
                  {SENSITIVITY.flatMap((g) => g.rows.map((row, i) => {
                    const r = computeEconomics({ ...BASELINE, ...row.patch });
                    const isBase = Object.keys(row.patch).length === 0;
                    return (
                      <tr key={g.factor + row.value} className={cx(i === 0 && 'border-t border-slate-100', isBase ? 'text-slate-400' : 'text-slate-700')}>
                        <td className="py-1.5 pr-3">{i === 0 ? g.factor : ''}</td><td className="py-1.5 pr-3">{row.label}</td>
                        <td className="py-1.5 text-right tabular-nums">{yuan(r.contribution)}</td>
                        <td className={cx('py-1.5 text-right tabular-nums', !Number.isFinite(r.breakEvenGroups) && 'text-red-600')}>{Number.isFinite(r.breakEvenGroups) ? `${r.breakEvenGroups} 组` : '亏损'}</td>
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </Fold>
            <Fold title="自己改假设算一算"><UnitEconCalculator /></Fold>
          </div>
        </Step>

        <Step n={5} title="谁使用，谁付钱">
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-slate-900">谁使用</h3>
              <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-slate-600">
                <li>组长确认决定，只处理例外：延期、没动静、没人认领。</li>
                <li>组员认领任务，点提醒里的链接回复进度。</li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-medium text-slate-900">谁付钱</h3>
              <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-slate-600">
                <li>小组里任何一个人买，全组用；也可以 AA。</li>
                <li>付钱的人和拍板的人分开，确认决定的仍是组长。</li>
                <li>规模化以后，学校、学院、社团按人数团体购入。</li>
              </ul>
            </div>
          </div>
        </Step>
      </ol>

      <div className="mt-14">
        <Fold title={`这个 Demo 的调用记录（usage_log，共 ${logs.length} 次，${yuan(total, 4)}${mock ? '，离线演示按字数估算' : ''}）`}>
          <p className="mb-3 text-sm leading-relaxed text-slate-600">
            真实接口实测（2026-11-21，接百炼跑完整条流程）：总花费约 ¥0.153（含调试和多轮评测）。其中演示会议的文字处理 ¥0.0117，问答平均每次 ¥0.0011，实时转写 13 秒 ¥0.0029。
          </p>
          {byFeature.size === 0 ? <EmptyState title="还没有调用记录" hint="处理一场会议或问一个问题试试" /> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400"><th className="py-2 font-normal">功能</th><th className="py-2 text-right font-normal">次数</th><th className="py-2 text-right font-normal">输入 tokens</th><th className="py-2 text-right font-normal">输出 tokens</th><th className="py-2 text-right font-normal">总成本</th></tr></thead>
              <tbody>
                {[...byFeature.entries()].map(([f, v]) => (
                  <tr key={f} className="border-t border-slate-100 text-slate-700">
                    <td className="py-1.5">{FEATURE_LABEL[f] ?? f}</td><td className="py-1.5 text-right tabular-nums">{v.count}</td>
                    <td className="py-1.5 text-right tabular-nums">{v.input.toLocaleString()}</td><td className="py-1.5 text-right tabular-nums">{v.output.toLocaleString()}</td>
                    <td className="py-1.5 text-right tabular-nums">{yuan(v.cost, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Fold>
      </div>
    </div>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return <span className="whitespace-nowrap font-semibold tabular-nums text-slate-900">{children}</span>;
}

function Step({ n, title, note, children }: { n: number; title: string; note?: string; children: React.ReactNode }) {
  return (
    <li className="relative" aria-label={title}>
      <span className="absolute -left-[45px] top-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-slate-50 text-sm font-semibold tabular-nums text-slate-900 ring-1 ring-slate-300">{n}</span>
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
      {note && <p className="mt-3 max-w-2xl text-xs leading-relaxed text-slate-500">{note}</p>}
    </li>
  );
}

function Tier({ name, price, unit, lines, featured }: { name: string; price: string; unit?: string; lines: string[]; featured?: boolean }) {
  return (
    <div className={cx('relative border-slate-100 p-5 [&:not(:first-child)]:border-t sm:[&:not(:first-child)]:border-l sm:[&:not(:first-child)]:border-t-0', featured && 'bg-brand-50/60')}>
      {featured && <span className="absolute inset-x-0 top-0 h-0.5 bg-brand-600" aria-hidden />}
      <p className={cx('text-sm', featured ? 'font-medium text-brand-700' : 'text-slate-500')}>{name}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{price}</p>
      {unit && <p className="text-xs text-slate-400">{unit}</p>}
      <ul className="mt-4 space-y-1.5 text-sm text-slate-600">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
  );
}

function Metric({ value, label, sub, accent }: { value: string; label: string; sub: string; accent?: boolean }) {
  return (
    <div>
      <p className={cx('text-3xl font-semibold tabular-nums tracking-tight', accent ? 'text-brand-700' : 'text-slate-900')}>{value}</p>
      <p className="mt-1 text-sm text-slate-700">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">{sub}</p>
    </div>
  );
}

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl bg-white ring-1 ring-slate-200 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm text-slate-600 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">
        <span>{title}</span>
        <span className="text-slate-400 transition-transform group-open:rotate-45" aria-hidden>+</span>
      </summary>
      <div className="border-t border-slate-100 px-4 py-4">{children}</div>
    </details>
  );
}
