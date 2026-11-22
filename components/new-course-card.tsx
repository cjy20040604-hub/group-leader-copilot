'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui';
import { PlusIcon } from '@/components/icons';
import { NewCourseForm } from '@/components/course-picker';

// 首页「我的课程」末尾的新建卡片（只给组长看）
export function NewCourseCard({ people = [] }: { people?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-xl border border-dashed border-slate-300 p-4 text-left text-slate-500 transition-colors hover:border-brand-500 hover:text-brand-700">
        <p className="flex items-center gap-1.5 font-medium"><PlusIcon />新建课程</p>
        <p className="mt-2 text-xs">这学期又多了一门小组作业？加进来一起管</p>
      </button>
    );
  }
  return (
    <Card className="p-4">
      <p className="mb-2 text-sm font-medium">新建课程 / 小组</p>
      <NewCourseForm people={people} onCancel={() => setOpen(false)} onCreated={(c) => { setOpen(false); router.push(`/app/c/${c.id}`); router.refresh(); }} />
    </Card>
  );
}
