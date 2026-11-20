import Link from 'next/link';

const FAQS = [
  { q: '没有 API Key 能演示吗？', a: '能。MOCK_LLM=true 模式用种子数据对应的预置输出跑通全流程，讲解现场不翻车。' },
  { q: 'AI 会不会把任务分错人、记错 DDL？', a: 'AI 只负责抽取，人名由代码模糊匹配花名册、日期由代码换算校验，低置信度标黄，组长确认后才落库。' },
  { q: '问它上次定了什么，它会编吗？', a: '不会。RAG 回答必须带 [日期·类型] 出处，相似度不够且关键词无命中时直接回答「记录里没找到」。' },
  { q: '三门课的决议会串台吗？', a: '不会。检索按 course_id 硬过滤，被新决议推翻的旧决议默认排除。' },
  { q: '一学期要花多少钱？', a: '按每学期 3 门课 × 8 次会 × 200 次问答推算，纯文字稿模型成本约 2.3 元。组长 Pro 19.9 元/学期。' },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: '组长减负',
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      description: '把小组会议转写变成纪要、任务和提醒的协作工具，让组长不用再整理纪要、记旧决议、追 DDL。',
      offers: [
        { '@type': 'Offer', name: '免费版', price: '0', priceCurrency: 'CNY' },
        { '@type': 'Offer', name: '组长 Pro（每学期）', price: '19.9', priceCurrency: 'CNY' },
        { '@type': 'Offer', name: '课程版（每学生每学期）', price: '5', priceCurrency: 'CNY' },
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ],
};

export default function LandingPage() {
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
            把会议转写粘贴进来，1 分钟变成「结构化纪要 + 任务 + 提醒 + 可检索的集体记忆」。
            5 人小组的组长，不用再整理纪要、记旧决议、追 DDL。
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/app" className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700">免费试用 Demo</Link>
            <Link href="/app/cost" className="rounded-lg border border-slate-300 px-6 py-3 text-sm text-slate-700 hover:bg-slate-100">看成本看板</Link>
          </div>
        </section>

        <section className="bg-white py-14" aria-label="痛点与功能">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-center text-xl font-bold">三个痛点，三个功能</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <article className="rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold">📋 没人整理纪要</h3>
                <p className="mt-2 text-sm text-slate-600">粘贴转写 → AI 抽取决议/待办/分歧/待定 → 组长确认 → 一键复制成群消息。从粘贴到可发群 ≤ 3 次点击。</p>
              </article>
              <article className="rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold">🧠 没人记得上次定了啥</h3>
                <p className="mt-2 text-sm text-slate-600">会前简报 + 「问问上次」带出处问答 + 议程撞旧决议自动提示。答案必须引用到具体会议，找不到就直说。</p>
              </article>
              <article className="rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold">⏰ DDL 临近没人催</h3>
                <p className="mt-2 text-sm text-slate-600">任务看板 + 风险灯 + D-3/D-1/过期自动提醒 + 催办文案。全部确定性代码，提醒不漏发、不错发。</p>
              </article>
            </div>
          </div>
        </section>

        <section className="py-14" aria-label="定价">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-center text-xl font-bold">定价：一杯奶茶钱，管一学期</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <article className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="font-semibold">免费版</h3>
                <p className="mt-2 text-2xl font-bold">¥0</p>
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  <li>每月 4 次纪要（仅粘贴文字稿）</li><li>1 门课</li><li>基础问答</li>
                </ul>
              </article>
              <article className="rounded-xl border-2 border-brand-600 bg-white p-5 shadow-md">
                <h3 className="font-semibold text-brand-700">组长 Pro</h3>
                <p className="mt-2 text-2xl font-bold">¥19.9<span className="text-sm font-normal text-slate-500"> / 学期</span></p>
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  <li>3 门课不限次纪要</li><li>含 10 小时录音转写</li><li>风险提醒 + 会前简报</li>
                </ul>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="font-semibold">课程版（B 端）</h3>
                <p className="mt-2 text-2xl font-bold">¥5<span className="text-sm font-normal text-slate-500"> / 学生 / 学期</span></p>
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  <li>老师看各组贡献度看板</li><li>过程性评价证据</li><li>解决搭便车与互评不公</li>
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