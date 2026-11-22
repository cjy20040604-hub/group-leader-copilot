'use client';

import { useEffect, useRef, useState } from 'react';
import { KindTag } from '@/components/ui';
import { XIcon } from '@/components/icons';

// 落地页首屏的「纪要书架」：每本书是一场组会，颜色是课程。悬停或键盘选中时书抽出来、旁边显示这场会定了什么；点开像书一样翻开
// 数据来自演示数据库里真实的纪要（决定 / 待办 / 待定 / 原话），不是写死的示意
export interface ShelfItem { text: string; evidence: string | null }
export interface ShelfBook {
  id: string;
  courseName: string;
  color: string;
  date: string; // YYYY-MM-DD
  title: string;
  decisions: (ShelfItem & { supersededOn: string | null })[];
  actions: ShelfItem[];
  questions: string[];
}

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const HEIGHTS = [236, 252, 228, 260, 244, 232, 256, 240];
// 架子上的其他书（没有纪要的旧书），只是为了让书架像书架
const FILLERS_LEFT = [{ h: 204, w: 30, c: '#3b3129' }, { h: 220, w: 40, c: '#2f2822' }, { h: 196, w: 26, c: '#463a2f' }];
const FILLERS_RIGHT = [
  { h: 212, w: 34, c: '#352c25' }, { h: 228, w: 28, c: '#2b241f' }, { h: 200, w: 44, c: '#40342a' },
  { h: 236, w: 30, c: '#2f2822' }, { h: 208, w: 36, c: '#3b3129' }, { h: 222, w: 26, c: '#463a2f' },
];
const short = (t: string) => (t.length > 9 ? `${t.slice(0, 9)}…` : t);

