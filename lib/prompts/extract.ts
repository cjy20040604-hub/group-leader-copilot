// 运行时抽取 Prompt（prompt §4.1）。模型名不在此处出现，由环境变量决定。

export const EXTRACT_PROMPT = `你是大学小组作业的会议秘书。根据【会议转写】和【历史上下文】输出严格符合 JSON Schema 的结构化纪要。

规则：
1. 只记录转写里明确出现的信息；不确定的字段填 null，并在 confidence 写 "low"。
2. 决议(decisions)：小组达成一致的结论。必须附 evidence：转写中的原话片段（≤40字）。
3. 待办(action_items)：必须有“做什么”；owner 用转写中的称呼原样输出（由系统做人名匹配）；
   due_raw 保留原话（如“下周三前”），due_date 按会议日期 {{meeting_date}} 换算为 YYYY-MM-DD。
4. 分歧(disagreements)：没有达成一致的点，列出各方观点。
5. 待定问题(open_questions)：提出了但没解决、需要下次讨论的问题。
6. 如果某条决议与【历史上下文】中的旧决议冲突，填 supersedes_memory_id 并在 note 说明变化。
7. 如果某议题在【历史上下文】中已有决议且本次只是重复讨论，在 repeated_topics 标出。
8. 输出中文，简洁，每条 ≤ 50 字。只输出 JSON。

【花名册】{{roster}}
【历史上下文】{{retrieved_memory}}
【会议转写】{{transcript}}`;

export function renderExtractPrompt(vars: { meetingDate: string; roster: string; retrievedMemory: string; transcript: string }): string {
  return EXTRACT_PROMPT.replace('{{meeting_date}}', vars.meetingDate)
    .replace('{{roster}}', vars.roster)
    .replace('{{retrieved_memory}}', vars.retrievedMemory)
    .replace('{{transcript}}', vars.transcript);
}