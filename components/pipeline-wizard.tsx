'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, Card, Badge, AiBadge, Input, Textarea, Select, cx, PageHeader } from '@/components/ui';
import type { Draft, ValidatedAction } from '@/lib/pipeline';
import { CoursePicker } from '@/components/course-picker';

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
  canCreateCourse?: boolean;
}

type Phase = 'input' | 'processing' | 'confirm' | 'done';

export function PipelineWizard({ courses: initialCourses, members, defaultDate, live, canCreateCourse = false }: Props) {
  const [courses, setCourses] = useState(initialCourses);
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
  const [dingOpen, setDingOpen] = useState(false);
  const [dingConf, setDingConf] = useState('');
  const [dingUnion, setDingUnion] = useState('');
  const [dingBusy, setDingBusy] = useState(false);
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
    setAsrNote(`「${file.name}」按 1 小时录音计费 ${data.costCny.toFixed(2)} 元，已填入示例转写。`);
  }

  // 从钉钉视频会议的云录制（闪记）导入转写：发言人按花名册对上名字
  async function importDingTalk() {
    setDingBusy(true);
    setError('');
    try {
      const res = await fetch('/api/dingtalk/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conferenceId: dingConf, unionId: dingUnion }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '导入失败');
      setTranscript(data.transcript);
      if (data.suggestedCourse) setCourseId(data.suggestedCourse);
      const mapped = (data.speakers as { nickName: string; mappedTo: string | null }[])
        .map((sp) => (sp.mappedTo && sp.mappedTo !== sp.nickName ? `${sp.nickName}→${sp.mappedTo}` : sp.mappedTo ? sp.nickName : `${sp.nickName}（不在花名册）`)).join('、');
      setAsrNote(`${data.simulated ? '示例数据：' : ''}已从钉钉会议导入 ${data.paragraphs} 段，约 ${Math.max(1, Math.round(data.seconds / 60))} 分钟。发言人：${mapped}。`);
      setDingOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDingBusy(false);
    }
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
    <div className="space-y-6">
      <PageHeader title="导入转写，整理纪要" lede="粘贴腾讯会议、飞书导出的文字稿，或从钉钉会议导入；AI 整理成决定、待办和待定，你确认后才保存。" />

      {/* 步骤条 */}
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs" aria-label="流水线步骤">
        {['1 输入', '2 预处理', '3 召回上下文', '4 结构化抽取', '5 校验', '6 人工确认', '7 落库', '8 建索引', '9 分发'].map((s, i) => {
          const active = phase === 'input' ? i === 0 : phase === 'processing' ? i <= 4 : phase === 'confirm' ? i <= 5 : true;
          return <li key={s} className={cx('flex items-center gap-1', active ? 'font-medium text-slate-900' : 'text-slate-400')}>{i > 0 && <span className="px-1 text-slate-300" aria-hidden>/</span>}<span className={cx('tabular-nums', active && 'text-brand-600')}>{s.split(' ')[0]}</span>{s.split(' ')[1]}</li>;
        })}
      </ol>

      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-600">{error}</p>}
      {live && phase !== 'input' && (
        <p className="rounded-lg bg-brand-50 p-2 text-xs text-brand-800">
          来自会议室：实时转写 {live.lines} 句（{live.source === 'demo' ? '演示录音' : '麦克风'}，约 {Math.max(1, Math.round(live.seconds / 60))} 分钟）
          {live.hints > 0 ? `，会中提醒了 ${live.hints} 次「这事定过了」` : ''}。已自动开始整理，你只需要逐条确认。
        </p>
      )}

      {phase === 'input' && (
        <Card className="space-y-5 p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="text-xs text-slate-500">课程
              <div className="mt-1">
                <CoursePicker courses={courses} value={courseId} onChange={setCourseId} canCreate={canCreateCourse} className="w-full"
                  onCourseCreated={(c) => setCourses((prev) => [...prev, c])} />
              </div>
            </div>
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
                这个在 {d.meetingDate.slice(5).replace('-', '/')} 已经定了：{d.text}。还要重新讨论吗？
                <span className="block text-[11px] text-yellow-700">向量相似度 {(d.similarity * 100).toFixed(0)}% · 对上的词：{d.matched || '—'}</span>
              </p>
            ))}
            {dupChecked && dupChecked === agenda.trim() && duplicates.length === 0 && (
              <p className="mt-2 text-xs text-slate-500">没撞上已经定过的决议，可以讨论。</p>
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs text-slate-500">会议转写（粘贴腾讯会议 / 飞书妙记导出的文字稿）</label>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={loadSample}>粘贴示例转写</Button>
                <Button size="sm" variant="outline" onClick={() => setDingOpen(!dingOpen)}>从钉钉会议导入</Button>
                <label className="inline-flex cursor-pointer items-center rounded-lg px-2.5 py-1 text-xs text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
                  上传音频
                  <input type="file" accept="audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && mockAsr(e.target.files[0])} />
                </label>
              </div>
            </div>
            {dingOpen && (
              <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-600">钉钉视频会议开了「云录制（闪记）」的，可以直接把转写拉过来（带发言人）。会议 ID（conferenceId）由钉钉「创建视频会议」接口返回，会议相关的事件推送里也带着。</p>
                <div className="flex flex-wrap gap-2">
                  <Input value={dingConf} onChange={(e) => setDingConf(e.target.value)} placeholder="会议 ID（conferenceId）" className="min-w-48 flex-1 py-1 text-xs" aria-label="钉钉会议 ID" />
                  <Input value={dingUnion} onChange={(e) => setDingUnion(e.target.value)} placeholder="查询人 unionId（选填）" className="w-48 py-1 text-xs" aria-label="钉钉 unionId" />
                  <Button size="sm" disabled={!dingConf.trim() || dingBusy} onClick={importDingTalk}>{dingBusy ? '导入中…' : '导入转写'}</Button>
                </div>
              </div>
            )}
            <Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={12} className="mt-2 text-sm leading-relaxed" placeholder="林晓：人到齐了，我们开始……" />
            {asrNote && <p className="mt-1 text-xs text-yellow-700">{asrNote}</p>}
          </div>
          <Button onClick={process} disabled={!transcript.trim()}>开始整理</Button>
        </Card>
      )}

      {phase === 'processing' && <Card className="p-8 text-center text-sm text-slate-500">正在整理…</Card>}

      {(phase === 'confirm' || phase === 'done') && draft && (
        <Card className="space-y-3 p-5">
          <p className="text-[15px] font-semibold text-slate-900">流水线耗时与花费</p>
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
            <p className="rounded-lg bg-yellow-50 p-2 text-xs text-yellow-800">这段用规则抽取，可能漏抽，请逐条核对，缺的用「+ 添加」补上。</p>
          )}
        </Card>
      )}

      {phase === 'confirm' && draft && (
        <Card className="space-y-5 p-5">
          <div className="flex items-center gap-2"><AiBadge /><span className="text-xs text-slate-500">逐条勾选 / 修改，确认后才写入任务表与记忆库</span></div>

          <section>
            <h2 className="mb-1 text-[15px] font-semibold text-slate-900">会议标题</h2>
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
              {draft.extraction.repeated_topics.map((r) => <p key={r.memory_id}>重复讨论：「{r.topic}」在历史决议 {r.memory_id} 中已有结论</p>)}
            </div>
          )}

          <section>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-slate-900">决议（{editDecisions.length}）</h2>
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
              <h2 className="text-[15px] font-semibold text-slate-900">待办（{editActions.length}）</h2>
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
              <h2 className="mb-1 text-[15px] font-semibold text-slate-900">分歧（未达成一致）</h2>
              {draft.extraction.disagreements.map((d, i) => (
                <p key={i} className="text-xs text-slate-600">{d.topic}：{d.positions.join(' / ')}</p>
              ))}
            </section>
          )}

          <section>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-slate-900">待定问题</h2>
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

          {draft.extraction.next_meeting && <p className="text-xs text-slate-500">下次会议：{draft.extraction.next_meeting}</p>}

          <Button onClick={confirm}>✔ 确认并落库（写入任务 + 记忆库 + 提醒）</Button>
        </Card>
      )}

      {phase === 'done' && (
        <Card className="space-y-3 p-4">
          <p className="text-sm font-semibold text-green-700">已落库：任务上看板、决议进记忆库、提醒规则已挂载</p>
          <Textarea readOnly value={groupMessage} rows={14} className="font-mono text-xs" aria-label="群消息文本" />
          <div className="flex gap-2">
            <Button onClick={copyMessage}>{copied ? '已复制' : '一键复制群消息'}</Button>
            <Link href={`/app/meeting/${meetingId}`} className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">查看纪要</Link>
            <Link href={`/app/c/${draft?.courseId}`} className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">去看板</Link>
          </div>
        </Card>
      )}
    </div>
  );
}