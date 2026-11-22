import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { canLead } from '@/lib/auth';
import { setMembership, type CourseRole } from '@/lib/membership';
import { scanReminders } from '@/lib/reminders';

// 小组成员：把某人加进 / 移出某门课，或改 TA 在这门课的角色。只有这门课的组长能改；确定性代码，不调 LLM
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const courseId = String(body.courseId ?? '');
  const memberId = String(body.memberId ?? '');
  const role = body.role === null ? null : (['leader', 'member'].includes(body.role) ? body.role as CourseRole : undefined);
  if (role === undefined) return NextResponse.json({ error: '角色只能是组长、组员，或移出小组' }, { status: 400 });
  if (!db.select().from(schema.courses).where(eq(schema.courses.id, courseId)).get()) return NextResponse.json({ error: '课程不存在' }, { status: 404 });
  if (!db.select().from(schema.members).where(eq(schema.members.id, memberId)).get()) return NextResponse.json({ error: '成员不存在' }, { status: 404 });
  if (!canLead(courseId)) return NextResponse.json({ error: '只有这个小组的组长能改组员' }, { status: 403 });
  if (role === null) {
    const owned = db.select().from(schema.tasks).where(eq(schema.tasks.courseId, courseId)).all().filter((t) => t.ownerId === memberId && t.status !== 'done');
    if (owned.length) return NextResponse.json({ error: `TA 在这门课还有 ${owned.length} 个没做完的任务，先改派再移出` }, { status: 409 });
  }
  const res = setMembership(courseId, memberId, role);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  scanReminders();
  return NextResponse.json({ ok: true });
}
