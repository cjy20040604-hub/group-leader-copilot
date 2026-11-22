import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { Card, Badge, EmptyState } from '@/components/ui';
import { TranscriptViewer } from '@/components/transcript-viewer';
import { STATUS_LABEL, type TaskStatus } from '@/lib/risk';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = { decision: '决议', action: '待办', open_question: '待定', disagreement: '分歧', topic_summary: '议题' };

export default async function MeetingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ hl?: string }> }) {
  const { id } = await params;
  const { hl } = await searchParams;
  const meeting = db.select().from(schema.meetings).where(eq(schema.meetings.id, id)).get();
  if (!meeting) notFound();

  const course = db.select().from(schema.courses).where(eq(schema.courses.id, meeting.courseId)).get();
  const mems = db.select().from(schema.memoryItems).where(eq(schema.memoryItems.meetingId, id)).all();
  const tasks = db.select().from(schema.tasks).where(eq(schema.tasks.meetingId, id)).all();
  const members = db.select().from(schema.members).all();
  const nameOf = (mid: string | null) => members.find((m) => m.id === mid)?.name ?? '待认领';
  const evidences = mems.map((m) => m.evidence).filter((e): e is string => !!e);
  const decisions = mems.filter((m) => m.type === 'decision');
  const questions = mems.filter((m) => m.type === 'open_question');
  const disagreements = mems.filter((m) => m.type === 'disagreement');

  return (
    <div className="space-y-10">
      <div>
      <div className="mb-2 flex items-center gap-3 text-sm">
        <Link href={`/app/c/${meeting.courseId}`} className="text-slate-500 hover:text-slate-900">{course?.name}</Link>
        <span className="tabular-nums text-slate-400">{meeting.date}</span>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">{meeting.title}</h1>
      </div>

      <section aria-label="决议">
        <h2 className="mb-2 text-[15px] font-semibold text-slate-900">决议</h2>
        {decisions.length === 0 ? <EmptyState title="本场无决议" /> : (
          <div className="space-y-2">
            {decisions.map((d) => (
              <Card key={d.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[15px] font-medium text-slate-900">{d.text}</p>
                  {d.status === 'superseded' && <Badge tone="slate">已被推翻 → {d.supersededBy}</Badge>}
                </div>
                {d.evidence && <p className="mt-1.5 text-xs text-slate-500">原话：「{d.evidence}」</p>}
              </Card>
            ))}
          </div>
        )}
      </section>

      <section aria-label="待办">
        <h2 className="mb-2 text-[15px] font-semibold text-slate-900">本场产生的任务</h2>
        {tasks.length === 0 ? <EmptyState title="本场无待办" /> : (
          <Card className="divide-y divide-slate-100">
            {tasks.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="text-slate-900">{t.title}</span>
                <span className="text-xs tabular-nums text-slate-500">{nameOf(t.ownerId)}，{t.dueDate ?? '日期待定'}，{STATUS_LABEL[t.status as TaskStatus]}</span>
              </div>
            ))}
          </Card>
        )}
      </section>

      {disagreements.length > 0 && (
        <section aria-label="分歧">
          <h2 className="mb-2 text-[15px] font-semibold text-slate-900">分歧（未达成一致）</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
            {disagreements.map((d) => <li key={d.id}>{d.text.replace(/^分歧/, '')}</li>)}
          </ul>
        </section>
      )}

      {questions.length > 0 && (
        <section aria-label="待定问题">
          <h2 className="mb-2 text-[15px] font-semibold text-slate-900">待定问题</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
            {questions.map((q) => <li key={q.id}>{q.text}</li>)}
          </ul>
        </section>
      )}

      <section aria-label="会议转写原文">
        <h2 className="mb-2 text-[15px] font-semibold text-slate-900">转写原文<span className="ml-2 text-xs font-normal text-slate-400">高亮的是决议、待办的原话</span></h2>
        <TranscriptViewer transcript={meeting.transcript} evidences={evidences} highlight={hl} />
      </section>

      <section aria-label="全部记忆条目">
        <h2 className="mb-2 text-[15px] font-semibold text-slate-900">记忆条目</h2>
        <div className="flex flex-wrap gap-1">
          {mems.map((m) => (
            <Badge key={m.id} tone={m.status === 'superseded' ? 'slate' : m.type === 'decision' ? 'blue' : 'green'}>
              [{TYPE_LABEL[m.type] ?? m.type}] {m.text.slice(0, 24)}{m.text.length > 24 ? '…' : ''}
            </Badge>
          ))}
        </div>
      </section>
    </div>
  );
}