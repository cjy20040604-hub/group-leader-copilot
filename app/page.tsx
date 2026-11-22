import Link from 'next/link';
import { MinutesShelf, type ShelfBook } from '@/components/minutes-shelf';
import { db, schema } from '@/lib/db/client';
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

export const dynamic = 'force-dynamic';

// 书架上的书：演示数据库里真实的每场会（按课程、日期排），带它的决定 / 待办 / 待定和原话
function loadShelf(): ShelfBook[] {
  const courses = new Map(db.select().from(schema.courses).all().map((c) => [c.id, c]));
  const items = db.select().from(schema.memoryItems).all();
  const dateOf = new Map(items.map((m) => [m.id, m.meetingDate]));
  const order = [...courses.keys()];
  return db.select().from(schema.meetings).all()
    .sort((a, b) => order.indexOf(a.courseId) - order.indexOf(b.courseId) || a.date.localeCompare(b.date))
    .map((m) => {
      const mine = items.filter((i) => i.meetingId === m.id);
      const c = courses.get(m.courseId);
      return {
        id: m.id, courseName: c?.name ?? m.courseId, color: c?.color ?? '#64748b', date: m.date, title: m.title,
        decisions: mine.filter((i) => i.type === 'decision').map((i) => ({ text: i.text, evidence: i.evidence, supersededOn: i.status === 'superseded' && i.supersededBy ? dateOf.get(i.supersededBy) ?? null : null })),
        actions: mine.filter((i) => i.type === 'action').map((i) => ({ text: i.text, evidence: i.evidence })),
        questions: mine.filter((i) => i.type === 'open_question').map((i) => i.text),
      };
    });
}

