import { db, schema } from '@/lib/db/client';
import { isMock } from '@/lib/llm';
import { llmCost, embeddingCost, asrCost, asrCostFor, asrPrice, STANDARD_MEETING } from '@/config/pricing';
import { Card, Badge, EmptyState } from '@/components/ui';
import { UnitEconCalculator } from '@/components/unit-econ-calculator';
import { computeEconomics, BASELINE, SENSITIVITY } from '@/lib/unit-economics';

export const dynamic = 'force-dynamic';

const FEATURE_LABEL: Record<string, string> = {
  extract: '纪要抽取', index: '建索引(embedding)', qa: '问答', briefing: '会前简报', asr: '录音转写(ASR)', search: '检索 embedding', duplicate_check: '重复检测 embedding', live_check: '会中查重 embedding', conflict_check: '冲突检测 embedding',
};

export default function CostPage() {
  const logs = db.select().from(schema.usageLog).all();
  const mock = isMock();
  const extractModel = process.env.LLM_MODEL_EXTRACT ?? '';
  const chatModel = process.env.LLM_MODEL_CHAT ?? '';
  const embedModel = process.env.EMBEDDING_MODEL ?? '';

  const byFeature = new Map<string, { count: number; cost: number; input: number; output: number }>();
  for (const l of logs) {
    const f = byFeature.get(l.feature) ?? { count: 0, cost: 0, input: 0, output: 0 };
    f.count++; f.cost += l.costCny; f.input += l.inputTokens; f.output += l.outputTokens;
    byFeature.set(l.feature, f);
  }

  // 单次会议成本 = 这场会的召回 + 抽取 + 冲突检测 + 建索引 + ASR（含会议室实时转写、会中查重）；只算已确认落库的会议（处理了但没确认的草稿不进均值）
  const confirmed = new Set(db.select({ id: schema.meetings.id }).from(schema.meetings).all().map((m) => m.id));
  const meetingCosts = new Map<string, number>();
  for (const l of logs) {
    if (l.meetingId && confirmed.has(l.meetingId) && ['search', 'extract', 'index', 'asr', 'live_check', 'conflict_check'].includes(l.feature)) {
      meetingCosts.set(l.meetingId, (meetingCosts.get(l.meetingId) ?? 0) + l.costCny);
    }
  }
  const avgMeeting = meetingCosts.size ? [...meetingCosts.values()].reduce((a, b) => a + b, 0) / meetingCosts.size : 0;
  const qaLogs = logs.filter((l) => l.feature === 'qa');
  const avgQa = qaLogs.length ? qaLogs.reduce((a, b) => a + b.costCny, 0) / qaLogs.length : 0;
  const total = logs.reduce((a, b) => a + b.costCny, 0);

  const stdExtract = llmCost(extractModel, STANDARD_MEETING.extract.input, STANDARD_MEETING.extract.output);
  const stdIndex = embeddingCost(embedModel, STANDARD_MEETING.index.tokens);
  const stdBriefing = llmCost(chatModel, STANDARD_MEETING.briefing.input, STANDARD_MEETING.briefing.output);
  const stdText = stdExtract + stdIndex + stdBriefing;
  const stdAsr = asrCost(STANDARD_MEETING.asrSeconds);
  const liveAsrModel = process.env.ASR_MODEL || 'qwen3-asr-flash';
  const liveAsr = asrPrice(liveAsrModel);
  const stdLiveAsr = asrCostFor(liveAsrModel, STANDARD_MEETING.asrSeconds);
  const stdQa = llmCost(chatModel, STANDARD_MEETING.qa.input, STANDARD_MEETING.qa.output);
  const semesterModel = STANDARD_MEETING.meetingsPerSemester * stdText + STANDARD_MEETING.qaPerSemester * stdQa;
  const semesterAll = semesterModel + STANDARD_MEETING.infraPerSemester;
  const proPrice = 19.9;
  const proAsr = asrCost(10 * 3600); // 组长 Pro 含 10 小时录音
  const proCost = semesterAll + proAsr;
  const measuredLabel = mock ? 'Mock 估算' : '实测';

  const fmt = (n: number) => `¥${n.toFixed(4)}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">成本看板</h1>
        {mock && <Badge tone="yellow">Demo 模拟计量（tokens 按字数估算）</Badge>}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-slate-500">累计调用</p><p className="mt-1 text-2xl font-bold">{logs.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">累计成本</p><p className="mt-1 text-2xl font-bold">{fmt(total)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">单次会议平均（{measuredLabel}）</p><p className="mt-1 text-2xl font-bold">{fmt(avgMeeting)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">单次问答平均（{measuredLabel}）</p><p className="mt-1 text-2xl font-bold">{fmt(avgQa)}</p></Card>
      </div>

      <section aria-label="按功能统计">
        <h2 className="mb-2 text-sm font-semibold">按功能计量（usage_log · {measuredLabel}）</h2>
        {mock && <p className="mb-2 text-xs text-slate-500">Mock 模式没有真的调用模型：每条记录按「真实会发出的 prompt + Mock 输出」的字数估算 tokens；配上百炼 Key 后同一张表记录接口返回的真实用量。种子会议的转写只有 1200–1800 字，所以比下面的 1 小时会议推算便宜。</p>}
        {byFeature.size === 0 ? <EmptyState title="还没有调用记录" hint="处理一场会议或问一个问题试试" /> : (
          <Card className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="p-2">功能</th><th className="p-2">次数</th><th className="p-2">输入 tokens</th><th className="p-2">输出 tokens</th><th className="p-2">总成本</th><th className="p-2">平均</th>
              </tr></thead>
              <tbody>
                {[...byFeature.entries()].map(([f, v]) => (
                  <tr key={f} className="border-b border-slate-100">
                    <td className="p-2">{FEATURE_LABEL[f] ?? f}</td><td className="p-2">{v.count}</td>
                    <td className="p-2">{v.input.toLocaleString()}</td><td className="p-2">{v.output.toLocaleString()}</td>
                    <td className="p-2">{fmt(v.cost)}</td><td className="p-2">{fmt(v.cost / v.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section aria-label="标准会议推算">
        <h2 className="mb-2 text-sm font-semibold">标准 1 小时会议推算（单价 × 用量假设，与 docs/cost-model.md 一致）</h2>
        <Card className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="p-2">项目</th><th className="p-2">模型</th><th className="p-2">用量假设</th><th className="p-2">成本</th>
            </tr></thead>
            <tbody>
              <tr className="border-b border-slate-100"><td className="p-2">纪要抽取</td><td className="p-2">{extractModel}</td><td className="p-2">输入 16k（转写12k+上下文2.5k+提示词1.5k）/ 输出 2.5k</td><td className="p-2">{fmt(stdExtract)}</td></tr>
              <tr className="border-b border-slate-100"><td className="p-2">建索引</td><td className="p-2">{embedModel}</td><td className="p-2">16k tokens</td><td className="p-2">{fmt(stdIndex)}</td></tr>
              <tr className="border-b border-slate-100"><td className="p-2">会前简报</td><td className="p-2">{chatModel}</td><td className="p-2">输入 4k / 输出 0.8k</td><td className="p-2">{fmt(stdBriefing)}</td></tr>
              <tr className="border-b border-slate-100 font-semibold"><td className="p-2">小计（粘贴文字稿）</td><td className="p-2"></td><td className="p-2"></td><td className="p-2">≈ ¥{stdText.toFixed(3)}</td></tr>
              <tr className="border-b border-slate-100"><td className="p-2">ASR（可选）</td><td className="p-2">Paraformer</td><td className="p-2">3600 秒 × ¥0.00008/秒</td><td className="p-2">{fmt(stdAsr)}</td></tr>
              <tr className="border-b border-slate-100"><td className="p-2">会议室实时转写（可选）</td><td className="p-2">{liveAsrModel}</td><td className="p-2">3600 秒 × ¥{liveAsr.perSecond}/秒{liveAsr.verified ? '' : '（单价是假设，待核对）'}；静音不上传，实际按有人说话的时长计</td><td className="p-2">{fmt(stdLiveAsr)}</td></tr>
              <tr className="border-b border-slate-100 font-semibold"><td className="p-2">小计（上传录音）</td><td className="p-2"></td><td className="p-2"></td><td className="p-2">≈ ¥{(stdText + stdAsr).toFixed(3)}</td></tr>
              <tr><td className="p-2">单次问答</td><td className="p-2">{chatModel}</td><td className="p-2">输入 3k / 输出 0.4k</td><td className="p-2">{fmt(stdQa)}</td></tr>
            </tbody>
          </table>
        </Card>
      </section>

      <section aria-label="学期成本推算">
        <h2 className="mb-2 text-sm font-semibold">单用户学期推算（3 门课 × 8 次会 = 24 次，200 次问答）</h2>
        <Card className="p-4 text-sm">
          <p>纯文字稿模型成本：24 × ¥{stdText.toFixed(3)} + 200 × ¥{stdQa.toFixed(4)} ≈ <strong>¥{semesterModel.toFixed(2)}</strong></p>
          <p className="mt-1">加服务器/数据库/推送摊销 ¥{STANDARD_MEETING.infraPerSemester} ≈ <strong>¥{semesterAll.toFixed(2)}</strong>；全部用录音再加 24 × ¥{stdAsr.toFixed(2)} ≈ ¥{(STANDARD_MEETING.meetingsPerSemester * stdAsr).toFixed(1)}</p>
          <p className="mt-2 text-xs text-slate-500">组长 Pro 定价 {proPrice} 元/学期（含 10 小时录音 ≈ ¥{proAsr.toFixed(2)}）：成本 ≈ {semesterModel.toFixed(2)} + {proAsr.toFixed(2)} + {STANDARD_MEETING.infraPerSemester} ≈ {proCost.toFixed(2)} 元，毛利约 {(((proPrice - proCost) / proPrice) * 100).toFixed(0)}%。这是只算这个组自己的毛利（每组摊 2 元固定成本）；算上它带着的免费用户、支付通道费，并把固定成本按月单列，见下方「敏感度与盈亏平衡」。详见 docs/cost-model.md。</p>
        </Card>
      </section>

      <section aria-label="敏感度与盈亏平衡">
        <h2 className="mb-2 text-sm font-semibold">敏感度与盈亏平衡（一次只动一个假设，其余按基线）</h2>
        <Card className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="p-2">假设</th><th className="p-2">取值</th><th className="p-2">每组变动成本</th><th className="p-2">每组边际贡献</th><th className="p-2">单组贡献率</th><th className="p-2">盈亏平衡</th>
            </tr></thead>
            <tbody>
              {SENSITIVITY.flatMap((g) => g.rows.map((row, i) => {
                const r = computeEconomics({ ...BASELINE, ...row.patch });
                const base = Object.keys(row.patch).length === 0;
                return (
                  <tr key={g.factor + row.value} className={`border-b border-slate-100 ${base ? 'bg-slate-50 text-slate-500' : ''}`}>
                    <td className="p-2">{i === 0 ? g.factor : ''}</td><td className="p-2">{row.label}</td>
                    <td className="p-2">¥{r.variableCost.toFixed(2)}</td><td className="p-2">¥{r.contribution.toFixed(2)}</td>
                    <td className="p-2">{(r.unitMargin * 100).toFixed(1)}%</td>
                    <td className={`p-2 ${Number.isFinite(r.breakEvenGroups) ? '' : 'text-red-600'}`}>{Number.isFinite(r.breakEvenGroups) ? `${r.breakEvenGroups} 组` : '亏损'}</td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </Card>
        <p className="mt-1 text-xs text-slate-500">基线：每组每学期 24 次 × 1 小时会、200 次问答、10 小时录音会后上传走录音文件识别（「上传音频」目前是 Demo 模拟；全走会议室实时转写见表中那一行）；Pro 19.9 元；免费用户 : 付费组 = 4 : 1；固定成本 100 元/月；支付通道费 0.6%。除单价外都是假设。最敏感的是录音走实时转写和免费用户比例。</p>
      </section>

      <section aria-label="单位经济计算器">
        <h2 className="mb-2 text-sm font-semibold">单位经济计算器（改假设，结果立刻更新）</h2>
        <UnitEconCalculator />
      </section>

      <section aria-label="最近调用">
        <h2 className="mb-2 text-sm font-semibold">最近调用明细</h2>
        <Card className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="p-2">时间</th><th className="p-2">模型</th><th className="p-2">功能</th><th className="p-2">输入</th><th className="p-2">输出</th><th className="p-2">音频秒</th><th className="p-2">成本</th>
            </tr></thead>
            <tbody>
              {[...logs].reverse().slice(0, 20).map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="p-2 font-mono">{l.ts.slice(0, 16).replace('T', ' ')}</td>
                  <td className="p-2">{l.model}</td>
                  <td className="p-2">{FEATURE_LABEL[l.feature] ?? l.feature}</td>
                  <td className="p-2">{l.inputTokens}</td><td className="p-2">{l.outputTokens}</td>
                  <td className="p-2">{l.audioSeconds || '—'}</td><td className="p-2">{fmt(l.costCny)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}