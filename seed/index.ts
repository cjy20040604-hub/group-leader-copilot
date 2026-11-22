import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { loadEnv } from '@/lib/env';

loadEnv();

import { db, DB_PATH, schema } from '@/lib/db/client';
import { indexMeeting } from '@/lib/rag/index';
import { searchMemory } from '@/lib/rag/search';
import { answerQuestion } from '@/lib/rag/answer';
import { generateBriefing } from '@/lib/rag/briefing';
import { logUsage } from '@/lib/llm';
import { preprocessTranscript, disagreementText } from '@/lib/pipeline';
import { renderExtractPrompt } from '@/lib/prompts/extract';
import { estimateTokens } from '@/lib/rag/tokenize';
import { scanReminders } from '@/lib/reminders';
import { DEFAULT_DEMO_NOW, toLocalISO } from '@/lib/time';
import { insertUpdate } from '@/lib/task-updates';

const MEETING_IDS = ['mkt-1105', 'mkt-1112', 'db-1106', 'db-1113', 'startup-1107', 'startup-1114'];

interface SeedExtraction {
  meeting_id: string; course_id: string; date: string; title: string;
  topics: string[];
  decisions: { text: string; evidence: string; confidence: string; supersedes_memory_id?: string | null; note?: string | null }[];
  action_items: { task: string; owner_raw: string; due_raw: string | null; due_date: string | null; confidence: string; evidence: string }[];
  disagreements: { topic: string; positions: string[] }[];
  open_questions: string[];
  repeated_topics: { topic: string; memory_id: string }[];
  next_meeting: string | null;
}

