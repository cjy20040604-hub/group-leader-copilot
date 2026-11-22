import { notFound } from 'next/navigation';
import { eq, desc } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth';
import { getDemoNowISO } from '@/lib/time';
import { CourseTabs } from '@/components/course-tabs';
import { roleIn, courseRoster } from '@/lib/membership';

export const dynamic = 'force-dynamic';

export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const course = db.select().from(schema.courses).where(eq(schema.courses.id, courseId)).get();
  if (!course) notFound();

  const meetings = db.select().from(schema.meetings).where(eq(schema.meetings.courseId, courseId)).orderBy(desc(schema.meetings.date)).all();
  const tasks = db.select().from(schema.tasks).where(eq(schema.tasks.courseId, courseId)).all();
  const user = getCurrentUser();
  const role = roleIn(user.id, courseId);
  // 不在这个小组：看不到它的纪要和任务（不同课的组员可以不一样）
  if (!role) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-lg font-medium text-slate-900">你不在「{course.name}」这个小组</p>
        <p className="mt-2 text-sm text-slate-500">请这个小组的组长在设置里把你加进来。</p>
      </div>
    );
  }
  const members = courseRoster(courseId);

  return (
    <CourseTabs
      course={course}
      meetings={meetings.map((m) => ({ id: m.id, date: m.date, title: m.title }))}
      tasks={tasks}
      members={members.map((m) => ({ id: m.id, name: m.name, role: m.role }))}
      currentUserId={user.id}
      isLeader={role === 'leader'}
      demoNow={getDemoNowISO()}
    />
  );
}