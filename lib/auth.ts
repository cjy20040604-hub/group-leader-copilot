import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getSetting } from '@/lib/time';

export interface CurrentUser {
  id: string;
  name: string;
  role: 'leader' | 'member';
}

export function getCurrentUser(): CurrentUser {
  const id = getSetting('current_user') ?? 'linxiao';
  const m = db.select().from(schema.members).where(eq(schema.members.id, id)).get();
  if (!m) return { id: 'linxiao', name: '林晓', role: 'leader' };
  return { id: m.id, name: m.name, role: m.role as 'leader' | 'member' };
}

export function isLeader(): boolean {
  return getCurrentUser().role === 'leader';
}