export async function runSeed() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const raw = new Database(DB_PATH);
  raw.exec(fs.readFileSync(path.join(process.cwd(), 'seed/init.sql'), 'utf8'));
  raw.close();

  db.insert(schema.courses).values([
    { id: 'mkt', name: '市场营销学', color: '#2563eb' },
    { id: 'db', name: '数据库原理', color: '#059669' },
    { id: 'startup', name: '创新创业实践', color: '#d97706' },
  ]).run();

  db.insert(schema.members).values([
    { id: 'linxiao', name: '林晓', role: 'leader', aliasesJson: JSON.stringify(['晓姐', '组长', '晓晓']) },
    { id: 'ajie', name: '阿杰', role: 'member', aliasesJson: JSON.stringify(['杰哥', '小杰']) },
    { id: 'xiaoyu', name: '小雨', role: 'member', aliasesJson: JSON.stringify(['雨姐', '小雨同学']) },
    { id: 'haoran', name: '浩然', role: 'member', aliasesJson: JSON.stringify(['然哥', '小然']) },
    { id: 'siqi', name: '思琪', role: 'member', aliasesJson: JSON.stringify(['琪琪', '思琪同学']) },
  ]).run();

  // 小组成员按课程分开（产品支持每门课组员不同）；演示数据里三门课的转写都是这 5 个人在说话，所以三组都是全员，林晓三门都当组长
  for (const c of ['mkt', 'db', 'startup']) {
    db.insert(schema.courseMembers).values(['linxiao', 'ajie', 'xiaoyu', 'haoran', 'siqi'].map((m) => ({ courseId: c, memberId: m, role: m === 'linxiao' ? 'leader' : 'member' }))).run();
  }

  // 套餐：付钱的人和拍板的组长分开。营销课阿杰一个人买了专业版；数据库课全组 AA；创新创业还在用体验版（已用 2 / 3 次）
  db.insert(schema.coursePlans).values([
    { courseId: 'mkt', tier: 'pro', payerId: 'ajie', split: 'single', startedAt: '2026-11-05T15:30:00' },
    { courseId: 'db', tier: 'pro', payerId: 'linxiao', split: 'aa', startedAt: '2026-11-06T16:00:00' },
    { courseId: 'startup', tier: 'free', payerId: null, split: 'single', startedAt: null },
  ]).run();

  const seedTasks = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'seed/mock_responses/tasks.json'), 'utf8')) as {
    id: string; course_id: string; meeting_id: string; title: string; owner_id: string | null;
    due_date: string | null; status: string; last_update_at: string | null; progress_note: string | null;
  }[];

  const extractModel = process.env.LLM_MODEL_EXTRACT ?? '';
  const rosterText = (db.select().from(schema.members).all())
    .map((m) => `${m.name}（${(JSON.parse(m.aliasesJson) as string[]).join('/')}）`).join('、');

  for (const id of MEETING_IDS) {
    const transcript = fs.readFileSync(path.join(process.cwd(), `seed/transcripts/${id}.txt`), 'utf8');
    const ex = JSON.parse(fs.readFileSync(path.join(process.cwd(), `seed/mock_responses/meetings/${id}.json`), 'utf8')) as SeedExtraction;

    // 计量按流水线真实会拼出来的 prompt 估算（召回上下文 = 这场会之前本课程的记忆），不再加固定的 4000 tokens
    const context = await searchMemory(ex.course_id, preprocessTranscript(transcript).cleaned.slice(0, 300), { limit: 8, silent: true });
    const retrievedMemory = context.results.map((r) => `[${r.id}] [${r.meetingDate}] ${r.text}`).join('\n') || '（无历史记录）';
    const prompt = renderExtractPrompt({ meetingDate: ex.date, roster: rosterText, retrievedMemory, transcript });
    const modelOutput = { topics: ex.topics, decisions: ex.decisions, action_items: ex.action_items, disagreements: ex.disagreements, open_questions: ex.open_questions, repeated_topics: ex.repeated_topics, next_meeting: ex.next_meeting };

    db.insert(schema.meetings).values({
      id, courseId: ex.course_id, date: ex.date, title: ex.title, transcript, nextMeeting: ex.next_meeting, processed: 1, createdAt: `${ex.date}T15:00:00`,
    }).run();

    ex.decisions.forEach((d, i) => {
      db.insert(schema.memoryItems).values({
        id: `${id}-d${i + 1}`, courseId: ex.course_id, meetingId: id, meetingDate: ex.date,
        type: 'decision', text: d.text, evidence: d.evidence, status: 'active',
      }).run();
    });
    ex.action_items.forEach((a, i) => {
      db.insert(schema.memoryItems).values({
        id: `${id}-a${i + 1}`, courseId: ex.course_id, meetingId: id, meetingDate: ex.date,
        type: 'action', text: `${a.task}（${a.owner_raw}，${a.due_raw ?? '日期待定'}）`, evidence: a.evidence, status: 'active',
      }).run();
    });
    ex.open_questions.forEach((q, i) => {
      db.insert(schema.memoryItems).values({
        id: `${id}-q${i + 1}`, courseId: ex.course_id, meetingId: id, meetingDate: ex.date,
        type: 'open_question', text: q, status: 'active',
      }).run();
    });
    ex.disagreements.forEach((d, i) => {
      db.insert(schema.memoryItems).values({
        id: `${id}-g${i + 1}`, courseId: ex.course_id, meetingId: id, meetingDate: ex.date,
        type: 'disagreement', text: disagreementText(d), status: 'active',
      }).run();
    });
    ex.topics.forEach((t, i) => {
      db.insert(schema.memoryItems).values({
        id: `${id}-t${i + 1}`, courseId: ex.course_id, meetingId: id, meetingDate: ex.date,
        type: 'topic_summary', text: t, status: 'active',
      }).run();
    });

    await indexMeeting(id);
    logUsage({
      model: extractModel,
      inputTokens: estimateTokens(prompt),
      outputTokens: estimateTokens(JSON.stringify(modelOutput)),
      feature: 'extract', meetingId: id, ts: `${ex.date}T15:05:00`,
    });
  }

  // superseded 链：新决议推翻旧决议
  for (const id of MEETING_IDS) {
    const ex = JSON.parse(fs.readFileSync(path.join(process.cwd(), `seed/mock_responses/meetings/${id}.json`), 'utf8')) as SeedExtraction;
    ex.decisions.forEach((d, i) => {
      if (d.supersedes_memory_id) {
        db.update(schema.memoryItems)
          .set({ status: 'superseded', supersededBy: `${id}-d${i + 1}` })
          .where(eq(schema.memoryItems.id, d.supersedes_memory_id)).run();
      }
    });
  }

  // 历史会上分的任务早就做完了：演示里不再逐条摆出来，只把对应的记忆条目标成已完成，问答照样答得出「谁做的、做完没」
  const HISTORICAL_DONE = ['mkt-1105-a1', 'mkt-1105-a2', 'mkt-1112-a1', 'mkt-1112-a2', 'db-1106-a1', 'db-1106-a2', 'startup-1107-a1', 'startup-1107-a2'];
  for (const id of HISTORICAL_DONE) db.update(schema.memoryItems).set({ status: 'done' }).where(eq(schema.memoryItems.id, id)).run();

  for (const t of seedTasks) {
    db.insert(schema.tasks).values({
      id: t.id, courseId: t.course_id, meetingId: t.meeting_id, title: t.title, ownerId: t.owner_id,
      dueDate: t.due_date, status: t.status, lastUpdateAt: t.last_update_at, progressNote: t.progress_note,
      createdAt: `${t.meeting_id.slice(-4).replace(/(\d{2})(\d{2})/, '2026-$1-$2')}T15:10:00`,
    }).run();
    if (t.status === 'done') {
      db.update(schema.memoryItems).set({ status: 'done' }).where(eq(schema.memoryItems.id, t.id)).run();
    }
  }

  // 任务动态：每个任务记一条进度；另加思琪「申请延期」，演示组员主动更新
  const minus1 = (iso: string) => toLocalISO(new Date(new Date(iso).getTime() - 60000));
  for (const t of seedTasks) {
    if (!t.owner_id || !t.progress_note || !t.last_update_at) continue;
    const done = t.status === 'done';
    insertUpdate(t.id, t.course_id, t.owner_id, {
      kind: t.status === 'awaiting_review' ? 'submit' : 'progress', fromStatus: 'in_progress',
      toStatus: done ? 'in_progress' : t.status, note: t.progress_note, proposedDue: null,
    }, done ? minus1(t.last_update_at) : t.last_update_at);
    if (done) insertUpdate(t.id, t.course_id, 'linxiao', { kind: 'review_pass', fromStatus: 'awaiting_review', toStatus: 'done', note: null, proposedDue: null }, t.last_update_at);
  }
  const seedUpdates = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'seed/mock_responses/task_updates.json'), 'utf8')) as {
    task_id: string; actor_id: string; kind: 'blocked' | 'extension_request'; note: string; proposed_due: string | null; created_at: string;
  }[];
  for (const u of seedUpdates) {
    const t = seedTasks.find((x) => x.id === u.task_id)!;
    insertUpdate(u.task_id, t.course_id, u.actor_id, { kind: u.kind, fromStatus: t.status, toStatus: t.status, note: u.note, proposedDue: u.proposed_due }, u.created_at);
    const patch: { lastUpdateAt: string; blocker?: string } = { lastUpdateAt: u.created_at };
    if (u.kind === 'blocked') patch.blocker = u.note;
    db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, u.task_id)).run();
  }

  db.insert(schema.settings).values({ key: 'demo_now', value: DEFAULT_DEMO_NOW }).run();
  db.insert(schema.settings).values({ key: 'current_user', value: 'linxiao' }).run();

  // 成本看板的简报 / 问答记录：真的跑一遍问答和简报（Mock 下按真实 prompt 估算 tokens），不再写死 3000/400、4000/800
  try {
    for (const c of ['mkt', 'db', 'startup']) await generateBriefing(c);
    for (const [c, q] of [['mkt', '我们PPT最后定的什么风格？'], ['db', 'ER图谁负责？什么时候交？'], ['startup', '路演谁上台定了吗？']]) {
      await answerQuestion(c, q);
    }
  } catch (e) {
    console.warn('⚠️ 示例问答/简报没跑成（不影响演示数据）：', (e as Error).message);
  }

  const { created } = scanReminders();

  const counts = {
    courses: db.select().from(schema.courses).all().length,
    members: db.select().from(schema.members).all().length,
    meetings: db.select().from(schema.meetings).all().length,
    memory: db.select().from(schema.memoryItems).all().length,
    tasks: db.select().from(schema.tasks).all().length,
    reminders: created,
  };
  console.log('✅ 种子数据已生成：', counts);
  return counts;
}

const isDirectRun = process.argv[1] && process.argv[1].replace(/\\/g, '/').includes('seed/index');
if (isDirectRun) {
  runSeed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}