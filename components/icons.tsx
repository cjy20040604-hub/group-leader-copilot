// 一套线性图标（路径取自 lucide，ISC 许可）：16px、描边 1.5、颜色跟随文字。全站替代 ● ⏸ ▶ ✔ ✕ ✓ ＋ 这类字符
import React from 'react';

type IconProps = { className?: string; title?: string };

function Svg({ className, title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className ?? 'h-4 w-4 shrink-0'} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

export const PlusIcon = (p: IconProps) => <Svg {...p}><path d="M5 12h14" /><path d="M12 5v14" /></Svg>;
export const CheckIcon = (p: IconProps) => <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>;
export const XIcon = (p: IconProps) => <Svg {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Svg>;
export const PauseIcon = (p: IconProps) => <Svg {...p}><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></Svg>;
export const PlayIcon = (p: IconProps) => <Svg {...p}><path d="M6 4.5v15a.5.5 0 0 0 .77.42l11.5-7.5a.5.5 0 0 0 0-.84L6.77 4.08A.5.5 0 0 0 6 4.5Z" /></Svg>;
export const RecordIcon = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" fill="currentColor" /></Svg>;
export const MicIcon = (p: IconProps) => <Svg {...p}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M19 10v1a7 7 0 0 1-14 0v-1" /><path d="M12 18v4" /></Svg>;
export const CopyIcon = (p: IconProps) => <Svg {...p}><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M4 16V5a1 1 0 0 1 1-1h11" /></Svg>;
export const DownloadIcon = (p: IconProps) => <Svg {...p}><path d="M12 15V3" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></Svg>;
export const FastIcon = (p: IconProps) => <Svg {...p}><path d="m13 19 9-7-9-7v14Z" /><path d="m2 19 9-7-9-7v14Z" /></Svg>;
