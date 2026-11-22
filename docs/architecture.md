# Architecture：组长减负 Demo

## 能力地图（Capability Map）

| 模块 id | 职责 | 依赖 |
|---|---|---|
| db-seed | SQLite schema、种子数据、DEMO_NOW | — |
| llm-gateway | OpenAI 兼容调用 / MOCK_LLM、usage_log 计量 | db-seed |
| pipeline | 9 步会议流水线（预处理→召回→抽取→校验→确认→落库→索引→分发） | llm-gateway, rag |
| rag | mock/真实 embedding、MiniSearch BM25、RRF、问答、拒答、重复检测、简报 | llm-gateway, db-seed |
| tasks-risk | 任务 CRUD、风险灯、提醒扫描、催办模板、时间快进 | db-seed |
| tasks-flow（v2） | 组员认领/提交/进度/卡住/申请延期，组长确认/打回/批延期（`lib/task-flow.ts` 纯函数）；动态留痕 `task_updates`（`lib/task-updates.ts`）；待我处理 / 回顾 / 带到下次会（`lib/review.ts`） | db-seed, tasks-risk |
| live（v2） | 会议室：自动开录、VAD 切段、WAV 编码（`lib/live/audio.ts`）、百炼 ASR 请求（`lib/live/asr-request.ts`）、会中「这事定过了」（`lib/live/cues.ts` + `findSameTopicDecisions`） | llm-gateway, rag |
| ui | 12 个页面路由、身份切换、成本看板、成功指标、落地页 | 全部 |

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
- `tasks(id, course_id, meeting_id, title, owner_id, due_date, status, last_update_at, progress_note, blocker, created_at)`
  - status: `unclaimed → in_progress → awaiting_review → done`；owner_id 为 NULL = 待认领；blocker 非空 = 组员标了「卡住了」
  - 组员只能把自己的任务改成「进行中 / 待审核」，「已完成」由组长确认；组长自己的任务提交即完成
- `task_updates(id, task_id, course_id, actor_id, kind, from_status, to_status, note, proposed_due, resolved, created_at)` — v2
  - kind: `created | claim | status | submit | progress | blocked | unblocked | extension_request | extension_approved | extension_rejected | review_pass | review_return`
  - 延期申请 resolved=0 表示等组长回复；批准后改 DDL 并重建提醒
  - 老库由 `lib/db/client.ts` 启动时就地升级（加列、建表，不删数据）
- `scheduled_meetings(id, course_id, date, created_at)` — 首页「会议安排」：组长新建 / 删除（`/api/schedule`），确认纪要时按 next_meeting 自动加
- `reminders(id, task_id, kind, fire_date, message, created_at)` — kind: `d3 | d1 | overdue`；按 (task_id, kind) 幂等
- `usage_log(id, ts, model, input_tokens, output_tokens, audio_seconds, cost_cny, feature, meeting_id)`
- `settings(key, value)` — `demo_now`（默认 `2026-11-19T09:00:00`）、`current_user`、`auto_record`（会议室自动开录开关）、`live_draft`（会议室结束后待整理的转写，整理后清除）

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

## 会议室（v2，`/app/meeting/live`）