export default function LandingPage() {
  const books = loadShelf();
  // 交付物里的成本数字直接从成本模型算，和成本看板同一份代码，不会说岔
  const base = computeEconomics(BASELINE);
  const rt = computeEconomics({ ...BASELINE, asrPerSecond: ASR_REALTIME });
  const link = 'text-sm text-brand-600 hover:text-brand-700 hover:underline';
  return (
    <div className="min-h-screen bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* 首屏：纪要书架。深色暖光是这个场景的灯光，只在首屏出现；往下回到纸面暖白 */}
      <div className="relative overflow-hidden bg-[#1c1814] text-[#efe9de]" style={{ backgroundImage: 'radial-gradient(ellipse 60% 50% at 72% 0%, rgba(255, 196, 120, 0.10), transparent 70%)' }}>
        <header>
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <p className="flex items-center gap-2 text-[15px] font-medium tracking-tight">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600 text-[11px] font-semibold text-white" aria-hidden>减</span>组长减负
            </p>
            <nav aria-label="落地页导航" className="flex items-center gap-5 text-sm">
              <a href="#deliverables" className="hidden text-[#b3aa9c] hover:text-[#efe9de] sm:inline">交付物</a>
              <a href="#pricing" className="hidden text-[#b3aa9c] hover:text-[#efe9de] sm:inline">定价</a>
              <Link href="/app" className="rounded-lg bg-[#efe9de] px-4 py-2 font-medium text-[#1c1814] hover:bg-white">进入 Demo</Link>
            </nav>
          </div>
        </header>

        <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 md:pt-16" aria-label="纪要书架">
          <div className="max-w-2xl">
            <h1 className="text-[32px] font-medium leading-[1.15] tracking-tight sm:text-4xl lg:text-[52px]"><span className="block">会上说的话，</span><span className="block lg:whitespace-nowrap">散会就变成决定和任务</span></h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#b3aa9c]">
              给小组作业的组长用：进会议室自动开录，散会自动出纪要，组员自己更新进度。每场会都留在书架上，下次想不起来就翻。
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/app" className="rounded-lg bg-brand-500 px-5 py-3 text-sm font-medium text-white hover:bg-brand-600">免费试用 Demo</Link>
              <Link href="/app/cost" className="rounded-lg px-5 py-3 text-sm font-medium text-[#efe9de] ring-1 ring-inset ring-[#efe9de]/25 hover:bg-white/5">看成本与商业模式</Link>
              <span className="text-xs text-[#8a8173]">不用注册，也不用 API Key</span>
            </div>
          </div>
          <div className="mt-12">
            <MinutesShelf books={books} />
          </div>
        </section>
      </div>

      <main>
        <section className="border-t border-paper-line bg-white py-10" aria-label="痛点与解法">
          <p className="mx-auto max-w-6xl px-4 text-[17px] leading-relaxed text-slate-600">
            <span className="font-medium text-slate-900">组长的痛点</span>是会后没人整理纪要、下次没人记得定了啥、进度全靠组长追；<span className="font-medium text-slate-900">Demo 把这三处连成一条线</span>：会上自动转写，AI 整理成决定和待办、组长确认后生效，组员自己更新进度，DDL 前 3 天、前 1 天和过期当天自动提醒（组员点链接就能回），下次开会前遗留自动排好，忘了就「问问上次」。
          </p>
        </section>

        <section id="deliverables" className="py-20" aria-label="交付物一览">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl font-medium tracking-tight text-slate-900">交付物一览</h2>
            <p className="mt-3 max-w-2xl text-[15px] text-slate-600">Demo、为什么是这个组合、成本与商业模式，以及我们怎么验证这些结论。</p>
            <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 md:grid-cols-2">
              <article className="bg-white p-7">
                <h3 className="text-[15px] font-medium text-slate-900">Demo</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">一个 5 人小组、三门课的一周：会上自动开录和实时转写，会后组长确认纪要，组员自己更新进度，下次会前自动汇总遗留。</p>
                <Link href="/app" className={`mt-4 inline-block ${link}`}>进入 Demo</Link>
              </article>
              <article className="bg-white p-7">
                <h3 className="text-[15px] font-medium text-slate-900">为什么是这个组合</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">AI 只用在需要理解声音和语言的地方：转写、整理成决定和待办、按意思回忆旧决议。开录、认领、延期、提醒、风险灯都用规则，因为必须可预测、边际成本几乎为零。AI 产出要组长确认才生效。只做纪要没人执行，只做看板要手抄，全交给 Agent 不可控也越用越贵。</p>
                <a href={`${REPO}/blob/main/docs/why-this-combo.md`} className={`mt-4 inline-block ${link}`}>和 5 种其他组合的对比</a>
              </article>
              <article className="bg-white p-7">
                <h3 className="text-[15px] font-medium text-slate-900">成本与商业模式</h3>
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
                <h3 className="text-[15px] font-medium text-slate-900">怎么验证的</h3>
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

        <section id="pricing" className="border-t border-paper-line bg-white py-20" aria-label="定价">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl font-medium tracking-tight text-slate-900">定价：一杯奶茶钱，管一学期</h2>
            <p className="mt-3 max-w-2xl text-[15px] text-slate-600">按一门课的一支小组计价：不同课的组员可以不一样，各组自己付或 AA；同时带几个组的组长买多组包。</p>
            <div className="mt-10 grid overflow-hidden rounded-2xl border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-4">
              <article className="p-7">
                <h3 className="text-sm text-slate-500">体验版</h3>
                <p className="mt-2 text-3xl font-medium tracking-tight text-slate-900">¥0</p>
                <ul className="mt-5 space-y-2 text-sm text-slate-600">
                  <li>1 个小组</li><li>每学期 3 次纪要（粘贴文字稿或钉钉导入）</li><li>基础问答，不开录音</li>
                </ul>
              </article>
              <article className="relative border-t border-slate-100 bg-brand-50/50 p-7 sm:border-l sm:border-t-0">
                <span className="absolute inset-x-0 top-0 h-0.5 bg-brand-600" aria-hidden />
                <h3 className="text-sm font-medium text-brand-700">专业版</h3>
                <p className="mt-2 text-3xl font-medium tabular-nums tracking-tight text-slate-900">¥9.9<span className="ml-1 text-sm font-normal text-slate-500">/ 组 / 学期</span></p>
                <ul className="mt-5 space-y-2 text-sm text-slate-600">
                  <li>一门课的一支小组，不限次纪要</li><li>组里谁买都行，也可以 AA（5 人每人约 ¥1.98）</li><li>含 3 小时录音转写</li><li>任务与回顾、提醒、会前简报</li>
                </ul>
              </article>
              <article className="border-t border-slate-100 p-7 lg:border-l lg:border-t-0">
                <h3 className="text-sm text-slate-500">多组包</h3>
                <p className="mt-2 text-3xl font-medium tabular-nums tracking-tight text-slate-900">¥19.9<span className="ml-1 text-sm font-normal text-slate-500">/ 人 / 学期</span></p>
                <ul className="mt-5 space-y-2 text-sm text-slate-600">
                  <li>你当组长的全部小组一起升级（最多 4 个）</li><li>每组含 3 小时录音转写</li><li>给同时带几门课的组长</li>
                </ul>
              </article>
              <article className="border-t border-slate-100 p-7 sm:border-l lg:border-t-0">
                <h3 className="text-sm text-slate-500">团体购入版</h3>
                <p className="mt-2 text-3xl font-medium tabular-nums tracking-tight text-slate-900">¥5 起<span className="ml-1 text-sm font-normal text-slate-500">/ 人 / 门课</span></p>
                <ul className="mt-5 space-y-2 text-sm text-slate-600">
                  <li>按人数阶梯：30–99 人 ¥5，100–499 人 ¥4，500 人以上 ¥3</li><li>老师给一门课的学生统一开通</li><li>管理者看各组过程数据（规划中）</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="py-20" aria-label="常见问题">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="text-2xl font-medium tracking-tight text-slate-900">常见问题</h2>
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

      <footer className="border-t border-paper-line py-8 text-center text-xs text-slate-400">
        <p>组长减负：AI 只负责理解和回忆，执行层全是规则，既省钱又可靠。</p>
      </footer>
    </div>
  );
}
