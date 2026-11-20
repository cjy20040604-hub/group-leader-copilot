import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { mockEmbed } from '@/lib/rag/embed';
import { estimateTokens } from '@/lib/rag/tokenize';
import { llmCost, embeddingCost } from '@/config/pricing';
import { getDemoNowISO } from '@/lib/time';
import { renderExtractPrompt } from '@/lib/prompts/extract';
import { renderAnswerPrompt, BRIEFING_PROMPT } from '@/lib/prompts/answer';
import { formatCN } from '@/lib/time';
import { coverage, type Term } from '@/lib/rag/terms';
import { coverStrong } from '@/lib/rag/match';
import { ruleExtract } from '@/lib/rule-extract';
import { STATUS_LABEL, type TaskStatus } from '@/lib/risk';
import type { RosterMember } from '@/lib/roster';
import type { Retrieved, ChunkHit } from '@/lib/rag/search';

export const ExtractSchema = z.object({
  topics: z.array(z.string()),
  decisions: z.array(z.object({
    text: z.string(),
    evidence: z.string(),
    confidence: z.enum(['high', 'low']),
    supersedes_memory_id: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  })),
  action_items: z.array(z.object({
    task: z.string(),
    owner_raw: z.string(),
    due_raw: z.string().nullable(),
    due_date: z.string().nullable(),
    confidence: z.enum(['high', 'low']),
    evidence: z.string(),
  })),
  disagreements: z.array(z.object({ topic: z.string(), positions: z.array(z.string()) })),
  open_questions: z.array(z.string()),
  repeated_topics: z.array(z.object({ topic: z.string(), memory_id: z.string() })),
  next_meeting: z.string().nullable(),
});
export type Extraction = z.infer<typeof ExtractSchema>;

// fixture = 命中种子预置输出；rules = 规则抽取兜底；llm = 真实模型
export type ExtractMode = 'fixture' | 'rules' | 'llm';

export function isMock(): boolean {
  return process.env.MOCK_LLM === 'true' || !process.env.DASHSCOPE_API_KEY;
}

function modelNames() {
  return {
    extract: process.env.LLM_MODEL_EXTRACT ?? '',
    chat: process.env.LLM_MODEL_CHAT ?? '',
    embed: process.env.EMBEDDING_MODEL ?? '',
  };
}

// 百炼 Qwen3 系列：显式关掉思考模式，输出 token 可预测（按非思考价计费）
const NO_THINKING = { enable_thinking: false } as Record<string, unknown>;

// 百炼 text-embedding-v4 单次最多 10 条（以官方文档为准），超出分批
const EMBED_BATCH = 10;

function client(): OpenAI {
  return new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: process.env.LLM_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  });
}

export function logUsage(opts: {
  model: string; inputTokens?: number; outputTokens?: number; audioSeconds?: number;
  feature: string; meetingId?: string | null; cost?: number; ts?: string;
}) {
  const cost = opts.cost ?? llmCost(opts.model, opts.inputTokens ?? 0, opts.outputTokens ?? 0);
  db.insert(schema.usageLog).values({
    ts: opts.ts ?? getDemoNowISO(),
    model: opts.model,
    inputTokens: opts.inputTokens ?? 0,
    outputTokens: opts.outputTokens ?? 0,
    audioSeconds: opts.audioSeconds ?? 0,
    costCny: cost,
    feature: opts.feature,
    meetingId: opts.meetingId ?? null,
  }).run();
}

export async function embedTexts(texts: string[], opts: { feature: string; meetingId?: string | null; silent?: boolean } = { feature: 'index' }): Promise<Float32Array[]> {
  const model = modelNames().embed;
  if (isMock()) {
    const vectors = texts.map(mockEmbed);
    if (!opts.silent) {
      const tokens = texts.reduce((s, t) => s + estimateTokens(t), 0);
      logUsage({ model, inputTokens: tokens, feature: opts.feature, meetingId: opts.meetingId, cost: embeddingCost(model, tokens) });
    }
    return vectors;
  }
  const out: Float32Array[] = [];
  let tokens = 0;
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const res = await client().embeddings.create({ model, input: texts.slice(i, i + EMBED_BATCH), dimensions: 1024 });
    out.push(...res.data.map((d) => Float32Array.from(d.embedding)));
    tokens += res.usage?.prompt_tokens ?? 0;
  }
  if (!opts.silent) {
    logUsage({ model, inputTokens: tokens, feature: opts.feature, meetingId: opts.meetingId, cost: embeddingCost(model, tokens) });
  }
  return out;
}

