import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { roleIn, ledCourseIds } from '@/lib/membership';
import { setPlan } from '@/lib/plans';
import { getDemoNowISO } from '@/lib/time';

// 开通 / 取消套餐（演示，不扣款）。付款人可以是组里任何人，也可以 AA；确认决定、审批延期仍是组长的事
export async function POST(req: NextRequest) {
  const user = getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const now = getDemoNowISO();

  // 多组包：一个人当组长的全部小组一起升级（最多 4 个）
  if (body.bundle) {
    const led = ledCourseIds(user.id);
    if (!led.length) return NextResponse.json({ error: '多组包给同时带几个组的组长；你现在没有当组长的小组' }, { status: 400 });
    if (led.length > 4) return NextResponse.json({ error: '多组包最多覆盖 4 个小组' }, { status: 400 });
    for (const c of led) setPlan({ courseId: c, tier: 'bundle', payerId: user.id, split: 'single', startedAt: now });
    return NextResponse.json({ ok: true, courses: led.length });
  }

  const courseId = String(body.courseId ?? '');
  if (!roleIn(user.id, courseId)) return NextResponse.json({ error: '你不在这个小组，不能替它开通' }, { status: 403 });
  if (body.tier === 'free') {
    setPlan({ courseId, tier: 'free', payerId: null, split: 'single', startedAt: null });
    return NextResponse.json({ ok: true });
  }
  if (body.tier !== 'pro') return NextResponse.json({ error: '只能开通专业版或改回体验版' }, { status: 400 });
  setPlan({ courseId, tier: 'pro', payerId: user.id, split: body.split === 'aa' ? 'aa' : 'single', startedAt: now });
  return NextResponse.json({ ok: true });
}
