// 会议安排：新建 / 删除 / 查询，全部确定性代码，不调 LLM
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function listScheduled(fromDate: string) {
  return db.select().from(schema.scheduledMeetings).all()
    .filter((m) => m.date >= fromDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// 同一门课同一天只留一条，重复安排直接返回已有的
export function addScheduled(courseId: string, date: string, nowISO: string) {
  const existing = db.select().from(schema.scheduledMeetings)
    .where(and(eq(schema.scheduledMeetings.courseId, courseId), eq(schema.scheduledMeetings.date, date))).get();
  if (existing) return existing.id;
  const id = `s-${courseId}-${date}`;
  db.insert(schema.scheduledMeetings).values({ id, courseId, date, createdAt: nowISO }).run();
  return id;
}

export function removeScheduled(id: string) {
  return db.delete(schema.scheduledMeetings).where(eq(schema.scheduledMeetings.id, id)).run().changes > 0;
}