function normalize(s: string): string {
  return s.replace(/\[?\d{1,2}:\d{2}(?::\d{2})?\]?/g, '').replace(/\s+/g, '').toLowerCase();
}

function bigramSet(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / Math.max(a.size + b.size - inter, 1);
}

function readSeedJSON(rel: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf8'));
}

// Mock 抽取：转写和种子转写高度重合 → 读预置输出；否则走规则抽取（不再返回空结果）
function mockExtraction(transcript: string, roster: RosterMember[], meetingDate: string): { extraction: Extraction; mode: ExtractMode } {
  const input = bigramSet(normalize(transcript));
  const candidates: { txt: string; json: string }[] = [
    { txt: 'seed/new_meeting.txt', json: 'seed/mock_responses/extract_new_meeting.json' },
    ...['mkt-1105', 'mkt-1112', 'db-1106', 'db-1113', 'startup-1107', 'startup-1114'].map((id) => ({
      txt: `seed/transcripts/${id}.txt`,
      json: `seed/mock_responses/meetings/${id}.json`,
    })),
  ];
  let best: { score: number; json: string } | null = null;
  for (const c of candidates) {
    const p = path.join(process.cwd(), c.txt);
    if (!fs.existsSync(p)) continue;
    const score = jaccard(input, bigramSet(normalize(fs.readFileSync(p, 'utf8'))));
    if (!best || score > best.score) best = { score, json: c.json };
  }
  if (best && best.score > 0.25) {
    const parsed = ExtractSchema.safeParse(readSeedJSON(best.json));
    if (parsed.success) return { extraction: parsed.data, mode: 'fixture' };
  }
  return { extraction: ruleExtract(transcript, roster, meetingDate), mode: 'rules' };
}

export async function chatExtract(vars: {
  transcript: string; retrievedMemory: string; meetingDate: string; roster: string;
  rosterMembers: RosterMember[]; meetingId?: string | null; ts?: string;
}): Promise<{ extraction: Extraction; degraded: boolean; mode: ExtractMode; usage: { input: number; output: number } }> {
  const prompt = renderExtractPrompt(vars);
  const model = modelNames().extract;
  if (isMock()) {
    const result = mockExtraction(vars.transcript, vars.rosterMembers, vars.meetingDate);
    const usage = { input: estimateTokens(prompt), output: estimateTokens(JSON.stringify(result.extraction)) };
    logUsage({ model, inputTokens: usage.input, outputTokens: usage.output, feature: 'extract', meetingId: vars.meetingId, ts: vars.ts });
    return { ...result, degraded: false, usage };
  }
  const usage = { input: 0, output: 0 };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client().chat.completions.create({
      model,
      messages: [{ role: 'user', content: attempt === 0 ? prompt : prompt + '\n\n上次输出不符合 JSON Schema，请严格只输出合法 JSON。' }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
      ...NO_THINKING,
    });
    usage.input += res.usage?.prompt_tokens ?? 0;
    usage.output += res.usage?.completion_tokens ?? 0;
    logUsage({ model, inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0, feature: 'extract', meetingId: vars.meetingId, ts: vars.ts });
    const text = (res.choices[0]?.message?.content ?? '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try {
      const parsed = ExtractSchema.safeParse(JSON.parse(text));
      if (parsed.success) return { extraction: parsed.data, degraded: false, mode: 'llm', usage };
    } catch { /* retry */ }
  }
  // 两次都不合法 → 规则抽取兜底 + 组长手动补
  return { extraction: ruleExtract(vars.transcript, vars.rosterMembers, vars.meetingDate), degraded: true, mode: 'rules', usage };
}

const TYPE_LABEL: Record<string, string> = { decision: '决议', action: '待办', open_question: '待定', disagreement: '分歧', topic_summary: '议题', transcript: '原文' };

export interface ChatAnswerResult {
  answer: string;
  citations: string[]; // 记忆条目 id 或原文分块 id
  quotes?: Record<string, string>; // 原文分块 id → 引用的那句原话（引用卡片跳转后高亮用）
  refused?: boolean;
  reason?: string;
}

interface AnswerCtx { courseId: string; terms: Term[]; chunks: ChunkHit[] }

