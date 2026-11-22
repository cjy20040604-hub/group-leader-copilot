import { db, schema } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth';
import { getDemoNowISO } from '@/lib/time';
import { isMock } from '@/lib/llm';
import { TopNav } from '@/components/top-nav';
import { visibleReminders } from '@/lib/reminders';
import { ledCourseIds } from '@/lib/membership';

export const dynamic = 'force-dynamic';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const members = db.select().from(schema.members).all();
  const user = getCurrentUser();
  const reminderCount = visibleReminders(user).length;

  return (
    <div className="min-h-screen">
      <TopNav
        members={members.map((m) => ({ id: m.id, name: m.name, role: ledCourseIds(m.id).length ? 'leader' : 'member' }))}
        currentUserId={user.id}
        demoNow={getDemoNowISO()}
        mock={isMock()}
        reminderCount={reminderCount}
      />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">{children}</main>
    </div>
  );
}