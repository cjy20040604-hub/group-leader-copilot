import { notFound } from 'next/navigation';
import { eq, desc } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth';
import { getDemoNowISO } from '@/lib/time';
import { CourseTabs } from '@/components/course-tabs';

export const dynamic = 'force-dynamic';

export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const course = db.select().from(schema.courses).where(eq(schema.courses.id, courseId)).get();
  if (!course) notFound();

  const meetings = db.select().from(schema.meetings).where(eq(schema.meetings.courseId, courseId)).orderBy(desc(schema.meetings.date)).all();
  const tasks = db.select().from(schema.tasks).where(eq(schema.tasks.courseId, courseId)).all();
  const members = db.select().from(schema.members).all();
  const user = getCurrentUser();

  return (
    <CourseTabs
      course={course}
      meetings={meetings.map((m) => ({ id: m.id, date: m.date, title: m.title }))}
      tasks={tasks}
      members={members.map((m) => ({ id: m.id, name: m.name, role: m.role }))}
      currentUserId={user.id}
      isLeader={user.role === 'leader'}
      demoNow={getDemoNowISO()}
    />
  );
}