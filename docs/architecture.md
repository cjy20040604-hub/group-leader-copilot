# Architecture：组长减负 Demo

## 能力地图（Capability Map）

| 模块 id | 职责 | 依赖 |
|---|---|---|
| db-seed | SQLite schema、种子数据、DEMO_NOW | — |
| llm-gateway | OpenAI 兼容调用 / MOCK_LLM、usage_log 计量 | db-seed |
| pipeline | 9 步会议流水线（预处理→召回→抽取→校验→确认→落库→索引→分发） | llm-gateway, rag |
| rag | mock/真实 embedding、MiniSearch BM25、RRF、问答、拒答、重复检测、简报 | llm-gateway, db-seed |
| tasks-risk | 任务 CRUD、风险灯、提醒扫描、催办模板、时间快进 | db-seed |
| ui | 8 个路由页面、身份切换、成本看板、落地页 | 全部 |

构建顺序：db-seed → llm-gateway → rag / tasks-risk → pipeline → ui。

## 技术栈

Next.js 16 App Router + TypeScript + Tailwind（shadcn 风格组件，`components/ui/`）· better-sqlite3 + Drizzle ORM（`data/demo.db` 单文件）· openai SDK → 百炼 compatible-mode · MiniSearch(BM25) + Float32 BLOB 向量 → RRF · zod 校验 · node:test 单测（tsx 运行）· tsx 跑 seed/eval。

## 命令

```bash
npm run dev        # 启动（默认 MOCK_LLM=true，无需 Key）
npm run seed       # 重置并生成种子数据
npm run eval       # RAG 评估：Hit@8 / 答对率 / 引用准确率 / 拒答正确率 / 串台数
npm test           # node:test via tsx（risk.test.ts / rrf.test.ts）
npm run lint       # eslint（eslint-config-next flat config）
npm run typecheck  # tsc --noEmit
```

## 数据库 Schema（lib/db/schema.ts，DDL 见 seed/init.sql）

- `courses(id, name, color)` — id: `mkt` / `db` / `startup`
- `members(id, name, role, aliases_json)` — id: `linxiao`(组长) / `ajie` / `xiaoyu` / `haoran` / `siqi`；aliases 用于人名模糊匹配（如 "浩然"/"然哥"）
- `meetings(id, course_id, date, title, transcript, processed, created_at)`
- `memory_items(id, course_id, meeting_id, meeting_date, type, text, evidence, status, superseded_by, embedding)`
  - type: `decision | action | open_question | topic_summary`；status: `active | superseded | done`
  - id 约定：`{meeting_id}-d1/-a1/-q1/-t1`；embedding 为 Float32Array(1024) BLOB
- `transcript_chunks(id, meeting_id, course_id, start_offset, text, embedding)` — 按说话人轮次聚合 ≈400 tokens/块，重叠 50
- `tasks(id, course_id, meeting_id, title, owner_id, due_date, status, last_update_at, progress_note, created_at)`
  - status: `unclaimed → in_progress → awaiting_review → done`；owner_id 为 NULL = 待认领
- `reminders(id, task_id, kind, fire_date, message, created_at)` — kind: `d3 | d1 | overdue`；按 (task_id, kind) 幂等
- `usage_log(id, ts, model, input_tokens, output_tokens, audio_seconds, cost_cny, feature, meeting_id)`
- `settings(key, value)` — `demo_now`（默认 `2026-11-19T09:00:00`）、`current_user`

## LLM 网关（lib/llm.ts）

- `MOCK_LLM=true` 或无 `DASHSCOPE_API_KEY` → Mock 模式：
  - 抽取：转写与种子转写高度重合 → 读 `seed/mock_responses/` 预置输出；否则走 `lib/rule-extract.ts` 规则抽取
  - 问答：不读预置答案。`lib/rag/answer.ts` 先过证据闸门（`lib/rag/terms.ts`：问题关键词权重过半在本课程记录里没出现过 → 拒答，两种模式共用）；Mock 再在本课程检索结果里挑关键词覆盖 ≥ 50% 的条目做抽取式模板，对不上也拒答
  - embedding：确定性 mock 向量（概念词袋 0.7 + 字符 bigram 哈希 0.3，1024 维归一化），语义近邻可离线复现
  - Mock 调用同样写 usage_log（按字数估算 tokens，UI 标「Demo 模拟」）
- 真实模式：模型名只从环境变量读（`LLM_MODEL_EXTRACT` / `LLM_MODEL_CHAT` / `EMBEDDING_MODEL`）；抽取要求 `response_format: json_object`，对话类调用显式 `enable_thinking: false`；embedding 每批最多 10 条。zod 解析失败重试 1 次，再失败降级为规则抽取 + 组长手动补。问答的出处只保留答案里真的标注了的条目，并且只能来自本课程。
- 单价表 `config/pricing.ts`（元/百万 tokens；ASR 元/秒）。

## 会议流水线（§4，API：POST /api/meetings/process → 草稿；POST /api/meetings/confirm → 落库）

