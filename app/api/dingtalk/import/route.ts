import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { dingtalkConfigured, fetchCloudTexts } from '@/lib/dingtalk/client';
import { demoCloudTexts, paragraphsToTranscript } from '@/lib/dingtalk/cloud-texts';
import { parseScript } from '@/lib/live/cues';
import type { RosterMember } from '@/lib/roster';

// 从钉钉视频会议的云录制（闪记）导入转写：拉文本 → 按发言人拼成转写 → 交给纪要流水线
// 没配钉钉应用（DINGTALK_APP_KEY / SECRET）：返回按官方响应格式构造的演示数据，标「演示模拟」
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const conferenceId = String(body.conferenceId ?? '').trim();
  const unionId = String(body.unionId ?? '').trim() || process.env.DINGTALK_UNION_ID || undefined;
  if (!conferenceId) return NextResponse.json({ error: '请填钉钉视频会议的 conferenceId' }, { status: 400 });

  const roster: RosterMember[] = db.select().from(schema.members).all()
    .map((m) => ({ id: m.id, name: m.name, aliases: JSON.parse(m.aliasesJson) as string[] }));
  const live = dingtalkConfigured();
  try {
    const paragraphs = live
      ? await fetchCloudTexts(conferenceId, unionId)
      : demoCloudTexts(parseScript(fs.readFileSync(path.join(process.cwd(), 'seed/new_meeting.txt'), 'utf8'))).paragraphList ?? [];
    if (paragraphs.length === 0) return NextResponse.json({ error: '这场会的云录制里还没有文字（没人发言，或转写还没生成）' }, { status: 404 });
    const r = paragraphsToTranscript(paragraphs, roster);
    return NextResponse.json({ ...r, simulated: !live, suggestedCourse: live ? null : 'mkt' });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
