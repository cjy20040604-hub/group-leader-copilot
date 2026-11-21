# TASKS.md — 里程碑与进度

> 每个里程碑结束：跑 `npm run lint && npm run typecheck && npm test`，按验收逐条自测后勾选。
> 全部里程碑已完成（2026-11-19）。
> 2026-11-20 复核后修正：原评估集的答案来自手写的 `answers.json`（问哪题答哪题），且问答按关键词匹配、不分课程（在数据库课问 PPT 会答出营销课的结论）；种子还写入了按假设值伪造的问答/简报计量。已改为：问答走证据闸门 + 抽取式模板、评估扩到 23 题、计量按真实 prompt 估算、非示例转写走规则抽取。
> 同日第二轮：议程查重/冲突检测改为「向量 + 关键词」并由组长勾选推翻、原文分块进检索、DDL 以规则为准、人名猜测标黄、风险灯红灯优先、提醒按触发日生成、任务可增删改 DDL、真实模式 embedding 分批与 JSON 输出、重置不再 shell 调 npm。
> 当前门禁（2026-11-21）：lint · typecheck · 94/94 单测 · eval 同下。
> 当时门禁（2026-11-20）：lint · typecheck · 46/46 单测 · eval Hit@8 14/14、答对率 13/14（「幻灯片」同义词被证据闸门拒答，宁可拒答不答错）、拒答正确率 9/9、串台 0。

## M0 Spec
- [x] docs/PRD.md（问题/目标/非目标/用户故事/验收标准/指标）
- [x] docs/architecture.md（能力地图 + schema + AI 边界）
- [x] TASKS.md
- 验收：文档覆盖 P1–P4 与 §2 边界表 ✅

