import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getDemoNowISO } from '@/lib/time';

// 成功指标事件：只记确定性代码能判断的事（比如「这事定过了」被拦下）
// 同一场会 / 同一条议程重复检查只记一次（议程框失焦和点按钮可能各触发一次）
export function recordMetric(kind: 'dup_blocked', opts: { courseId?: string | null; meetingId?: string | null; detail?: string }) {
  const courseId = opts.courseId ?? null;
  const meetingId = opts.meetingId ?? null;
  const detail = opts.detail ?? null;
  const same = db.select().from(schema.metricEvents).where(and(
    eq(schema.metricEvents.kind, kind),
    courseId ? eq(schema.metricEvents.courseId, courseId) : isNull(schema.metricEvents.courseId),
    meetingId ? eq(schema.metricEvents.meetingId, meetingId) : isNull(schema.metricEvents.meetingId),
    detail ? eq(schema.metricEvents.detail, detail) : isNull(schema.metricEvents.detail),
  )).get();
  if (same) return;
  db.insert(schema.metricEvents).values({ kind, courseId, meetingId, detail, createdAt: getDemoNowISO() }).run();
}
