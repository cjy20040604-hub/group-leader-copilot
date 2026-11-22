import React from 'react';

// 全站设计规范（2026-11-22）：白底卡片 + 细边框不加阴影；正文 slate-600，标题 slate-900；
// 品牌蓝只给主操作和要强调的数字；数字一律 tabular-nums；标题不加 emoji
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
};

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        FOCUS,
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm',
        variant === 'primary' && 'bg-brand-600 text-white hover:bg-brand-700',
        variant === 'outline' && 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 hover:text-slate-900',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-xl border border-slate-200 bg-white', className)} {...props} />;
}

export function Badge({ tone = 'slate', children, className }: { tone?: 'slate' | 'blue' | 'green' | 'yellow' | 'red' | 'purple'; children: React.ReactNode; className?: string }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-600 ring-slate-500/20',
    blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    yellow: 'bg-amber-50 text-amber-800 ring-amber-600/25',
    red: 'bg-red-50 text-red-700 ring-red-600/20',
    purple: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  };
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset', tones[tone], className)}>{children}</span>;
}

export function AiBadge() {
  return <Badge tone="purple">AI 生成 · 待确认</Badge>;
}

const FIELD = 'rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

// 调用方传了自己的内边距 / 字号时不再叠默认值（Tailwind 同类工具类谁生效看 CSS 顺序，不看 class 顺序）
function fieldClass(base: string, className?: string) {
  const c = className ?? '';
  const [px, py] = base.split(' ');
  const hasP = /(^|\s)p-/.test(c);
  const pad = cx(!hasP && !/(^|\s)(px|pl|pr)-/.test(c) && px, !hasP && !/(^|\s)py-/.test(c) && py);
  const size = /(^|\s)text-(xs|sm|base|lg|\[)/.test(c) ? '' : 'text-sm';
  return cx(pad, size, FIELD, c);
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx('w-full', fieldClass('px-3 py-2', props.className))} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx('w-full', fieldClass('px-3 py-2', props.className))} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={fieldClass('px-3 py-2', props.className)} />;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 px-6 py-8 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

// 每页顶部：标题 + 一句说明 + 右侧操作
export function PageHeader({ title, lede, actions, children }: { title: React.ReactNode; lede?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-medium tracking-tight text-slate-900 sm:text-[28px]">{title}</h1>
        {lede && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-600">{lede}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

// 区块标题：左边标题，右边可放「全部 →」之类的操作
export function SectionTitle({ children, aside, className }: { children: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return (
    <div className={cx('mb-3 flex flex-wrap items-center justify-between gap-2', className)}>
      <h2 className="text-[15px] font-medium text-slate-900">{children}</h2>
      {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
    </div>
  );
}

// 风险灯：红 / 黄 / 绿圆点（替代 emoji），颜色由 lib/risk.ts 的规则决定
export function RiskDot({ level, className }: { level: 'red' | 'yellow' | 'green'; className?: string }) {
  const tone = { red: 'bg-red-500 ring-red-500/20', yellow: 'bg-amber-400 ring-amber-400/25', green: 'bg-emerald-500 ring-emerald-500/20' }[level];
  const label = { red: '高风险', yellow: '要留意', green: '正常' }[level];
  return <span className={cx('inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-4', tone, className)} role="img" aria-label={`风险：${label}`} title={label} />;
}

// 标志性细节：纪要条目的种类标记。全站同一套形状和颜色——决定 / 待办 / 待定 / 分歧 / 议题 / 原文
const KIND: Record<string, { label: string; cls: string }> = {
  decision: { label: '决定', cls: 'bg-brand-50 text-brand-700 ring-brand-600/25' },
  action: { label: '待办', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/25' },
  open_question: { label: '待定', cls: 'bg-amber-50 text-amber-800 ring-amber-600/30' },
  disagreement: { label: '分歧', cls: 'bg-rose-50 text-rose-700 ring-rose-600/25' },
  topic_summary: { label: '议题', cls: 'bg-slate-50 text-slate-600 ring-slate-400/40' },
  transcript: { label: '原文', cls: 'bg-slate-50 text-slate-600 ring-slate-400/40' },
};
export function KindTag({ kind, className }: { kind: string; className?: string }) {
  const k = KIND[kind] ?? { label: kind, cls: 'bg-slate-50 text-slate-600 ring-slate-400/40' };
  return <span className={cx('inline-flex shrink-0 items-center rounded px-1.5 py-px text-[11px] font-medium ring-1 ring-inset', k.cls, className)}>{k.label}</span>;
}

// 原话：一律用「」引用，次要文字色
export function Quote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cx('text-slate-500', className)}>「{children}」</span>;
}
