import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { searchMemory, type Retrieved, type ChunkHit } from './search';
import { chatAnswer } from '@/lib/llm';
import { TYPE_LABEL } from './briefing';
import { questionTerms, coverage, normalizeText, type Term } from './terms';

export interface AnswerResult {
  refused: boolean;
  answer: string;
  citations: string[];
  results: Retrieved[];
  chunks: ChunkHit[];
  quotes?: Record<string, string>;
  reason?: string;
}

export const NOT_FOUND = '记录里没找到。要不要把这个问题加到下次会议议程？';

// 课程语料：本课程全部记忆条目（含已推翻）+ 课程名 + 花名册
function courseCorpus(courseId: string): string {
  const course = db.select().from(schema.courses).where(eq(schema.courses.id, courseId)).get();
  const items = db.select().from(schema.memoryItems).where(eq(schema.memoryItems.courseId, courseId)).all();
  const members = db.select().from(schema.members).all();
  return normalizeText([
    course?.name ?? '',
    ...members.map((m) => m.name),
    ...items.map((i) => `${i.text} ${i.evidence ?? ''}`),
  ].join(' '));
}

// 证据闸门（确定性，两种模式共用）：问题关键词的权重过半在本课程记录里从没出现过 → 拒答，不调对话模型
export function evidenceGate(courseId: string, question: string): { pass: boolean; terms: Term[]; unknown: string[] } {
  const terms = questionTerms(question);
  if (terms.length === 0) return { pass: true, terms, unknown: [] };
  const corpus = courseCorpus(courseId);
  const unknown = terms.filter((x) => !corpus.includes(x.t)).map((x) => x.t);
  return { pass: coverage(terms, corpus) > 0.5, terms, unknown };
}

export async function answerQuestion(courseId: string, question: string, opts: { silent?: boolean } = {}): Promise<AnswerResult> {
  const sr = await searchMemory(courseId, question, { silent: opts.silent });
  if (sr.refused || sr.results.length === 0) {
    return { refused: true, answer: NOT_FOUND, citations: [], results: sr.results, chunks: sr.chunks, reason: '检索阈值：向量相似度和关键词命中都太低' };
  }
  const gate = evidenceGate(courseId, question);
  if (!gate.pass) {
    return {
      refused: true, answer: NOT_FOUND, citations: [], results: sr.results, chunks: sr.chunks,
      reason: `证据闸门：问题里的「${gate.unknown.join('、')}」在这门课的记录里从没出现过，未调用模型`,
    };
  }

  const label = (r: { meetingDate: string; type: string }) => `${r.meetingDate}·${TYPE_LABEL[r.type] ?? r.type}`;
  // 变更链：被推翻的旧决议不进检索结果，但作为「此前」附在新决议后面，模型才能说清改动过程
  const records = sr.results.map((r) => {
    let line = `[${r.id}] [${label(r)}] ${r.text}${r.evidence ? `（原话：${r.evidence}）` : ''}`;
    if (r.type === 'decision') {
      const old = db.select().from(schema.memoryItems)
        .where(and(eq(schema.memoryItems.courseId, courseId), eq(schema.memoryItems.supersededBy, r.id))).get();
      if (old) line += `（此前：${old.text} [${label(old)}·已推翻]）`;
    }
    return line;
  });
  // L2 原文片段：纪要条目没写到的细节（比如「画图用 draw.io」），模型可以引用 [日期·原文]
  for (const c of sr.chunks) records.push(`[${c.id}] [${c.meetingDate}·原文] ${c.text.slice(0, 300)}`);

  const res = await chatAnswer(question, records.join('\n'), sr.results, { courseId, terms: gate.terms, chunks: sr.chunks });
  if (res.refused) {
    return { refused: true, answer: NOT_FOUND, citations: [], results: sr.results, chunks: sr.chunks, reason: res.reason };
  }
  return { refused: false, answer: res.answer, citations: res.citations, results: sr.results, chunks: sr.chunks, quotes: res.quotes };
}
