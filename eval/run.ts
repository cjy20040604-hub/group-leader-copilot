import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '@/lib/env';

loadEnv();

import { inArray } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { answerQuestion } from '@/lib/rag/answer';
import { isMock } from '@/lib/llm';

interface Golden {
  id: string;
  course_id: string;
  question: string;
  expect_answer_points: string[];
  expect_memory_ids: string[];
  expect_refusal: boolean;
}

// 评估集分三类：g/p = 能答的（含换说法）；x = 跨课程必须拒答；k = 关键词沾边但记录里没有答案
// 问答不读任何预置答案：Mock 模式是检索结果上的抽取式模板，真实模式是 qwen-plus
async function main() {
  const golden = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'eval/golden.json'), 'utf8')) as Golden[];
  let hits = 0, answerable = 0, answered = 0, citeCorrect = 0, falseRefusals = 0, refusalCorrect = 0, refusals = 0, crossCourse = 0;

  console.log(`RAG 评估（${isMock() ? 'Mock：抽取式模板' : '真实模型'}，先 npm run seed 再跑）\n`);
  for (const g of golden) {
    const res = await answerQuestion(g.course_id, g.question, { silent: true });
    const citedRows = res.citations.length ? db.select().from(schema.memoryItems).where(inArray(schema.memoryItems.id, res.citations)).all() : [];
    const leaked = citedRows.filter((r) => r.courseId !== g.course_id);
    if (leaked.length) crossCourse++;

    if (g.expect_refusal) {
      refusals++;
      const ok = res.refused && leaked.length === 0;
      if (ok) refusalCorrect++;
      console.log(`${ok ? '✅' : '❌'} ${g.id} [应拒答·${g.course_id}] ${g.question} → ${res.refused ? `拒答（${res.reason}）` : '错误作答: ' + res.answer}`);
      continue;
    }
    answerable++;
    const retrievedIds = res.results.map((r) => r.id);
    const hit = g.expect_memory_ids.every((id) => retrievedIds.includes(id));
    if (hit) hits++;
    const citeOk = !res.refused && leaked.length === 0 && g.expect_memory_ids.every((id) => res.citations.includes(id));
    if (citeOk) citeCorrect++;
    const pointsOk = !res.refused && g.expect_answer_points.every((p) => res.answer.includes(p));
    if (pointsOk) answered++;
    if (res.refused) falseRefusals++;
    console.log(`${hit && pointsOk && citeOk ? '✅' : '❌'} ${g.id} [${g.course_id}] ${g.question}`);
    console.log(`   答：${res.answer}${res.refused ? `（${res.reason}）` : ''}`);
    console.log(`   检索命中=${hit} 要点覆盖=${pointsOk} 引用正确=${citeOk} citations=[${res.citations.join(', ')}]`);
  }

  const pct = (a: number, b: number) => `${a}/${b} = ${((a / Math.max(b, 1)) * 100).toFixed(0)}%`;
  const hitRate = hits / Math.max(answerable, 1);
  const answerRate = answered / Math.max(answerable, 1);
  console.log('\n========== 汇总 ==========');
  console.log(`Hit@8（检索）    : ${pct(hits, answerable)}  （目标 ≥ 90%）`);
  console.log(`答对率（要点）   : ${pct(answered, answerable)}  （目标 ≥ 80%）`);
  console.log(`引用准确率       : ${pct(citeCorrect, answerable)}`);
  console.log(`误拒             : ${pct(falseRefusals, answerable)}`);
  console.log(`拒答正确率       : ${pct(refusalCorrect, refusals)}  （目标 100%）`);
  console.log(`串台（引用了别的课）: ${crossCourse} 题  （目标 0）`);
  const ok = hitRate >= 0.9 && answerRate >= 0.8 && refusalCorrect === refusals && crossCourse === 0;
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
