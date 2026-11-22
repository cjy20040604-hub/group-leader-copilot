import Link from 'next/link';
import { computeEconomics, textCostPerMeeting, BASELINE, ASR_REALTIME } from '@/lib/unit-economics';

const REPO = 'https://github.com/cjy20040604-hub/group-leader-copilot';

const FAQS = [
  { q: '没有 API Key 能用吗？', a: '能。没配 Key 时以离线模式运行：示例会议读预置结果，其他转写走规则抽取，问答在本课程记录上做抽取式回答，全流程都能跑；配上阿里云百炼 Key 后切换为真实模型。' },
  { q: '开会要自己按录音吗？', a: '不用。进会议室 3 秒后自动开录（可取消），说的话实时转成文字；没人说话时不上传，长时间静音自动结束并进入纪要整理。开录前会提示参会人。' },
  { q: '组员要怎么更新进度？', a: '在「任务与回顾」里一键点：做完了、写一句进度、卡住了、申请延期，或者自己认领没人管的任务。组长只看需要拍板的例外。' },
  { q: 'AI 会不会把任务分错人、记错 DDL？', a: 'AI 只负责抽取，人名由代码模糊匹配花名册、日期由代码换算校验，低置信度标黄，组长确认后才落库。' },
  { q: '问它上次定了什么，它会编吗？', a: '不会。RAG 回答必须带 [日期·类型] 出处，相似度不够且关键词无命中时直接回答「记录里没找到」。' },
  { q: '三门课的决议会串台吗？', a: '不会。检索按 course_id 硬过滤，被新决议推翻的旧决议默认排除。' },
  { q: '一学期要花多少钱？', a: '按一门课的一支小组算：一学期约 8 次会、约 67 次问答，纯文字稿模型成本约 0.73 元；录音转写才是大头，所以默认用导入文字稿或钉钉闪记。专业版 9.9 元/组/学期，组里谁买都行，也可以 AA；同时带几个组的组长可以买 19.9 元的多组包。' },
  { q: '必须组长来买吗？', a: '不用。按小组计价，组里谁买都行，也可以 AA；付钱的人和拍板的人分开，确认决定的仍是这个组的组长。老师可以按一门课的人数走团体购入版。' },
  { q: '三门课的组员不一样怎么办？', a: '每门课单独建小组，成员和角色按课设置：同一个人可以在 A 课当组长、在 B 课当组员。整理纪要时只和这门课的名单对人名，别的组的人不会被派任务；组长只看到自己小组的任务，组员在别的组的 DDL 只显示日期，不显示内容。' },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: '组长减负',
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      description: '帮组长把会上说的话，变成确认过的决定、有人负责跟进的任务，以及下次会接着推进的记录。',
      offers: [
        { '@type': 'Offer', name: '体验版', price: '0', priceCurrency: 'CNY' },
        { '@type': 'Offer', name: '专业版（一门课的一支小组，每学期，可 AA）', price: '9.9', priceCurrency: 'CNY' },
        { '@type': 'Offer', name: '多组包（组长带的全部小组，每人每学期）', price: '19.9', priceCurrency: 'CNY' },
        { '@type': 'Offer', name: '团体购入版（每人每门课，30–99 人档）', price: '5', priceCurrency: 'CNY' },
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ],
};

