// 小组成员与按课角色：不同课的小组成员可以不一样，权限按「你在这门课里是谁」判断（确定性代码，不调 LLM）
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';

export type CourseRole = 'leader' | 'member';
export interface RosterRow { id: string; name: string; aliases: string[]; role: CourseRole }

function rows() {
  return db.select().from(schema.courseMembers).all();
}

export function roleIn(userId: string, courseId: string): CourseRole | null {
  const r = db.select().from(schema.courseMembers)
    .where(and(eq(schema.courseMembers.courseId, courseId), eq(schema.courseMembers.memberId, userId))).get();
  return (r?.role as CourseRole) ?? null;
}

export const isLeaderOf = (userId: string, courseId: string) => roleIn(userId, courseId) === 'leader';

// 这个人所在的全部课程 / 当组长的课程
export function myCourseIds(userId: string): string[] {
  return rows().filter((r) => r.memberId === userId).map((r) => r.courseId);
}
export function ledCourseIds(userId: string): string[] {
  return rows().filter((r) => r.memberId === userId && r.role === 'leader').map((r) => r.courseId);
}

// 一门课的名单（整理纪要对人名、指派下拉框都只用这份）
export function courseRoster(courseId: string): RosterRow[] {
  const people = new Map(db.select().from(schema.members).all().map((m) => [m.id, m]));
  return rows().filter((r) => r.courseId === courseId).flatMap((r) => {
    const m = people.get(r.memberId);
    return m ? [{ id: m.id, name: m.name, aliases: JSON.parse(m.aliasesJson) as string[], role: r.role as CourseRole }] : [];
  });
}

// 每门课 → 名单（给前端下拉框按所选课程切换）
export function rosterByCourse(): Record<string, { id: string; name: string; role: CourseRole }[]> {
  const people = new Map(db.select().from(schema.members).all().map((m) => [m.id, m]));
  const out: Record<string, { id: string; name: string; role: CourseRole }[]> = {};
  for (const r of rows()) {
    const m = people.get(r.memberId);
    if (m) (out[r.courseId] ??= []).push({ id: m.id, name: m.name, role: r.role as CourseRole });
  }
  return out;
}

// 「某人是某门课的组长」集合，给动态归类、指标计算用
export function leaderPairs(): Set<string> {
  return new Set(rows().filter((r) => r.role === 'leader').map((r) => `${r.courseId}:${r.memberId}`));
}

export function setMembership(courseId: string, memberId: string, role: CourseRole | null): { ok: true } | { ok: false; error: string } {
  const current = roleIn(memberId, courseId);
  if (current === 'leader' && role !== 'leader') {
    const leaders = rows().filter((r) => r.courseId === courseId && r.role === 'leader').length;
    if (leaders <= 1) return { ok: false, error: '每个小组至少保留一名组长，先把别人设为组长再改 TA' };
  }
  if (role === null) {
    db.delete(schema.courseMembers).where(and(eq(schema.courseMembers.courseId, courseId), eq(schema.courseMembers.memberId, memberId))).run();
  } else if (current) {
    db.update(schema.courseMembers).set({ role }).where(and(eq(schema.courseMembers.courseId, courseId), eq(schema.courseMembers.memberId, memberId))).run();
  } else {
    db.insert(schema.courseMembers).values({ courseId, memberId, role }).run();
  }
  return { ok: true };
}
