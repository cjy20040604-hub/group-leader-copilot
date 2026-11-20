import { db, schema } from '@/lib/db/client';
import { getDemoNowISO } from '@/lib/time';
import { getCurrentUser } from '@/lib/auth';
import { Card, Badge } from '@/components/ui';
import { TimeTravel, ResetDemo } from '@/components/time-travel';
import { CourseManager } from '@/components/course-manager';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const members = db.select().from(schema.members).all();
  const courses = db.select().from(schema.courses).all();
  const user = getCurrentUser();
  const demoNow = getDemoNowISO();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">设置</h1>

      <section aria-label="课程与小组">
        <h2 className="mb-2 text-sm font-semibold">📚 课程/小组（不限于演示的 3 门课，可自建）</h2>
        <CourseManager courses={courses} isLeader={user.role === 'leader'} />
      </section>

      <section aria-label="花名册">
        <h2 className="mb-2 text-sm font-semibold">👥 花名册（人名模糊匹配用）</h2>
        <Card className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="p-2">成员</th><th className="p-2">角色</th><th className="p-2">别名（转写里的称呼）</th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-slate-100">
                  <td className="p-2 font-medium">{m.name}{m.id === user.id && <Badge tone="blue" className="ml-1">当前身份</Badge>}</td>
                  <td className="p-2">{m.role === 'leader' ? '组长' : '组员'}</td>
                  <td className="p-2 text-slate-500">{(JSON.parse(m.aliasesJson) as string[]).join('、')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="mt-1 text-xs text-slate-400">身份切换在顶部导航栏下拉框。组员只能看自己的任务、改状态、填一句进度（确定性权限代码，无账号体系）。</p>
      </section>

      <section aria-label="提醒与风险规则">
        <h2 className="mb-2 text-sm font-semibold">⏰ 提醒规则 & 风险灯（全部确定性代码）</h2>
        <Card className="p-4 text-xs leading-relaxed text-slate-600">
          <p>提醒：D-3、D-1、过期第一天各生成一条站内通知 + 可复制催办文案，文案按触发那天写；改 DDL 会重建提醒。Demo 用页面每 60 秒轮询一次代替服务端定时任务，时间快进、确认纪要、改任务后立即补扫。</p>
          <p className="mt-1">催办模板：「@负责人 课程 的「任务」{`{due_text}`}截止，目前状态：{`{status}`}，需要帮忙吗？」</p>
          <p className="mt-2">🔴 红：已过 DDL 未完成；或距 DDL ≤ 1 天且状态不是 待审核/已完成</p>
          <p>🟡 黄：距 DDL ≤ 3 天且 48 小时内没更新；或负责人待认领</p>
          <p>🟢 绿：其他</p>
        </Card>
      </section>

      <TimeTravel demoNow={demoNow} />

      <section aria-label="重置">
        <h2 className="mb-2 text-sm font-semibold">♻️ 演示数据</h2>
        <ResetDemo />
        <p className="mt-1 text-xs text-slate-400">和命令行 npm run seed 跑的是同一段代码：重建 SQLite 单文件数据库并重新生成种子。</p>
      </section>
    </div>
  );
}