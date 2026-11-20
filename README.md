# 组长减负 · 小组作业协作纪要工具（Demo）

把会议转写变成「纪要 + 任务 + 提醒 + 可检索的集体记忆」，让 5 人小组的组长不用再整理纪要、记旧决议、追 DDL。

需求来源：`qoder-quest-prompt.md` · 规格：`docs/PRD.md` / `docs/architecture.md` · 进度：`TASKS.md`

## 一键启动（约 5 分钟）

```bash
npm i            # 安装依赖（Node ≥ 22，推荐 22/24 LTS）
npm run seed     # 初始化 SQLite：3 门课、5 成员、6 场历史会议 + 剧情数据
npm run dev      # 开发服务器，默认 http://localhost:3000
```

打开 `/` 是产品落地页，`/app` 是 Demo 工作台（身份默认「组长林晓」，右上角可切换组员）。

> **macOS 注意事项**：如果是在 AI agent 的沙箱终端里启动，`npm run dev` 可能显示 Ready 但浏览器打不开（桌面目录的系统权限限制，不是代码问题）。两个办法：① 在系统自带终端里运行 `npm run dev`；② 直接用生产模式 `npm run build && npm start`，效果完全一样。端口被占用时 Next 会自动换到 3001 等空闲端口，看终端输出的实际地址。

## Mock 模式说明（默认，零成本离线）

`.env.local` 默认 `MOCK_LLM=true`：**不需要任何 API Key，全流程可离线演示**，每次「调用」照常写 `usage_log`（按真实会发出的 prompt 字数估算 tokens）。各环节在 Mock 下怎么跑：

- 抽取：粘贴的是示例转写 → 读 `seed/mock_responses/` 里的预置输出；**任何其他转写 → 规则抽取**（「定了/就用」→ 决议，「某人 + 时间」→ 待办，问句/「还没定」→ 待定），确认面板可以增删改补漏
- 问答：**不读任何预置答案**，在本课程检索结果上做抽取式模板；先过确定性证据闸门（问题关键词过半在本课程记录里没出现过 → 「记录里没找到」，两种模式共用）
- 简报：模板拼接；embedding：本地确定性向量

切换真实模型（阿里云百炼，OpenAI 兼容接口）：

```bash
# .env.local
MOCK_LLM=false
DASHSCOPE_API_KEY=你的Key        # 不要提交到版本库
LLM_MODEL_EXTRACT=qwen3.7-plus   # 纪要抽取
LLM_MODEL_CHAT=qwen-plus         # 问答 / 会前简报
EMBEDDING_MODEL=text-embedding-v4
```

模型名只从环境变量读取；单价表在 `config/pricing.ts`（上线前请到百炼控制台核对）。没配 Key 时问答/简报自动降级为模板拼接，页面会标注「Demo 降级」。

## 演示脚本（三条路径，对应 3 分钟讲解稿 docs/pitch-3min.md）

演示前先 `npm run seed` 重置剧情，确认时间显示 2026-11-19。

**路径一：粘贴 → 纪要 → 发群（≤ 3 次点击）**
1. `/app/meeting/new`，点「粘贴示例转写」（内容来自 `seed/new_meeting.txt`），选课程《市场营销学》，点「开始处理」。
2. 看 9 步流水线步骤条（每步耗时/token）；确认面板里每条都标「AI 生成 · 待确认」，「那个谁」的任务会落到待认领并标黄低置信度。决议、待办、待定问题都能改、删、手动添加。换成自己写的转写也能跑（Mock 下走规则抽取，面板顶部会说明）。
3. 点「确认并落库」→「复制群消息」。新任务出现在课程看板。示例会议里有人提议把 PPT 换回蓝白版、被组长否了，所以确认面板只提示「重复讨论」，没有决议被推翻。
4. 顺便在议程框输入「PPT 用什么风格」：提示 11/12 已经定了「PPT 改用学校官方模板」，并写出对上的词（ppt、风格≈模板）；输入「PPT 要不要加动画」则不提示。不调 LLM。
5. 想看「推翻旧决议」：换到《数据库原理》，粘贴一段含「就这么定了，数据库改用 PostgreSQL」的转写 → 确认面板提示「可能和 11/06 定的『数据库用 MySQL 8』是同一件事」，组长勾上才推翻；确认后旧决议划线，问答会说明「之前定的是 MySQL 8，11/19 改的」。

