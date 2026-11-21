import Link from 'next/link';
import { computeEconomics, textCostPerMeeting, BASELINE, ASR_REALTIME } from '@/lib/unit-economics';

const REPO = 'https://github.com/cjy20040604-hub/group-leader-copilot';

const FAQS = [
  { q: '没有 API Key 能演示吗？', a: '能。MOCK_LLM=true 模式用种子数据对应的预置输出跑通全流程，讲解现场不翻车。' },
  { q: '开会要自己按录音吗？', a: '不用。进会议室 3 秒后自动开录（可取消），说的话实时转成文字；没人说话时不上传，长时间静音自动结束并进入纪要整理。开录前会提示参会人。' },
  { q: '组员要怎么更新进度？', a: '在「任务与回顾」里一键点：做完了、写一句进度、卡住了、申请延期，或者自己认领没人管的任务。组长只看需要拍板的例外。' },
  { q: 'AI 会不会把任务分错人、记错 DDL？', a: 'AI 只负责抽取，人名由代码模糊匹配花名册、日期由代码换算校验，低置信度标黄，组长确认后才落库。' },
  { q: '问它上次定了什么，它会编吗？', a: '不会。RAG 回答必须带 [日期·类型] 出处，相似度不够且关键词无命中时直接回答「记录里没找到」。' },
  { q: '三门课的决议会串台吗？', a: '不会。检索按 course_id 硬过滤，被新决议推翻的旧决议默认排除。' },
  { q: '一学期要花多少钱？', a: '按每学期 3 门课 × 8 次会 × 200 次问答推算，纯文字稿模型成本约 2.2 元；录音转写才是大头，所以默认用导入文字稿或钉钉闪记。专业版 19.9 元/组/学期，一人买全组用，也可以 AA。' },
  { q: '必须组长来买吗？', a: '不用。按小组计价，组里谁买都行，也可以 AA；付钱的人和拍板的人分开，确认决定的仍是组长或小组指定的人。学校、学院、社团等机构可以走团体购入版，按人数阶梯优惠。' },
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
        { '@type': 'Offer', name: '专业版（每组每学期，可 AA）', price: '19.9', priceCurrency: 'CNY' },
        { '@type': 'Offer', name: '团体购入版（每人每学期，30–99 人档）', price: '5', priceCurrency: 'CNY' },
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
  return (
    <div className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <p className="font-bold text-brand-700">组长减负</p>
          <nav aria-label="落地页导航">
            <Link href="/app" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">进入 Demo →</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-4 py-16 text-center">
          <h1 className="text-3xl font-bold leading-tight md:text-4xl">开完会就散会，<br className="md:hidden" />纪要、旧决议、DDL 全压组长一个人？</h1>
          <p className="mx-auto mt-4 max-w-2xl text-slate-600">
            帮组长把会上说的话，变成确认过的决定、有人负责跟进的任务，以及下次会接着推进的记录。
            进会议室自动开录、实时转写；组员自己更新进度；下次开会，遗留事项自动排好。
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/app" className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700">免费试用 Demo</Link>
            <Link href="/app/cost" className="rounded-lg border border-slate-300 px-6 py-3 text-sm text-slate-700 hover:bg-slate-100">看成本看板</Link>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50 py-12" aria-label="交付物一览">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-xl font-bold">交付物一览</h2>
            <p className="mt-1 text-sm text-slate-500">Demo、为什么是这个组合、成本与商业模式，都在这一屏能找到入口。</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <article className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="font-semibold">Demo</h3>
                <p className="mt-2 text-sm text-slate-600">不用注册、不用 Key，离线 Mock 模式全流程可用。建议路径：顶部「🎙 开会」看自动开录和实时转写 → 确认纪要 → 「任务与回顾」→「问问上次」→「成本看板」。</p>
                <Link href="/app" className="mt-3 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">进入 Demo</Link>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="font-semibold">为什么是这个组合</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">三个痛点是同一条链断在三处：会上说的话 → 确认过的决定 → 有人跟进的任务 → 下次会接着推进，所以做一条闭环而不是三个单点工具。AI 只用在需要理解声音和语言的地方（转写、整理成决定和待办、按意思回忆旧决议）；开录、认领、延期、提醒、风险灯都用规则，因为必须可预测、几乎零边际成本。AI 产出要组长确认才生效。只做纪要没人执行，只做看板要手抄，全交给 Agent 不可控也越用越贵。</p>
                <a href={`${REPO}/blob/main/docs/why-this-combo.md`} className="mt-3 inline-block text-sm text-brand-600 hover:underline">和 5 种其他组合的对比表</a>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="font-semibold">成本与商业模式</h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  <li>按阿里云百炼原价：1 小时组会文字处理约 ¥{textCostPerMeeting(1).toFixed(3)}，一个组长一学期模型成本约 ¥{base.modelCost.toFixed(2)}</li>
                  <li>专业版 ¥19.9 / 组 / 学期（一人买全组用，可 AA）；每个付费组边际贡献约 ¥{base.contribution.toFixed(2)}，约 {base.breakEvenGroups} 个付费组覆盖固定成本（录音会后上传；全走实时转写约 {rt.breakEvenGroups} 组）</li>
                  <li>谁用：组长（核心）、组员（自己更新进度）、老师（看过程数据，规划中）；谁付钱：小组里任何一个人或 AA（付钱的人和拍板的人分开），规模化后学校、学院等机构走团体购入版（¥5 / ¥4 / ¥3 每人每学期，按人数阶梯）</li>
                  <li className="text-xs text-slate-400">付费率、固定成本、会议次数等是假设 · 待验证，敏感度见成本看板</li>
                </ul>
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <Link href="/app/cost" className="text-brand-600 hover:underline">成本看板（含计算器）</Link>
                  <a href={`${REPO}/blob/main/docs/cost-model.md`} className="text-brand-600 hover:underline">成本与商业模式测算文档</a>
                </div>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="font-semibold">怎么判断它有用、代码在哪</h3>
                <p className="mt-2 text-sm text-slate-600">北极星指标是每周确认的决定数，配套看提醒回复率、组员自主更新占比、按时完成率。源码、产品定位、架构和测试都在 GitHub 仓库里。</p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <Link href="/app/metrics" className="text-brand-600 hover:underline">成功指标</Link>
                  <a href={REPO} className="text-brand-600 hover:underline">GitHub 仓库</a>
                  <a href={`${REPO}/blob/main/docs/product-v2.md`} className="text-brand-600 hover:underline">产品定位与 AI 分工</a>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="bg-white py-14" aria-label="痛点与功能">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-center text-xl font-bold">三个痛点，三个功能</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <article className="rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold">📋 没人整理纪要</h3>
                <p className="mt-2 text-sm text-slate-600">进会议室自动开录、实时转写（也能粘贴文字稿）→ AI 抽取决议/待办/分歧/待定 → 组长确认才生效 → 一键复制成群消息。</p>
              </article>
              <article className="rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold">🧠 没人记得上次定了啥</h3>
                <p className="mt-2 text-sm text-slate-600">会前简报 + 「问问上次」带出处问答 + 议程撞旧决议自动提示。答案必须引用到具体会议，找不到就直说。</p>
              </article>
              <article className="rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold">⏰ 进度全靠组长追</h3>
                <p className="mt-2 text-sm text-slate-600">组员一键更新：做完了、卡住了、申请延期、自己认领。组长只看「待我处理」，D-3/D-1/过期提醒和风险灯全是确定性代码。</p>
              </article>
            </div>
          </div>
        </section>

        <section className="py-14" aria-label="定价">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-center text-xl font-bold">定价：一杯奶茶钱，管一学期</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <article className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="font-semibold">体验版</h3>
                <p className="mt-2 text-2xl font-bold">¥0</p>
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  <li>每月 4 次纪要（粘贴文字稿或钉钉导入）</li><li>1 门课</li><li>基础问答，不开录音</li>
                </ul>
              </article>
              <article className="rounded-xl border-2 border-brand-600 bg-white p-5 shadow-md">
                <h3 className="font-semibold text-brand-700">专业版</h3>
                <p className="mt-2 text-2xl font-bold">¥19.9<span className="text-sm font-normal text-slate-500"> / 组 / 学期</span></p>
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  <li>一人购买，全组使用；也可以 AA（5 人每人约 ¥3.98）</li><li>谁付钱都行，确认决定的仍是组长</li><li>3 门课不限次纪要，含 10 小时录音转写</li><li>任务与回顾、提醒、会前简报</li>
                </ul>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="font-semibold">团体购入版（机构）</h3>
                <p className="mt-2 text-2xl font-bold">¥5 起<span className="text-sm font-normal text-slate-500"> / 人 / 学期</span></p>
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  <li>按人数阶梯：30–99 人 ¥5，100–499 人 ¥4，500 人以上 ¥3</li><li>学校、学院、社团统一采购，每个小组都有专业版功能</li><li>管理者看各组过程数据（规划中）</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="bg-white py-14" aria-label="常见问题">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="text-center text-xl font-bold">常见问题</h2>
            <div className="mt-6 space-y-3">
              {FAQS.map((f) => (
                <details key={f.q} className="rounded-xl border border-slate-200 p-4">
                  <summary className="cursor-pointer text-sm font-medium">{f.q}</summary>
                  <p className="mt-2 text-sm text-slate-600">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        <p>组长减负 · AI 只负责「理解」和「回忆」，执行层全部是规则 —— 既省钱又可靠。</p>
      </footer>
    </div>
  );
}