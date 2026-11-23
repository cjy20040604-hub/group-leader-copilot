import { db, schema } from '@/lib/db/client';
import { getDemoNowISO } from '@/lib/time';
import { getCurrentUser } from '@/lib/auth';
import { Card, PageHeader, SectionTitle, RiskDot } from '@/components/ui';
import { TimeTravel, ResetDemo } from '@/components/time-travel';
import { CourseManager } from '@/components/course-manager';
import { RosterManager } from '@/components/roster-manager';
import { myCourseIds, ledCourseIds } from '@/lib/membership';
import { getPlan, meetingsUsed, realtimeUsedForQuota, realtimeQuota, FREE_MEETINGS, PRO_RECORD_SECONDS, PRICE, TIER_LABEL } from '@/lib/plans';
import { PlanManager, type PlanRow } from '@/components/plan-manager';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const members = db.select().from(schema.members).all();
  const user = getCurrentUser();
  const myIds = myCourseIds(user.id);
  const ledIds = ledCourseIds(user.id);
  const courses = db.select().from(schema.courses).all().filter((c) => myIds.includes(c.id));
  const memberships: Record<string, Record<string, 'leader' | 'member'>> = {};
  for (const r of db.select().from(schema.courseMembers).all()) (memberships[r.courseId] ??= {})[r.memberId] = r.role as 'leader' | 'member';
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? null;
  const planRows: PlanRow[] = courses.map((c) => {
    const p = getPlan(c.id);
    return {
      courseId: c.id, courseName: c.name, color: c.color, tier: p.tier, tierLabel: TIER_LABEL[p.tier],
      payerName: nameOf(p.payerId), split: p.split, groupSize: Object.keys(memberships[c.id] ?? {}).length || 1,
      meetingsUsed: meetingsUsed(c.id), freeMeetings: FREE_MEETINGS,
      recordMinutesUsed: Math.round(realtimeUsedForQuota(c.id) / 60), recordMinutesQuota: realtimeQuota(p.tier, p.addonSeconds) / 60, addonMinutes: p.addonSeconds / 60,
      isLeader: ledIds.includes(c.id),
    };
  });
  const demoNow = getDemoNowISO();

  return (
    <div className="space-y-12">
      <PageHeader title="设置" lede="课程、花名册、提醒规则和演示数据。这里的规则都写在代码里，不调用模型。" />

      <section aria-label="课程与小组">
        <SectionTitle>课程和小组</SectionTitle>
        <CourseManager courses={courses} people={members.filter((m) => m.id !== user.id).map((m) => ({ id: m.id, name: m.name }))} />
      </section>

      <section aria-label="花名册">
        <SectionTitle>花名册</SectionTitle>
        <RosterManager members={members} courses={courses} memberships={memberships} ledCourseIds={ledIds} currentUserId={user.id} />
        <p className="mt-2 text-xs text-slate-400">每门课的小组成员可以不一样，角色也按课算：整理纪要时只和这门课的名单对人名，指派下拉框也只列本组的人。身份在顶栏右侧切换；改名后任务和催办文案里的名字会同步更新。</p>
      </section>

      <section aria-label="套餐与付款">
        <SectionTitle>套餐与付款</SectionTitle>
        <PlanManager rows={planRows} canBundle={ledIds.length > 1} prices={{ ...PRICE, proHours: PRO_RECORD_SECONDS / 3600 }} />
      </section>

      <section aria-label="提醒与风险规则">
        <SectionTitle>提醒规则和风险灯</SectionTitle>
        <Card className="space-y-1 p-5 text-sm leading-relaxed text-slate-600">
          <p>提醒：截止前 3 天、前 1 天和过期当天各发一条，文案按发出那天来写；改了 DDL，提醒会跟着重排。新提醒出现时，页面右下角会弹站内通知，开了浏览器通知还会弹系统通知；组长也能复制带回复链接的催办，发到群里。服务端每 5 分钟检查一次（GitHub Actions 定时任务），没人打开网页也照样生成。下一步打算接钉钉 / 企业微信的群机器人来发。</p>
          <p className="mt-1">催办模板：「@负责人 课程 的「任务」{`{due_text}`}截止，目前状态：{`{status}`}，需要帮忙吗？」</p>
          <p className="flex items-start gap-2 pt-2"><RiskDot level="red" className="mt-1.5" />红：已过 DDL 未完成；或距 DDL ≤ 1 天且状态不是待审核 / 已完成；或组员标了「卡住了」且距 DDL ≤ 3 天</p>
          <p className="flex items-start gap-2"><RiskDot level="yellow" className="mt-1.5" />黄：距 DDL ≤ 3 天且 48 小时内没更新；或负责人待认领；或组员标了「卡住了」</p>
          <p className="flex items-start gap-2"><RiskDot level="green" className="mt-1.5" />绿：其他</p>
        </Card>
      </section>

      <TimeTravel demoNow={demoNow} />

      <section aria-label="重置">
        <SectionTitle>演示数据</SectionTitle>
        <ResetDemo />
        <p className="mt-1 text-xs text-slate-400">和命令行 npm run seed 是同一段代码：重建数据库，恢复初始演示数据，演示时间也回到 11 月 19 日。</p>
      </section>
    </div>
  );
}