// 问答：Mock 走抽取式模板（只用本课程检索结果，关键词对不上就拒答）；真实模式调 qwen-plus 并校验引用
export async function chatAnswer(question: string, records: string, items: Retrieved[], ctx: AnswerCtx): Promise<ChatAnswerResult> {
  const model = modelNames().chat;
  const inCourse = items.filter((i) => i.courseId === ctx.courseId);
  const chunks = ctx.chunks.filter((c) => c.courseId === ctx.courseId);
  if (isMock()) {
    const composed = composeAnswer(question, inCourse, { ...ctx, chunks });
    logUsage({ model, inputTokens: estimateTokens(renderAnswerPrompt(question, records)), outputTokens: estimateTokens(composed.answer), feature: 'qa' });
    return composed;
  }
  const res = await client().chat.completions.create({
    model,
    messages: [{ role: 'user', content: renderAnswerPrompt(question, records) }],
    temperature: 0.2,
    ...NO_THINKING,
  });
  logUsage({ model, inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0, feature: 'qa' });
  const answer = res.choices[0]?.message?.content?.trim() ?? '';
  if (!answer || answer.includes('记录里没找到')) return { answer: '记录里没找到。', citations: [], refused: true, reason: '模型判断检索到的记录不足以回答' };
  // 引用校验：只保留答案里真的标注了的条目（[11/12·决议] / [2026-11-12·决议] / [11/12·原文]）
  const labels = (date: string, t: string) => [`${formatCN(date)}·${t}`, `${date}·${t}`, `${date.slice(5).replace('-', '/')}·${t}`];
  const cited = [
    ...inCourse.filter((r) => labels(r.meetingDate, TYPE_LABEL[r.type] ?? r.type).some((l) => answer.includes(l))).map((r) => r.id),
    ...chunks.filter((c) => labels(c.meetingDate, '原文').some((l) => answer.includes(l))).map((c) => c.id),
  ];
  return { answer, citations: cited.length ? cited : inCourse.slice(0, 3).map((r) => r.id) };
}

const PRIORITY: Record<string, number> = { decision: 0, action: 1, open_question: 2, disagreement: 3 };
const OWNER_INTENT = /谁|负责|什么时候|何时|哪天|几号|截止|交|进度/;

