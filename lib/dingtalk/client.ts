// 钉钉开放平台调用（服务端）：企业内部应用 accessToken + 查询会议录制中的文本信息
// 需要：钉钉开发者后台创建「企业内部应用」，开通「视频会议信息读权限」，把 AppKey / AppSecret 填进 .env.local
// ⚠️ 没有真实应用凭证，未联调；请求格式按官方文档写

import type { DingCloudTextsPage, DingParagraph } from './cloud-texts';
import { nextTokenOf } from './cloud-texts';

// DINGTALK_API_BASE 只用于本地模拟服务测试，正式环境不用填
const API = process.env.DINGTALK_API_BASE || 'https://api.dingtalk.com';
const MAX_PAGES = 50;

export function dingtalkConfigured(): boolean {
  return Boolean(process.env.DINGTALK_APP_KEY && process.env.DINGTALK_APP_SECRET);
}

let cached: { token: string; expiresAt: number } | null = null;

// 获取企业内部应用的 accessToken：POST /v1.0/oauth2/accessToken { appKey, appSecret } → { accessToken, expireIn }
export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const res = await fetch(`${API}/v1.0/oauth2/accessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appKey: process.env.DINGTALK_APP_KEY, appSecret: process.env.DINGTALK_APP_SECRET }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.accessToken) throw new Error(`获取钉钉 accessToken 失败：${data.message ?? data.code ?? res.status}`);
  cached = { token: data.accessToken, expiresAt: Date.now() + Number(data.expireIn ?? 7200) * 1000 };
  return cached.token;
}

const ERROR_HINT: Record<string, string> = {
  cloudRecordNotFound: '这场会没开云录制（闪记），或者还没人发言',
  orgAccessForbidden: '应用所在组织和这场会不是同一个组织',
  unknownUserError: 'unionId 不对，或这个人不在应用所在组织里',
  permissionError: '应用没开通「视频会议信息读权限」',
  resourceClose: '会议已关闭',
};

// 查询会议录制中的文本信息：按时间正序翻页，最多 50 页 × 2000 条
export async function fetchCloudTexts(conferenceId: string, unionId?: string): Promise<DingParagraph[]> {
  const token = await getAccessToken();
  const all: DingParagraph[] = [];
  let next: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({ direction: '0', maxResults: '2000' });
    if (unionId) q.set('unionId', unionId);
    if (next) q.set('nextToken', next);
    const res = await fetch(`${API}/v1.0/conference/videoConferences/${encodeURIComponent(conferenceId)}/cloudRecords/getTexts?${q}`, {
      headers: { 'x-acs-dingtalk-access-token': token, 'Content-Type': 'application/json' },
    });
    const data = (await res.json().catch(() => ({}))) as DingCloudTextsPage & { code?: string; message?: string };
    if (!res.ok) throw new Error(`钉钉返回 ${data.code ?? res.status}：${ERROR_HINT[data.code ?? ''] ?? data.message ?? '未知错误'}`);
    all.push(...(data.paragraphList ?? []));
    next = nextTokenOf(data);
    if (!next) break;
  }
  return all;
}