export function MinutesShelf({ books }: { books: ShelfBook[] }) {
  const [pulled, setPulled] = useState<string | null>(books.find((b) => b.decisions.some((d) => d.supersededOn))?.id ?? books[0]?.id ?? null);
  const [open, setOpen] = useState<ShelfBook | null>(null);
  const active = books.find((b) => b.id === pulled) ?? null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
      <div>
        <div role="list" aria-label="纪要书架：每本书是一场组会" className="shelf-row flex items-end gap-1.5 overflow-x-auto px-2 pb-0 pt-6 [scrollbar-width:none]">
          {FILLERS_LEFT.map((f, i) => <Filler key={`l${i}`} {...f} />)}
          {books.map((b, i) => {
            const isPulled = pulled === b.id;
            const superseded = b.decisions.some((d) => d.supersededOn);
            return (
              <button key={b.id} role="listitem" type="button"
                onMouseEnter={() => setPulled(b.id)} onFocus={() => setPulled(b.id)} onClick={() => setOpen(b)}
                aria-label={`${md(b.date)} ${b.courseName}：${b.title}，打开这份纪要`}
                className="book group relative shrink-0 rounded-t-[3px] text-left outline-none transition-transform duration-200 ease-out focus-visible:ring-2 focus-visible:ring-amber-200/80"
                style={{
                  height: HEIGHTS[i % HEIGHTS.length],
                  width: 56,
                  background: `color-mix(in oklab, ${b.color} 46%, #2a2018)`,
                  transform: isPulled ? 'translateY(-16px)' : undefined,
                  animationDelay: `${i * 50}ms`,
                }}>
                <span className="absolute inset-x-2 top-3 flex h-8 items-center justify-center rounded-sm bg-[#efe6d4] text-[11px] tabular-nums text-[#3a3026]" aria-hidden>{md(b.date)}</span>
                <span className="absolute inset-x-0 top-16 flex justify-center whitespace-nowrap text-sm tracking-wider text-[#f3ece0] [writing-mode:vertical-rl]" aria-hidden>{short(b.title)}</span>
                <span className="absolute inset-x-2 bottom-4 h-px bg-[#e8c77a]/50" aria-hidden />
                {superseded && <span className="absolute inset-x-2 bottom-6 h-px bg-[#e8c77a]/50" aria-hidden title="有决定后来被推翻" />}
              </button>
            );
          })}
          {FILLERS_RIGHT.map((f, i) => <Filler key={`r${i}`} {...f} />)}
        </div>
        <div className="h-3 rounded-[2px] bg-[#5a4431] shadow-[0_6px_12px_rgba(0,0,0,0.35)]" aria-hidden />
        <p className="mt-3 text-xs text-[#a39a8c]">每本书是一场组会，颜色是课程。选一本看这场会定了什么，点开翻到原话。</p>
      </div>

      <div aria-live="polite" className="min-h-[200px] rounded-xl bg-[#f6f1e7] p-5 text-[#2b2620] shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
        {active ? (
          <>
            <p className="flex items-center gap-2 text-xs text-[#7a6f60]">
              <span className="h-2 w-2 rounded-full" style={{ background: active.color }} aria-hidden />{active.courseName}　<span className="tabular-nums">{md(active.date)}</span> 组会
            </p>
            <p className="mt-1 text-[15px] font-medium">{active.title}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {active.decisions.slice(0, 2).map((d) => (
                <li key={d.text} className="flex items-start gap-2">
                  <KindTag kind="decision" className="mt-0.5" />
                  <span className={d.supersededOn ? 'text-[#8a8072] line-through' : ''}>{d.text}{d.supersededOn && <span className="ml-1 text-xs no-underline">（{md(d.supersededOn)} 改了）</span>}</span>
                </li>
              ))}
              {active.actions.slice(0, 2).map((a) => (
                <li key={a.text} className="flex items-start gap-2"><KindTag kind="action" className="mt-0.5" /><span>{a.text}</span></li>
              ))}
            </ul>
            <button type="button" onClick={() => setOpen(active)} className="mt-4 text-sm text-brand-600 hover:text-brand-700 hover:underline">翻开这份纪要</button>
          </>
        ) : <p className="text-sm text-[#7a6f60]">选一本书</p>}
      </div>

      {open && <Spread book={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Filler({ h, w, c }: { h: number; w: number; c: string }) {
  return <span className="book shrink-0 rounded-t-[3px]" style={{ height: h, width: w, background: c }} aria-hidden />;
}

// 翻开的纪要：左页是决定、待办、待定，右页是原话
function Spread({ book, onClose }: { book: ShelfBook; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const quotes = [...book.decisions, ...book.actions].filter((x) => x.evidence);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d0b09]/70 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${book.courseName} ${md(book.date)} 纪要`} onClick={(e) => e.stopPropagation()}
        className="spread relative grid max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-[#f6f1e7] text-[#2b2620] shadow-[0_24px_60px_rgba(0,0,0,0.5)] md:grid-cols-2">
        <button ref={closeRef} type="button" onClick={onClose} aria-label="合上纪要"
          className="absolute right-3 top-3 rounded-md p-1.5 text-[#7a6f60] hover:bg-black/5 hover:text-[#2b2620] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"><XIcon /></button>
        <section className="p-7 md:border-r md:border-[#e2d9c8]">
          <p className="flex items-center gap-2 text-xs text-[#7a6f60]"><span className="h-2 w-2 rounded-full" style={{ background: book.color }} aria-hidden />{book.courseName}　<span className="tabular-nums">{md(book.date)}</span> 组会</p>
          <h3 className="mt-1 text-xl font-medium">{book.title}</h3>
          <ul className="mt-5 space-y-2.5 text-[15px]">
            {book.decisions.map((d) => (
              <li key={d.text} className="flex items-start gap-2"><KindTag kind="decision" className="mt-1" />
                <span className={d.supersededOn ? 'text-[#8a8072] line-through' : ''}>{d.text}</span>
                {d.supersededOn && <span className="shrink-0 text-xs text-[#8a8072]">{md(d.supersededOn)} 被推翻</span>}
              </li>
            ))}
            {book.actions.map((a) => <li key={a.text} className="flex items-start gap-2"><KindTag kind="action" className="mt-1" /><span>{a.text}</span></li>)}
            {book.questions.map((q) => <li key={q} className="flex items-start gap-2"><KindTag kind="open_question" className="mt-1" /><span>{q}</span></li>)}
          </ul>
        </section>
        <section className="ruled-dark p-7">
          <p className="text-xs text-[#7a6f60]">原话</p>
          <ul className="mt-3 space-y-3 text-[15px] leading-8">
            {quotes.length === 0 && <li className="text-[#7a6f60]">这场会没有标出原话</li>}
            {quotes.map((q) => <li key={q.evidence!}><mark>「{q.evidence}」</mark></li>)}
          </ul>
          <a href="/app" className="mt-6 inline-block text-sm text-brand-600 hover:text-brand-700 hover:underline">在 Demo 里看完整纪要</a>
        </section>
      </div>
    </div>
  );
}
