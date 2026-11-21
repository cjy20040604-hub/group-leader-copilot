import fs from 'node:fs';
import path from 'node:path';
import { db, schema } from '@/lib/db/client';
import { getDemoNow, toLocalISO, dateOnly, getSetting } from '@/lib/time';
import { isMock, asrModelName } from '@/lib/llm';
import { courseReview } from '@/lib/review';
import { parseScript } from '@/lib/live/cues';
import { LiveMeeting } from '@/components/live-meeting';

export const dynamic = 'force-dynamic';

// 演示录音只有一段：市场营销学的新会议（seed/new_meeting.txt）
const DEMO_COURSE = 'mkt';

export default async function LiveMeetingPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const { course } = await searchParams;
  const now = getDemoNow();
  const courses = db.select().from(schema.courses).all();
  const members = db.select().from(schema.members).all();
  const initialCourse = courses.find((c) => c.id === course)?.id ?? DEMO_COURSE;
  const script = parseScript(fs.readFileSync(path.join(process.cwd(), 'seed/new_meeting.txt'), 'utf8'));

  return (
    <LiveMeeting
      courses={courses.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
      members={members.map((m) => ({ id: m.id, name: m.name }))}
      initialCourse={initialCourse}
      today={dateOnly(toLocalISO(now))}
      mock={isMock()}
      asrModel={asrModelName()}
      autoRecord={getSetting('auto_record') !== 'false'}
      demoCourse={DEMO_COURSE}
      script={script}
      carry={Object.fromEntries(courses.map((c) => {
        const r = courseReview(c.id, now);
        return [c.id, { lastMeeting: r.lastMeeting?.date ?? null, items: r.carry }];
      }))}
    />
  );
}
