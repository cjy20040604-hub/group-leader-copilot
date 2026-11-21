// 钉钉视频会议「云录制（闪记）」转写文本 → 本产品的转写格式（纯函数，可单测）
// 接口：GET https://api.dingtalk.com/v1.0/conference/videoConferences/{conferenceId}/cloudRecords/getTexts
// 文档：https://open.dingtalk.com/document/development/queries-the-text-information-about-cloud-recording（2026-06-02 更新）
// 响应字段按文档：hasMore + paragraphList[{ unionId, nickName, recordId, startTime, endTime, paragraph, sentenceList, nextTtoken }]
// ⚠️ 文档示例里分页字段拼成了 nextTtoken，请求参数叫 nextToken；两种拼法都认，真实接口未联调

import { matchOwnerDetailed, type RosterMember } from '@/lib/roster';
import { clock, type ScriptLine } from '@/lib/live/cues';

export interface DingSentence { unionId?: string; sentence: string; startTime: number; endTime: number }
export interface DingParagraph {
  unionId?: string;
  nickName?: string;
  recordId?: number | string;
  status?: number;
  startTime: number; // 毫秒，从录制开始算
  endTime: number;
  paragraph: string;
  sentenceList?: DingSentence[];
  nextToken?: number | string;
  nextTtoken?: number | string;
}
export interface DingCloudTextsPage { hasMore?: boolean; paragraphList?: DingParagraph[] }

export function nextTokenOf(page: DingCloudTextsPage): string | null {
  const last = page.paragraphList?.[page.paragraphList.length - 1];
  const token = last?.nextToken ?? last?.nextTtoken;
  return page.hasMore && token !== undefined && token !== null ? String(token) : null;
}

export interface ConvertResult {
  transcript: string;
  paragraphs: number;
  speakers: { nickName: string; mappedTo: string | null; how: string }[];
  seconds: number;
}

// 钉钉昵称 → 花名册姓名（完全 / 别名 / 包含 / 差一个字）；对不上就保留钉钉昵称，组长在确认页再改
export function paragraphsToTranscript(paragraphs: DingParagraph[], roster: RosterMember[]): ConvertResult {
  const list = paragraphs
    .filter((p) => p.paragraph && p.paragraph.trim())
    .sort((a, b) => a.startTime - b.startTime);
  const names = new Map<string, { mappedTo: string | null; how: string }>();
  const nameOf = (p: DingParagraph) => {
    const nick = (p.nickName ?? '').trim() || '发言人';
    if (!names.has(nick)) {
      const m = matchOwnerDetailed(nick, roster);
      const member = m.id ? roster.find((r) => r.id === m.id) : undefined;
      names.set(nick, { mappedTo: member?.name ?? null, how: m.how });
    }
    return names.get(nick)!.mappedTo ?? nick;
  };
  const out: string[] = [];
  let lastMark = -Infinity;
  for (const p of list) {
    const sec = Math.floor(p.startTime / 1000);
    if (sec - lastMark >= 300) { out.push(`[${clock(sec)}]`); lastMark = sec; }
    out.push(`${nameOf(p)}：${p.paragraph.trim().replace(/\s*\n\s*/g, ' ')}`);
  }
  const last = list[list.length - 1];
  return {
    transcript: out.join('\n'),
    paragraphs: list.length,
    speakers: [...names.entries()].map(([nickName, v]) => ({ nickName, ...v })),
    seconds: last ? Math.round(last.endTime / 1000) : 0,
  };
}

// 演示数据：没配钉钉应用时，把演示录音按文档里的响应格式包装成一页 getTexts 结果
// 昵称故意用钉钉里常见的叫法（如「小雨同学」「杰哥」），顺便演示花名册别名匹配
const DEMO_NICK: Record<string, string> = { 林晓: '林晓', 小雨: '小雨同学', 阿杰: '杰哥', 浩然: '然哥', 思琪: '思琪' };

export function demoCloudTexts(script: ScriptLine[]): DingCloudTextsPage {
  return {
    hasMore: false,
    paragraphList: script.map((l, i) => {
      const startTime = l.at * 1000;
      const endTime = startTime + Math.max(2, Math.round(l.text.length / 4)) * 1000;
      const unionId = `demoUnion-${l.speaker ?? 'x'}`;
      return {
        unionId, nickName: DEMO_NICK[l.speaker ?? ''] ?? l.speaker ?? '发言人', recordId: 1000 + i, status: 1,
        startTime, endTime, paragraph: l.text,
        sentenceList: [{ unionId, sentence: l.text, startTime, endTime }],
        nextTtoken: startTime * 1000,
      };
    }),
  };
}