- 开录：进页面 3 秒倒计时自动开录（`settings.auto_record`，可关），倒计时期间显示录音告知；Mock 下非演示课程不自动开。
- 麦克风授权（`lib/live/mic-permission.ts` + 会议室同意框）：`navigator.permissions.query({name:'microphone'})` 读当前状态并监听变化；没授权时绝不调用 `getUserMedia`，先弹页面内同意框（用途 / 录什么 / 存到哪里 / 随时可停），组长点「允许使用麦克风」后才触发浏览器授权框。自动开录倒计时中发现麦克风没授权，会停下倒计时改弹同意框。拒绝（NotAllowedError）、没设备（NotFoundError）、被占用（NotReadableError）、非安全上下文分别给出浏览器 / macOS 的修复步骤；录到一半设备断开会暂停并提示。
- Mock 模式麦克风：真实录音 + VAD 切段，但不调语音模型；每段可回放，结束后把有人说话的部分拼成 WAV 供回放 / 下载（页面内最多保留 30 分钟），不进纪要流水线。
- 真实模式（有 Key + `ASR_MODEL`）：浏览器 `getUserMedia` → ScriptProcessor → 降采样 16 kHz → `VadSegmenter`（RMS 阈值 0.015、静音 800 ms 判一句说完、单段 ≤ 20 s、开口前留 200 ms、短于 300 ms 丢弃）→ WAV Base64 → `POST /api/asr/live` → `transcribeSegment()`（百炼 OpenAI 兼容接口，`input_audio` Data URL，system 消息放课程名 + 花名册做识别上下文，`asr_options.enable_itn=true`）→ usage_log(feature=asr, meeting_id=会话 id)。2026-11-21 真实接口联调通过（见 `docs/real-run-report.md`）。
- Mock：「演示录音」按 `seed/new_meeting.txt` 逐句打字式播放，结束时 `POST /api/live/finish` 按会议时长记一条 ASR 估算。
- 会中查重：每句话先用规则挑出「在提议 / 翻旧账」的半句（要不要、换回、改成…），再 `POST /api/live/check` → `findSameTopicDecisions`（embedding + 关键词规则，不调大模型）。
- 自动结束：演示放完 5 秒、真实模式连续静音 2 分钟后 30 秒倒计时（可取消）。
- 结束 → `live_draft` → `/app/meeting/new?from=live` 自动跑流水线，meetingId 沿用会话 id（`m-live-…`），ASR / 查重 / 抽取的计量挂在同一场会上。

## 三门课并行、提醒闭环、成功指标、单位经济（确定性代码）

- `lib/multi-course.ts`：`loadAgenda` 汇总未来 7 天各课程的 DDL 和已安排的会（含已过期）；`memberLoads` / `assessLoad` 判定组员负载（≥ 3 件太满；≥ 2 件且跨 ≥ 2 门课为跨课撞车）。首页只在撞车时用 `components/week-board.tsx` 的 `MemberLoadPanel` 展示。
- 提醒闭环：`reminders.responded_at / response`；`/r/[id]` 回复页（`components/reminder-reply.tsx`）→ `POST /api/reminders/reply` 以负责人身份调 `recordTaskAction`，再标记提醒已回复。组长复制提醒时附 `/r/{id}` 链接（`components/reminder-card.tsx`）。
- `lib/metrics.ts`：`replyRate`、`selfUpdateShare`、`onTimeRate` 纯函数 + `loadMetrics`；`metric_events` 表记录「重复讨论被拦下」（议程查重、会中查重命中时写，同一会 / 同一议程去重）。页面 `/app/metrics`。
- `lib/unit-economics.ts`：每组变动成本、免费用户成本、边际贡献、盈亏平衡、规模毛利和敏感度表；成本看板的表和计算器（`components/unit-econ-calculator.tsx`）共用这一份代码。

## 钉钉会议转写导入（`lib/dingtalk/`）

- `POST /api/dingtalk/import {conferenceId, unionId?}` → `fetchCloudTexts()`（`POST /v1.0/oauth2/accessToken` 取企业内部应用 token 并缓存；`GET /v1.0/conference/videoConferences/{conferenceId}/cloudRecords/getTexts` 正序翻页，`nextToken` / `nextTtoken` 都认）→ `paragraphsToTranscript()`（排序、5 分钟时间戳、昵称按花名册映射）→ 填进纪要页输入框。
- 没配 `DINGTALK_APP_KEY` / `DINGTALK_APP_SECRET`：演示数据（演示录音按官方响应字段包装）。`DINGTALK_API_BASE` 只给本地模拟服务测试用。
- 不调模型，不写 usage_log。实时事件 `meeting_asr_result_event` 需要常驻 Stream 进程，未做（见 `docs/dingtalk-integration.md`）。

