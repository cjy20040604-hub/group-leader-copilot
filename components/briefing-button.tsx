'use client';

import { useState } from 'react';
import { Button, Card, Badge } from '@/components/ui';

export function BriefingButton({ courseId }: { courseId: string }) {
  const [text, setText] = useState('');
  const [ai, setAi] = useState(false);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    const res = await fetch('/api/briefing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId }) });
    const data = await res.json();
    setText(data.text);
    setAi(data.aiGenerated && !data.degraded);
    setLoading(false);
  }

  return (
    <div>
      <Button size="sm" variant="outline" onClick={generate} disabled={loading}>
        {loading ? '生成中…' : '生成会前简报'}
      </Button>
      {text && (
        <Card className="mt-2 p-3">
          <div className="mb-1">{ai ? <Badge tone="purple">AI 生成 · 待确认</Badge> : <Badge tone="slate">模板拼接 · Demo 降级（零成本）</Badge>}</div>
          <p className="text-xs leading-relaxed text-slate-700">{text}</p>
        </Card>
      )}
    </div>
  );
}