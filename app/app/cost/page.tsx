import { db, schema } from '@/lib/db/client';
import { isMock } from '@/lib/llm';
import { PRICING, ASR_PRICES, ASR_PRICE_PER_SECOND, STANDARD_MEETING } from '@/config/pricing';
import { EmptyState, cx } from '@/components/ui';
import { UnitEconCalculator } from '@/components/unit-econ-calculator';
import { computeEconomics, textCostPerMeeting, qaCost, NOTES, PRO, BUNDLE, ADDON, MIX, SENSITIVITY, ASR_FILE, ASR_REALTIME, INFRA_PER_GROUP, INFRA_PER_BUNDLE, groupPurchaseCostPerStudent, blendedBreakEven, addonEconomics } from '@/lib/unit-economics';

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

  // 两档：纪要版（不含录音）和专业版（多 8 小时实时转写）。成本只算这支小组自己：模型 + 实时转写 + 服务器摊销
  const notes = computeEconomics(NOTES);
  const pro = computeEconomics(PRO);
  const pro6 = computeEconomics({ ...PRO, recordedHours: 6 });
  const pro99 = computeEconomics({ ...PRO, pricePerSemester: 9.9 });
  const mix = blendedBreakEven(MIX);
  const mix0 = blendedBreakEven(MIX.map((m) => ({ ...m, inputs: { ...m.inputs, freeRealtimeMinutes: 0 } })));
  const addon = addonEconomics(ADDON);
  const infra = INFRA_PER_GROUP;
  const notesCost = notes.variableCost + infra;
  const proCost = pro.variableCost + infra;
  const bundle = computeEconomics(BUNDLE);
  const bundleCost = bundle.variableCost + INFRA_PER_BUNDLE;
  const oldFree = computeEconomics({ ...PRO, freeMeetingsPerSemester: 16 });
  const campus = groupPurchaseCostPerStudent({ asrPerSecond: ASR_FILE, coursesPerStudent: 3, groupSize: 5 });
  const pct = (part: number, whole: number) => `${((part / whole) * 100).toFixed(0)}%`;

  // 「定价里都是什么」：两条按同一比例尺画，纪要版那条短一截，差的就是实时转写
  const bars = [
    { name: '纪要版', price: NOTES.pricePerSemester, parts: [
      { label: '模型', value: notes.modelCost, tone: 'bg-slate-700' },
      { label: '服务器摊销', value: infra, tone: 'bg-slate-300' },
      { label: '毛利', value: NOTES.pricePerSemester - notesCost, tone: 'bg-brand-600' },
    ] },
    { name: '专业版', price: PRO.pricePerSemester, parts: [
      { label: '模型', value: pro.modelCost, tone: 'bg-slate-700' },
      { label: '实时转写 8 小时', value: pro.asrCost, tone: 'bg-slate-500' },
      { label: '服务器摊销', value: infra, tone: 'bg-slate-300' },
      { label: '毛利', value: PRO.pricePerSemester - proCost, tone: 'bg-brand-600' },
    ] },
  ];
  const scale = PRO.pricePerSemester;

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
      {/* 开头先给结论，再把两档定价拆开看 */}
      <header className="pt-2">
        <h1 className="text-3xl font-medium tracking-tight text-slate-900">成本与商业模式</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
          计价单位是一门课的一支小组。纪要和实时转写分开卖：纪要版 <Num>{NOTES.pricePerSemester} 元</Num>，成本约 <Num>{yuan(notesCost)}</Num>；专业版 <Num>{PRO.pricePerSemester} 元</Num>，多 8 小时实时转写，成本约 <Num>{yuan(proCost)}</Num>。7 成纪要版、3 成专业版时，<Num>{mix.breakEvenGroups} 个付费组</Num>回本。
        </p>
      </header>

      <figure className="mt-8 space-y-7 rounded-2xl bg-white p-6 ring-1 ring-slate-200 sm:p-8" aria-label="两档定价拆开看">
        {bars.map((bar) => (
          <div key={bar.name}>
            <figcaption className="flex items-baseline justify-between gap-4">
              <span className="text-sm text-slate-500">{bar.name} {bar.price} 元拆开看</span>
              <span className="text-sm tabular-nums text-slate-400">每组每学期，毛利 {pct(bar.parts[bar.parts.length - 1].value, bar.price)}</span>
            </figcaption>
            <div className="anatomy-bar mt-3 flex h-4 overflow-hidden rounded-full bg-slate-100" role="img"
              aria-label={bar.parts.map((a) => `${a.label} ${a.value.toFixed(2)} 元`).join('，')}>
              {bar.parts.map((a) => <span key={a.label} className={a.tone} style={{ width: `${(a.value / scale) * 100}%` }} />)}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              {bar.parts.map((a) => (
                <div key={a.label}>
                  <dt className="flex items-center gap-2 text-xs text-slate-500"><span className={cx('h-2 w-2 rounded-full', a.tone)} aria-hidden />{a.label}</dt>
                  <dd className={cx('mt-1 text-lg font-medium tabular-nums tracking-tight', a.label === '毛利' ? 'text-brand-700' : 'text-slate-900')}>{yuan(a.value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        <p className="text-xs text-slate-400">两条按同一比例尺画：纪要版那条短了一截，差的就是专业版多出来的 8 小时实时转写。</p>
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
            <p>转写 1 小时：会议室实时 <Num>{yuan(asrLiveHour)}</Num>，散会后上传录音 <Num>{yuan(asrFileHour)}</Num>；导入腾讯会议、钉钉的文字稿不花转写钱。</p>
          </div>
        </Step>

        <Step n={3} title="据此定价" note={`纪要版：8 次会 + 约 67 次提问 + 服务器摊销 ${infra.toFixed(2)} 元 ≈ ${yuan(notesCost)}；专业版再加 8 小时实时转写 ${yuan(pro.asrCost)} ≈ ${yuan(proCost)}。多组包按组长带 3 个组都开纪要版算：成本 ${yuan(bundleCost)}，毛利约 ${pct(BUNDLE.pricePerSemester - bundleCost, BUNDLE.pricePerSemester)}。`}>
          <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4">
              <Tier name="体验版" price="免费" lines={['1 个小组', '每学期 3 次纪要', `送 ${NOTES.freeRealtimeMinutes} 分钟实时转写，先体验实时字幕`]} />
              <Tier name="纪要版" price={`${NOTES.pricePerSemester} 元`} unit="每组每学期" featured
                lines={['纪要不限次：导入文字稿、钉钉会议', '问答、提醒、会前简报、任务', `可以 AA，5 人每人约 ${(NOTES.pricePerSemester / 5).toFixed(2)} 元`, `成本 ${yuan(notesCost)}，毛利约 ${pct(NOTES.pricePerSemester - notesCost, NOTES.pricePerSemester)}`]} />
              <Tier name="专业版" price={`${PRO.pricePerSemester} 元`} unit="每组每学期"
                lines={['纪要版全部，纪要不限次', '含 8 小时会议室实时转写', `AA 每人约 ${(PRO.pricePerSemester / 5).toFixed(2)} 元`, `成本 ${yuan(proCost)}，毛利约 ${pct(PRO.pricePerSemester - proCost, PRO.pricePerSemester)}`]} />
              <Tier name="多组包" price={`${BUNDLE.pricePerSemester} 元`} unit="每人每学期" lines={['你当组长的小组都开纪要版', '最多 4 个组', '给同时带几门课的组长']} />
            </div>
            <div className="grid gap-x-6 gap-y-2 border-t border-slate-100 px-5 py-4 text-sm text-slate-600 sm:grid-cols-2">
              <p><span className="font-medium text-slate-900">加时包 {ADDON.hours} 小时 {ADDON.price} 元</span>：实时转写不够时加，哪档都能买；按满额用完算，毛利约 {(addon.margin * 100).toFixed(1)}%。</p>
              <p><span className="font-medium text-slate-900">团体购入 5 / 4 / 3 元</span>每人每门课（30–99 / 100–499 / 500 人以上）：老师给一门课统一开通，管理者看板还没做。</p>
            </div>
          </div>
          <div className="mt-4 max-w-3xl space-y-2 rounded-xl bg-amber-50/70 px-4 py-3 text-sm leading-relaxed text-slate-700 ring-1 ring-inset ring-amber-200">
            <p className="font-medium text-slate-900">为什么把纪要和实时转写分开卖</p>
            <p>大部分小组用腾讯会议、钉钉开会，本来就有文字稿，只需要纪要。纪要版成本 {yuan(notesCost)}，卖 {NOTES.pricePerSemester} 元，不让他们为用不上的转写付钱。</p>
            <p>在教室面对面开会的小组才要实时转写：一学期 8 次会、每次 1 小时就是 8 小时，实时转写成本 {yuan(pro.asrCost)}，所以专业版 {PRO.pricePerSemester} 元。同样 8 小时卖 9.9 元要 {pro99.breakEvenGroups} 组才回本。</p>
            <p>额度用完会议不中断：照常录音，散会后用录音文件识别整理（每小时 {yuan(asrFileHour)}，不另收费，只是没有实时字幕和撞车提示）；还想要实时转写就买加时包。</p>
            <p>计价单位是一门课的一支小组：同一个学生在不同课里组员不一样，付钱的人也不一样。体验版每学期 3 次纪要，比一支小组一学期开的约 8 次会少；另送 {NOTES.freeRealtimeMinutes} 分钟实时转写，让没付费的组也体验一次实时字幕，每组成本 {yuan(NOTES.freeRealtimeMinutes * 60 * ASR_REALTIME, 3)}，混合回本因此从 {mix0.breakEvenGroups} 组变成 {mix.breakEvenGroups} 组；沿用旧额度「每月 4 次」，专业版要 {oldFree.breakEvenGroups} 组才回本。团体购入时一个学生平均 3 个小组，每人成本约 {yuan(campus)}（录音散会后上传），实时转写会亏，所以全校包不含实时转写。</p>
          </div>
        </Step>

        <Step n={4} title="商业模式成立吗">
          <div className="grid gap-6 sm:grid-cols-3">
            <Metric value={`${notes.breakEvenGroups} 组`} label="只卖纪要版时回本" sub={`每组贡献 ${yuan(notes.contribution)}，贡献率 ${(notes.unitMargin * 100).toFixed(1)}%`} />
            <Metric value={`${pro.breakEvenGroups} 组`} label="只卖专业版时回本" sub={`8 小时用满，每组贡献 ${yuan(pro.contribution)}；实际只送有人说话的部分、用 6 小时时 ${pro6.breakEvenGroups} 组`} />
            <Metric value={`${mix.breakEvenGroups} 组`} label="7 成纪要版 + 3 成专业版" sub={`加权每组贡献 ${yuan(mix.contribution)}；全买多组包时 ${bundle.breakEvenGroups} 个包`} accent />
          </div>
          <p className="mt-4 max-w-2xl text-xs leading-relaxed text-slate-500">把免费小组的成本（每个付费组带 {NOTES.freeToPaid} 个体验版小组，每个每学期 {NOTES.freeMeetingsPerSemester} 次纪要 + 送 {NOTES.freeRealtimeMinutes} 分钟实时转写，合计 {yuan(notes.freeCostPerUser)}）、{(NOTES.paymentFeeRate * 100).toFixed(1)}% 支付手续费、每月 {NOTES.fixedPerMonth} 元固定成本都算进去。付费率、档位比例、用量、固定成本都是假设，待访谈验证。</p>
          <div className="mt-5 space-y-2">
            <Fold title="专业版的每个假设变了，回本组数怎么变">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-400"><th className="py-2 font-normal">假设</th><th className="py-2 font-normal">取值</th><th className="py-2 text-right font-normal">每组贡献</th><th className="py-2 text-right font-normal">回本</th></tr></thead>
                <tbody>
                  {SENSITIVITY.flatMap((g) => g.rows.map((row, i) => {
                    const r = computeEconomics({ ...PRO, ...row.patch });
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
                <li>同一个人可以在 A 课当组长、在 B 课当组员，权限按课算。</li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-medium text-slate-900">谁付钱</h3>
              <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-slate-600">
                <li>每支小组单独付：组里任何一个人买，全组用；也可以 AA。</li>
                <li>线上开会、有文字稿的组买纪要版；在教室开会、要实时转写的组买专业版，不够再加时。</li>
                <li>同时带几个组的组长，买多组包更划算。</li>
                <li>付钱的人和拍板的人分开，确认决定的仍是这个组的组长。</li>
                <li>规模化以后，老师按一门课的人数团体购入。</li>
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
  return <span className="whitespace-nowrap font-medium tabular-nums text-slate-900">{children}</span>;
}

function Step({ n, title, note, children }: { n: number; title: string; note?: string; children: React.ReactNode }) {
  return (
    <li className="relative" aria-label={title}>
      <span className="absolute -left-[46px] top-0 flex h-7 w-7 items-center justify-center rounded-full bg-slate-50 text-sm font-medium tabular-nums text-slate-900 ring-1 ring-slate-300">{n}</span>
      <h2 className="text-lg font-medium tracking-tight text-slate-900">{title}</h2>
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
      <p className="mt-2 text-2xl font-medium tabular-nums tracking-tight text-slate-900">{price}</p>
      {unit && <p className="text-xs text-slate-400">{unit}</p>}
      <ul className="mt-4 space-y-1.5 text-sm text-slate-600">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
  );
}

function Metric({ value, label, sub, accent }: { value: string; label: string; sub: string; accent?: boolean }) {
  return (
    <div>
      <p className={cx('text-3xl font-medium tabular-nums tracking-tight', accent ? 'text-brand-700' : 'text-slate-900')}>{value}</p>
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
