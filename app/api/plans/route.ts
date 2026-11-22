import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { roleIn, ledCourseIds } from '@/lib/membership';
import { setPlan, addAddon, getPlan } from '@/lib/plans';
import { getDemoNowISO } from '@/lib/time';

// 开通 / 改档 / 加购（演示，不扣款）。付款人可以是组里任何人，也可以 AA；确认决定、审批延期仍是组长的事
// 档位：纪要版（只管纪要）/ 专业版（多 8 小时实时转写）/ 多组包（组长带的全部小组都开纪要版）；加时包哪档都能买
export async function POST(req: NextRequest) {
  const user = getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const now = getDemoNowISO();

  // 多组包：一个人当组长的全部小组一起开纪要版（最多 4 个）；已经是专业版的组保持专业版
  if (body.bundle) {
    const led = ledCourseIds(user.id);
    if (led.length < 2) return NextResponse.json({ error: '多组包给同时带两个以上小组的组长' }, { status: 400 });
    if (led.length > 4) return NextResponse.json({ error: '多组包最多覆盖 4 个小组' }, { status: 400 });
    for (const c of led) if (getPlan(c).tier !== 'pro') setPlan({ courseId: c, tier: 'bundle', payerId: user.id, split: 'single', startedAt: now });
    return NextResponse.json({ ok: true, courses: led.length });
  }

  const courseId = String(body.courseId ?? '');
  if (!roleIn(user.id, courseId)) return NextResponse.json({ error: '你不在这个小组，不能替它开通' }, { status: 403 });
  if (body.addon) {
    addAddon(courseId);
    return NextResponse.json({ ok: true });
  }
  if (body.tier === 'free') {
    setPlan({ courseId, tier: 'free', payerId: null, split: 'single', startedAt: null });
    return NextResponse.json({ ok: true });
  }
  if (body.tier !== 'notes' && body.tier !== 'pro') return NextResponse.json({ error: '只能开通纪要版、专业版或改回体验版' }, { status: 400 });
  setPlan({ courseId, tier: body.tier, payerId: user.id, split: body.split === 'aa' ? 'aa' : 'single', startedAt: now });
  return NextResponse.json({ ok: true });
}
