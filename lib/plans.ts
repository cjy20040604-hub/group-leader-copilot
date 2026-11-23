// 小组套餐与额度（确定性代码，不调 LLM）。额度和价格数字和成本模型同一份：lib/unit-economics.ts
// 2026-11-22：纪要和录音转写拆开卖。纪要版只管纪要；专业版多 8 小时会议室实时转写；加时包哪档都能买。
// 实时转写额度用完不拦会：照常录音，散会后用录音文件识别整理，或者加购时长
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { NOTES, PRO, BUNDLE, ADDON, BUNDLE_HOURS_PER_GROUP } from '@/lib/unit-economics';
import { ledCourseIds } from '@/lib/membership';

export type Tier = 'free' | 'notes' | 'pro' | 'bundle';
export const FREE_MEETINGS = NOTES.freeMeetingsPerSemester; // 体验版每学期几次纪要
export const PRO_RECORD_SECONDS = PRO.recordedHours * 3600; // 专业版每组每学期实时转写额度
export const FREE_RECORD_SECONDS = NOTES.freeRealtimeMinutes * 60; // 体验版送的实时转写：每位组长一学期一次，他带的几个体验版小组共用（先体验实时字幕再决定付不付）
export const BUNDLE_RECORD_SECONDS = BUNDLE_HOURS_PER_GROUP * 3600; // 多组包里每个小组的实时转写额度
export const ADDON_SECONDS = ADDON.hours * 3600;            // 一个加时包多少秒
export const PRICE = { notes: NOTES.pricePerSemester, pro: PRO.pricePerSemester, bundle: BUNDLE.pricePerSemester, bundleHours: BUNDLE_HOURS_PER_GROUP, addon: ADDON.price, addonHours: ADDON.hours };
export const TIER_LABEL: Record<Tier, string> = { free: '体验版', notes: '纪要版', pro: '专业版', bundle: '多组包' };

export interface Plan { courseId: string; tier: Tier; payerId: string | null; split: 'single' | 'aa'; startedAt: string | null; addonSeconds: number }

export function getPlan(courseId: string): Plan {
  const r = db.select().from(schema.coursePlans).where(eq(schema.coursePlans.courseId, courseId)).get();
  return r
    ? { courseId, tier: r.tier as Tier, payerId: r.payerId, split: r.split as 'single' | 'aa', startedAt: r.startedAt, addonSeconds: r.addonSeconds ?? 0 }
    : { courseId, tier: 'free', payerId: null, split: 'single', startedAt: null, addonSeconds: 0 };
}

export function meetingsUsed(courseId: string): number {
  return db.select().from(schema.meetings).where(eq(schema.meetings.courseId, courseId)).all().length;
}

// 这门课本学期已用的实时转写秒数：挂在这门课会议上的 ASR 记录，加上会议室开过、但还没确认成纪要的场次
// （会议室每场开录时记一条 live_course:<场次> → 课程；确认后会议 id 就是场次 id，用集合去重不会重复算）
export function recordSecondsUsed(courseId: string): number {
  const ids = new Set(db.select().from(schema.meetings).where(eq(schema.meetings.courseId, courseId)).all().map((m) => m.id));
  for (const r of db.select().from(schema.settings).all()) if (r.key.startsWith('live_course:') && r.value === courseId) ids.add(r.key.slice('live_course:'.length));
  return db.select().from(schema.usageLog).all().filter((l) => l.feature === 'asr' && l.meetingId && ids.has(l.meetingId)).reduce((a, l) => a + (l.audioSeconds ?? 0), 0);
}

// 算额度时用的「已用秒数」：体验版按组长算（他当组长的体验版小组加起来），付费档按这支小组算
// 免费送的是单价最贵的实时转写，每个小组都送一次的话，转化率一低每卖一单都亏（见 docs/cost-model.md 3.5 节）
export function realtimeUsedForQuota(courseId: string): number {
  const p = getPlan(courseId);
  if (p.tier !== 'free') return recordSecondsUsed(courseId);
  const leader = db.select().from(schema.courseMembers).all().find((r) => r.courseId === courseId && r.role === 'leader')?.memberId;
  const freeCourses = leader ? ledCourseIds(leader).filter((c) => getPlan(c).tier === 'free') : [courseId];
  return (freeCourses.includes(courseId) ? freeCourses : [...freeCourses, courseId]).reduce((a, c) => a + recordSecondsUsed(c), 0);
}