function composeAnswer(question: string, items: Retrieved[], ctx: AnswerCtx): ChatAnswerResult {
  const notFound = (reason: string): ChatAnswerResult => ({ answer: '记录里没找到。', citations: [], refused: true, reason });
  if (items.length === 0 && ctx.chunks.length === 0) return notFound('Mock 作答：本课程没有检索结果');

  // 课程名里的词（「营销」「创新创业」）不算必须对上的关键词
  const courseName = db.select().from(schema.courses).where(eq(schema.courses.id, ctx.courseId)).get()?.name ?? '';
  const terms = ctx.terms;
  const tasks = new Map(db.select().from(schema.tasks).where(eq(schema.tasks.courseId, ctx.courseId)).all().map((t) => [t.id, t]));
  const members = db.select().from(schema.members).all();
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? '待认领';
  const ownerIntent = OWNER_INTENT.test(question);
  const isDone = (r: Retrieved) => (r.type === 'action' ? tasks.get(r.id)?.status === 'done' : r.status === 'done');

  // 候选条目：问题里两字以上的关键词必须都能在这条记录里找到（原词或同义，见 lib/rag/match.ts）
  // 问「谁 / 什么时候」时待办加分，没做完的再加：「ER 图现在谁在画」该答完整版，而不是已交的初稿
  const ownerBonus = (r: Retrieved) => (ownerIntent && r.type === 'action' ? 0.1 + (isDone(r) ? 0 : 0.25) : 0);
  const ranked = items
    .filter((r) => r.type !== 'topic_summary')
    .map((r) => {
      const text = `${r.text} ${r.evidence ?? ''}`;
      return { r, cover: coverStrong(terms, text, { exclude: courseName }), cov: coverage(terms, text) };
    })
    .filter((x) => x.cover.ok)
    .map((x) => ({ ...x, rank: x.cov + ownerBonus(x.r) }))
    .sort((a, b) =>
      b.rank - a.rank
      || (ownerIntent ? (a.r.type === 'action' ? 0 : 1) - (b.r.type === 'action' ? 0 : 1) : 0)
      || (PRIORITY[a.r.type] ?? 9) - (PRIORITY[b.r.type] ?? 9)
      || b.r.score - a.r.score);

  const cite = (r: { meetingDate: string; type: string }, suffix = '') => `[${formatCN(r.meetingDate)}·${TYPE_LABEL[r.type] ?? r.type}${suffix}]`;

  if (ranked.length === 0) {
    // ① 纪要条目里没有：去原文分块里找「相邻两句话包含全部关键词」的地方，原话引用
    const quote = findTranscriptQuote(terms, ctx.chunks, courseName);
    if (quote) {
      return {
        answer: `纪要里没有这条结论，原文里提过：「${quote.text}」${cite({ meetingDate: quote.chunk.meetingDate, type: 'transcript' })}。`,
        citations: [quote.chunk.id],
        quotes: { [quote.chunk.id]: quote.line },
      };
    }
    // ② 只有议题标签对得上：如实说「只在议题里提过」，不硬凑结论
    const topic = items.filter((r) => r.type === 'topic_summary')
      .map((r) => ({ r, cover: coverStrong(terms, r.text, { exclude: courseName }) })).filter((x) => x.cover.ok)
      .sort((a, b) => b.r.score - a.r.score)[0]?.r;
    if (!topic) return notFound('Mock 作答：纪要和原文里都没有和问题关键词全部对上的记录');
    const meeting = db.select().from(schema.meetings).where(eq(schema.meetings.id, topic.meetingId)).get();
    const tail = topic.text.includes('下次会议') && meeting?.nextMeeting
      ? `，那次会定的下次会议是 ${formatCN(meeting.nextMeeting)}。`
      : '，没有更具体的结论。';
    return { answer: `记录里只有议题「${topic.text}」${cite(topic)}${tail}`, citations: [topic.id] };
  }

  const citations: string[] = [];
  const describe = (r: Retrieved): string => {
    citations.push(r.id);
    if (r.type === 'decision') {
      let s = `现在定的是「${r.text}」${cite(r)}${r.evidence ? `，原话「${r.evidence}」` : ''}`;
      const old = db.select().from(schema.memoryItems)
        .where(and(eq(schema.memoryItems.courseId, ctx.courseId), eq(schema.memoryItems.supersededBy, r.id))).get();
      if (old) {
        citations.push(old.id);
        s += `。之前定的是「${old.text}」${cite(old, '·已推翻')}，${formatCN(r.meetingDate)} 改的`;
      }
      return s;
    }
    if (r.type === 'action') {
      const t = tasks.get(r.id);
      if (!t) return `${r.text}${cite(r)}`;
      const due = t.dueDate ? `${formatCN(t.dueDate)} 截止` : '日期待定';
      const who = t.ownerId ? `由${nameOf(t.ownerId)}负责` : '还没人认领（待认领）';
      const status = t.ownerId ? `，现在${STATUS_LABEL[t.status as TaskStatus] ?? t.status}` : '';
      return `「${t.title}」${who}，${due}${status}${cite(r)}${t.progressNote ? `（进度：${t.progressNote}）` : ''}`;
    }
    if (r.type === 'open_question') return `还没定：${r.text}${cite(r)}`;
    if (r.type === 'disagreement') {
      const positions = r.text.slice(r.text.indexOf('：') + 1);
      const short = positions.split('；').map((p) => p.split(/[：:，,]/)[0]).join('；');
      return `当时的分歧：${short}${cite(r)}`;
    }
    return `${r.text}${cite(r)}`;
  };

  let answer = describe(ranked[0].r);
  const second = ranked.find((x, i) => i > 0 && x.rank === ranked[0].rank && !citations.includes(x.r.id));
  if (second && answer.length < 90) answer += `。另外，${describe(second.r)}`;
  return { answer: `${answer}。`, citations };
}

// 原文兜底：在分块里找「上一句 + 这一句」同时包含问题全部关键词（只认原词）的地方
function findTranscriptQuote(terms: Term[], chunks: ChunkHit[], courseName: string): { chunk: ChunkHit; text: string; line: string } | null {
  for (const chunk of chunks) {
    const lines = chunk.text.split('\n').map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const window = `${lines[i - 1] ?? ''} ${lines[i]}`;
      if (!coverStrong(terms, window, { exclude: courseName, concept: false }).ok) continue;
      // 窗口在这一句才凑齐关键词，说明关键信息在这一句：只引用这一句（带说话人）
      const text = lines[i].length > 70 ? `${lines[i].slice(0, 70)}…` : lines[i];
      return { chunk, text, line: lines[i] };
    }
  }
  return null;
}

// 会前简报：真实模式调 qwen-plus；Mock 由调用方走模板拼接，但照样按真实 prompt 记一条估算计量
export async function chatBriefing(material: string, mockText: () => string): Promise<{ text: string; aiGenerated: boolean }> {
  const model = modelNames().chat;
  const prompt = BRIEFING_PROMPT.replace('{{material}}', material);
  if (isMock()) {
    const text = mockText();
    logUsage({ model, inputTokens: estimateTokens(prompt), outputTokens: estimateTokens(text), feature: 'briefing', meetingId: null });
    return { text, aiGenerated: false };
  }
  const res = await client().chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    ...NO_THINKING,
  });
  logUsage({ model, inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0, feature: 'briefing', meetingId: null });
  return { text: (res.choices[0]?.message?.content ?? '').slice(0, 200), aiGenerated: true };
}
