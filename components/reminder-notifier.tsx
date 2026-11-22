'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { XIcon } from '@/components/icons';

// DDL 提醒的「真提醒」：新提醒出现时弹浏览器通知（用户允许后），同时在页面右下角弹一条站内通知（不需要授权）
// 提醒本身由规则生成（D-3 / D-1 / 过期当天）；这里只负责把新出现的提醒推到人眼前。钉钉群机器人、企业微信是下一步的发送通道
interface FeedItem { id: string; taskId: string; kind: string; fireDate: string; message: string }
type Perm = 'default' | 'granted' | 'denied' | 'unsupported';

const KIND: Record<string, string> = { d3: '3 天后截止', d1: '明天截止', overdue: '已过期' };
const seenKey = (uid: string) => `reminders-seen:${uid}`;
// 重置 Demo 数据或把演示时间拨回去以后，提醒会用同样的 id 重新生成（任务 id + D-3 / D-1 / 过期）。
// 不清掉「已看过」的记录，再快进时这些提醒就不会再弹，看起来像没反应
export function clearSeenReminders() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith('reminders-seen:')) localStorage.removeItem(k);
    }
  } catch { /* 隐私模式下本来就没记 */ }
}

function loadSeen(uid: string): Set<string> | null {
  try { const v = localStorage.getItem(seenKey(uid)); return v ? new Set(JSON.parse(v) as string[]) : null; } catch { return null; }
}
function saveSeen(uid: string, ids: Set<string>) {
  try { localStorage.setItem(seenKey(uid), JSON.stringify([...ids].slice(-200))); } catch { /* 隐私模式下不记，最多重复提示一次 */ }
}

export function ReminderNotifier({ userId }: { userId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [perm, setPerm] = useState<Perm>('default');
  const [mounted, setMounted] = useState(false);
  const [toasts, setToasts] = useState<FeedItem[]>([]);
  const busy = useRef(false);

  // 授权状态只在浏览器里读得到：挂载后读一次（放进回调，避免服务端和浏览器渲染不一致）
  useEffect(() => {
    const t = setTimeout(() => { setMounted(true); setPerm(!('Notification' in window) ? 'unsupported' : (Notification.permission as Perm)); }, 0);
    return () => clearTimeout(t);
  }, []);

  const push = useCallback((items: FeedItem[]) => {
    if (!items.length) return;
    setToasts((prev) => [...items, ...prev].slice(0, 3));
    const ids = new Set(items.map((i) => i.id));
    setTimeout(() => setToasts((prev) => prev.filter((t) => !ids.has(t.id))), 12000); // 12 秒后自动收起
    if ('Notification' in window && Notification.permission === 'granted') {
      for (const r of items.slice(0, 3)) {
        const n = new Notification(`组长减负：${KIND[r.kind] ?? 'DDL 提醒'}`, { body: r.message, tag: r.id });
        n.onclick = () => { window.focus(); router.push('/app/tasks'); n.close(); };
      }
    }
  }, [router]);

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const scan = await fetch('/api/reminders/scan', { method: 'POST' }).then((r) => r.json()).catch(() => ({ created: 0 }));
      const feed = await fetch('/api/reminders/feed').then((r) => r.json()) as { userId: string; epoch: string; items: FeedItem[] };
      const key = `${feed.userId}:${feed.epoch}`; // 换了一套演示数据就重新记
      const seen = loadSeen(key);
      if (!seen) {
        // 第一次打开：已有的提醒只记下来，不刷屏
        saveSeen(key, new Set(feed.items.map((i) => i.id)));
      } else {
        const fresh = feed.items.filter((i) => !seen.has(i.id));
        fresh.forEach((i) => seen.add(i.id));
        saveSeen(key, seen);
        push(fresh);
      }
      if (scan.created > 0) router.refresh();
    } finally {
      busy.current = false;
    }
  }, [push, router]);

  // 每分钟、切换页面、回到这个标签页、以及时间快进 / 确认纪要之后各查一次
  useEffect(() => { void check(); }, [check, pathname, userId]);
  useEffect(() => {
    const timer = setInterval(() => void check(), 60000);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    window.addEventListener('reminders:check', onFocus);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); window.removeEventListener('reminders:check', onFocus); };
  }, [check]);

  async function enable() {
    if (!('Notification' in window)) return;
    const p = await Notification.requestPermission();
    setPerm(p as Perm);
    if (p === 'granted') new Notification('组长减负：通知已开启', { body: '有 DDL 前 3 天、前 1 天或过期的提醒时，会在这里通知你。' });
  }

  return (
    <>
      {perm === 'default' && <button type="button" onClick={enable} className="text-[#e8c77a] hover:underline">开启浏览器通知</button>}
      {perm === 'granted' && <span className="text-cream-400">浏览器通知已开</span>}
      {perm === 'denied' && <span className="text-cream-400" title="在浏览器地址栏左侧的站点设置里允许通知">浏览器通知被拦截</span>}

      {/* 挂到 body 上：顶栏有毛玻璃效果，fixed 定位放在顶栏里会跟着顶栏走 */}
      {mounted && createPortal(<div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="toast-in pointer-events-auto rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
            <div className="flex items-start gap-2">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{KIND[t.kind] ?? 'DDL 提醒'}</p>
                <p className="mt-0.5 text-slate-600">{t.message}</p>
                <Link href="/app/tasks" onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))} className="mt-2 inline-block text-xs text-brand-600 hover:underline">去处理</Link>
              </div>
              <button type="button" aria-label="关闭这条通知" onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))} className="rounded p-0.5 text-slate-400 hover:text-slate-700"><XIcon /></button>
            </div>
          </div>
        ))}
      </div>, document.body)}
    </>
  );
}
