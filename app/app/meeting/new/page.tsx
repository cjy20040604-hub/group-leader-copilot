import { db, schema } from '@/lib/db/client';
import { getDemoNow, dateOnly, toLocalISO, getSetting } from '@/lib/time';
import { PipelineWizard, type LiveDraft } from '@/components/pipeline-wizard';
import { getCurrentUser } from '@/lib/auth';
import { ledCourseIds, rosterByCourse } from '@/lib/membership';
import { quotaNote } from '@/lib/plans';

export const dynamic = 'force-dynamic';

export default async function NewMeetingPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  // 整理纪要由这门课的组长确认：下拉只列你当组长的小组；负责人下拉按所选课程的名单切换
  const user = getCurrentUser();
  const ledIds = ledCourseIds(user.id);
  const courses = db.select().from(schema.courses).all().filter((c) => ledIds.includes(c.id));
  const rosters = rosterByCourse();
  const people = db.select().from(schema.members).all().filter((m) => m.id !== user.id).map((m) => ({ id: m.id, name: m.name }));
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
      rosters={Object.fromEntries(Object.entries(rosters).map(([k, v]) => [k, v.map((m) => ({ id: m.id, name: m.name }))]))}
      people={people}
      quotaNotes={Object.fromEntries(courses.map((c) => [c.id, quotaNote(c.id)]))}
      defaultDate={dateOnly(toLocalISO(getDemoNow()))}
      live={live}
      canCreateCourse
    />
  );
}
