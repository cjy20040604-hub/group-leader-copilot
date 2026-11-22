import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getSetting } from '@/lib/time';
import { ledCourseIds, isLeaderOf as leaderOf } from '@/lib/membership';

// role = 'leader' 表示这个人至少在一门课里当组长（能看到「待我处理」等组长视图）；具体能不能动某门课，用 canLead(courseId) 判断
export interface CurrentUser {
  id: string;
  name: string;
  role: 'leader' | 'member';
}

export function getCurrentUser(): CurrentUser {
  const id = getSetting('current_user') ?? 'linxiao';
  const m = db.select().from(schema.members).where(eq(schema.members.id, id)).get();
  if (!m) return { id: 'linxiao', name: '林晓', role: 'leader' };
  return { id: m.id, name: m.name, role: ledCourseIds(m.id).length > 0 ? 'leader' : 'member' };
}

export function isLeader(): boolean {
  return getCurrentUser().role === 'leader';
}

// 当前用户在这门课里是不是组长
export function canLead(courseId: string): boolean {
  return leaderOf(getCurrentUser().id, courseId);
}