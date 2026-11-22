// 小组套餐与额度（确定性代码，不调 LLM）。额度数字和成本模型同一份：lib/unit-economics.ts 的 BASELINE
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { BASELINE } from '@/lib/unit-economics';

export type Tier = 'free' | 'pro' | 'bundle';
export const FREE_MEETINGS = BASELINE.freeMeetingsPerSemester; // 体验版每学期几次纪要
export const PRO_RECORD_SECONDS = BASELINE.recordedHours * 3600; // 专业版（含多组包）每组每学期录音转写额度
export const TIER_LABEL: Record<Tier, string> = { free: '体验版', pro: '专业版', bundle: '专业版（多组包）' };

export interface Plan { courseId: string; tier: Tier; payerId: string | null; split: 'single' | 'aa'; startedAt: string | null }

export function getPlan(courseId: string): Plan {
  const r = db.select().from(schema.coursePlans).where(eq(schema.coursePlans.courseId, courseId)).get();
  return r ? { courseId, tier: r.tier as Tier, payerId: r.payerId, split: r.split as 'single' | 'aa', startedAt: r.startedAt } : { courseId, tier: 'free', payerId: null, split: 'single', startedAt: null };
}

export function meetingsUsed(courseId: string): number {
  return db.select().from(schema.meetings).where(eq(schema.meetings.courseId, courseId)).all().length;
}

// 这门课本学期已用的录音转写秒数（按 usage_log 里挂在这门课会议上的 ASR 记录）
export function recordSecondsUsed(courseId: string): number {
  const ids = new Set(db.select().from(schema.meetings).where(eq(schema.meetings.courseId, courseId)).all().map((m) => m.id));
  return db.select().from(schema.usageLog).all().filter((l) => l.feature === 'asr' && l.meetingId && ids.has(l.meetingId)).reduce((a, l) => a + (l.audioSeconds ?? 0), 0);
}

// 纯函数，方便单测
export function canAddMeeting(tier: Tier, used: number): { ok: true } | { ok: false; reason: string } {
  if (tier !== 'free' || used < FREE_MEETINGS) return { ok: true };
  return { ok: false, reason: `体验版每学期 ${FREE_MEETINGS} 次纪要，已经用完。组里任何人开通专业版（9.9 元，可 AA）就能继续` };
}
export function canRecord(tier: Tier, usedSeconds: number, addSeconds: number): { ok: true } | { ok: false; reason: string } {
  if (tier === 'free') return { ok: false, reason: '体验版不含录音转写，可以粘贴腾讯会议 / 飞书的文字稿或从钉钉导入' };
  if (usedSeconds + addSeconds > PRO_RECORD_SECONDS) return { ok: false, reason: `这支小组本学期 ${PRO_RECORD_SECONDS / 3600} 小时录音转写额度用完了，可以改用导入文字稿` };
  return { ok: true };
}

export function setPlan(p: Plan) {
  const existing = db.select().from(schema.coursePlans).where(eq(schema.coursePlans.courseId, p.courseId)).get();
  const row = { tier: p.tier, payerId: p.payerId, split: p.split, startedAt: p.startedAt };
  if (existing) db.update(schema.coursePlans).set(row).where(eq(schema.coursePlans.courseId, p.courseId)).run();
  else db.insert(schema.coursePlans).values({ courseId: p.courseId, ...row }).run();
}

// 给页面用的一句话额度说明：体验版还剩几次、专业版录音还剩多少
export function quotaNote(courseId: string): string {
  const p = getPlan(courseId);
  if (p.tier === 'free') {
    const left = Math.max(0, FREE_MEETINGS - meetingsUsed(courseId));
    return left > 0 ? `体验版：本学期还能整理 ${left} 次纪要，不含录音转写` : '体验版：本学期纪要次数用完了，组里任何人开通专业版（9.9 元，可 AA）就能继续';
  }
  const leftMin = Math.max(0, Math.round((PRO_RECORD_SECONDS - recordSecondsUsed(courseId)) / 60));
  return `${TIER_LABEL[p.tier]}：纪要不限次，录音转写还剩 ${leftMin} 分钟`;
}
