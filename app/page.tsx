import Link from 'next/link';
import { MinutesShelf, type ShelfBook } from '@/components/minutes-shelf';
import { db, schema } from '@/lib/db/client';
import { computeEconomics, textCostPerMeeting, blendedBreakEven, NOTES, PRO, MIX, ASR_REALTIME } from '@/lib/unit-economics';

const REPO = 'https://github.com/cjy20040604-hub/group-leader-copilot';

const FAQS = [
  { q: '没有 API Key 能用吗？', a: '能。没配 Key 时用离线模式：示例会议直接读预置结果，别的转写用规则整理，问答从这门课的记录里摘原话回答，整条流程都能走通。配上阿里云百炼的 Key 就换成真实模型。' },
  { q: '开会要自己按录音吗？', a: '不用。进会议室 3 秒后自动开录（可以取消），说的话实时转成文字；没人说话时不上传，静音太久会自动结束，接着整理纪要。开录前会提醒参会的人。' },
  { q: '组员要怎么更新进度？', a: '在「任务与回顾」里点一下就行：做完了、写一句进度、卡住了、申请延期，也可以自己认领没人管的任务。组长只看需要拍板的事。' },
  { q: 'AI 会不会把任务分错人、记错 DDL？', a: 'AI 只负责把话整理出来。人名由代码去花名册里对，日期由代码换算和检查，拿不准的标黄，组长确认后才保存。' },
  { q: '问它上次定了什么，它会编吗？', a: '不会。每句回答都要带 [日期·类型] 出处；意思对不上、关键词也没命中时，直接回答「记录里没找到」。' },
  { q: '三门课的决定会串吗？', a: '不会。每门课只在自己的记录里找；被新决定推翻的旧决定，默认不拿来回答。' },
  { q: '一学期要花多少钱？', a: '按一门课的一支小组算。先用体验版：免费，每学期 3 次纪要，送 10 分钟会议室实时转写。线上开会、有文字稿的组买纪要版 6.9 元/学期，纪要不限次；在教室开会、要实时转写的组买专业版 14.9 元，含 8 小时实时转写。组里谁买都行，也可以 AA；同时带几个组的组长可以买 14.9 元的多组包，全部小组都开纪要版。' },
  { q: '实时转写的时长用完了怎么办？', a: '会议照常开、照常录音，散会后用录音文件识别整理，不另收费，只是没有实时字幕和撞车提示。还想要实时转写，可以加购 3 小时 3.9 元的加时包，哪个档位都能买。' },
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
        { '@type': 'Offer', name: '纪要版（一门课的一支小组，每学期，纪要不限次，可 AA）', price: '6.9', priceCurrency: 'CNY' },
        { '@type': 'Offer', name: '专业版（纪要版 + 8 小时会议室实时转写，每组每学期）', price: '14.9', priceCurrency: 'CNY' },
        { '@type': 'Offer', name: '多组包（组长带的全部小组都开纪要版，每人每学期）', price: '14.9', priceCurrency: 'CNY' },
        { '@type': 'Offer', name: '实时转写加时包（3 小时）', price: '3.9', priceCurrency: 'CNY' },
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
  const notes = computeEconomics(NOTES);
  const pro = computeEconomics(PRO);
  const mix = blendedBreakEven(MIX);
  const link = 'text-sm text-brand-600 hover:text-brand-700 hover:underline';
  return (
    <div className="min-h-screen bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* 首屏：纪要书架。深色暖光是这个场景的灯光，只在首屏出现；往下回到纸面暖白 */}
      <div className="relative overflow-hidden bg-ink text-cream-50" style={{ backgroundImage: 'radial-gradient(ellipse 60% 50% at 72% 0%, rgba(255, 196, 120, 0.08), transparent 70%)' }}>
        <header>
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <p className="flex items-center gap-2 text-[15px] font-medium tracking-tight">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600 text-[11px] font-semibold text-white" aria-hidden>减</span>组长减负
            </p>
            <nav aria-label="落地页导航" className="flex items-center gap-5 text-sm">
              <a href="#deliverables" className="hidden text-cream-200 hover:text-cream-50 sm:inline">交付物</a>
              <a href="#pricing" className="hidden text-cream-200 hover:text-cream-50 sm:inline">定价</a>
              <Link href="/app" className="rounded-lg bg-cream-50 px-4 py-2 font-medium text-ink hover:bg-white">进入 Demo</Link>
            </nav>
          </div>
        </header>

        <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 md:pt-16" aria-label="纪要书架">
          <div className="max-w-2xl">
            <h1 className="text-[32px] font-medium leading-[1.15] tracking-tight sm:text-4xl lg:text-[52px]"><span className="block">会上说定的事，</span><span className="block lg:whitespace-nowrap">会后接着推进。</span></h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-cream-200">
              会议自动转写，AI 整理决定和待办，由您确认后发布。组员更新自己的进度，系统按截止时间提醒。多门课的组会统一收进书架，上次定了什么，随时翻得到。
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/app" className="rounded-lg bg-brand-500 px-5 py-3 text-sm font-medium text-white hover:bg-brand-600">免费试用 Demo</Link>
              <Link href="/app/cost" className="rounded-lg px-5 py-3 text-sm font-medium text-cream-50 ring-1 ring-inset ring-cream-50/30 hover:bg-white/5">看成本与商业模式</Link>
            </div>
          </div>
          <div className="mt-12">
            <MinutesShelf books={books} />
          </div>
        </section>
      </div>

      <main>
        <section className="py-16" aria-label="痛点与解法">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl font-medium tracking-tight text-slate-900">痛点与解法</h2>
            <p className="mt-3 max-w-2xl text-[15px] text-slate-600">纪要、旧决议、DDL 三件事都压在组长一个人身上；Demo 把它们连成一条线。</p>
            <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-paper-line bg-paper-line md:grid-cols-2">
              <article className="bg-paper-card p-7">
                <h3 className="text-[15px] font-medium text-slate-900">组长的痛点</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">会后没人整理纪要，下次没人记得定了啥，进度全靠组长一个个追。</p>
              </article>
              <article className="bg-paper-card p-7">
                <h3 className="text-[15px] font-medium text-slate-900">Demo 怎么解决</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">会上自动转写，AI 整理成决定和待办、组长确认后生效；组员自己更新进度，DDL 前 3 天、前 1 天和过期当天自动提醒（组员点链接就能回）；下次开会前遗留自动排好，忘了就「问问上次」。</p>
              </article>
            </div>
          </div>
        </section>

        <section id="deliverables" className="border-t border-paper-line py-16" aria-label="交付物一览">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl font-medium tracking-tight text-slate-900">交付物一览</h2>
            <p className="mt-3 max-w-2xl text-[15px] text-slate-600">Demo、为什么是这个组合、成本与商业模式，以及我们怎么验证这些结论。</p>
            <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-paper-line bg-paper-line md:grid-cols-2">
              <article className="bg-paper-card p-7">
                <h3 className="text-[15px] font-medium text-slate-900">Demo</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">一个 5 人小组、三门课的一周：会上自动开录和实时转写，会后组长确认纪要，组员自己更新进度，下次会前自动汇总遗留。</p>
                <Link href="/app" className={`mt-4 inline-block ${link}`}>进入 Demo</Link>
              </article>
              <article className="bg-paper-card p-7">
                <h3 className="text-[15px] font-medium text-slate-900">为什么是这个组合</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">AI 只用在需要理解声音和语言的地方：转写、整理成决定和待办、按意思回忆旧决议。开录、认领、延期、提醒、风险灯都用规则，因为必须可预测、边际成本几乎为零。AI 产出要组长确认才生效。只做纪要没人执行，只做看板要手抄，全交给 Agent 不可控也越用越贵。</p>
                <a href={`${REPO}/blob/main/docs/why-this-combo.md`} className={`mt-4 inline-block ${link}`}>和 5 种其他组合的对比</a>
              </article>
              <article className="bg-paper-card p-7">
                <h3 className="text-[15px] font-medium text-slate-900">成本与商业模式</h3>
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
                  <li><span className="text-slate-900">单次服务成本</span>（阿里云百炼原价）：1 小时组会文字处理约 ¥{textCostPerMeeting(1).toFixed(3)}；贵的是转写，实时转写 1 小时约 ¥{(3600 * ASR_REALTIME).toFixed(2)}。一支小组（一门课）一学期模型成本约 ¥{notes.modelCost.toFixed(2)}。</li>
                  <li><span className="text-slate-900">定价</span>：计价单位是一门课的一支小组，纪要和实时转写分开卖。体验版免费（每学期 3 次纪要，送 10 分钟实时转写）；纪要版 ¥6.9 / 组 / 学期；专业版 ¥14.9，多 8 小时实时转写，用完照常录音、散会后整理，或加购 3 小时 ¥3.9；组长带多个组买多组包 ¥14.9；团体购入版每人每门课 ¥5 / ¥4 / ¥3。</li>
                  <li><span className="text-slate-900">商业模式</span>：只卖纪要版 {notes.breakEvenGroups} 组回本，只卖专业版 {pro.breakEvenGroups} 组；7 成纪要版、3 成专业版时约 {mix.breakEvenGroups} 个付费组回本。</li>
                  <li><span className="text-slate-900">谁使用，谁付钱</span>：组长和组员使用，角色按课算；每支小组由组里任何一个人或 AA 付钱，拍板的仍是这个组的组长；规模化后老师按课团体购入。</li>
                </ul>
                <p className="mt-2 text-xs text-slate-400">付费率、固定成本、用量是假设，敏感度见成本看板。</p>
                <div className="mt-4 flex flex-wrap gap-4">
                  <Link href="/app/cost" className={link}>成本看板（含计算器）</Link>
                  <a href={`${REPO}/blob/main/docs/cost-model.md`} className={link}>成本与商业模式测算</a>
                </div>
              </article>
              <article className="bg-paper-card p-7">
                <h3 className="text-[15px] font-medium text-slate-900">怎么验证的</h3>
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
                  <li>真实百炼接口跑过一遍：抽取、问答、实时转写都跑通，演示会议文字处理实测约 ¥0.012</li>
                  <li>RAG 评估 23 题（含跨课程提问）：应拒答全部拒答，串台 0</li>
                  <li>124 个单元测试；每次模型调用都记账</li>
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

        <section id="pricing" className="border-t border-paper-line py-20" aria-label="定价">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl font-medium tracking-tight text-slate-900">定价：一杯奶茶钱，管一学期</h2>
            <p className="mt-3 max-w-2xl text-[15px] text-slate-600">按一门课的一支小组计价，各组自己付或 AA。线上开会有文字稿的买纪要版，在教室开会要实时转写的买专业版。</p>
            <div className="mt-10 grid overflow-hidden rounded-t-2xl border border-paper-line bg-paper-card sm:grid-cols-2 lg:grid-cols-4">
              <article className="p-7">
                <h3 className="text-sm text-slate-500">体验版</h3>
                <p className="mt-2 text-3xl font-medium tracking-tight text-slate-900">¥0</p>
                <ul className="mt-5 space-y-2 text-sm text-slate-600">
                  <li>1 个小组</li><li>每学期 3 次纪要（粘贴文字稿或钉钉导入）</li><li>送 10 分钟会议室实时转写，先体验实时字幕</li>
                </ul>
              </article>
              <article className="relative border-t border-paper-line bg-brand-50/50 p-7 sm:border-l sm:border-t-0">
                <span className="absolute inset-x-0 top-0 h-0.5 bg-brand-600" aria-hidden />
                <h3 className="text-sm font-medium text-brand-700">纪要版</h3>
                <p className="mt-2 text-3xl font-medium tabular-nums tracking-tight text-slate-900">¥6.9<span className="ml-1 text-sm font-normal text-slate-500">/ 组 / 学期</span></p>
                <ul className="mt-5 space-y-2 text-sm text-slate-600">
                  <li>纪要不限次：粘贴文字稿、钉钉会议导入</li><li>问答、提醒、会前简报、任务与回顾</li><li>组里谁买都行，也可以 AA（5 人每人约 ¥1.38）</li>
                </ul>
              </article>
              <article className="border-t border-paper-line p-7 lg:border-l lg:border-t-0">
                <h3 className="text-sm text-slate-500">专业版</h3>
                <p className="mt-2 text-3xl font-medium tabular-nums tracking-tight text-slate-900">¥14.9<span className="ml-1 text-sm font-normal text-slate-500">/ 组 / 学期</span></p>
                <ul className="mt-5 space-y-2 text-sm text-slate-600">
                  <li>纪要版全部，纪要不限次</li><li>含 8 小时会议室实时转写，开会时有字幕和撞车提示</li><li>用完照常录音，散会后整理</li>
                </ul>
              </article>
              <article className="border-t border-paper-line p-7 sm:border-l lg:border-t-0">
                <h3 className="text-sm text-slate-500">多组包</h3>
                <p className="mt-2 text-3xl font-medium tabular-nums tracking-tight text-slate-900">¥14.9<span className="ml-1 text-sm font-normal text-slate-500">/ 人 / 学期</span></p>
                <ul className="mt-5 space-y-2 text-sm text-slate-600">
                  <li>你当组长的小组都开纪要版（最多 4 个）</li><li>给同时带几门课的组长</li><li>某个组要实时转写，单独升专业版或加时</li>
                </ul>
              </article>
            </div>
            <div className="grid gap-x-10 gap-y-3 border-x border-b border-paper-line bg-paper-card px-7 py-5 text-sm text-slate-600 sm:grid-cols-2 rounded-b-2xl -mt-px">
              <p><span className="font-medium text-slate-900">加时包 ¥3.9 / 3 小时</span>：实时转写不够时加，哪个档位都能买。</p>
              <p><span className="font-medium text-slate-900">团体购入版 ¥5 起 / 人 / 门课</span>：30–99 人 ¥5，100–499 人 ¥4，500 人以上 ¥3；老师给一门课统一开通。</p>
            </div>
          </div>
        </section>

        <section className="py-20" aria-label="常见问题">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="text-2xl font-medium tracking-tight text-slate-900">常见问题</h2>
            <div className="mt-8 divide-y divide-paper-line border-y border-paper-line">
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
        <p>组长减负：AI 只负责理解和回忆，推进事情全靠规则，所以便宜，结果也可预期。</p>
      </footer>
    </div>
  );
}
