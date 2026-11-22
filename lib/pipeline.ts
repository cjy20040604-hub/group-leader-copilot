import { db, schema } from '@/lib/db/client';
import { and, eq } from 'drizzle-orm';
import { chatExtract, type Extraction, type ExtractMode } from '@/lib/llm';
import { searchMemory, findSameTopicDecisions } from '@/lib/rag/search';
import { indexMeeting } from '@/lib/rag/index';
import { estimateTokens } from '@/lib/rag/tokenize';
import { matchOwnerDetailed, speakerOfEvidence, type RosterMember } from '@/lib/roster';
import { parseDueDate, inSemester } from '@/lib/dates';
import { getDemoNow, toLocalISO, formatCN } from '@/lib/time';
import { deriveTitle } from '@/lib/title';
import { scanReminders } from '@/lib/reminders';
import { addScheduled } from '@/lib/schedule';

export interface PipelineStep {
  name: string;
  ms: number;
  tokens?: number;
  detail: string;
  ai: boolean;
}

export interface ValidatedAction {
  task: string;
  ownerRaw: string;
  ownerId: string | null;
  dueRaw: string | null;
  dueDate: string | null;
  confidence: 'high' | 'low';
  evidence: string;
  flags: string[];
  manual?: boolean; // 组长在确认面板手动添加
}

// 新决议可能推翻的旧决议（和 extraction.decisions 一一对应）
export interface DecisionCheck {
  candidate: { memoryId: string; text: string; meetingDate: string; matched: string; source: 'model' | 'rule' } | null;
  note?: string;
}

export interface Draft {
  meetingId: string; // 处理时就分配，抽取/召回的计量都挂在这场会上
  courseId: string;
  date: string;
  title: string;
  titleSource: 'manual' | 'ai' | 'template';
  transcript: string;
  extraction: Extraction;
  actions: ValidatedAction[];
  decisionChecks: DecisionCheck[];
  steps: PipelineStep[];
  degraded: boolean;
  extractMode: ExtractMode;
  contextIds: string[];
}

