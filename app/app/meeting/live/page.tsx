import fs from 'node:fs';
import path from 'node:path';
import { db, schema } from '@/lib/db/client';
import { getDemoNow, toLocalISO, dateOnly, getSetting } from '@/lib/time';
import { isMock, asrModelName } from '@/lib/llm';
import { courseReview } from '@/lib/review';
import { parseScript } from '@/lib/live/cues';
import { LiveMeeting } from '@/components/live-meeting';
import { getCurrentUser } from '@/lib/auth';
import { ledCourseIds, rosterByCourse } from '@/lib/membership';

export const dynamic = 'force-dynamic';

// 演示录音只有一段：市场营销学的新会议（seed/new_meeting.txt）
const DEMO_COURSE = 'mkt';

export default async function LiveMeetingPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const { course } = await searchParams;
  const now = getDemoNow();
  // 开会、整理纪要由这门课的组长发起：下拉只列你当组长的小组；发言人名单按所选课程切换
  const user = getCurrentUser();
  const ledIds = ledCourseIds(user.id);
  const courses = db.select().from(schema.courses).all().filter((c) => ledIds.includes(c.id));
  const rosters = rosterByCourse();
  const initialCourse = courses.find((c) => c.id === course)?.id ?? (courses.some((c) => c.id === DEMO_COURSE) ? DEMO_COURSE : courses[0]?.id ?? DEMO_COURSE);
  const people = db.select().from(schema.members).all().filter((m) => m.id !== user.id).map((m) => ({ id: m.id, name: m.name }));
  const script = parseScript(fs.readFileSync(path.join(process.cwd(), 'seed/new_meeting.txt'), 'utf8'));

  return (
    <LiveMeeting
      courses={courses.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
      rosters={Object.fromEntries(Object.entries(rosters).map(([k, v]) => [k, v.map((m) => ({ id: m.id, name: m.name }))]))}
      people={people}
      initialCourse={initialCourse}
      today={dateOnly(toLocalISO(now))}
      mock={isMock()}
      asrModel={asrModelName()}
      autoRecord={getSetting('auto_record') !== 'false'}
      demoCourse={DEMO_COURSE}
      script={script}
      canCreateCourse
      carry={Object.fromEntries(courses.map((c) => {
        const r = courseReview(c.id, now);
        return [c.id, { lastMeeting: r.lastMeeting?.date ?? null, items: r.carry }];
      }))}
    />
  );
}
