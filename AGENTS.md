# AGENTS.md — 小组作业协作纪要工具（组长减负 Demo）

## 产品一句话
帮组长把会上说的话，变成「确认过的决定」「有人负责跟进的任务」和「下次会接着推进的记录」（v2 定位，详见 docs/product-v2.md）。

## 核心用户
- 组长林晓：3 门课小组作业并行（市场营销学 / 数据库原理 / 创新创业实践），付费决策人
- 组员：阿杰、小雨、浩然、思琪 —— 在「任务与回顾」一键更新（做完了 / 写进度 / 卡住了 / 申请延期 / 认领）
- 老师 / 机构：团体购入版（按人数阶梯），看各组过程数据（规划中）

## 硬性规则
1. AI 只用于：语音→文字（ASR）、转写→结构化纪要、待办抽取、RAG 问答、会前简报、embedding 重复检测（含会中「这事定过了」）
   - 判断标准：这一步需要「理解语言或声音」才用 AI；开录 / 静音暂停 / 自动结束、认领、延期审批、待我处理、带到下次会都是规则
2. 任务 CRUD、任务流转（lib/task-flow.ts）、DDL 计算、提醒调度、风险灯、权限、统计、回顾汇总（lib/review.ts）—— 一律确定性代码，禁止调用 LLM
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
- `lib/task-flow.ts` 任务流转规则（纯函数）· `lib/task-updates.ts` 动态落库 · `lib/review.ts` 待我处理 / 回顾 · `lib/live/` 会议室（VAD、WAV、ASR 请求、会中查重）
- `seed/` 种子会议与 mock 输出 · `eval/golden.json` 评估集
- `docs/` PRD、architecture、flows、why-this-combo、cost-model、product-v2、real-run-report、dingtalk-integration、research/
- `TASKS.md` 里程碑与进度（每个里程碑结束更新）

## 术语表
- 决议 decision：小组达成一致的结论 · 待办 action：有负责人与 DDL 的任务 · 待定 open_question：下次要讨论的问题
- superseded：被新决议推翻的旧决议 · 风险灯：🔴/🟡/🟢，规则见 lib/risk.ts
- DEMO_NOW：演示用虚拟当前时间（「时间快进」修改它）
- 任务动态 task_updates：认领 / 进度 / 卡住 / 延期申请 / 确认 / 打回，全部留痕 · 带到下次会 carry：卡住、过期、延期申请、没人认领、48h 没动静、待确认、待定

## 写作约定
- UI 与文档用中文、口语化；代码标识符与注释用英文
- 改动前先读 docs/PRD.md；新增功能必须能对应到痛点 P1–P4 之一，否则不做
