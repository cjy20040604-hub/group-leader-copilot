import { db, schema } from '@/lib/db/client';
import { CourseAsk } from '@/components/course-ask';

export const dynamic = 'force-dynamic';

export default function AskPage() {
  const courses = db.select().from(schema.courses).all();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">问问上次 · 跨课程问答</h1>
      <p className="text-sm text-slate-500">必须先选课程 —— 检索按 course_id 硬过滤，课程之间绝不串台。</p>
      <CourseAsk courses={courses.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}