'use client';

import { useState } from 'react';
import { Select } from '@/components/ui';
import { AskPanel } from '@/components/ask-panel';

export function CourseAsk({ courses }: { courses: { id: string; name: string }[] }) {
  const [courseId, setCourseId] = useState('');
  return (
    <div className="space-y-3">
      <Select value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label="选择课程">
        <option value="">先选课程…</option>
        {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      {courseId ? <AskPanel courseId={courseId} /> : <p className="text-xs text-slate-400">选完课程才能提问</p>}
    </div>
  );
}