import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { recordTaskAction } from '@/lib/task-updates';
import { getDemoNowISO } from '@/lib/time';
import type { TaskAction } from '@/lib/task-flow';

// 提醒闭环：组员点提醒里的链接直接回复，回复会变成任务动态，组长那边立刻看到
// 演示里「链接即身份」（以任务负责人的身份操作）；正式版要用微信 / 钉钉登录确认是本人
const LABEL: Record<string, string> = { progress: '在做，能按时交', submit: '做完了', block: '卡住了', request_extension: '申请延期' };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const reminder = db.select().from(schema.reminders).where(eq(schema.reminders.id, String(body.reminderId ?? ''))).get();
  if (!reminder) return NextResponse.json({ error: '提醒不存在或已过期' }, { status: 404 });
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, reminder.taskId)).get();
  if (!task) return NextResponse.json({ error: '任务已删除' }, { status: 404 });
  if (!task.ownerId) return NextResponse.json({ error: '这个任务还没人认领，去「任务与回顾」认领' }, { status: 409 });
  const owner = db.select().from(schema.members).where(eq(schema.members.id, task.ownerId)).get();
  if (!owner) return NextResponse.json({ error: '负责人不在花名册里' }, { status: 409 });
  const action = body.action as TaskAction;
  if (!action?.type || !(action.type in LABEL)) return NextResponse.json({ error: '不支持的回复' }, { status: 400 });

  const res = await recordTaskAction(task.id, { id: owner.id, role: owner.role as 'leader' | 'member' }, action);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.code });
  const detail = action.type === 'request_extension' ? `${LABEL[action.type]}到 ${action.proposedDue}` : action.type === 'block' ? `${LABEL.block}：${action.reason}` : LABEL[action.type];
  db.update(schema.reminders).set({ respondedAt: getDemoNowISO(), response: detail }).where(eq(schema.reminders.id, reminder.id)).run();
  return NextResponse.json({ ok: true, response: detail });
}
