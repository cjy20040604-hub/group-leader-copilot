import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import { toLocalISO } from '@/lib/time-utils';

export { toLocalISO, dateOnly, daysUntilDue, hoursSince, formatCN } from '@/lib/time-utils';

export const DEFAULT_DEMO_NOW = '2026-11-19T09:00:00';

export function getSetting(key: string): string | null {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db.insert(schema.settings).values({ key, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } }).run();
}

export function getDemoNow(): Date {
  return new Date(getSetting('demo_now') ?? DEFAULT_DEMO_NOW);
}

export function getDemoNowISO(): string {
  return getSetting('demo_now') ?? DEFAULT_DEMO_NOW;
}

export function setDemoNow(iso: string) {
  setSetting('demo_now', iso);
}

export function shiftDemoNow(days: number) {
  const d = getDemoNow();
  d.setDate(d.getDate() + days);
  setDemoNow(toLocalISO(d));
}

export function resetDemoNow() {
  setDemoNow(DEFAULT_DEMO_NOW);
}