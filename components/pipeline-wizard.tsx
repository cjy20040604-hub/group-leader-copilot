'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, Card, Badge, AiBadge, Input, Textarea, Select, cx } from '@/components/ui';
import type { Draft, ValidatedAction } from '@/lib/pipeline';

type EditDecision = Draft['extraction']['decisions'][number] & { checked: boolean; manual?: boolean };

const blankAction = (): ValidatedAction => ({ task: '', ownerRaw: '', ownerId: null, dueRaw: null, dueDate: null, confidence: 'high', evidence: '', flags: [], manual: true });

export interface LiveDraft {
  courseId: string; date: string; transcript: string; sessionId: string;
  source: 'demo' | 'mic'; seconds: number; lines: number; hints: number;
}

interface Props {
  courses: { id: string; name: string }[];
  members: { id: string; name: string }[];
  defaultDate: string;
  live?: LiveDraft | null; // 会议室结束后带过来的转写：自动开始整理，组长只需确认
}

type Phase = 'input' | 'processing' | 'confirm' | 'done';

export function PipelineWizard({ courses, members, defaultDate, live }: Props) {
  const [phase, setPhase] = useState<Phase>(live ? 'processing' : 'input');
  const [courseId, setCourseId] = useState(live?.courseId ?? courses[0]?.id ?? '');
  const [date, setDate] = useState(live?.date ?? defaultDate);
  const [title, setTitle] = useState('');
  const [confirmTitle, setConfirmTitle] = useState('');
  const [agenda, setAgenda] = useState('');
  const [duplicates, setDuplicates] = useState<{ memoryId: string; text: string; meetingDate: string; similarity: number; matched: string }[]>([]);
  const [dupChecked, setDupChecked] = useState('');
  const [transcript, setTranscript] = useState(live?.transcript ?? '');
  const [asrNote, setAsrNote] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [editDecisions, setEditDecisions] = useState<EditDecision[]>([]);
  const [editActions, setEditActions] = useState<ValidatedAction[]>([]);
  const [editQuestions, setEditQuestions] = useState<string[]>([]);
  const [groupMessage, setGroupMessage] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [copied, setCopied] = useState(false);

  async function checkDuplicate() {
    if (!agenda.trim()) return;
    const res = await fetch('/api/duplicate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId, agenda }) });
    const data = await res.json();
    setDuplicates(data.matches ?? []);
    setDupChecked(agenda.trim());
  }

  async function loadSample() {
    const res = await fetch('/api/seed-transcript');
    const data = await res.json();
    setTranscript(data.transcript);
    setCourseId('mkt');
  }

  async function mockAsr(file: File) {
    const res = await fetch('/api/asr', { method: 'POST' });
    const data = await res.json();
    setTranscript(data.transcript);
    setCourseId('mkt');
    setAsrNote(`Demo 模拟：已把「${file.name}」当作 1 小时录音，按 Paraformer 计量 ${data.costCny.toFixed(2)} 元，返回预置转写。`);
  }

  function process() {
    setError('');
    setPhase('processing');
    void runProcess({ courseId, date, transcript, title });
  }

  async function runProcess(input: { courseId: string; date: string; transcript: string; title: string; meetingId?: string }) {
    try {
      const res = await fetch('/api/meetings/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '处理失败');
      setDraft(data);
      setConfirmTitle(data.title);
      setEditDecisions(data.extraction.decisions.map((d: Draft['extraction']['decisions'][number]) => ({ ...d, checked: true })));
      setEditActions(data.actions);
      setEditQuestions(data.extraction.open_questions);
      setPhase('confirm');
    } catch (e) {
      setError((e as Error).message);
      setPhase('input');
    }
  }

  // 会议室来的转写：进页面就自动整理（只跑一次）
  const autoRan = useRef(false);
  useEffect(() => {
    if (!live || autoRan.current) return;
    autoRan.current = true;
    void runProcess({ courseId: live.courseId, date: live.date, transcript: live.transcript, title: '', meetingId: live.sessionId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirm() {
    if (!draft) return;
    setError('');
    const decisions = editDecisions
      .filter((d) => d.checked && d.text.trim())
      .map(({ checked: _checked, manual: _manual, ...d }) => d);
    const res = await fetch('/api/meetings/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft, edits: { actions: editActions, decisions, openQuestions: editQuestions, title: confirmTitle.trim() || draft.title } }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? '落库失败'); return; }
    setGroupMessage(data.groupMessage);
    setMeetingId(data.meetingId);
    setPhase('done');
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(groupMessage);
    } catch {
      const ta = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="群消息文本"]');
      ta?.select();
      document.execCommand('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">新建会议 · 处理流水线</h1>

      {/* 步骤条 */}
      <ol className="flex flex-wrap gap-1 text-[11px]" aria-label="流水线步骤">
        {['1 输入', '2 预处理', '3 召回上下文', '4 结构化抽取', '5 校验', '6 人工确认', '7 落库', '8 建索引', '9 分发'].map((s, i) => {
          const active = phase === 'input' ? i === 0 : phase === 'processing' ? i <= 4 : phase === 'confirm' ? i <= 5 : true;
          return <li key={s} className={cx('rounded-full px-2 py-1', active ? 'bg-brand-100 text-brand-700 font-medium' : 'bg-slate-100 text-slate-400')}>{s}</li>;
        })}
      </ol>

      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-600">{error}</p>}
      {live && phase !== 'input' && (
        <p className="rounded-lg bg-brand-50 p-2 text-xs text-brand-800">
          🎙 来自会议室：实时转写 {live.lines} 句（{live.source === 'demo' ? '演示录音 · 模拟' : '麦克风'}，约 {Math.max(1, Math.round(live.seconds / 60))} 分钟）
          {live.hints > 0 ? `，会中提醒了 ${live.hints} 次「这事定过了」` : ''}。已自动开始整理，你只需要逐条确认。
        </p>
      )}

      {phase === 'input' && (
        <Card className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-xs text-slate-500">课程
              <Select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="mt-1 w-full">
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </label>
            <label className="text-xs text-slate-500">会议日期
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
            </label>
            <label className="text-xs text-slate-500">标题（可选）
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="默认自动生成" className="mt-1" />
            </label>
          </div>
          <div>
            <label className="text-xs text-slate-500">本次议程（可选，先做重复讨论检测，只比 embedding 不花钱）</label>
            <div className="mt-1 flex gap-2">
              <Input value={agenda} onChange={(e) => setAgenda(e.target.value)} onBlur={checkDuplicate} placeholder="比如：PPT 用什么风格" />
              <Button variant="outline" onClick={checkDuplicate}>检测重复</Button>
            </div>
            {duplicates.map((d) => (
              <p key={d.memoryId} className="mt-2 rounded-lg bg-yellow-50 p-2 text-xs text-yellow-800">
                ⚠️ 这个在 {d.meetingDate.slice(5).replace('-', '/')} 已经定了：{d.text}。还要重新讨论吗？
                <span className="block text-[11px] text-yellow-700">向量相似度 {(d.similarity * 100).toFixed(0)}% · 对上的词：{d.matched || '—'}</span>
              </p>
            ))}
            {dupChecked && dupChecked === agenda.trim() && duplicates.length === 0 && (
              <p className="mt-2 text-xs text-slate-500">没撞上已经定过的决议，可以讨论。</p>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-500">会议转写（粘贴腾讯会议 / 飞书妙记导出的文字稿）</label>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={loadSample}>📋 粘贴示例转写</Button>
                <label className="inline-flex cursor-pointer items-center rounded-lg px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100">
                  🎤 上传音频（Demo 模拟）
                  <input type="file" accept="audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && mockAsr(e.target.files[0])} />
                </label>
              </div>
            </div>
            <Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={12} className="mt-1 font-mono text-xs" placeholder="林晓：人到齐了，我们开始……" />
            {asrNote && <p className="mt-1 text-xs text-yellow-700">{asrNote}</p>}
          </div>
          <Button onClick={process} disabled={!transcript.trim()}>开始处理 →</Button>
        </Card>
      )}

      {phase === 'processing' && <Card className="p-8 text-center text-sm text-slate-500">流水线运行中…（Mock 模式即时返回）</Card>}

      {(phase === 'confirm' || phase === 'done') && draft && (
        <Card className="space-y-2 p-4">
          <p className="text-xs font-semibold text-slate-600">流水线耗时与花费</p>
          <div className="grid gap-1 md:grid-cols-2">
            {draft.steps.map((s) => (
              <div key={s.name} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-[11px]">
                <span className="flex items-center gap-1">{s.ai && <Badge tone="purple">AI</Badge>}{s.name}</span>
                <span className="text-slate-500">{s.ms}ms{s.tokens ? ` · ~${s.tokens} tokens` : ''}</span>
              </div>
            ))}
          </div>
          {draft.degraded && <p className="rounded-lg bg-yellow-50 p-2 text-xs text-yellow-800">抽取降级：模型两次都没输出合法 JSON，已改用规则抽取，漏掉的请在下面手动补</p>}
          {!draft.degraded && draft.extractMode === 'rules' && (
            <p className="rounded-lg bg-yellow-50 p-2 text-xs text-yellow-800">Mock 模式：这段不是示例转写，改用规则抽取（「定了/就用」→ 决议，「某人 + 时间」→ 待办，问句 → 待定）。规则可能漏抽，请逐条核对，缺的用「+ 添加」补上；配上百炼 Key 后由 qwen3.7-plus 抽取。</p>
          )}
        </Card>
      )}

      {phase === 'confirm' && draft && (
        <Card className="space-y-4 p-4">
          <div className="flex items-center gap-2"><AiBadge /><span className="text-xs text-slate-500">逐条勾选 / 修改，确认后才写入任务表与记忆库</span></div>

          <section>
            <h2 className="mb-1 text-sm font-semibold">📝 会议标题</h2>
            <div className="flex items-center gap-2">
              <Input value={confirmTitle} onChange={(e) => setConfirmTitle(e.target.value)} className="text-xs" aria-label="会议标题" />
              {draft.titleSource === 'ai' && <AiBadge />}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {draft.titleSource === 'ai' ? 'AI 根据抽出的议题起的标题，可改' : draft.titleSource === 'manual' ? '你在第一步填写的标题' : '没抽到议题，用了模板标题，可改'}
            </p>
          </section>

          {draft.extraction.repeated_topics.length > 0 && (
            <div className="rounded-lg bg-yellow-50 p-2 text-xs text-yellow-800">
              {draft.extraction.repeated_topics.map((r) => <p key={r.memory_id}>⚠️ 重复讨论：「{r.topic}」在历史决议 {r.memory_id} 中已有结论</p>)}
            </div>
          )}

          <section>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold">✅ 决议（{editDecisions.length}）</h2>
              <Button size="sm" variant="ghost" onClick={() => setEditDecisions((prev) => [...prev, { text: '', evidence: '', confidence: 'high', supersedes_memory_id: null, note: null, checked: true, manual: true }])}>+ 添加决议</Button>
            </div>
            {editDecisions.length === 0 && <p className="text-xs text-slate-400">无</p>}
            {editDecisions.map((d, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg p-1.5 hover:bg-slate-50">
                <input type="checkbox" checked={d.checked} onChange={(e) => setEditDecisions((prev) => prev.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)))} className="mt-2" aria-label="保留这条决议" />
                <div className="min-w-0 flex-1 text-sm">
                  <Input value={d.text} onChange={(e) => setEditDecisions((prev) => prev.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} className="text-xs" aria-label="决议内容" placeholder="比如：报告统一用学校模板" />
                  <span className="mt-0.5 block text-[11px] text-slate-400">
                    {d.manual ? <Badge tone="slate">手动添加</Badge> : <>原话：「{d.evidence}」</>}
                    {d.confidence === 'low' && !d.manual && <Badge tone="yellow" className="ml-1">低置信度</Badge>}
                  </span>
                  {(() => {
                    const check = draft.decisionChecks?.[i];
                    if (d.manual || !check) return null;
                    if (check.note && !check.candidate) return <p className="mt-1 text-[11px] text-slate-500">{check.note}</p>;
                    if (!check.candidate) return null;
                    const c = check.candidate;
                    return (
                      <label className="mt-1 flex items-start gap-1.5 rounded-md bg-yellow-50 p-1.5 text-[11px] text-yellow-900">
                        <input type="checkbox" className="mt-0.5" checked={d.supersedes_memory_id === c.memoryId}
                          onChange={(e) => setEditDecisions((prev) => prev.map((x, j) => (j === i ? { ...x, supersedes_memory_id: e.target.checked ? c.memoryId : null } : x)))} />
                        <span>
                          可能和 {c.meetingDate.slice(5).replace('-', '/')} 定的「{c.text}」是同一件事
                          （{c.source === 'model' ? '模型判断' : `对上的词：${c.matched}`}）。勾上 = 用这条新决议推翻它，旧决议会划线、问答不再当结论。
                        </span>
                      </label>
                    );
                  })()}
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditDecisions((prev) => prev.filter((_, j) => j !== i))} aria-label="删除这条决议">✕</Button>
              </div>
            ))}
          </section>

          <section>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold">📌 待办（{editActions.length}）</h2>
              <Button size="sm" variant="ghost" onClick={() => setEditActions((prev) => [...prev, blankAction()])}>+ 添加待办</Button>
            </div>
            {editActions.length === 0 && <p className="text-xs text-slate-400">无</p>}
            <div className="space-y-2">
              {editActions.map((a, i) => (
                <div key={i} className={cx('rounded-lg border p-2', a.flags.length ? 'border-yellow-300 bg-yellow-50' : 'border-slate-200')}>
                  <div className="grid gap-2 md:grid-cols-[1fr_130px_140px_auto]">
                    <Input value={a.task} onChange={(e) => setEditActions((prev) => prev.map((x, j) => (j === i ? { ...x, task: e.target.value } : x)))} className="text-xs" aria-label="任务内容" placeholder="要做什么" />
                    <Select value={a.ownerId ?? ''} onChange={(e) => setEditActions((prev) => prev.map((x, j) => (j === i ? { ...x, ownerId: e.target.value || null } : x)))} className="text-xs" aria-label="负责人">
                      <option value="">待认领</option>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </Select>
                    <Input type="date" value={a.dueDate ?? ''} onChange={(e) => setEditActions((prev) => prev.map((x, j) => (j === i ? { ...x, dueDate: e.target.value || null } : x)))} className="text-xs" aria-label="截止日期" />
                    <Button size="sm" variant="ghost" onClick={() => setEditActions((prev) => prev.filter((_, j) => j !== i))} aria-label="删除这条待办">✕</Button>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {a.manual ? <Badge tone="slate">手动添加</Badge> : <>原话指派：「{a.ownerRaw}」 · 原话日期：「{a.dueRaw ?? '无'}」</>}
                    {a.flags.map((f) => <Badge key={f} tone="yellow" className="ml-1">{f}</Badge>)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {draft.extraction.disagreements.length > 0 && (
            <section>
              <h2 className="mb-1 text-sm font-semibold">⚡ 分歧（未达成一致）</h2>
              {draft.extraction.disagreements.map((d, i) => (
                <p key={i} className="text-xs text-slate-600">{d.topic}：{d.positions.join(' / ')}</p>
              ))}
            </section>
          )}

          <section>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold">❓ 待定问题</h2>
              <Button size="sm" variant="ghost" onClick={() => setEditQuestions((prev) => [...prev, ''])}>+ 添加待定问题</Button>
            </div>
            {editQuestions.map((q, i) => (
              <div key={i} className="mb-1 flex gap-2">
                <Input value={q} onChange={(e) => setEditQuestions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))} className="text-xs" aria-label="待定问题" placeholder="下次要讨论的问题" />
                <Button size="sm" variant="ghost" onClick={() => setEditQuestions((prev) => prev.filter((_, j) => j !== i))} aria-label="删除这条待定问题">✕</Button>
              </div>
            ))}
            {editQuestions.length === 0 && <p className="text-xs text-slate-400">无</p>}
          </section>

          {draft.extraction.next_meeting && <p className="text-xs text-slate-500">🗓 下次会议：{draft.extraction.next_meeting}</p>}

          <Button onClick={confirm}>✔ 确认并落库（写入任务 + 记忆库 + 提醒）</Button>
        </Card>
      )}

      {phase === 'done' && (
        <Card className="space-y-3 p-4">
          <p className="text-sm font-semibold text-green-700">✅ 已落库：任务上看板、决议进记忆库、提醒规则已挂载</p>
          <Textarea readOnly value={groupMessage} rows={14} className="font-mono text-xs" aria-label="群消息文本" />
          <div className="flex gap-2">
            <Button onClick={copyMessage}>{copied ? '✅ 已复制' : '📋 一键复制群消息'}</Button>
            <Link href={`/app/meeting/${meetingId}`} className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">查看纪要</Link>
            <Link href={`/app/c/${draft?.courseId}`} className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">去看板</Link>
          </div>
        </Card>
      )}
    </div>
  );
}