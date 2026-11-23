import Link from 'next/link';
import { MinutesShelf, type ShelfBook } from '@/components/minutes-shelf';
import { db, schema } from '@/lib/db/client';
import { computeEconomics, textCostPerMeeting, blendedBreakEven, monthlyProfit, campusCourseContribution, ECS_YEARLY, NOTES, PRO, MIX, ASR_REALTIME } from '@/lib/unit-economics';

const REPO = 'https://github.com/cjy20040604-hub/group-leader-copilot';

const FAQS = [
  { q: '没有 API Key 能用吗？', a: '能。没配 Key 时用离线模式：示例会议直接读预置结果，别的转写用规则整理，问答从这门课的记录里摘原话回答，整条流程都能走通。配上阿里云百炼的 Key 就换成真实模型。' },
  { q: '开会要自己按录音吗？', a: '不用。进会议室 3 秒后自动开录（可以取消），说的话实时转成文字；没人说话时不上传，静音太久会自动结束，接着整理纪要。开录前会提醒参会的人。' },
  { q: '组员要怎么更新进度？', a: '在「任务与回顾」里点一下就行：做完了、写一句进度、卡住了、申请延期，也可以自己认领没人管的任务。组长只看需要拍板的事。' },
  { q: 'AI 会不会把任务分错人、记错 DDL？', a: 'AI 只负责把话整理出来。人名由代码去花名册里对，日期由代码换算和检查，拿不准的标黄，组长确认后才保存。' },
  { q: '问它上次定了什么，它会编吗？', a: '不会。每句回答都要带 [日期·类型] 出处；意思对不上、关键词也没命中时，直接回答「记录里没找到」。' },
  { q: '三门课的决定会串吗？', a: '不会。每门课只在自己的记录里找；被新决定推翻的旧决定，默认不拿来回答。' },
  { q: '一学期要花多少钱？', a: '按一门课的一支小组算。先用体验版：免费，每学期 3 次纪要，送 5 分钟会议室实时转写（每位组长一次）。线上开会、有文字稿的组买纪要版 6.9 元/学期，纪要不限次；在教室开会、要实时转写的组买专业版 14.9 元，含 8 小时实时转写。组里谁买都行，也可以 AA；同时带 2–4 个组的组长可以买 19.9 元的多组包，自己当组长的小组一起开通，纪要不限次，每组还含 2 小时会议室实时转写（已经付过费的组保持原样）。' },
  { q: '实时转写的时长用完了怎么办？', a: '会议照常开、照常录音，散会后用录音文件识别整理，不另收费，只是没有实时字幕和撞车提示。还想要实时转写，可以加购 3 小时 3.9 元的加时包，哪个档位都能买。' },
  { q: '谁来买？必须组长买吗？', a: '主要是组长买：痛最直接，拍板最快；同时带几门课的组长买多组包，一次开通全部小组。组里别人买或者 AA 也可以，只是选项，向 5 个人各收一块多钱，麻烦比钱本身还大。老师可以按一门课的人数走团体购入版。' },
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
        { '@type': 'Offer', name: '多组包（组长带的全部小组一起开通，每组含 2 小时实时转写，每人每学期）', price: '19.9', priceCurrency: 'CNY' },
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
  const profit1000 = monthlyProfit(mix.contribution, 1000);
  const profit50Courses = monthlyProfit(campusCourseContribution(), 50);
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
            <p className="mt-3 max-w-2xl text-[15px] text-slate-600">纪要、旧决定、DDL 三件事都压在组长一个人身上；Demo 把它们连成一条线。</p>
            <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-paper-line bg-paper-line md:grid-cols-2">
              <article className="bg-paper-card p-7">
                <h3 className="text-[15px] font-medium text-slate-900">组长的痛点</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">开完会，组长的事才开始：纪要要自己整理，上次定了什么得翻聊天记录，谁还没交又得一个个私聊问。几门课一起推进、每门课组员还不一样，这些事全落在组长一个人身上。</p>
              </article>
              <article className="bg-paper-card p-7">
                <h3 className="text-[15px] font-medium text-slate-900">Demo 怎么解决</h3>
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
                  <li><span className="font-medium text-slate-900">会后少整理：</span>会议自动转写，AI 整理决定和待办，组长确认后发布。</li>
                  <li><span className="font-medium text-slate-900">平时少催问：</span>组员点链接回复进度；截止前 3 天、前 1 天和过期当天自动提醒，组长只看要拍板的事。</li>
                  <li><span className="font-medium text-slate-900">会前少翻找：</span>遗留自动排进下次会；上次定了什么，「问问上次」带出处回答。</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section id="deliverables" className="border-t border-paper-line py-16" aria-label="交付物一览">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl font-medium tracking-tight text-slate-900">交付物一览</h2>
            <p className="mt-3 max-w-2xl text-[15px] text-slate-600">这个产品帮谁解决什么、为什么这样设计、怎么收费，以及哪些已经验证、哪些还要验证。</p>
            <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-paper-line bg-paper-line md:grid-cols-2">
              <article className="bg-paper-card p-7">
                <h3 className="text-[15px] font-medium text-slate-900">Demo：组长林晓的一周</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">林晓同时带三门课的小组作业。开完会，纪要自动出来，她只需要确认；组员点链接回复进度，不用她挨个问；有人同一周撞了两个 DDL，首页先提醒她问一句；下次开会前，遗留和上次定的事已经摆好。</p>
                <Link href="/app" className={`mt-4 inline-block ${link}`}>进入 Demo</Link>
              </article>
              <article className="bg-paper-card p-7">
                <h3 className="text-[15px] font-medium text-slate-900">为什么是这个组合</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">转写和纪要，腾讯会议、钉钉已经能做。真正的对手是「会议软件加一张共享表格」，我们多做的是表格做不到的两件事：</p>
                <ul className="mt-2 space-y-2 text-sm leading-relaxed text-slate-600">
                  <li><span className="font-medium text-slate-900">跨课撞 DDL 提前提醒：</span>几门课的 DDL 放在一起看，同一个组员一周撞了两个，首页先提醒组长问一句。一张表格只看得到一门课。</li>
                  <li><span className="font-medium text-slate-900">旧决定被推翻就不再当结论：</span>新决定取代旧的以后，问答和会前简报不再引用旧的。表格里的旧结论会一直留着。</li>
                </ul>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">分工上，AI 只做要理解语言的事（转写、整理决定和待办、按意思找旧决定），出的是草稿，组长确认才算数；认领、提醒、延期、风险灯交给规则，准时、可预期，几乎不花钱。</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600"><span className="font-medium text-slate-900">提醒怎么送到组员手里：</span>组长把带回复链接的催办复制到微信群，组员点开就能回，不用登录；页面上也会弹站内和浏览器通知。个人微信群没有机器人接口，下一步接钉钉 / 企业微信群机器人。</p>
                <a href={`${REPO}/blob/main/docs/why-this-combo.md`} className={`mt-4 inline-block ${link}`}>和 5 种其他组合的对比</a>
              </article>
              <article className="bg-paper-card p-7">
                <h3 className="text-[15px] font-medium text-slate-900">成本与商业模式</h3>
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
                  <li><span className="text-slate-900">单次服务成本</span>（阿里云百炼原价）：1 小时组会文字处理约 ¥{textCostPerMeeting(1).toFixed(3)}；贵的是转写，实时转写 1 小时约 ¥{(3600 * ASR_REALTIME).toFixed(2)}。一支小组（一门课）一学期模型成本约 ¥{notes.modelCost.toFixed(2)}。</li>
                  <li><span className="text-slate-900">定价跟着用法走</span>：按一门课的一支小组收费，因为不同课组员不一样，掏钱的人也不一样。线上开会、本来就有文字稿的组只要纪要，买纪要版 ¥6.9 / 学期；在教室开会、要实时字幕的组买专业版 ¥14.9（含 8 小时，用完照常录音、散会后整理，或 ¥3.9 加 3 小时）。体验版免费（3 次纪要 + 5 分钟实时转写），先试再买；带多个组的组长买多组包 ¥19.9（每组含 2 小时实时转写）；老师按课团体购入，每人每门课 ¥5 / ¥4 / ¥3。</li>
                  <li><span className="text-slate-900">商业模式</span>：服务器用阿里云 ECS 经济型 e 实例（{ECS_YEARLY} 元/年），只卖纪要版 {notes.breakEvenGroups} 组回本，只卖专业版 {pro.breakEvenGroups} 组；7 成纪要版、3 成专业版时 {mix.breakEvenGroups} 个付费组就回本。</li>
                  <li><span className="text-slate-900">谁使用，谁付钱</span>：组长和组员使用，角色按课算；主要由组长付钱，AA 只是选项。服务器按阿里云 ECS {ECS_YEARLY} 元/年算，回本不难；单月利润可能为：1,000 个付费组约 ¥{Math.round(profit1000).toLocaleString()}，50 门 60 人课的团体购入约 ¥{Math.round(profit50Courses).toLocaleString()}，所以利润主要靠老师按课团体购入。</li>
                </ul>
                <p className="mt-2 text-xs text-slate-400">付费率、用量是假设；ECS 价格是 2026-11-22 查的活动价，以控制台为准；敏感度见成本看板。</p>
                <div className="mt-4 flex flex-wrap gap-4">
                  <Link href="/app/cost" className={link}>成本看板（含计算器）</Link>
                  <a href={`${REPO}/blob/main/docs/cost-model.md`} className={link}>成本与商业模式测算</a>
                </div>
              </article>
              <article className="bg-paper-card p-7">
                <h3 className="text-[15px] font-medium text-slate-900">验证了什么，还要验证什么</h3>
                <p className="mt-3 text-sm font-medium text-slate-900">已经验证：能跑通，账算得清</p>
                <ul className="mt-1.5 space-y-1.5 text-sm leading-relaxed text-slate-600">
                  <li>真实百炼接口跑过一遍：抽取、问答、实时转写都跑通，演示会议文字处理实测约 ¥0.012</li>
                  <li>RAG 评估 23 题（含跨课程提问）：没有串台，该拒答的都拒答了；题目不多，只能说明没有明显问题。另有 129 个单元测试，每次模型调用都记账</li>
                </ul>
                <p className="mt-3 text-sm font-medium text-slate-900">还没验证：组长买不买账</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">组长每周是不是真的少花时间、组员会不会回提醒、小组愿不愿意付 6.9 或 14.9 元，现在都是假设。下一步先访谈组长、组员和老师，再用试用数据看北极星「每周确认的决定数」和提醒回复率。</p>
                <p className="mt-3 text-sm font-medium text-slate-900">已知局限</p>
                <ul className="mt-1.5 space-y-1.5 text-sm leading-relaxed text-slate-600">
                  <li>为了用免费额度，现在部署在 Render（海外）：国内访问不够稳，录音和转写也会经过境外服务器。后续为了稳定和合规，换到阿里云内地 ECS（要先备案），录音存 OSS，模型继续用百炼。</li>
                  <li>线下一台设备录音还分不清谁在说话，现在靠组长手动选发言人。</li>
                </ul>
                <div className="mt-4 flex flex-wrap gap-4">
                  <a href={`${REPO}/blob/main/docs/research/interview-targets.md`} className={link}>访谈计划</a>
                  <a href={`${REPO}/blob/main/docs/real-run-report.md`} className={link}>真实接口实测报告</a>
                  <Link href="/app/metrics" className={link}>成功指标</Link>
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
                  <li>1 个小组</li><li>每学期 3 次纪要（粘贴文字稿或钉钉导入）</li><li>送 5 分钟会议室实时转写，先体验实时字幕（每位组长一次）</li>
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
                <p className="mt-2 text-3xl font-medium tabular-nums tracking-tight text-slate-900">¥19.9<span className="ml-1 text-sm font-normal text-slate-500">/ 人 / 学期</span></p>
                <ul className="mt-5 space-y-2 text-sm text-slate-600">
                  <li>你当组长的小组一起开通（最多 4 个），纪要不限次</li><li>每组含 2 小时会议室实时转写，不够再加时</li><li>带三门课的组长，比每组单买划算</li>
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