**路径二：问问上次（RAG 带出处）**
1. 课程页「问问上次」问：`我们PPT最后定的什么风格？` → 答「学校模板 [11/12·决议]」并说明蓝白→学校模板的变更，点引用卡片跳转纪要并高亮原话。
2. 问记录里没有的（如 `我们组费预算是多少？`）→ 只答「记录里没找到」并写明为什么没答，可一键「加入下次议程」。在「数据库原理」里问同一句 PPT 问题 → 同样拒答（课程硬过滤 + 证据闸门，不串台）。
3. 点「会前简报」看上次决议/待办/待定汇总。

**路径三：时间快进 → 任务变红 → 一键催办**
1. 首页能看到浩然的「ER 图完整版」🟡（DDL 还有 2 天、4 天没更新）。
2. `/app/settings` 点「时间快进 +3 天」→ 2026-11-22，任务变 🔴 已过期，补出 D-1（「明天截止」，按 11/20 触发那天写）和过期提醒（「已过期 1 天」）和催办文案（模板生成，不调 LLM），复制即可发群。
3. 课程看板里组长可以「+ 新建任务」、改 DDL（提醒按新日期重建）、删除任务。切换身份到「浩然」：组员只看得到自己的任务，可拖拽改状态、填一句进度。「时间重置」恢复初始剧情。

**成本看板**：`/app/cost` 展示每次调用的 model/tokens/费用明细、单次会议与问答成本（Mock 下标「Mock 估算」，配 Key 后为接口返回的实测用量）、学期推算。测算依据与定价见 `docs/cost-model.md`。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build && npm start` | 生产构建 + 启动（沙箱终端里更稳） |
| `npm run seed` | 重置数据库与全部剧情数据 |
| `npm run eval` | RAG 评估（先 `npm run seed`）：23 题 = 14 道能答（含换说法）+ 9 道应拒答（含跨课程、关键词沾边），输出 Hit@8 / 答对率 / 引用准确率 / 拒答正确率 / 串台数 |
| `npm test` | 单元测试（node:test：风险灯、日期换算、人名匹配、规则抽取、RRF、证据闸门关键词、同一件事判断，46 例） |
| `npm run lint` / `npm run typecheck` | ESLint / tsc 检查 |

## 硬性边界（详见 AGENTS.md 与 docs/architecture.md）

- AI 只用于：转写→结构化纪要、待办抽取、RAG 问答、会前简报、embedding 重复检测。
- 任务 CRUD、DDL 计算、提醒调度、风险灯、权限、统计全是确定性代码，不调 LLM。
- AI 产出必须组长确认后才落库；RAG 无证据时只答「记录里没找到」；检索按 course_id 硬过滤、默认排除 superseded。
- 每次模型调用写 `usage_log`；不做登录注册/多租户/真实微信短信（提醒为站内通知，页面标「Demo 模拟」）。

## 目录速览

```
app/            落地页 + /app 工作台 + API 路由
components/     UI 组件（shadcn 风格）与流水线/看板/问答组件
lib/            llm 网关 · pipeline · rag/（索引/检索/RRF）· risk · reminders · db
config/         pricing.ts 单价表
seed/           init.sql · 历史会议转写 · new_meeting.txt · mock_responses/
eval/           golden.json + run.ts
docs/           PRD · architecture · flows · why-this-combo · cost-model · pitch-3min · research/
data/demo.db    SQLite 单文件（npm run seed 重建）
```