# AGENTS.md — 小组作业协作纪要工具（组长减负 Demo）

## 产品一句话
把会议转写变成「纪要 + 任务 + 提醒 + 可检索的集体记忆」，让 5 人小组的组长不用再整理纪要、记旧决议、追 DDL。

## 核心用户
- 组长林晓：3 门课小组作业并行（市场营销学 / 数据库原理 / 创新创业实践），付费决策人
- 组员：阿杰、小雨、浩然、思琪 —— 被动使用（收提醒、改状态）
- 老师：B 端课程版，看贡献度看板

## 硬性规则
1. AI 只用于：转写→结构化纪要、待办抽取、RAG 问答、会前简报、embedding 重复检测
2. 任务 CRUD、DDL 计算、提醒调度、风险灯、权限、统计 —— 一律确定性代码，禁止调用 LLM
3. 所有 AI 产出标「AI 生成 · 待确认」，组长确认后才落库（human-in-the-loop）
4. RAG 回答必须带出处 [日期·类型]；无证据时回答“记录里没找到”，不许编造
5. 检索必须按 course_id 硬过滤，默认排除 superseded 决议
6. 每次模型调用写 usage_log（model、tokens、cost_cny、feature）
7. `MOCK_LLM=true` 时全流程可离线演示
8. 模型名只从环境变量读取，不得硬编码

## 技术栈
Next.js App Router + TypeScript + Tailwind + shadcn/ui · SQLite + Drizzle · OpenAI 兼容 SDK → 阿里云百炼
· qwen3.7-plus（抽取）/ qwen-plus（问答、简报）/ text-embedding-v4 · MiniSearch(BM25) + 向量 → RRF

## 常用命令
- `npm run dev` 启动 · `npm run seed` 重置种子数据 · `npm run eval` RAG 评估 · `npm test` 单元测试

## 目录约定
- `lib/prompts/` 运行时 prompt · `lib/rag/` 索引与检索 · `lib/risk.ts` 风险灯规则 · `config/pricing.ts` 单价表
- `seed/` 种子会议与 mock 输出 · `eval/golden.json` 评估集
- `docs/` PRD、architecture、flows、why-this-combo、cost-model、pitch-3min、research/
- `TASKS.md` 里程碑与进度（每个里程碑结束更新）

## 术语表
- 决议 decision：小组达成一致的结论 · 待办 action：有负责人与 DDL 的任务 · 待定 open_question：下次要讨论的问题
- superseded：被新决议推翻的旧决议 · 风险灯：🔴/🟡/🟢，规则见 lib/risk.ts
- DEMO_NOW：演示用虚拟当前时间（「时间快进」修改它）

## 写作约定
- UI 与文档用中文、口语化；代码标识符与注释用英文
- 改动前先读 docs/PRD.md；新增功能必须能对应到痛点 P1–P4 之一，否则不做
