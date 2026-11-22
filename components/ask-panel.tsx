'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Card, Badge, AiBadge, Input, EmptyState, KindTag } from '@/components/ui';

interface CitationRow {
  id: string;
  meetingId: string;
  meetingDate: string;
  type: string;
  text: string;
  evidence: string | null;
  status: string;
}

interface AskResult {
  refused: boolean;
  reason?: string;
  answer: string;
  citations: string[];
  citationRows: CitationRow[];
}

const TYPE_LABEL: Record<string, string> = { decision: '决议', action: '待办', open_question: '待定', disagreement: '分歧', topic_summary: '议题', transcript: '原文' };

export function AskPanel({ courseId }: { courseId: string }) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(false);

  async function ask() {
    if (!question.trim()) return;
    setLoading(true);
    setError('');
    setAdded(false);
    try {
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId, question }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '问答失败');
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function addToAgenda() {
    await fetch('/api/agenda', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId, question }) });
    setAdded(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask()}
          placeholder="比如：我们PPT最后定的什么风格？"
          aria-label="问上次会议的问题"
        />
        <Button onClick={ask} disabled={loading}>{loading ? '检索中…' : '问问上次'}</Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <Card className="p-6">
          <div className="mb-3 flex items-center gap-2">
            {result.refused ? <Badge tone="yellow">证据不足 · 拒答</Badge> : <AiBadge />}
          </div>
          <p className="max-w-3xl text-base leading-relaxed text-slate-900">{result.answer}</p>
          {result.refused && result.reason && <p className="mt-1 text-[11px] text-slate-400">为什么没答：{result.reason}</p>}
          {result.refused && (
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={addToAgenda} disabled={added}>
                {added ? '已加入下次议程' : '把这个问题加到下次会议议程'}
              </Button>
            </div>
          )}
          {result.citationRows.length > 0 && (
            <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-500">出处（点开跳到纪要并高亮原话）</p>
              {result.citationRows.map((c) => (
                <Link key={c.id} href={`/app/meeting/${c.meetingId}?hl=${encodeURIComponent(c.evidence ?? '')}`} className="block">
                  <div className="rounded-lg border border-slate-200 px-3 py-2.5 transition-colors hover:border-slate-400">
                    <div className="flex items-center gap-2">
                      <KindTag kind={c.type} /><span className="text-xs tabular-nums text-slate-500">{Number(c.meetingDate.slice(5, 7))}/{Number(c.meetingDate.slice(8))}</span>
                      {c.status === 'superseded' && <Badge tone="slate">已被推翻</Badge>}
                      <span className="text-[11px] text-slate-400">{c.id}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-700">{c.text}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}
      {!result && !loading && <EmptyState title="答案必须带出处，找不到就直说" hint="检索按课程硬过滤，不会串台；被推翻的旧决议默认排除" />}
    </div>
  );
}