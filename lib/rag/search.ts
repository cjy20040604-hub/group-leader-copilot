import MiniSearch from 'minisearch';
import { db, schema } from '@/lib/db/client';
import { and, eq, ne } from 'drizzle-orm';
import { cosine, fromBlob } from './embed';
import { tokenize } from './tokenize';
import { questionTerms } from './terms';
import { coverStrong, describeCover } from './match';
import { embedTexts, isMock } from '@/lib/llm';

export interface MemoryRow {
  id: string;
  courseId: string;
  meetingId: string;
  meetingDate: string;
  type: string;
  text: string;
  evidence: string | null;
  status: string;
  supersededBy: string | null;
}

export interface Retrieved extends MemoryRow {
  score: number;
  vecSim: number;
}

// L2 原文层：会议转写分块（兜底证据）
export interface ChunkHit {
  id: string;
  courseId: string;
  meetingId: string;
  meetingDate: string;
  text: string;
  score: number;
}

export interface SearchResult {
  results: Retrieved[];
  chunks: ChunkHit[];
  maxVecSim: number;
  bm25TopScore: number;
  refused: boolean;
}

export const REFUSE_VEC_THRESHOLD = 0.35;
export const REFUSE_COVERAGE_THRESHOLD = 0.3;
// 真实向量：余弦 ≥ 0.8 才算同一件事；Mock 向量不讲语义（「方案」被归进营销组就能把余弦拉到 0.69），
// 所以 Mock 下放宽到 0.5，真正把关的是关键词规则（lib/rag/match.ts）
export const DUPLICATE_THRESHOLD = Number(process.env.DUPLICATE_THRESHOLD ?? 0.8);
export const MOCK_DUPLICATE_THRESHOLD = 0.5;

// RRF 融合（k=60），导出供单测
export function rrfFuse(rankLists: string[][], k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of rankLists) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return scores;
}

function bm25Rank<T extends { id: string }>(docs: T[], fields: (keyof T & string)[], query: string) {
  const mini = new MiniSearch<T>({ fields, storeFields: ['id'], tokenize, searchOptions: { tokenize, prefix: false, fuzzy: false } });
  mini.addAll(docs);
  return mini.search(query);
}