## M1 脚手架 + 数据
- [x] Next.js + TS + Tailwind 脚手架，components/ui 基础组件
- [x] Drizzle schema + seed/init.sql + lib/db
- [x] 种子：3 门课、5 成员、6 场历史会议（中文口语转写 1200–1800 字）、埋入剧情（PPT superseded / ER 图风险 / 路演分歧）
- [x] seed/new_meeting.txt + seed/mock_responses/*
- [x] 身份切换（组长/组员）
- 验收：能看到 3 门课与历史纪要 ✅（浏览器实测 /app：市场营销学/数据库原理/创新创业实践，浩然 ER 图 🟡；组员视图只见本人任务）

## M2 会议流水线
- [x] 9 步流水线 API + 步骤条 UI（耗时/token）
- [x] zod 校验 + 人名模糊匹配 + 日期换算 + 低置信度标黄
- [x] 确认面板 → 落库（superseded_by）→ 建索引 → 群消息一键复制
- 验收：粘贴 new_meeting.txt → 确认 → 任务上看板，≤ 3 次点击 ✅（实测 3 次点击：粘贴示例→开始处理→确认并落库；「那个谁」→待认领+低置信度标黄；群消息含决议/待办@负责人/下次会议）

## M3 RAG
- [x] mock/真实 embedding + MiniSearch + RRF + 时间加权
- [x] 问答带 [日期·类型] 引用卡片（跳转高亮 evidence）+ 证据闸门拒答（写明原因）+ 加入议程按钮
- [x] 议程重复检测（≥0.80，不调 LLM）
- [x] 会前简报（LLM/模板降级）
- [x] eval/golden.json 10 条 + npm run eval
- 验收：PPT 风格问答正确带出处 ✅（答「学校模板 [11/12·决议]」并说明蓝白→学校模板变更，引用卡片跳转纪要高亮原话；拒答「记录里没找到」+加入议程可用；议程「PPT 用什么风格」命中 98% 相似度提示）；Hit@8 ≥ 90% ✅（2026-11-20 起评估集为 23 题，见顶部说明）

## M4 任务/风险/提醒
- [x] 看板拖拽改状态 + last_update_at + 进度一句话
- [x] lib/risk.ts + risk.test.ts
- [x] 提醒扫描（D-3/D-1/过期）+ 催办模板 + 站内通知
- [x] 时间快进 +1/+3/重置（DEMO_NOW）
- 验收：快进 3 天浩然任务变红 + 催办草稿 ✅（11/19→11/22，ER 图 🔴 已过期 1 天，新增 6 条提醒含 D-1/过期催办）；单测通过 ✅（当时 15 例；现 27 例，含证据闸门与规则抽取）

## M5 成本 + 落地页
- [x] config/pricing.ts + usage_log 全量计量
- [x] /app/cost：单次会议/问答成本 + 学期推算
- [x] 落地页：价值主张/痛点→功能/定价/FAQ + FAQPage & SoftwareApplication JSON-LD + /llms.txt + /sitemap.xml
- 验收：成本看板有数 ✅（实测均值 + 标准推算 + 最近调用明细）；落地页语义化 ✅（main/section/article/header/footer + aria-label；JSON-LD 5 问 5 答 + 3 档 Offer；llms.txt 200；sitemap.xml 正常）；Lighthouse 可访问性实测 **95 ≥ 90** ✅（lighthouse@12 headless Chrome，2026-11-19，唯一未满分项 color-contrast）

## M6 文档 + 验收
- [x] docs/why-this-combo.md（150–200 字一段）
- [x] docs/cost-model.md（实测数据回填 + 定价 + 谁付钱 + 待验证假设）
- [x] docs/pitch-3min.md（按秒分段）
- [x] docs/flows.md + docs/research/interview-targets.md
- [x] README（一键启动 / Mock 说明 / 演示脚本）
- [x] lint + typecheck + test 全绿；浏览器实测三条演示路径
- 验收：新机器 `npm i && npm run seed && npm run dev` 5 分钟跑通 ✅（README 含步骤与 macOS 沙箱终端注意事项；生产模式 `npm run build && npm start` 已全流程实测）
## M7 轻量通用化（2026-11-20，用户确认后追加）
- [x] 自建课程/小组：POST /api/courses（组长权限、同名/超长校验、确定性 CRUD 不调 LLM）+ 设置页 CourseManager
- [x] 新课程全链路可用：新建会议下拉 / 课程页 / 问答选课 / 首页总览自动收录；记忆从零开始，拒答规则不变
- [x] AI 默认会议标题：lib/title.ts deriveTitle（议题拼标题，≤30 字）+ Draft.titleSource；确认面板标题可改、AI 来源标「AI 生成 · 待确认」；无议题回退模板标题
- [x] lib/title.test.ts 4 例并入 npm test（共 50 例）
- [x] 花名册可编辑：POST/PATCH /api/members（组长权限；加人、改名、改别名、组长/组员重分配；同名/超长校验；至少保留一名组长护栏）
- [x] 改名同步：任务记忆条目文本 + embedding 重建 + 催办文案负责人名字（lib/roster.ts parseAliases + 2 例单测，共 52 例）
- [x] 设置页 RosterManager 行内编辑 + 添加成员表单；组员只读
- [x] docs/flows.md 同步（§4 输入/确认、§6 选课、§8 设置与组员差异）
- 验收：lint / typecheck / test（52 例）/ eval（Hit@8 100%、拒答 100%、串台 0）全绿 ✅；浏览器实测：设置页新建「摄影社」+ 同名报错 ✅ → 新课程跑示例转写流水线，确认面板 AI 标题「问卷回收进度、样本量目标」带「AI 生成 · 待确认」✅ → 落库后新课程看板 3 任务含 🔴/🟡 风险灯 ✅ → 新课问答无关问题正确拒答 ✅；花名册添加「小陆」✅ → 最后一名组长降级被护栏阻止 ✅ → 阿杰改名李杰后看板同步 ✅ → 浩然改名后催办文案同步 ✅ → 思琪提组长、林晓降组员再恢复全链路 ✅ → 重置后全部测试改动清除、种子恢复 ✅

## M8 v2：会议室 + 任务与回顾（2026-11-21）
- [x] 定位与需求分析、AI 环节判断：`docs/product-v2.md`（需求为假设 · 待验证）
- [x] 会议室 `/app/meeting/live`：自动开录、实时转写（Mock 演示录音 / 真实 VAD 切段 + 百炼 Qwen-ASR）、会中「这事定过了」、上次遗留、自动结束 → 自动整理
- [x] 任务与回顾 `/app/tasks`：组员一键更新（做完了 / 进度 / 卡住 / 延期 / 认领），组长待我处理 + 组员动态 + 回顾与带到下次会
- [x] 数据：`tasks.blocker`、`task_updates` 表（老库启动时就地升级）；种子加思琪「卡住 + 申请延期」
- [x] 风险灯：卡住至少黄、3 天内到期且卡住为红；会前简报加「上次会后进展」
- [x] 验证：lint、typecheck、82 例单测、build、浏览器走通（演示录音 → 会中提醒 → 自动结束 → 纪要确认 → 计量挂在同一场会；组员权限、认领、提交、延期审批）
- [ ] 待办：真实 ASR 联调（需要 Key）；qwen3-asr-flash 单价核对；成本模型把会议室转写算进去（交给 Qoder 做）
- [x] 麦克风授权：页面内同意框 → 浏览器授权；拒绝 / 没设备 / 被占用 / 非 https 的修复引导；Mock 模式可真录音（回放、下载 WAV，不转文字）（2026-11-21）
- [x] 钉钉会议转写导入：视频会议云录制（闪记）getTexts 接入 + 演示数据 + 本地模拟服务验证；调研对比 `docs/dingtalk-integration.md`（2026-11-21）
- [ ] 待办：真实钉钉应用联调；实时事件 meeting_asr_result_event（需常驻 Stream 进程）；独立 AI 听记等官方开放 REST 接口
- [x] 新建课程入口：首页「我的课程」末尾「＋ 新建课程」卡片；纪要页、会议室的课程下拉加「＋ 新建课程…」，建好自动选中（只有组长可见）（2026-11-21）
