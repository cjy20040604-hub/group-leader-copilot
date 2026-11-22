import { db, schema } from '@/lib/db/client';
import { CourseAsk } from '@/components/course-ask';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function AskPage() {
  const courses = db.select().from(schema.courses).all();
  return (
    <div className="space-y-6">
      <PageHeader title="问问上次" lede="先选课程再提问。每句回答都带出处；记录里没有就直说，课程之间不串。" />
      <CourseAsk courses={courses.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}