export async function searchMemory(
  courseId: string,
  query: string,
  opts: { includeSuperseded?: boolean; limit?: number; silent?: boolean; meetingId?: string | null } = {},
): Promise<SearchResult> {
  const limit = opts.limit ?? 8;
  const rows = db
    .select()
    .from(schema.memoryItems)
    .where(
      opts.includeSuperseded
        ? eq(schema.memoryItems.courseId, courseId)
        : and(eq(schema.memoryItems.courseId, courseId), ne(schema.memoryItems.status, 'superseded')),
    )
    .all() as (MemoryRow & { embedding: Buffer | null })[];

  if (rows.length === 0) {
    return { results: [], chunks: [], maxVecSim: 0, bm25TopScore: 0, refused: true };
  }

  const [queryVec] = await embedTexts([query], { feature: 'search', silent: opts.silent, meetingId: opts.meetingId });

  // ── L1 条目层：向量 top 20 + BM25 top 20 → RRF ──
  const vecRanked = rows
    .map((r) => ({ id: r.id, sim: r.embedding ? cosine(queryVec, fromBlob(r.embedding)!) : 0 }))
    .sort((a, b) => b.sim - a.sim);
  const maxVecSim = vecRanked[0]?.sim ?? 0;

  const bm25 = bm25Rank(rows.map((r) => ({ ...r, evidence: r.evidence ?? '' })), ['text', 'evidence'], query).slice(0, 20);
  const bm25TopScore = bm25[0]?.score ?? 0;
  const queryTokenCount = tokenize(query).length;
  const bm25Coverage = bm25[0] && queryTokenCount > 0 ? bm25[0].terms.length / queryTokenCount : 0;

  const fused = rrfFuse([vecRanked.slice(0, 20).map((v) => v.id), bm25.map((b) => b.id as string)]);

  // 时间加权：同主题新决议优先（最多 +15%）
  const dates = rows.map((r) => r.meetingDate).sort();
  const minD = new Date(dates[0]).getTime();
  const maxD = new Date(dates[dates.length - 1]).getTime();
  const span = Math.max(maxD - minD, 1);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const simById = new Map(vecRanked.map((v) => [v.id, v.sim]));

  const results: Retrieved[] = [...fused.entries()]
    .map(([id, score]) => {
      const { embedding: _e, ...row } = byId.get(id)!;
      const recency = (new Date(row.meetingDate).getTime() - minD) / span;
      return { ...row, score: score * (1 + 0.15 * recency), vecSim: simById.get(id) ?? 0 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // ── L2 原文层：同样向量 + BM25 → RRF，取前 3 块当兜底证据 ──
  const meetings = new Map(db.select().from(schema.meetings).where(eq(schema.meetings.courseId, courseId)).all().map((m) => [m.id, m.date]));
  const chunkRows = db.select().from(schema.transcriptChunks).where(eq(schema.transcriptChunks.courseId, courseId)).all();
  let chunks: ChunkHit[] = [];
  if (chunkRows.length) {
    const cVec = chunkRows
      .map((c) => ({ id: c.id, sim: c.embedding ? cosine(queryVec, fromBlob(c.embedding as Buffer)!) : 0 }))
      .sort((a, b) => b.sim - a.sim).slice(0, 20).map((c) => c.id);
    const cBm25 = bm25Rank(chunkRows, ['text'], query).slice(0, 20).map((c) => c.id as string);
    const cById = new Map(chunkRows.map((c) => [c.id, c]));
    chunks = [...rrfFuse([cVec, cBm25]).entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([id, score]) => {
        const c = cById.get(id)!;
        return { id, courseId, meetingId: c.meetingId, meetingDate: meetings.get(c.meetingId) ?? '', text: c.text, score };
      });
  }

  const refused = maxVecSim < REFUSE_VEC_THRESHOLD && bm25Coverage < REFUSE_COVERAGE_THRESHOLD;
  return { results, chunks, maxVecSim, bm25TopScore, refused };
}

export interface SameTopicHit {
  memoryId: string;
  text: string;
  meetingDate: string;
  similarity: number;
  matched: string; // 对上的关键词，如「ppt、风格≈模板」
}

// 「这件事是不是已经定过」：议程查重和决议冲突检测共用（不调 LLM）
// 真实模式：text-embedding-v4 余弦 ≥ 阈值；Mock：余弦 ≥ 阈值 且 关键词对得上（Mock 向量同组话题一律虚高）
export async function findSameTopicDecisions(
  courseId: string,
  text: string,
  opts: { feature: string; meetingId?: string | null; silent?: boolean },
): Promise<SameTopicHit[]> {
  const rows = db
    .select()
    .from(schema.memoryItems)
    .where(and(eq(schema.memoryItems.courseId, courseId), eq(schema.memoryItems.type, 'decision'), eq(schema.memoryItems.status, 'active')))
    .all() as (MemoryRow & { embedding: Buffer | null })[];
  if (rows.length === 0 || !text.trim()) return [];
  const [vec] = await embedTexts([text], { feature: opts.feature, meetingId: opts.meetingId, silent: opts.silent });
  const terms = questionTerms(text);
  const mock = isMock();
  return rows
    .map((r) => {
      // 旧决议的上下文 = 本条 + 原话 + 被它推翻的那条（变更链上的说法都算同一件事）
      const prev = db.select().from(schema.memoryItems).where(eq(schema.memoryItems.supersededBy, r.id)).all();
      const context = [r.text, r.evidence ?? '', ...prev.flatMap((p) => [p.text, p.evidence ?? ''])].join(' ');
      const cover = coverStrong(terms, context);
      const similarity = r.embedding ? cosine(vec, fromBlob(r.embedding)!) : 0;
      return { memoryId: r.id, text: r.text, meetingDate: r.meetingDate, similarity, cover };
    })
    .filter((r) => (mock ? r.similarity >= MOCK_DUPLICATE_THRESHOLD && r.cover.ok : r.similarity >= DUPLICATE_THRESHOLD))
    .sort((a, b) => b.cover.literal.length - a.cover.literal.length || b.similarity - a.similarity)
    .map(({ cover, ...r }) => ({ ...r, matched: describeCover(cover) }));
}

export async function detectDuplicateAgenda(courseId: string, agenda: string): Promise<SameTopicHit[]> {
  return findSameTopicDecisions(courseId, agenda, { feature: 'duplicate_check' });
}
