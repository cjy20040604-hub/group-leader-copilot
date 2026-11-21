import { db, schema } from '@/lib/db/client';
import { getDemoNow, dateOnly, toLocalISO, getSetting } from '@/lib/time';
import { PipelineWizard, type LiveDraft } from '@/components/pipeline-wizard';

export const dynamic = 'force-dynamic';

export default async function NewMeetingPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const courses = db.select().from(schema.courses).all();
  const members = db.select().from(schema.members).all();
  // 会议室结束时把转写存成 live_draft；整理（process）成功后清掉
  let live: LiveDraft | null = null;
  if (from === 'live') {
    try {
      const d = JSON.parse(getSetting('live_draft') ?? 'null') as LiveDraft | null;
      if (d && courses.some((c) => c.id === d.courseId) && d.transcript) live = d;
    } catch { live = null; }
  }
  return (
    <PipelineWizard
      courses={courses.map((c) => ({ id: c.id, name: c.name }))}
      members={members.map((m) => ({ id: m.id, name: m.name }))}
      defaultDate={dateOnly(toLocalISO(getDemoNow()))}
      live={live}
    />
  );
}