## 任务与回顾（v2，`/app/tasks`，确定性代码）

- 组员视图：我的待办（按风险排序）+ 一键操作（`POST /api/tasks/action`）+ 没人认领的任务（可认领）+ 我的任务动态。
- 组长视图：待我处理 = 等确认完成 / 延期申请 / 卡住了 / 48 小时没动静 / 没人认领；组员动态；每门课「上次会到现在」（完成 / 进行中 / 卡住 / 待确认）与「带到下次会」。
- 带到下次会：卡住、过期、延期申请、没人认领、没动静、待确认、待定问题；卡住和延期各列一条，其余同一任务只列最急的。
- 会前简报的素材加了「上次会后进展」（完成了什么、卡在哪、谁申请延期）。

## 任务与提醒（确定性代码）

- 风险灯 `lib/risk.ts`：🔴 过期未完成 或 d≤1 且状态∉{待审核,已完成} 或 卡住且 d≤3（红灯规则先判，待认领的任务过期也是红）；🟡 待认领 或 卡住 或 d≤3 且 48h 未更新；🟢 其他。所有计算基于 `DEMO_NOW`（settings.demo_now）。
- 任务 CRUD：`/api/tasks` POST / PATCH / DELETE，新建、改内容/DDL/负责人、删除只有组长能做；改 DDL 会删掉旧提醒按新日期重建。
- 提醒扫描：POST /api/reminders/scan（页面每 60s 轮询代替服务端定时任务 + 时间快进/确认纪要/改任务后立即触发），D-3 / D-1 / 过期第一天各一条，文案按触发那天写；任务创建之前的触发日不补。页面只显示未完成任务的提醒，组员只看自己的。模板：「@{owner} {course} 的「{task}」{due_text}截止，目前状态：{status}，需要帮忙吗？」
- 时间快进：/app/settings「+1 天 / +3 天 / 重置」改 demo_now。

## 页面

`/`（落地页，语义化 + FAQPage/SoftwareApplication JSON-LD + llms.txt + sitemap）· `/app`（本周我要盯的事 top5 + 待我处理入口）· `/app/tasks`（任务与回顾）· `/app/meeting/live`（会议室）· `/app/c/[courseId]`（纪要/看板拖拽/问问上次 Tab）· `/app/meeting/new`（流水线）· `/app/meeting/[id]`（evidence 高亮）· `/app/ask`（先选课程）· `/app/cost` · `/app/settings`。

身份切换：顶部下拉（组长/组员），组员只见自己的任务、可改状态填进度；无账号体系，存 settings.current_user。

## 测试策略

node:test（`tsx --test` 运行，Node 22+ 内置，无额外依赖），共 108 例：风险灯（含卡住）、日期换算、人名匹配、规则抽取、RRF、证据闸门关键词、同一件事判断、任务流转（`lib/task-flow.test.ts`）、VAD/WAV/降采样（`lib/live/audio.test.ts`）、会中挑句与演示稿解析（`lib/live/cues.test.ts`）、ASR 请求体（`lib/live/asr-request.test.ts`）、麦克风出错引导（`lib/live/mic-permission.test.ts`）、钉钉转写转换（`lib/dingtalk/cloud-texts.test.ts`）、钉钉 client 对本地模拟服务（`lib/dingtalk/client.test.ts`）、单位经济（`lib/unit-economics.test.ts`）、组员跨课负载（`lib/multi-course.test.ts`）、成功指标（`lib/metrics.test.ts`）。eval 脚本独立跑检索指标。每个里程碑结束跑 lint + typecheck + test。

## 边界

- Always：AI 产出标「AI 生成 · 待确认」；course_id 硬过滤；usage_log 全量计量；模型名走环境变量。
- Ask first：改 schema、加依赖、改定价表。
- Never：硬编码模型名；LLM 参与任务 CRUD/DDL/提醒/风险灯；无证据编造答案；提交真实 Key。