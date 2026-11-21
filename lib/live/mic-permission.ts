// 麦克风授权：先在页面里说清楚「为什么要用、录什么、去哪」，组长点同意后才调用浏览器授权；
// 浏览器 / 系统拒绝时，按出错原因给出能照着做的修复步骤（纯函数，可单测）

export type MicPermission = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';
export type BrowserKind = 'chrome' | 'edge' | 'safari' | 'firefox' | 'other';

export interface MicHelp {
  title: string;
  steps: string[];
  canRetry: boolean;
}

export function detectBrowser(ua: string): BrowserKind {
  if (/Edg\//.test(ua)) return 'edge';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrome\/|CriOS\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}

export const PERMISSION_LABEL: Record<MicPermission, string> = {
  unknown: '还没问过',
  prompt: '还没授权',
  granted: '已允许',
  denied: '已拒绝',
  unsupported: '不可用',
};

function siteSettingSteps(browser: BrowserKind, host: string): string[] {
  switch (browser) {
    case 'safari':
      return [`Safari 菜单 → 设置… → 网站 → 麦克风，把「${host}」改成「允许」`, '回到这个页面刷新'];
    case 'firefox':
      return ['点地址栏左边的麦克风 / 锁形图标', '在「使用麦克风」那一行点 × 清除「已阻止」', '刷新页面，再点一次开始录音'];
    case 'edge':
    case 'chrome':
    default:
      return ['点地址栏左边的图标（锁形或调节图标）', '找到「麦克风」，改成「允许」', '刷新页面，再点一次开始录音'];
  }
}

const MAC_SYSTEM_STEP = 'Mac 上还要检查：系统设置 → 隐私与安全性 → 麦克风，打开你用的浏览器的开关（改完要重启浏览器）';

export function describeMicError(
  err: { name?: string; message?: string } | null,
  ctx: { secure: boolean; hasMediaDevices: boolean; browser: BrowserKind; host: string; isMac: boolean },
): MicHelp {
  if (!ctx.secure) {
    return {
      title: '当前地址不安全，浏览器不允许使用麦克风',
      steps: ['用 http://localhost 打开（本机演示），或者部署到 https 地址', '局域网 IP（如 http://192.168.x.x）不行，浏览器只在 https 和 localhost 下开放麦克风'],
      canRetry: false,
    };
  }
  if (!ctx.hasMediaDevices) {
    return { title: '这个浏览器不支持录音', steps: ['换用最新版 Chrome、Edge 或 Safari'], canRetry: false };
  }
  switch (err?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError': {
      const steps = siteSettingSteps(ctx.browser, ctx.host);
      if (ctx.isMac) steps.push(MAC_SYSTEM_STEP);
      return { title: '麦克风权限被拒绝了', steps, canRetry: true };
    }
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return {
        title: '没找到可用的麦克风',
        steps: ['插上耳机麦克风，或检查系统声音设置里的「输入」设备', ...(ctx.isMac ? ['Mac：系统设置 → 声音 → 输入，确认选中了麦克风且音量条会动'] : [])],
        canRetry: true,
      };
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return {
        title: '麦克风被别的软件占用了',
        steps: ['关掉正在用麦克风的软件（腾讯会议、飞书、微信语音等）', '再点一次开始录音'],
        canRetry: true,
      };
    default:
      return { title: '打不开麦克风', steps: [err?.message || '未知错误', '刷新页面后重试'], canRetry: true };
  }
}