1 输入（粘贴/音频 Demo 模拟 + 课程 + 日期 + 参会人）→ 2 预处理（清洗口头禅/时间戳、按说话人切分、>12k tokens 分段）→ 3 RAG 召回 top8 上下文 → 4 LLM 结构化抽取（zod）→ 5 代码校验（DDL 以 `lib/dates.ts` 规则换算为准，和模型给的日期不一致就标「日期存疑」；人名匹配花名册，「包含/差一个字」的猜测标黄，同时像两个人就不猜；「我来」按原话所在行的说话人记）→ 5b 冲突检测（新决议 × 本课程现行决议，见下文「同一件事」；模型给的 supersedes id 必须存在、同课程、是现行决议，否则忽略）→ 6 人工确认 UI（决议/待办/待定可增删改，可能推翻的旧决议由组长勾选）→ 7 落库（单个事务；superseded_by 链）→ 8 建索引（memory + chunks embedding）→ 9 分发（群消息文本，推翻的写明「改掉了 X 定的…」；提醒规则挂载）。抽取用清洗后的转写；步骤条的 token 是这一步实际（Mock 为估算）用量。

## RAG（lib/rag/）

- 硬过滤 course_id，默认排除 superseded（回答历史变化时显式取 superseded 链）。
- 向量 top20 + MiniSearch BM25 top20 → RRF(k=60) → top8；时间加权（同主题新决议优先）。
- 两层：L1 记忆条目 + L2 原文分块，各自向量 + BM25 → RRF；L1 取 top8 作结论，L2 取 top3 作兜底证据（真实模式一起给模型，可引用 [日期·原文]；Mock 在纪要条目对不上时，引用「相邻两句包含全部关键词」的那句原话）。
- 拒答：最高相似度 < 0.35 且关键词无命中；或证据闸门（问题关键词过半在本课程记忆条目里没出现过）→ 「记录里没找到」+ 原因 +「加入下次议程」按钮。
- 「同一件事」判断（`lib/rag/match.ts`，议程查重和冲突检测共用，不调 LLM）：真实模式 = text-embedding-v4 余弦 ≥ 0.8；Mock = 余弦 ≥ 0.5 且关键词全部对得上（原词，或同一概念组里的另一个词，如「风格≈模板」「PostgreSQL≈MySQL」，至少一个原词）。Mock 向量 85% 权重在 12 组概念上、同组话题一律 98% 相似，所以必须加这层。
- 简报：上次决议 + 未完成待办(按 DDL) + 待定问题 → qwen-plus ≤200 字；Mock 降级模板拼接。
- 评估：`eval/golden.json` 23 条（14 能答 + 9 应拒答，含跨课程与关键词沾边）；`eval/run.ts` 输出 Hit@8 / 答对率 / 引用准确率 / 拒答正确率 / 串台数。

## 任务与提醒（确定性代码）

- 风险灯 `lib/risk.ts`：🔴 过期未完成 或 d≤1 且状态∉{待审核,已完成}（红灯规则先判，待认领的任务过期也是红）；🟡 待认领 或 d≤3 且 48h 未更新；🟢 其他。所有计算基于 `DEMO_NOW`（settings.demo_now）。
- 任务 CRUD：`/api/tasks` POST / PATCH / DELETE，新建、改内容/DDL/负责人、删除只有组长能做；改 DDL 会删掉旧提醒按新日期重建。
- 提醒扫描：POST /api/reminders/scan（页面每 60s 轮询代替服务端定时任务 + 时间快进/确认纪要/改任务后立即触发），D-3 / D-1 / 过期第一天各一条，文案按触发那天写；任务创建之前的触发日不补。页面只显示未完成任务的提醒，组员只看自己的。模板：「@{owner} {course} 的「{task}」{due_text}截止，目前状态：{status}，需要帮忙吗？」
- 时间快进：/app/settings「+1 天 / +3 天 / 重置」改 demo_now。

## 页面

`/`（落地页，语义化 + FAQPage/SoftwareApplication JSON-LD + llms.txt + sitemap）· `/app`（本周我要盯的事 top5）· `/app/c/[courseId]`（纪要/看板拖拽/问问上次 Tab）· `/app/meeting/new`（流水线）· `/app/meeting/[id]`（evidence 高亮）· `/app/ask`（先选课程）· `/app/cost` · `/app/settings`。

身份切换：顶部下拉（组长/组员），组员只见自己的任务、可改状态填进度；无账号体系，存 settings.current_user。

## 测试策略

node:test（`tsx --test` 运行，Node 22+ 内置，无额外依赖）：`lib/risk.test.ts`（红黄绿全分支 + 催办模板）、`lib/rag/rrf.test.ts`（RRF 融合）。eval 脚本独立跑检索指标。每个里程碑结束跑 lint + typecheck + test。

## 边界

- Always：AI 产出标「AI 生成 · 待确认」；course_id 硬过滤；usage_log 全量计量；模型名走环境变量。
- Ask first：改 schema、加依赖、改定价表。
- Never：硬编码模型名；LLM 参与任务 CRUD/DDL/提醒/风险灯；无证据编造答案；提交真实 Key。