'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Badge, Select, cx } from '@/components/ui';
import { RecordIcon, PauseIcon, PlayIcon, FastIcon } from '@/components/icons';
import { clock, type ScriptLine } from '@/lib/live/cues';
import { VadSegmenter, downsample, encodeWav, toBase64, TARGET_RATE } from '@/lib/live/audio';
import { describeMicError, detectBrowser, PERMISSION_LABEL, type MicHelp, type MicPermission } from '@/lib/live/mic-permission';
import type { CarryItem } from '@/lib/review';
import { CoursePicker } from '@/components/course-picker';

// local：Mock 模式下麦克风录到的语音段（没转文字，可回放）
type Line = { id: number; at: number; speaker: string; text: string; hint?: boolean; local?: boolean; audioUrl?: string };
type Hint = { memoryId: string; text: string; meetingDate: string; matched: string; clause: string; similarity: number; lineId: number };
type Source = 'demo' | 'mic';
// winding：演示录音放完 / 长时间没人说话 → 倒计时自动结束（可取消）
type Phase = 'idle' | 'countdown' | 'recording' | 'paused' | 'winding' | 'saving';

interface Props {
  courses: { id: string; name: string; color: string }[];
  rosters: Record<string, { id: string; name: string }[]>; // 每门课的小组名单（不同课的组员可以不一样）
  people?: { id: string; name: string }[];
  initialCourse: string;
  today: string;
  mock: boolean;
  asrModel: string;
  autoRecord: boolean;
  demoCourse: string;
  script: ScriptLine[];
  carry: Record<string, { lastMeeting: string | null; items: CarryItem[] }>;
  canCreateCourse?: boolean;
}

