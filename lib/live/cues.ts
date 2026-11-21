// 会中「这事是不是定过了」：先用规则挑出「在提议 / 在翻旧账」的半句话，再交给 embedding 比对（不调大模型）
// 规则只决定「要不要去查」，查不查得到由 lib/rag/search.ts 的 findSameTopicDecisions 说了算

const CUE = /要不要|要不|换回|改回|换成|改成|换个|还是用|用什么|用哪个|定了吗|怎么定|重新定|再讨论|再议|翻一下/;
const SPEAKER = /^\s*([一-龥A-Za-z]{1,8})[：:]\s*/;

export function stripSpeaker(line: string): { speaker: string | null; text: string } {
  const m = line.match(SPEAKER);
  return m ? { speaker: m[1], text: line.slice(m[0].length) } : { speaker: null, text: line };
}

export function cueClauses(line: string): string[] {
  const { text } = stripSpeaker(line);
  return text
    .split(/[，。！？；,.!?;…]+/)
    .map((c) => c.trim())
    .filter((c) => c.length >= 4 && c.length <= 40 && CUE.test(c));
}

// 演示录音：「[00:07:20]」时间戳行 + 「名字：内容」发言行
export interface ScriptLine { at: number; speaker: string | null; text: string }

export function parseScript(raw: string): ScriptLine[] {
  const out: ScriptLine[] = [];
  let at = 0;
  let lastStamp = 0;
  let sinceStamp = 0;
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const stamp = line.match(/^\[(\d{2}):(\d{2}):(\d{2})\]$/);
    if (stamp) {
      lastStamp = Number(stamp[1]) * 3600 + Number(stamp[2]) * 60 + Number(stamp[3]);
      sinceStamp = 0;
      at = lastStamp;
      continue;
    }
    const { speaker, text } = stripSpeaker(line);
    out.push({ at, speaker, text });
    // 没有逐句时间戳：按每秒 4 个字估算说话时长，推出下一句的开始时间
    sinceStamp += Math.max(2, Math.round(text.length / 4));
    at = lastStamp + sinceStamp;
  }
  return out;
}

export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
