import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { visibleReminders } from '@/lib/reminders';

// 当前身份能看到的提醒（最新 10 条），给浏览器通知和站内弹窗比对「有没有新的」
export async function GET() {
  const user = getCurrentUser();
  const items = visibleReminders(user).slice(0, 10).map((r) => ({ id: r.id, taskId: r.taskId, kind: r.kind, fireDate: r.fireDate, message: r.message }));
  return NextResponse.json({ userId: user.id, items });
}
