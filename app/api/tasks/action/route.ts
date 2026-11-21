import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { recordTaskAction } from '@/lib/task-updates';
import type { TaskAction } from '@/lib/task-flow';

// 组员一键更新 / 组长处理例外：规则在 lib/task-flow.ts（纯函数），这里只做落库
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.taskId || !body.action?.type) return NextResponse.json({ error: '缺少 taskId 或 action' }, { status: 400 });
  const res = await recordTaskAction(String(body.taskId), getCurrentUser(), body.action as TaskAction);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.code });
  return NextResponse.json({ ok: true });
}
