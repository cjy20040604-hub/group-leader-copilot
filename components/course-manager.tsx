'use client';

import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui';
import { NewCourseForm } from '@/components/course-picker';

interface Props {
  courses: { id: string; name: string; color: string }[];
  people: { id: string; name: string }[];
}

// 你所在的小组 + 新建小组（谁都能建，建的人是这个组的组长）
export function CourseManager({ courses, people }: Props) {
  const router = useRouter();
  return (
    <Card className="space-y-4 p-5">
      <ul className="flex flex-wrap gap-2 text-xs">
        {courses.map((c) => (
          <li key={c.id} className="flex items-center gap-1.5 rounded-md bg-slate-50 px-2.5 py-1 text-slate-700 ring-1 ring-inset ring-slate-200">
            <span className="h-2 w-2 rounded-full" style={{ background: c.color }} aria-hidden />
            {c.name}
          </li>
        ))}
        {courses.length === 0 && <li className="text-slate-400">你还不在任何小组里</li>}
      </ul>
      <NewCourseForm autoFocus={false} people={people} onCreated={() => router.refresh()} />
    </Card>
  );
}
