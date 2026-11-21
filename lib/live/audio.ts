// 浏览器端录音的纯函数部分（可单测）：重采样到 16 kHz、按音量切段（VAD）、编码 WAV
// 「什么时候算有人在说话」是规则（音量阈值 + 静音时长），不需要 AI；只有切出来的语音段才送去识别，静音不花钱

export const TARGET_RATE = 16000;

export function rms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return frame.length ? Math.sqrt(sum / frame.length) : 0;
}

// 简单的平均降采样（48k/44.1k → 16k），会议语音够用
export function downsample(input: Float32Array, inRate: number, outRate = TARGET_RATE): Float32Array {
  if (inRate === outRate) return input;
  const ratio = inRate / outRate;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

export interface VadOptions {
  sampleRate: number;
  threshold: number;     // RMS 超过它算「有声音」
  minSpeechMs: number;   // 有声音不到这么久的当噪声丢掉（咳嗽、碰桌子）
  hangoverMs: number;    // 静音持续这么久才算一句说完
  maxSegmentMs: number;  // 一段最长多久（百炼单次识别 ≤ 5 分钟，这里切得更短，转写更「实时」）
  preRollMs: number;     // 开口前多留一点，别把第一个字切掉
}

export const DEFAULT_VAD: Omit<VadOptions, 'sampleRate'> = {
  threshold: 0.015, minSpeechMs: 300, hangoverMs: 800, maxSegmentMs: 20000, preRollMs: 200,
};

export interface VadResult { level: number; speaking: boolean; segment?: Float32Array }

export class VadSegmenter {
  private opts: VadOptions;
  private pre: Float32Array[] = [];
  private preLen = 0;
  private cur: Float32Array[] = [];
  private curLen = 0;
  private voicedMs = 0;
  private silenceMs = 0;
  private inSpeech = false;
  silentForMs = 0; // 连续静音多久（用于「长时间没人说话 → 自动结束」）

  get active(): boolean {
    return this.inSpeech;
  }

  constructor(opts: Partial<VadOptions> & { sampleRate: number }) {
    this.opts = { ...DEFAULT_VAD, ...opts };
  }

  private ms(samples: number) {
    return (samples / this.opts.sampleRate) * 1000;
  }

  private take(): Float32Array {
    const out = new Float32Array(this.curLen);
    let o = 0;
    for (const f of this.cur) { out.set(f, o); o += f.length; }
    this.cur = []; this.curLen = 0; this.voicedMs = 0; this.silenceMs = 0;
    return out;
  }

  push(frame: Float32Array): VadResult {
    const level = rms(frame);
    const loud = level >= this.opts.threshold;
    const dur = this.ms(frame.length);
    this.silentForMs = loud ? 0 : this.silentForMs + dur;

    if (!this.inSpeech) {
      if (loud) {
        this.inSpeech = true;
        this.cur = [...this.pre, frame];
        this.curLen = this.preLen + frame.length;
        this.pre = []; this.preLen = 0;
        this.voicedMs = dur; this.silenceMs = 0;
      } else {
        this.pre.push(frame); this.preLen += frame.length;
        while (this.pre.length > 1 && this.ms(this.preLen - this.pre[0].length) >= this.opts.preRollMs) {
          this.preLen -= this.pre.shift()!.length;
        }
      }
      return { level, speaking: this.inSpeech };
    }

    this.cur.push(frame); this.curLen += frame.length;
    if (loud) { this.voicedMs += dur; this.silenceMs = 0; } else { this.silenceMs += dur; }

    if (this.ms(this.curLen) >= this.opts.maxSegmentMs) {
      return { level, speaking: true, segment: this.take() };
    }
    if (this.silenceMs >= this.opts.hangoverMs) {
      this.inSpeech = false;
      const keep = this.voicedMs >= this.opts.minSpeechMs;
      const seg = this.take();
      return { level, speaking: false, segment: keep ? seg : undefined };
    }
    return { level, speaking: true };
  }

  // 结束录音时把没说完的那段交出去
  flush(): Float32Array | undefined {
    if (!this.inSpeech) return undefined;
    this.inSpeech = false;
    const keep = this.voicedMs >= this.opts.minSpeechMs;
    const seg = this.take();
    return keep ? seg : undefined;
  }
}

// 16-bit PCM 单声道 WAV
export function encodeWav(samples: Float32Array, sampleRate = TARGET_RATE): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}