const CARRY_LABEL: Record<CarryItem['kind'], string> = {
  blocked: '卡住', overdue: '过期', extension: '延期', unclaimed: '没人认领', silent: '没动静', review: '待确认', question: '待定',
};
const COUNTDOWN = 3;
const SILENCE_WIND_MS = 120_000; // 2 分钟没人说话 → 准备自动结束
const WIND_DEMO = 5;
const WIND_MIC = 30;
const MAX_LOCAL_SECONDS = 1800; // Mock 录音最多在页面里留 30 分钟有声片段，免得占满内存

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export function LiveMeeting(props: Props) {
  const { mock, script, demoCourse } = props;
  const [courses, setCourses] = useState(props.courses);
  const router = useRouter();
  const [courseId, setCourseId] = useState(props.initialCourse);
  const [source, setSource] = useState<Source>(mock ? 'demo' : 'mic');
  const [autoRecord, setAutoRecord] = useState(props.autoRecord);
  // 进会议室就自动开录：首屏直接是倒计时（Mock 下非演示课程不自动开，因为没有可录的东西）
  const autoStart = props.autoRecord && !(props.mock && props.initialCourse !== demoCourse);
  const [phase, setPhase] = useState<Phase>(autoStart ? 'countdown' : 'idle');
  const [count, setCount] = useState(COUNTDOWN);
  const [lines, setLines] = useState<Line[]>([]);
  const [partial, setPartial] = useState<{ speaker: string; text: string } | null>(null);
  const [clockSec, setClockSec] = useState(0);
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [hints, setHints] = useState<Hint[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [speed, setSpeed] = useState(1);
  const [speaker, setSpeaker] = useState('');
  const [inflight, setInflight] = useState(0);
  const [error, setError] = useState('');
  // 麦克风授权：先在页面里征得同意，再让浏览器弹系统授权框
  const [micPerm, setMicPerm] = useState<MicPermission>('unknown');
  const [consentOpen, setConsentOpen] = useState(false);
  const [micHelp, setMicHelp] = useState<MicHelp | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [recording, setRecording] = useState<{ url: string; seconds: number; voiced: number; segments: number } | null>(null);

  const phaseRef = useRef<Phase>(autoStart ? 'countdown' : 'idle');
  const speedRef = useRef(1);
  const speakerRef = useRef('');
  const sessionRef = useRef('');
  const lineIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idxRef = useRef(0);
  const charRef = useRef(0);
  const linesRef = useRef<Line[]>([]);
  const hintCountRef = useRef(0);
  const inflightRef = useRef(0);
  const audioRef = useRef<{ stream: MediaStream; ctx: AudioContext; proc: ScriptProcessorNode; vad: VadSegmenter; startedAt: number; pausedMs: number; pauseAt: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const micPermRef = useRef<MicPermission>('unknown');
  const sourceRef = useRef<Source>(mock ? 'demo' : 'mic');
  const localSegsRef = useRef<Float32Array[]>([]);

  const course = courses.find((c) => c.id === courseId);
  const demoMismatch = source === 'demo' && courseId !== demoCourse;
  const carry = props.carry[courseId] ?? { lastMeeting: null, items: [] };

  const go = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { speakerRef.current = speaker; }, [speaker]);
  useEffect(() => { hintCountRef.current = hints.length; }, [hints]);
  useEffect(() => { micPermRef.current = micPerm; }, [micPerm]);
  useEffect(() => { sourceRef.current = source; }, [source]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [lines, partial]);

  const clearTimers = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    timerRef.current = null;
    tickRef.current = null;
  };

  // 会中「这事定过了」：规则挑句 + embedding 比对，不调大模型
  const checkLine = useCallback(async (line: Line) => {
    try {
      const res = await fetch('/api/live/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId, text: line.text, sessionId: sessionRef.current }) });
      const data = await res.json();
      if (!data.hits?.length) return;
      setHints((prev) => {
        const fresh = (data.hits as Omit<Hint, 'lineId'>[]).filter((h) => !prev.some((p) => p.memoryId === h.memoryId));
        return fresh.length ? [...prev, ...fresh.map((h) => ({ ...h, lineId: line.id }))] : prev;
      });
      setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, hint: true } : l)));
      linesRef.current = linesRef.current.map((l) => (l.id === line.id ? { ...l, hint: true } : l));
    } catch { /* 查重失败不影响录音 */ }
  }, [courseId]);

  const appendLine = useCallback((at: number, who: string, text: string) => {
    const line = { id: ++lineIdRef.current, at, speaker: who, text };
    linesRef.current = [...linesRef.current, line];
    setLines(linesRef.current);
    void checkLine(line);
  }, [checkLine]);

  // ───── 演示录音：逐句「转写」seed/new_meeting.txt（Mock 模式，不调语音模型）─────
  const demoTick = useCallback(() => {
    if (phaseRef.current !== 'recording') return;
    const line = script[idxRef.current];
    if (!line) {
      setPartial(null); setSpeaking(false); setLevel(0.02);
      windDown(WIND_DEMO);
      return;
    }
    if (charRef.current === 0) setClockSec(line.at);
    charRef.current = Math.min(line.text.length, charRef.current + 2);
    setPartial({ speaker: line.speaker ?? '发言人', text: line.text.slice(0, charRef.current) });
    setSpeaking(true);
    setLevel(0.35 + Math.random() * 0.55);
    if (charRef.current >= line.text.length) {
      appendLine(line.at, line.speaker ?? '发言人', line.text);
      idxRef.current += 1;
      charRef.current = 0;
      setPartial(null); setSpeaking(false); setLevel(0.03);
      timerRef.current = setTimeout(demoTick, 650 / speedRef.current);
    } else {
      timerRef.current = setTimeout(demoTick, 110 / speedRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script, appendLine]);

  // Mock 模式：麦克风是真的在录，但不调语音模型；每段留在页面里，可回放，结束后可下载
  const keepLocal = useCallback((seg: Float32Array, at: number) => {
    const kept = localSegsRef.current.reduce((a, b) => a + b.length, 0) / TARGET_RATE;
    if (kept < MAX_LOCAL_SECONDS) localSegsRef.current.push(seg);
    const url = URL.createObjectURL(new Blob([encodeWav(seg, TARGET_RATE) as BlobPart], { type: 'audio/wav' }));
    const n = linesRef.current.filter((l) => l.local).length + 1;
    const line: Line = { id: ++lineIdRef.current, at, speaker: speakerRef.current || '发言人', text: `第 ${n} 段发言 · ${(seg.length / TARGET_RATE).toFixed(1)} 秒（未转文字）`, local: true, audioUrl: url };
    linesRef.current = [...linesRef.current, line];
    setLines(linesRef.current);
  }, []);

  // ───── 麦克风：VAD 切段 → /api/asr/live（真实模式）─────
  const sendSegment = useCallback(async (seg: Float32Array, at: number) => {
    if (mock) { keepLocal(seg, at); return; }
    inflightRef.current += 1; setInflight(inflightRef.current);
    try {
      const audio = toBase64(encodeWav(seg, TARGET_RATE));
      const res = await fetch('/api/asr/live', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio, seconds: seg.length / TARGET_RATE, courseId, sessionId: sessionRef.current }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? '转写失败');
      else if (data.text) appendLine(at, speakerRef.current || '发言人', data.text);
    } catch (e) {
      setError(`转写失败：${(e as Error).message}`);
    } finally {
      inflightRef.current -= 1; setInflight(inflightRef.current);
    }
  }, [courseId, appendLine, mock, keepLocal]);

  const micElapsed = () => {
    const a = audioRef.current;
    return a ? (performance.now() - a.startedAt - a.pausedMs) / 1000 : 0;
  };

  const getMicStream = () => navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });

  async function startMic(granted?: MediaStream) {
    const stream = granted ?? await getMicStream();
    // 录到一半麦克风被拔掉、或权限被关掉
    stream.getAudioTracks()[0]?.addEventListener('ended', () => {
      if (phaseRef.current !== 'recording') return;
      pause();
      setMicHelp({ title: '麦克风断开了', steps: ['检查麦克风是否被拔掉，或权限是不是被关掉了', '恢复后点「继续」；也可以直接结束会议'], canRetry: false });
      setConsentOpen(true);
    });
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const vad = new VadSegmenter({ sampleRate: TARGET_RATE });
    audioRef.current = { stream, ctx, proc, vad, startedAt: performance.now(), pausedMs: 0, pauseAt: 0 };
    let lastUi = 0;
    let segStart = 0;
    proc.onaudioprocess = (e) => {
      if (phaseRef.current !== 'recording') return;
      const frame = downsample(new Float32Array(e.inputBuffer.getChannelData(0)), ctx.sampleRate);
      const wasSpeaking = vad.active;
      const r = vad.push(frame);
      if (!wasSpeaking && r.speaking) segStart = micElapsed();
      const now = performance.now();
      if (now - lastUi > 100) { lastUi = now; setLevel(Math.min(1, r.level * 12)); setSpeaking(r.speaking); }
      if (r.segment) { void sendSegment(r.segment, segStart); segStart = micElapsed(); }
      if (vad.silentForMs >= SILENCE_WIND_MS) windDown(WIND_MIC);
    };
    src.connect(proc);
    proc.connect(ctx.destination);
    tickRef.current = setInterval(() => { if (phaseRef.current === 'recording') setClockSec(micElapsed()); }, 500);
  }

  function stopMic() {
    const a = audioRef.current;
    if (!a) return;
    a.proc.disconnect();
    a.stream.getTracks().forEach((t) => t.stop());
    void a.ctx.close();
  }

  // ───── 生命周期：倒计时自动开录 → 录音 → 暂停/继续 → 自动或手动结束 ─────
  async function start(granted?: MediaStream) {
    // 麦克风没授权过：先停下来征得同意，不偷偷录
    if (sourceRef.current === 'mic' && !granted && micPermRef.current !== 'granted') {
      clearTimers();
      go('idle');
      openConsent();
      return;
    }
    setError('');
    // 新的一次录音：清掉上一次留在页面上的转写、提醒和录音（释放回放用的内存）
    if (recording) URL.revokeObjectURL(recording.url);
    linesRef.current.forEach((l) => l.audioUrl && URL.revokeObjectURL(l.audioUrl));
    linesRef.current = [];
    setLines([]);
    setHints([]);
    setClockSec(0);
    setRecording(null);
    localSegsRef.current = [];
    sessionRef.current = `m-live-${Date.now()}`;
    go('recording');
    if (sourceRef.current === 'demo') {
      idxRef.current = 0; charRef.current = 0;
      timerRef.current = setTimeout(demoTick, 300);
    } else {
      try {
        await startMic(granted);
      } catch (e) {
        go('idle');
        showMicError(e as Error);
      }
    }
  }

  // ───── 麦克风授权 ─────
  const helpCtx = () => ({
    secure: window.isSecureContext,
    hasMediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
    browser: detectBrowser(navigator.userAgent),
    host: location.host,
    isMac: /Mac/i.test(navigator.userAgent),
  });

  function openConsent() {
    const ctx = helpCtx();
    if (!ctx.secure || !ctx.hasMediaDevices) setMicHelp(describeMicError(null, ctx));
    else if (micPermRef.current === 'denied') setMicHelp(describeMicError({ name: 'NotAllowedError' }, ctx));
    else setMicHelp(null);
    setConsentOpen(true);
  }

  function showMicError(e: { name?: string; message?: string }) {
    if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') setMicPerm('denied');
    setMicHelp(describeMicError(e, helpCtx()));
    setConsentOpen(true);
  }

  // 组长在页面里点了「允许」→ 浏览器弹系统授权框 → 允许后直接开录
  async function requestMic() {
    setRequesting(true);
    setMicHelp(null);
    try {
      const stream = await getMicStream();
      setMicPerm('granted');
      micPermRef.current = 'granted';
      setConsentOpen(false);
      await start(stream);
    } catch (e) {
      showMicError(e as Error);
    } finally {
      setRequesting(false);
    }
  }

  function startRecording() {
    if (source === 'mic' && micPerm !== 'granted') { openConsent(); return; }
    startCountdown();
  }

  function startCountdown() {
    if (demoMismatch) return;
    go('countdown');
    setCount(COUNTDOWN);
    runCountdown();
  }

  function runCountdown() {
    clearTimers();
    let n = COUNTDOWN;
    tickRef.current = setInterval(() => {
      n -= 1;
      setCount(n);
      if (n <= 0) { clearTimers(); void start(); }
    }, 1000);
  }

  function cancelCountdown() {
    clearTimers();
    go('idle');
  }

  function pause() {
    go('paused');
    if (timerRef.current) clearTimeout(timerRef.current);
    if (audioRef.current) audioRef.current.pauseAt = performance.now();
    setSpeaking(false); setLevel(0);
  }

  function resume() {
    if (audioRef.current?.pauseAt) {
      audioRef.current.pausedMs += performance.now() - audioRef.current.pauseAt;
      audioRef.current.pauseAt = 0;
      audioRef.current.vad.silentForMs = 0;
    }
    go('recording');
    if (source === 'demo') timerRef.current = setTimeout(demoTick, 200);
  }

  const windRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [wind, setWind] = useState(0);
  function windDown(seconds: number) {
    if (phaseRef.current === 'winding') return;
    go('winding');
    setWind(seconds);
    let n = seconds;
    windRef.current = setInterval(() => {
      n -= 1;
      setWind(n);
      if (n <= 0) { if (windRef.current) clearInterval(windRef.current); void finish(); }
    }, 1000);
  }
  function keepRecording() {
    if (windRef.current) clearInterval(windRef.current);
    if (audioRef.current) audioRef.current.vad.silentForMs = 0;
    go('recording');
  }

  function buildTranscript(all: Line[]): string {
    const out: string[] = [];
    let lastMark = -Infinity;
    for (const l of all) {
      if (l.at - lastMark >= 300) { out.push(`[${clock(l.at)}]`); lastMark = l.at; }
      out.push(`${l.speaker}：${l.text}`);
    }
    return out.join('\n');
  }

  async function finish() {
    if (phaseRef.current === 'saving') return;
    if (windRef.current) clearInterval(windRef.current);
    clearTimers();
    go('saving');
    setSpeaking(false); setLevel(0); setPartial(null);
    if (audioRef.current) {
      const last = audioRef.current.vad.flush();
      if (last) void sendSegment(last, micElapsed());
      stopMic();
      // 等最后几段转写回来（最多 15 秒）
      const t0 = Date.now();
      while (inflightRef.current > 0 && Date.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 300));
    }
    const all = linesRef.current.filter((l) => !l.local);
    if (all.length === 0) {
      const segs = localSegsRef.current;
      if (segs.length) {
        // Mock 麦克风：没有文字可整理，给出录音（有人说话的部分拼起来），可回放、下载
        const total = segs.reduce((a, b) => a + b.length, 0);
        const joined = new Float32Array(total);
        let o = 0;
        for (const seg of segs) { joined.set(seg, o); o += seg.length; }
        const url = URL.createObjectURL(new Blob([encodeWav(joined, TARGET_RATE) as BlobPart], { type: 'audio/wav' }));
        setRecording({ url, seconds: Math.floor(micElapsed()), voiced: Math.floor(total / TARGET_RATE), segments: linesRef.current.filter((l) => l.local).length });
        audioRef.current = null;
        go('idle');
        return;
      }
      setError(source === 'mic' ? '没录到有人说话的声音：检查麦克风有没有选对、音量条动不动' : '还没有转写内容，没法整理纪要');
      audioRef.current = null;
      go('idle');
      return;
    }
    const seconds = source === 'demo' ? (script[script.length - 1]?.at ?? 0) + 5 : micElapsed();
    const res = await fetch('/api/live/finish', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId, date: props.today, transcript: buildTranscript(all), sessionId: sessionRef.current,
        source, seconds: Math.round(seconds), lines: all.length, hints: hintCountRef.current,
      }),
    }).catch(() => null);
    if (!res?.ok) {
      setError('保存转写失败，请重试');
      go('paused');
      return;
    }
    router.push('/app/meeting/new?from=live');
  }

  // 读浏览器里麦克风权限的当前状态（已允许 / 没问过 / 已拒绝），并跟着变化
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const apply = (state: MicPermission) => {
      setMicPerm(state);
      micPermRef.current = state;
      // 自动开录倒计时中，但麦克风还没授权：停下倒计时，先征得同意
      if (state !== 'granted' && phaseRef.current === 'countdown' && sourceRef.current === 'mic') {
        clearTimers();
        go('idle');
        openConsent();
      }
    };
    const onChange = () => { if (status) apply(status.state as MicPermission); };
    void (async () => {
      await Promise.resolve();
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { apply('unsupported'); return; }
      try {
        status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        apply(status.state as MicPermission);
        status.addEventListener('change', onChange);
      } catch { /* 有的浏览器不支持查询麦克风权限：保持「还没问过」，点开始时再问 */ }
    })();
    return () => status?.removeEventListener('change', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 进会议室就自动开录（3 秒倒计时，可取消）
  useEffect(() => {
    if (autoStart) runCountdown();
    return () => {
      clearTimers();
      if (windRef.current) clearInterval(windRef.current);
      stopMic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleAuto(v: boolean) {
    setAutoRecord(v);
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auto_record: v }) });
  }

  const live = phase === 'recording' || phase === 'paused' || phase === 'winding' || phase === 'saving';
  const localMic = source === 'mic' && mock;
  const statusText = phase === 'countdown' ? `${count} 秒后自动开录` : phase === 'recording' ? (speaking ? (localMic ? '有人在说话 · 录音中' : '有人在说话 · 正在转写') : (localMic ? '静音中' : '静音中 · 不上传')) :
    phase === 'paused' ? '已暂停' : phase === 'winding' ? `没人说话了，${wind} 秒后自动结束` : phase === 'saving' ? '正在整理…' : '未开始';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-medium tracking-tight text-slate-900 sm:text-[28px]">会议室</h1>
        {course && <span className="inline-flex items-center gap-1.5 text-sm text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: course.color }} aria-hidden />{course.name} · {md(props.today)}</span>}
      </div>

      {/* 控制条 */}
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-start gap-1 text-xs text-slate-500">
            <span className="pt-1.5">课程</span>
            <CoursePicker courses={courses} value={courseId} onChange={setCourseId} disabled={live} canCreate={Boolean(props.canCreateCourse)} people={props.people} className="py-1 text-xs"
              onCourseCreated={(c) => setCourses((prev) => [...prev, { id: c.id, name: c.name, color: c.color ?? '#64748b' }])} />
          </div>
          <div role="radiogroup" aria-label="录音来源" className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
            <button role="radio" aria-checked={source === 'mic'} disabled={live} onClick={() => { setSource('mic'); setRecording(null); }}
              title={mock ? '离线演示：只录音，不转文字' : ''}
              className={cx('rounded-md px-3 py-1.5 transition-colors', source === 'mic' ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900', live && 'cursor-not-allowed opacity-50')}>麦克风</button>
            <button role="radio" aria-checked={source === 'demo'} disabled={live} onClick={() => setSource('demo')}
              className={cx('rounded-md px-3 py-1.5 transition-colors', source === 'demo' ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900', live && 'cursor-not-allowed opacity-50')}>演示录音</button>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={autoRecord} onChange={(e) => toggleAuto(e.target.checked)} />进会议室自动开录
          </label>
          {source === 'mic' && (
            <span className="flex items-center gap-1 text-xs text-slate-600">
              麦克风权限
              <Badge tone={micPerm === 'granted' ? 'green' : micPerm === 'denied' || micPerm === 'unsupported' ? 'red' : 'slate'}>{PERMISSION_LABEL[micPerm]}</Badge>
              {micPerm !== 'granted' && !live && <button className="text-brand-600 hover:underline" onClick={openConsent}>{micPerm === 'denied' ? '怎么打开' : '去授权'}</button>}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {phase === 'idle' && <Button onClick={startRecording} disabled={demoMismatch}><RecordIcon />开始录音</Button>}
            {phase === 'countdown' && <Button variant="outline" onClick={cancelCountdown}>先别录</Button>}
            {phase === 'recording' && <Button variant="outline" onClick={pause}><PauseIcon />暂停</Button>}
            {phase === 'paused' && <Button variant="outline" onClick={resume}><PlayIcon />继续</Button>}
            {phase === 'winding' && source === 'mic' && <Button variant="outline" onClick={keepRecording}>还在开，继续录</Button>}
            {source === 'demo' && (phase === 'recording' || phase === 'paused') && (
              <Button variant="ghost" size="sm" onClick={() => setSpeed(speed === 1 ? 4 : 1)}><FastIcon />{speed === 1 ? '4 倍速' : '1 倍速'}</Button>
            )}
            {(phase === 'recording' || phase === 'paused' || phase === 'winding') && <Button onClick={() => void finish()}>结束会议，整理纪要</Button>}
          </div>
        </div>

        {source === 'demo' && <p className="text-xs text-slate-500">演示录音：逐句回放一场「市场营销学」组会，模拟实时转写，放完自动整理纪要。</p>}
        {!live && <p className="text-xs text-slate-500">已经在腾讯会议、飞书或钉钉开过了？<Link href="/app/meeting/new" className="text-brand-600 hover:underline">导入转写（粘贴文字稿 / 钉钉会议）→</Link></p>}
        {demoMismatch && (
          <p className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
            演示录音是「市场营销学」的一场会，其他课程请切到麦克风。
            <Button size="sm" variant="outline" onClick={() => setCourseId(demoCourse)}>换成市场营销学</Button>
          </p>
        )}

        {/* 状态：录音灯 + 音量 + 会议时间 */}
        <div className="flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 px-4 py-3">
          <span className={cx('h-2.5 w-2.5 rounded-full', phase === 'recording' ? 'animate-pulse bg-red-500' : phase === 'countdown' ? 'bg-amber-400' : 'bg-slate-300')} aria-hidden />
          <span className="text-2xl font-medium tabular-nums tracking-tight text-slate-900">{clock(clockSec)}</span>
          <div className="flex h-7 items-end gap-0.5" aria-hidden>
            {Array.from({ length: 14 }, (_, i) => (
              <span key={i} className={cx('w-1 rounded-sm', speaking ? 'bg-brand-500' : 'bg-slate-300')}
                style={{ height: `${Math.max(12, Math.min(100, level * 100 * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7 + clockSec)))))}%` }} />
            ))}
          </div>
          <span className="text-sm text-slate-600" aria-live="polite">{statusText}</span>
          {inflight > 0 && <Badge tone="blue">转写中 {inflight} 段</Badge>}
          <span className="ml-auto text-xs tabular-nums text-slate-400">{lines.length} 句</span>
        </div>

        {phase === 'countdown' && (
          <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">
            开录前请告诉参会人：本次会议会录音并实时转写，只在本组可见；会后先出草稿，组长确认后才保存。
          </p>
        )}
        {phase === 'winding' && source === 'demo' && <p className="rounded-lg bg-slate-100 p-2 text-xs text-slate-600">演示录音放完了，{wind} 秒后自动结束会议并进入纪要整理。</p>}
        {recording && (
          <div className="space-y-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">
            <p className="text-sm font-medium">录音已结束：时长 {clock(recording.seconds)}，有人说话 {recording.voiced} 秒（{recording.segments} 段）</p>
            <p>离线演示只录音、不转文字。下面是有人说话的部分。</p>
            <audio controls src={recording.url} className="w-full" />
            <div className="flex flex-wrap gap-2">
              <a href={recording.url} download={`会议录音-${props.today}.wav`} className="rounded-lg border border-emerald-300 bg-white px-2.5 py-1 font-medium text-emerald-800 hover:bg-emerald-100">下载录音（WAV）</a>
              <Button size="sm" variant="outline" onClick={() => { setRecording(null); setSource('demo'); setCourseId(demoCourse); }}>换演示录音，体验整理纪要</Button>
            </div>
          </div>
        )}
        {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600">{error}</p>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 实时转写 */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <p className="text-[15px] font-medium text-slate-900">实时转写</p>
            {source === 'mic' && live && (
              <label className="text-xs text-slate-500">当前发言人
                <Select value={speaker} onChange={(e) => setSpeaker(e.target.value)} className="ml-1 py-0.5 text-xs">
                  <option value="">不确定</option>
                  {(props.rosters[courseId] ?? []).map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                </Select>
              </label>
            )}
          </div>
          <div ref={scrollRef} className="h-[28rem] space-y-2.5 overflow-y-auto px-5 py-4" aria-live="off">
            {lines.length === 0 && !partial && (
              <p className="pt-24 text-center text-sm text-slate-400">
                {phase === 'countdown' ? '马上开录…' : phase === 'idle' ? '开录后，说的话会一句句出现在这里' : '等有人说话…'}
              </p>
            )}
            {lines.map((l) => (
              <p key={l.id} className={cx('text-sm leading-relaxed text-slate-700', l.hint && '-mx-2 rounded-md bg-amber-50 px-2 py-1', l.local && 'text-slate-500')}>
                <span className="mr-3 text-[11px] tabular-nums text-slate-400">{clock(l.at)}</span>
                <span className="font-medium text-slate-900">{l.speaker}：</span>{l.text}
                {l.hint && <span className="ml-2 text-xs font-medium text-amber-700">定过了</span>}
                {l.audioUrl && <button className="ml-2 text-xs text-brand-600 hover:underline" onClick={() => void new Audio(l.audioUrl).play()}>回放</button>}
              </p>
            ))}
            {partial && (
              <p className="text-sm leading-relaxed text-slate-500">
                <span className="mr-3 text-[11px] tabular-nums text-slate-400">{clock(clockSec)}</span>
                <span className="font-medium">{partial.speaker}：</span>{partial.text}<span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-slate-400 align-middle" />
              </p>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          {/* 会中提醒 */}
          <Card className="p-5">
            <p className="text-[15px] font-medium text-slate-900">会中提醒</p>
            {hints.length === 0 ? (
              <p className="mt-1 text-xs text-slate-400">有人提议改已经定过的事时，这里会提醒你，免得重复讨论。</p>
            ) : (
              <div className="mt-2 space-y-2">
                {hints.map((h) => (
                  <div key={h.memoryId} className="rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2.5 text-sm text-slate-800">
                    <p>「{h.clause}」，这个 <b className="tabular-nums">{md(h.meetingDate)}</b> 已经定了：<b>{h.text}</b></p>
                    <p className="mt-1 text-[11px] text-amber-700">相似度 {(h.similarity * 100).toFixed(0)}%，对上的词：{h.matched || '无'}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 上次遗留 */}
          <Card className="p-5">
            <p className="text-[15px] font-medium text-slate-900">上次遗留，逐条过 <span className="tabular-nums text-slate-400">{carry.items.length}</span></p>
            <p className="text-[11px] text-slate-400">{carry.lastMeeting ? `${md(carry.lastMeeting)} 那次会之后自动汇总` : '这门课还没开过会'}</p>
            {carry.items.length === 0 ? <p className="mt-2 text-xs text-slate-400">没有遗留</p> : (
              <ul className="mt-2 space-y-1.5">
                {carry.items.map((c, i) => (
                  <li key={i}>
                    <label className={cx('flex cursor-pointer items-start gap-2 text-xs', checked.has(i) ? 'text-slate-400 line-through' : 'text-slate-700')}>
                      <input type="checkbox" className="mt-0.5" checked={checked.has(i)} onChange={() => setChecked((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                      <span><Badge tone="slate" className="mr-1">{CARRY_LABEL[c.kind]}</Badge>{c.text}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5 text-xs text-slate-600">
            <p className="mb-2 text-[15px] font-medium text-slate-900">这一页哪里用了 AI</p>
            <ul className="space-y-1.5">
              <li><Badge tone="slate">规则</Badge> 麦克风先征得你同意，再由浏览器弹授权框</li>
              <li><Badge tone="slate">规则</Badge> 开录、静音暂停上传、没人说话自动结束</li>
              <li><Badge tone="purple">AI</Badge> 语音 → 文字（{props.asrModel || 'ASR_MODEL 未配置'}）</li>
              <li><Badge tone="blue">embedding</Badge> 「这事定过了」：只比相似度，不调大模型</li>
              <li><Badge tone="purple">AI</Badge> 结束后：整理成决定 / 待办 / 待定，组长确认才保存</li>
            </ul>
          </Card>
        </div>
      </div>
      {consentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onKeyDown={(e) => { if (e.key === 'Escape' && !requesting) setConsentOpen(false); }}>
          <Card role="dialog" aria-modal="true" aria-labelledby="mic-consent-title" className="w-full max-w-md space-y-3 p-5">
            <h2 id="mic-consent-title" className="text-base font-medium">会议室要使用你电脑的麦克风</h2>
            {!micHelp ? (
              <>
                <ul className="space-y-1.5 text-sm text-slate-600">
                  <li><b className="text-slate-800">用来做什么：</b>{mock ? '把会上说的话录下来，可以回放和下载' : '把会上说的话实时转成文字，散会后整理成纪要'}</li>
                  <li><b className="text-slate-800">录什么：</b>只处理有人说话的片段，静音部分不{mock ? '保存' : '上传'}</li>
                  <li><b className="text-slate-800">存到哪里：</b>{mock ? '录音只留在这个浏览器页面，不上传' : '语音片段发给阿里云百炼识别，转出的文字只在本组可见'}</li>
                  <li><b className="text-slate-800">随时可停：</b>可以暂停或结束；也请告诉参会的同学正在录音</li>
                </ul>
                <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500">点「允许使用麦克风」后，浏览器会再弹一个授权框，请在那里选「允许」。</p>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" disabled={requesting} onClick={() => setConsentOpen(false)}>先不用</Button>
                  <Button autoFocus disabled={requesting} onClick={() => void requestMic()}>{requesting ? '请在浏览器弹框里点「允许」…' : '允许使用麦克风'}</Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-red-700">{micHelp.title}</p>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
                  {micHelp.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="ghost" onClick={() => setConsentOpen(false)}>关闭</Button>
                  {source === 'mic' && phase === 'idle' && <Button variant="outline" onClick={() => { setConsentOpen(false); setSource('demo'); setCourseId(demoCourse); }}>先用演示录音</Button>}
                  {micHelp.canRetry && phase === 'idle' && <Button autoFocus disabled={requesting} onClick={() => void requestMic()}>{requesting ? '请求中…' : '我改好了，重试'}</Button>}
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
