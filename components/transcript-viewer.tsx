'use client';

import { useMemo } from 'react';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function TranscriptViewer({ transcript, evidences, highlight }: { transcript: string; evidences: string[]; highlight?: string }) {
  const parts = useMemo(() => {
    const targets = [...new Set([...(highlight ? [highlight] : []), ...evidences])].filter((e) => e && transcript.includes(e));
    if (targets.length === 0) return [{ text: transcript, mark: false }];
    const re = new RegExp(`(${targets.map(escapeRegExp).join('|')})`, 'g');
    return transcript.split(re).map((piece) => ({ text: piece, mark: targets.includes(piece) }));
  }, [transcript, evidences, highlight]);

  return (
    <pre className="whitespace-pre-wrap rounded-xl bg-slate-100 p-4 font-sans text-xs leading-relaxed text-slate-700">
      {parts.map((p, i) => (p.mark ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </pre>
  );
}