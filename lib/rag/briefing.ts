import { db, schema } from '@/lib/db/client';
import { and, eq, ne } from 'drizzle-orm';
import { getDemoNow, formatCN } from '@/lib/time';
import { dueText, STATUS_LABEL, type TaskStatus } from '@/lib/risk';
import { chatBriefing } from '@/lib/llm';

const TYPE_LABEL: Record<string, string> = {
  decision: '决议',
  action: '待办',
  open_question: '待定',
  disagreement: '分歧',
  topic_summary: '议题',
};

export async function generateBriefing(courseId: string): Promise<{ text: string; aiGenerated: boolean; material: string }> {
  const course = db.select().from(schema.courses).where(eq(schema.courses.id, courseId)).get();
  const meetings = db.select().from(schema.meetings).where(and(eq(schema.meetings.courseId, courseId), eq(schema.meetings.processed, 1))).all();
  const last = meetings.sort((a, b) => b.date.localeCompare(a.date))[0];

  const decisions = last
    ? db.select().from(schema.memoryItems).where(and(eq(schema.memoryItems.meetingId, last.id), eq(schema.memoryItems.type, 'decision'), eq(schema.memoryItems.status, 'active'))).all()
    : [];
  const openTasks = db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.courseId, courseId), ne(schema.tasks.status, 'done')))
    .all()
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const questions = db.select().from(schema.memoryItems).where(and(eq(schema.memoryItems.courseId, courseId), eq(schema.memoryItems.type, 'open_question'), eq(schema.memoryItems.status, 'active'))).all();

  const now = getDemoNow();
  const members = db.select().from(schema.members).all();
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? '待认领';

  const material = [
    `课程：${course?.name ?? courseId}`,
    last ? `上次会议（${last.date}）决议：${decisions.map((d) => d.text).join('；') || '无'}` : '暂无历史会议',
    `未完成待办：${openTasks.map((t) => `${t.title}（${nameOf(t.ownerId)}，${dueText(t.dueDate, now)}，${STATUS_LABEL[t.status as TaskStatus]}）`).join('；') || '无'}`,
    `遗留问题：${questions.map((q) => q.text).join('；') || '无'}`,
  ].join('\n');

  // Mock / 无 Key：模板拼接（零成本兜底），但按真实 prompt 记一条估算计量，成本看板不再靠写死的数字
  const { text, aiGenerated } = await chatBriefing(material, () => templateBriefing(courseId));
  return { text, aiGenerated, material };
}

// Mock 降级：模板拼接（无 Key 时也走这里，保证不翻车）
export function templateBriefing(courseId: string): string {
  const course = db.select().from(schema.courses).where(eq(schema.courses.id, courseId)).get();
  const meetings = db.select().from(schema.meetings).where(and(eq(schema.meetings.courseId, courseId), eq(schema.meetings.processed, 1))).all();
  const last = meetings.sort((a, b) => b.date.localeCompare(a.date))[0];
  const now = getDemoNow();
  const members = db.select().from(schema.members).all();
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? '待认领';
  const decisions = last
    ? db.select().from(schema.memoryItems).where(and(eq(schema.memoryItems.meetingId, last.id), eq(schema.memoryItems.type, 'decision'), eq(schema.memoryItems.status, 'active'))).all()
    : [];
  const openTasks = db.select().from(schema.tasks).where(and(eq(schema.tasks.courseId, courseId), ne(schema.tasks.status, 'done'))).all()
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')).slice(0, 3);
  const questions = db.select().from(schema.memoryItems).where(and(eq(schema.memoryItems.courseId, courseId), eq(schema.memoryItems.type, 'open_question'), eq(schema.memoryItems.status, 'active'))).all();

  const parts = [
    `【${course?.name ?? ''} 会前简报】`,
    last ? `上次（${formatCN(last.date)}）定了：${decisions.map((d) => d.text).join('；') || '无新决议'}。` : '这是第一次开会。',
    openTasks.length ? `还欠着：${openTasks.map((t) => `${nameOf(t.ownerId)}的「${t.title}」${dueText(t.dueDate, now)}`).join('；')}。` : '任务都清完了。',
    questions.length ? `没拍板的：${questions.map((q) => q.text).join('；')}。` : '',
  ];
  return parts.filter(Boolean).join('').slice(0, 200);
}

export { TYPE_LABEL };