// 这个档位本学期一共能用多少秒实时转写：专业版 8 小时、多组包每组 2 小时、体验版送 5 分钟（每位组长一次），再加加时包；纪要版只有加时包
export function realtimeQuota(tier: Tier, addonSeconds: number): number {
  const base = { pro: PRO_RECORD_SECONDS, bundle: BUNDLE_RECORD_SECONDS, free: FREE_RECORD_SECONDS, notes: 0 }[tier];
  return base + addonSeconds;
}

// 纯函数，方便单测
export function canAddMeeting(tier: Tier, used: number): { ok: true } | { ok: false; reason: string } {
  if (tier !== 'free' || used < FREE_MEETINGS) return { ok: true };
  return { ok: false, reason: `体验版每学期 ${FREE_MEETINGS} 次纪要，已经用完。组里任何人开通纪要版（${PRICE.notes} 元，可 AA）就能继续` };
}

// 会议室实时转写能不能继续。用完时不是「这场会开不了」：前端改成只在本机录音，散会后整理
export function canRecord(tier: Tier, usedSeconds: number, addSeconds: number, addonSeconds = 0): { ok: true } | { ok: false; reason: string } {
  const quota = realtimeQuota(tier, addonSeconds);
  if (usedSeconds + addSeconds <= quota) return { ok: true };
  if (tier === 'free' && addonSeconds === 0) {
    return { ok: false, reason: `体验版送的 ${FREE_RECORD_SECONDS / 60} 分钟实时转写（每位组长一次，带的几个体验版小组共用）用完了。会照常录在本机，散会后可以下载录音；开通专业版（${PRICE.pro} 元，含 ${PRO_RECORD_SECONDS / 3600} 小时实时转写）就能继续` };
  }
  if (quota === 0) {
    return { ok: false, reason: `${TIER_LABEL[tier]}不含会议室实时转写。会照常录在本机，散会后可以下载录音；也可以粘贴腾讯会议 / 飞书文字稿、从钉钉导入，或加购实时转写 ${PRICE.addonHours} 小时 ${PRICE.addon} 元` };
  }
  return { ok: false, reason: `这支小组本学期 ${Math.round(quota / 3600)} 小时实时转写用完了。会照常录音，散会后用录音文件识别整理（不另收费，只是没有实时字幕和撞车提示）；要继续实时转写可以加购 ${PRICE.addonHours} 小时 ${PRICE.addon} 元` };
}

export function setPlan(p: Omit<Plan, 'addonSeconds'> & { addonSeconds?: number }) {
  const existing = db.select().from(schema.coursePlans).where(eq(schema.coursePlans.courseId, p.courseId)).get();
  const row = { tier: p.tier, payerId: p.payerId, split: p.split, startedAt: p.startedAt, addonSeconds: p.addonSeconds ?? existing?.addonSeconds ?? 0 };
  if (existing) db.update(schema.coursePlans).set(row).where(eq(schema.coursePlans.courseId, p.courseId)).run();
  else db.insert(schema.coursePlans).values({ courseId: p.courseId, ...row }).run();
}

// 加购一个加时包（演示，不扣款）。体验版也能买：加时包只管实时转写，纪要次数仍按体验版算
export function addAddon(courseId: string) {
  const p = getPlan(courseId);
  setPlan({ ...p, addonSeconds: p.addonSeconds + ADDON_SECONDS });
}

// 给页面用的一句话额度说明
export function quotaNote(courseId: string): string {
  const p = getPlan(courseId);
  const quota = realtimeQuota(p.tier, p.addonSeconds);
  const leftMin = Math.max(0, Math.round((quota - realtimeUsedForQuota(courseId)) / 60));
  const rt = quota > 0 ? `实时转写还剩 ${leftMin} 分钟` : '不含实时转写';
  if (p.tier === 'free') {
    const left = Math.max(0, FREE_MEETINGS - meetingsUsed(courseId));
    return left > 0 ? `体验版：本学期还能整理 ${left} 次纪要，${rt}` : `体验版：本学期纪要次数用完了，组里任何人开通纪要版（${PRICE.notes} 元，可 AA）就能继续`;
  }
  return `${TIER_LABEL[p.tier]}：纪要不限次，${rt}${quota > 0 && leftMin === 0 ? '（照常录音，散会后整理）' : ''}`;
}