// 步骤 2：预处理（确定性代码）
export function preprocessTranscript(raw: string): { cleaned: string; turns: number; tokens: number } {
  const cleaned = raw
    .replace(/\[?\d{1,2}:\d{2}(?::\d{2})?\]?/g, '')
    .replace(/^(嗯+|呃+|啊+|哈哈哈+)[，。,.]?\s*$/gm, '')
    .replace(/嗯，|呃，|就是说，|哈哈哈，/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const turns = cleaned.split('\n').filter((l) => /^[^：:]{1,6}[：:]/.test(l)).length;
  return { cleaned, turns, tokens: estimateTokens(cleaned) };
}

// 旧决议 id 只认：存在、同一门课、是决议、还没被推翻（模型或前端给的 id 都要过这一关）
export function validSupersedeTarget(courseId: string, id: string | null | undefined) {
  if (!id) return null;
  return db.select().from(schema.memoryItems)
    .where(and(eq(schema.memoryItems.id, id), eq(schema.memoryItems.courseId, courseId), eq(schema.memoryItems.type, 'decision'), eq(schema.memoryItems.status, 'active')))
    .get() ?? null;
}

// 步骤 5：校验（确定性代码）——日期以规则为准，模型只是参考；人名猜的都标黄
export function validateAction(
  a: Extraction['action_items'][number],
  ctx: { meetingDate: string; roster: RosterMember[]; transcript: string },
): ValidatedAction {
  const flags: string[] = [];
  const nameOf = (id: string) => ctx.roster.find((m) => m.id === id)?.name ?? id;

  // 「我来做」→ 说这句话的人
  let ownerRaw = a.owner_raw;
  if (/^(我|我来|本人)$/.test(ownerRaw.trim())) {
    const speaker = speakerOfEvidence(a.evidence, ctx.transcript);
    if (speaker) { ownerRaw = speaker; flags.push(`「我」按说话人记为 ${speaker}`); }
  }
  const owner = matchOwnerDetailed(ownerRaw, ctx.roster);
  if (owner.how === 'contains' || owner.how === 'fuzzy') flags.push(`人名按「${ownerRaw}」猜的是 ${nameOf(owner.id!)}，请确认`);
  if (owner.how === 'ambiguous') flags.push(`「${ownerRaw}」可能是 ${owner.candidates.map(nameOf).join(' / ')}，请选`);
  if (!owner.id) flags.push('owner 待认领');

  const parsed = parseDueDate(a.due_raw, ctx.meetingDate);
  const modelDate = a.due_date && /^\d{4}-\d{2}-\d{2}$/.test(a.due_date) ? a.due_date : null;
  let dueDate = parsed.date;
  if (parsed.date && modelDate && parsed.date !== modelDate) flags.push(`日期存疑：规则算出 ${parsed.date}，模型给的是 ${modelDate}`);
  if (!parsed.date && modelDate) {
    dueDate = modelDate;
    flags.push('日期是模型换算的（规则没认出原话），请核对');
  }
  if (!dueDate) flags.push('日期待定');
  else if (!inSemester(dueDate, ctx.meetingDate)) flags.push('日期超出学期范围');
  if (a.confidence === 'low') flags.push('低置信度');

  return { task: a.task, ownerRaw: a.owner_raw, ownerId: owner.id, dueRaw: a.due_raw, dueDate, confidence: a.confidence, evidence: a.evidence, flags };
}

export async function processMeeting(input: { courseId: string; date: string; transcript: string; title?: string; meetingId?: string }): Promise<Draft> {
  const steps: PipelineStep[] = [];
  const mark = <T>(name: string, ai: boolean, detail: string, fn: () => T | Promise<T>, tokens?: (r: T) => number): Promise<T> => {
    const t0 = performance.now();
    return Promise.resolve(fn()).then((r) => {
      steps.push({ name, ms: Math.round(performance.now() - t0), tokens: tokens?.(r), detail, ai });
      return r;
    });
  };

  const course = db.select().from(schema.courses).where(eq(schema.courses.id, input.courseId)).get();
  if (!course) throw new Error('课程不存在');
  if (!input.transcript.trim()) throw new Error('转写为空');
  // 会议室来的：沿用会议室的会话 id，实时转写 / 会中查重的计量就挂在这场会上
  const liveId = input.meetingId && /^m-live-\d+$/.test(input.meetingId)
    && !db.select().from(schema.meetings).where(eq(schema.meetings.id, input.meetingId)).get() ? input.meetingId : null;
  const meetingId = liveId ?? `m-${Date.now()}`;

  const pre = await mark('2 预处理 · 代码', false, '清洗口头禅/时间戳，按说话人切分', () => preprocessTranscript(input.transcript), (r) => r.tokens);
  if (pre.tokens > 12000) {
    steps.push({ name: '2b 分段', ms: 0, detail: `超过 12k tokens（${pre.tokens}），演示版按前 12k 字处理`, ai: false });
    pre.cleaned = pre.cleaned.slice(0, 12000);
  }

  const query = pre.cleaned.slice(0, 300);
  const context = await mark('3 召回上下文 · embedding', true, `检索 ${course.name} 最近决议与未完成待办 top 8`, () =>
    searchMemory(input.courseId, query, { limit: 8, meetingId }), () => estimateTokens(query));
  const retrievedMemory = context.results.map((r) => `[${r.id}] [${r.meetingDate}] ${r.text}`).join('\n') || '（无历史记录）';

  const members = db.select().from(schema.members).all();
  const roster: RosterMember[] = members.map((m) => ({ id: m.id, name: m.name, aliases: JSON.parse(m.aliasesJson) }));

  // 抽取用清洗后的转写（截断也在这里生效）
  const { extraction, degraded, mode } = await mark('4 结构化抽取 · LLM', true, '输出议题/决议/待办/分歧/待定/下次会议', () =>
    chatExtract({
      transcript: pre.cleaned,
      retrievedMemory,
      meetingDate: input.date,
      roster: roster.map((m) => `${m.name}（${m.aliases.join('/')}）`).join('、'),
      rosterMembers: roster,
      meetingId,
    }), (r) => r.usage.input + r.usage.output);
  if (degraded) steps.push({ name: '4b 降级', ms: 0, detail: 'JSON 解析重试后仍失败 → 规则抽取兜底 + 组长手动补', ai: false });
  else if (mode === 'rules') steps.push({ name: '4b 规则抽取', ms: 0, detail: '规则抽取（关键词 + 花名册 + 日期）', ai: false });

  const actions = await mark('5 校验 · 代码', false, '日期按规则换算并和模型对账；人名匹配花名册，猜的标黄；低置信度标黄', () =>
    extraction.action_items.map((a) => validateAction(a, { meetingDate: input.date, roster, transcript: input.transcript })));

  // 5b 冲突检测：模型说推翻谁先验真；模型没说的，用向量 + 关键词找「同一件事」的现行决议，交给组长决定
  const decisionChecks = await mark('5b 冲突检测 · embedding', true, '新决议 × 本课程现行决议：同一件事 → 提示可能推翻（不调 LLM）', async () => {
    const checks: DecisionCheck[] = [];
    for (const d of extraction.decisions) {
      const claimed = d.supersedes_memory_id ?? null;
      const target = validSupersedeTarget(input.courseId, claimed);
      if (target) {
        checks.push({ candidate: { memoryId: target.id, text: target.text, meetingDate: target.meetingDate, matched: '模型判断', source: 'model' } });
        continue;
      }
      d.supersedes_memory_id = null;
      const hit = (await findSameTopicDecisions(input.courseId, d.text, { feature: 'conflict_check', meetingId }))[0];
      checks.push({
        candidate: hit ? { memoryId: hit.memoryId, text: hit.text, meetingDate: hit.meetingDate, matched: hit.matched, source: 'rule' } : null,
        note: claimed ? `模型给的旧决议 ${claimed} 不存在或不属于这门课，已忽略` : undefined,
      });
    }
    return checks;
  });

  const derived = input.title?.trim()
    ? { title: input.title.trim(), source: 'manual' as const }
    : deriveTitle(extraction.topics, `${course.name} ${formatCN(input.date)} 组会`);

  return {
    meetingId,
    courseId: input.courseId,
    date: input.date,
    title: derived.title,
    titleSource: derived.source,
    transcript: input.transcript,
    extraction,
    actions,
    decisionChecks,
    steps,
    degraded,
    extractMode: mode,
    contextIds: context.results.map((r) => r.id),
  };
}

// 步骤 7-9：落库 + 建索引 + 分发（组长确认后调用）
export async function confirmMeeting(draft: Draft, edits?: { actions?: ValidatedAction[]; decisions?: Extraction['decisions']; openQuestions?: string[]; title?: string }): Promise<{ meetingId: string; groupMessage: string }> {
  const now = getDemoNow();
  const nowISO = toLocalISO(now);
  const meetingId = draft.meetingId && !db.select().from(schema.meetings).where(eq(schema.meetings.id, draft.meetingId)).get()
    ? draft.meetingId
    : `m-${Date.now()}`;
  // 空白条目（手动添加后没填）不落库
  const actions = (edits?.actions ?? draft.actions).filter((a) => a.task.trim());
  const decisions = (edits?.decisions ?? draft.extraction.decisions).filter((d) => d.text.trim());
  const openQuestions = (edits?.openQuestions ?? draft.extraction.open_questions).filter((q) => q.trim());
  const title = edits?.title ?? draft.title;

  const members = db.select().from(schema.members).all();
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? '待认领';
  const replaced: (string | null)[] = [];

  // 7 落库：一个事务，中途出错全部回滚
  db.transaction((tx) => {
    tx.insert(schema.meetings).values({
      id: meetingId, courseId: draft.courseId, date: draft.date, title,
      transcript: draft.transcript, nextMeeting: draft.extraction.next_meeting, processed: 1, createdAt: nowISO,
    }).run();

    decisions.forEach((d, i) => {
      const id = `${meetingId}-d${i + 1}`;
      tx.insert(schema.memoryItems).values({
        id, courseId: draft.courseId, meetingId, meetingDate: draft.date,
        type: 'decision', text: d.text, evidence: d.evidence, status: 'active',
      }).run();
      const target = validSupersedeTarget(draft.courseId, d.supersedes_memory_id);
      replaced.push(target ? `${formatCN(target.meetingDate)} 定的「${target.text}」` : null);
      if (target) {
        tx.update(schema.memoryItems).set({ status: 'superseded', supersededBy: id }).where(eq(schema.memoryItems.id, target.id)).run();
      }
    });

    actions.forEach((a, i) => {
      const id = `${meetingId}-a${i + 1}`;
      tx.insert(schema.memoryItems).values({
        id, courseId: draft.courseId, meetingId, meetingDate: draft.date,
        type: 'action', text: `${a.task}（${nameOf(a.ownerId)}，${a.dueDate ?? '日期待定'}）`, evidence: a.evidence, status: 'active',
      }).run();
      tx.insert(schema.tasks).values({
        id, courseId: draft.courseId, meetingId, title: a.task, ownerId: a.ownerId,
        dueDate: a.dueDate, status: a.ownerId ? 'in_progress' : 'unclaimed',
        lastUpdateAt: nowISO, createdAt: nowISO,
      }).run();
    });

    openQuestions.forEach((q, i) => {
      tx.insert(schema.memoryItems).values({
        id: `${meetingId}-q${i + 1}`, courseId: draft.courseId, meetingId, meetingDate: draft.date,
        type: 'open_question', text: q, status: 'active',
      }).run();
    });

    // 分歧也进记忆库：「路演谁上台」这种没拍板的事，下次问得到各方意见
    draft.extraction.disagreements.forEach((d, i) => {
      tx.insert(schema.memoryItems).values({
        id: `${meetingId}-g${i + 1}`, courseId: draft.courseId, meetingId, meetingDate: draft.date,
        type: 'disagreement', text: disagreementText(d), status: 'active',
      }).run();
    });

    draft.extraction.topics.forEach((t, i) => {
      tx.insert(schema.memoryItems).values({
        id: `${meetingId}-t${i + 1}`, courseId: draft.courseId, meetingId, meetingDate: draft.date,
        type: 'topic_summary', text: t, status: 'active',
      }).run();
    });
  });

  // 8 建索引（失败不影响已落库的纪要，可重建）；9 挂提醒；纪要里约了下次会就自动排进「会议安排」
  await indexMeeting(meetingId);
  scanReminders();
  const nm = draft.extraction.next_meeting;
  if (nm && nm > draft.date) addScheduled(draft.courseId, nm, nowISO);

  const course = db.select().from(schema.courses).where(eq(schema.courses.id, draft.courseId)).get();
  const groupMessage = buildGroupMessage({
    course: course?.name ?? draft.courseId,
    date: draft.date,
    decisions: decisions.map((d, i) => (replaced[i] ? `${d.text}（改掉了 ${replaced[i]}）` : d.text)),
    actions: actions.map((a) => ({ task: a.task, owner: nameOf(a.ownerId), due: a.dueDate })),
    openQuestions,
    nextMeeting: draft.extraction.next_meeting,
  });

  return { meetingId, groupMessage };
}

export function disagreementText(d: { topic: string; positions: string[] }): string {
  return `分歧「${d.topic}」：${d.positions.join('；')}`;
}

export function buildGroupMessage(opts: { course: string; date: string; decisions: string[]; actions: { task: string; owner: string; due: string | null }[]; openQuestions: string[]; nextMeeting: string | null }): string {
  const lines = [
    `📋 ${opts.course} ${formatCN(opts.date)} 组会纪要（组长已确认）`,
    '',
    '✅ 决议：',
    ...opts.decisions.map((d, i) => `${i + 1}. ${d}`),
    '',
    '📌 待办：',
    ...opts.actions.map((a) => `- @${a.owner} ${a.task}${a.due ? `（${a.due} 前）` : '（日期待定）'}`),
  ];
  if (opts.openQuestions.length) {
    lines.push('', '❓ 下次再议：', ...opts.openQuestions.map((q) => `- ${q}`));
  }
  if (opts.nextMeeting) lines.push('', `🗓 下次会议：${opts.nextMeeting}`);
  lines.push('', '—— 由「组长减负」生成');
  return lines.join('\n');
}