export default function LandingPage() {
  // 交付物里的成本数字直接从成本模型算，和成本看板同一份代码，不会说岔
  const base = computeEconomics(BASELINE);
  const rt = computeEconomics({ ...BASELINE, asrPerSecond: ASR_REALTIME });
  const link = 'text-sm text-brand-600 hover:text-brand-700 hover:underline';
  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="border-b border-slate-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <p className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-slate-900">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600 text-[11px] font-bold text-white" aria-hidden>减</span>组长减负
          </p>
          <nav aria-label="落地页导航" className="flex items-center gap-5 text-sm">
            <a href="#deliverables" className="hidden text-slate-500 hover:text-slate-900 sm:inline">交付物</a>
            <a href="#pricing" className="hidden text-slate-500 hover:text-slate-900 sm:inline">定价</a>
            <Link href="/app" className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800">进入 Demo</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* 首屏：一句会上的原话，怎么变成确认过的决定和有人跟进的任务 */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:py-24 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <h1 className="text-4xl font-semibold leading-[1.15] tracking-tight text-slate-900 md:text-5xl">会上说的话，<br />散会就变成决定和任务。</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
              给小组作业的组长用：进会议室自动开录，散会自动出纪要，组员自己更新进度，下次开会遗留事项已经排好。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/app" className="rounded-lg bg-brand-600 px-5 py-3 text-sm font-medium text-white hover:bg-brand-700">免费试用 Demo</Link>
              <Link href="/app/cost" className="rounded-lg px-5 py-3 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">看成本与商业模式</Link>
            </div>
            <p className="mt-4 text-xs text-slate-400">不用注册，也不用 API Key。</p>
          </div>

          <figure className="relative" aria-label="一句会上的话变成决定和任务的示意">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs text-slate-400">会上 · 11 月 13 日 · 数据库原理</p>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-700"><span className="font-medium text-slate-900">浩然：</span>主键统一用自增 id，别搞什么学号当主键。</p>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-700"><span className="font-medium text-slate-900">林晓：</span>好，那就定了，主键全部自增 id。思琪你下下周二之前把建表脚本写完。</p>
            </div>
            <div className="mx-auto h-8 w-px bg-slate-300" aria-hidden />
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">决定</span>
                <p className="text-[15px] text-slate-900">主键全部用自增 id</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">待办</span>
                <div>
                  <p className="text-[15px] text-slate-900">写建表脚本</p>
                  <p className="mt-0.5 text-xs tabular-nums text-slate-500">思琪，11 月 24 日截止（「下下周二」由代码换算），前 3 天和前 1 天自动提醒</p>
                </div>
              </div>
              <p className="border-t border-slate-100 pt-3 text-xs text-slate-400">AI 整理，组长确认后才生效</p>
            </div>
          </figure>
        </section>

        <section className="border-t border-slate-100 bg-slate-50 py-20" aria-label="痛点与功能">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight text-slate-900">三个痛点是同一条链断在三处</h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-600">会上说的话 → 确认过的决定 → 有人跟进的任务 → 下次会接着推进。所以做一条闭环，而不是三个单点工具。</p>
            <div className="mt-10 grid gap-10 md:grid-cols-3">
              {[
                ['没人整理纪要', '进会议室自动开录、实时转写，也能导入腾讯会议、钉钉的文字稿。AI 抽出决定、待办和待定，组长确认才生效，一键复制成群消息。'],
                ['没人记得上次定了啥', '有人提议改已经定过的事，会上当场提醒。「问问上次」带出处回答，找不到就直说「记录里没找到」，课程之间不串。'],
                ['进度全靠组长追', '组员自己点：做完了、卡住了、申请延期、认领。组长只看「待我处理」；提醒和风险灯全是规则，可预测、不花模型钱。'],
              ].map(([t, d], i) => (
                <article key={t} className="border-t-2 border-slate-900 pt-5">
                  <p className="text-sm tabular-nums text-slate-400">0{i + 1}</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">{t}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="deliverables" className="py-20" aria-label="交付物一览">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">交付物一览</h2>
            <p className="mt-3 max-w-2xl text-[15px] text-slate-600">Demo、为什么是这个组合、成本与商业模式，以及我们怎么验证这些结论。</p>
            <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 md:grid-cols-2">
              <article className="bg-white p-7">
                <h3 className="text-[15px] font-semibold text-slate-900">Demo</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">一个 5 人小组、三门课的一周：会上自动开录和实时转写，会后组长确认纪要，组员自己更新进度，下次会前自动汇总遗留。</p>
                <Link href="/app" className={`mt-4 inline-block ${link}`}>进入 Demo</Link>
              </article>
              <article className="bg-white p-7">
                <h3 className="text-[15px] font-semibold text-slate-900">为什么是这个组合</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">AI 只用在需要理解声音和语言的地方：转写、整理成决定和待办、按意思回忆旧决议。开录、认领、延期、提醒、风险灯都用规则，因为必须可预测、边际成本几乎为零。AI 产出要组长确认才生效。只做纪要没人执行，只做看板要手抄，全交给 Agent 不可控也越用越贵。</p>
                <a href={`${REPO}/blob/main/docs/why-this-combo.md`} className={`mt-4 inline-block ${link}`}>和 5 种其他组合的对比</a>
              </article>
              <article className="bg-white p-7">
                <h3 className="text-[15px] font-semibold text-slate-900">成本与商业模式</h3>
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
                  <li><span className="text-slate-900">单次服务成本</span>（阿里云百炼原价）：1 小时组会文字处理约 ¥{textCostPerMeeting(1).toFixed(3)}；贵的是转写，实时转写 1 小时约 ¥{(3600 * ASR_REALTIME).toFixed(2)}。一支小组（一门课）一学期模型成本约 ¥{base.modelCost.toFixed(2)}。</li>
                  <li><span className="text-slate-900">定价</span>：计价单位是一门课的一支小组（不同课组员可以不一样）。体验版免费；专业版 ¥9.9 / 组 / 学期，组里谁买都行，可 AA；组长带多个组买多组包 ¥19.9；团体购入版每人每门课 ¥5 / ¥4 / ¥3。</li>
                  <li><span className="text-slate-900">商业模式</span>：每个付费组边际贡献约 ¥{base.contribution.toFixed(2)}，约 {base.breakEvenGroups} 个付费组回本（3 小时录音全走实时转写约 {rt.breakEvenGroups} 组）。</li>
                  <li><span className="text-slate-900">谁使用，谁付钱</span>：组长和组员使用，角色按课算；每支小组由组里任何一个人或 AA 付钱，拍板的仍是这个组的组长；规模化后老师按课团体购入。</li>
                </ul>
                <p className="mt-2 text-xs text-slate-400">付费率、固定成本、用量是假设，敏感度见成本看板。</p>
                <div className="mt-4 flex flex-wrap gap-4">
                  <Link href="/app/cost" className={link}>成本看板（含计算器）</Link>
                  <a href={`${REPO}/blob/main/docs/cost-model.md`} className={link}>成本与商业模式测算</a>
                </div>
              </article>
              <article className="bg-white p-7">
                <h3 className="text-[15px] font-semibold text-slate-900">怎么验证的</h3>
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
                  <li>真实百炼接口跑过一遍：抽取、问答、实时转写都跑通，演示会议文字处理实测约 ¥0.012</li>
                  <li>RAG 评估 23 题（含跨课程提问）：应拒答全部拒答，串台 0</li>
                  <li>114 个单元测试；每次模型调用都记账</li>
                  <li>成功指标：北极星是每周确认的决定数</li>
                </ul>
                <div className="mt-4 flex flex-wrap gap-4">
                  <a href={`${REPO}/blob/main/docs/real-run-report.md`} className={link}>真实接口实测报告</a>
                  <Link href="/app/metrics" className={link}>成功指标</Link>
                  <a href={`${REPO}/blob/main/docs/product-v2.md`} className={link}>产品流程与 AI 分工</a>
                  <a href={REPO} className={link}>GitHub 仓库</a>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="pricing" className="border-t border-slate-100 bg-slate-50 py-20" aria-label="定价">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">定价：一杯奶茶钱，管一学期</h2>
            <p className="mt-3 max-w-2xl text-[15px] text-slate-600">按一门课的一支小组计价：不同课的组员可以不一样，各组自己付或 AA；同时带几个组的组长买多组包。</p>
            <div className="mt-10 grid overflow-hidden rounded-2xl border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-4">
              <article className="p-7">
                <h3 className="text-sm text-slate-500">体验版</h3>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">¥0</p>
                <ul className="mt-5 space-y-2 text-sm text-slate-600">
                  <li>1 个小组</li><li>每学期 3 次纪要（粘贴文字稿或钉钉导入）</li><li>基础问答，不开录音</li>
                </ul>
              </article>
              <article className="relative border-t border-slate-100 bg-brand-50/50 p-7 sm:border-l sm:border-t-0">
                <span className="absolute inset-x-0 top-0 h-0.5 bg-brand-600" aria-hidden />
                <h3 className="text-sm font-medium text-brand-700">专业版</h3>
                <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">¥9.9<span className="ml-1 text-sm font-normal text-slate-500">/ 组 / 学期</span></p>
                <ul className="mt-5 space-y-2 text-sm text-slate-600">
                  <li>一门课的一支小组，不限次纪要</li><li>组里谁买都行，也可以 AA（5 人每人约 ¥1.98）</li><li>含 3 小时录音转写</li><li>任务与回顾、提醒、会前简报</li>
                </ul>
              </article>
              <article className="border-t border-slate-100 p-7 lg:border-l lg:border-t-0">
                <h3 className="text-sm text-slate-500">多组包</h3>
                <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">¥19.9<span className="ml-1 text-sm font-normal text-slate-500">/ 人 / 学期</span></p>
                <ul className="mt-5 space-y-2 text-sm text-slate-600">
                  <li>你当组长的全部小组一起升级（最多 4 个）</li><li>每组含 3 小时录音转写</li><li>给同时带几门课的组长</li>
                </ul>
              </article>
              <article className="border-t border-slate-100 p-7 sm:border-l lg:border-t-0">
                <h3 className="text-sm text-slate-500">团体购入版</h3>
                <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">¥5 起<span className="ml-1 text-sm font-normal text-slate-500">/ 人 / 门课</span></p>
                <ul className="mt-5 space-y-2 text-sm text-slate-600">
                  <li>按人数阶梯：30–99 人 ¥5，100–499 人 ¥4，500 人以上 ¥3</li><li>老师给一门课的学生统一开通</li><li>管理者看各组过程数据（规划中）</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="py-20" aria-label="常见问题">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">常见问题</h2>
            <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
              {FAQS.map((f) => (
                <details key={f.q} className="group py-4 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-slate-900">
                    {f.q}<span className="text-slate-400 transition-transform group-open:rotate-45" aria-hidden>+</span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-100 py-8 text-center text-xs text-slate-400">
        <p>组长减负：AI 只负责理解和回忆，执行层全是规则，既省钱又可靠。</p>
      </footer>
    </div>
  );
}
