import { db, schema } from '@/lib/db/client';
import { getDemoNow, dateOnly, toLocalISO } from '@/lib/time';
import { PipelineWizard } from '@/components/pipeline-wizard';

export const dynamic = 'force-dynamic';

export default function NewMeetingPage() {
  const courses = db.select().from(schema.courses).all();
  const members = db.select().from(schema.members).all();
  return (
    <PipelineWizard
      courses={courses.map((c) => ({ id: c.id, name: c.name }))}
      members={members.map((m) => ({ id: m.id, name: m.name }))}
      defaultDate={dateOnly(toLocalISO(getDemoNow()))}
    />
  );
}