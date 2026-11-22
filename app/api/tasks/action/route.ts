import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth';
import { roleIn } from '@/lib/membership';
import { recordTaskAction } from '@/lib/task-updates';
import type { TaskAction } from '@/lib/task-flow';

// 组员一键更新 / 组长处理例外：规则在 lib/task-flow.ts（纯函数），这里只做落库
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.taskId || !body.action?.type) return NextResponse.json({ error: '缺少 taskId 或 action' }, { status: 400 });
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, String(body.taskId))).get();
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 });
  const user = getCurrentUser();
  // 角色按这门课算：同一个人在 A 课是组长、在 B 课是组员
  const res = await recordTaskAction(task.id, { id: user.id, role: roleIn(user.id, task.courseId) ?? 'member' }, body.action as TaskAction);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.code });
  return NextResponse.json({ ok: true });
}
