import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VadSegmenter, encodeWav, downsample, rms, toBase64 } from './audio';

const RATE = 16000;
const FRAME = 1600; // 100ms
const tone = (amp: number) => Float32Array.from({ length: FRAME }, (_, i) => amp * Math.sin(i / 3));
const quiet = () => new Float32Array(FRAME);

function feed(vad: VadSegmenter, pattern: [number, number][]) {
  const segs: Float32Array[] = [];
  for (const [amp, frames] of pattern) {
    for (let i = 0; i < frames; i++) {
      const r = vad.push(amp ? tone(amp) : quiet());
      if (r.segment) segs.push(r.segment);
    }
  }
  return segs;
}

describe('VadSegmenter', () => {
  it('说一句（1.5 秒）再静音 1 秒 → 切出一段，含开口前 200ms', () => {
    const vad = new VadSegmenter({ sampleRate: RATE });
    const segs = feed(vad, [[0, 5], [0.2, 15], [0, 10]]);
    assert.equal(segs.length, 1);
    // 预留 2 帧 + 说话 15 帧 + 静音 8 帧（到 800ms 判定说完）
    assert.equal(segs[0].length, (2 + 15 + 8) * FRAME);
  });

  it('咳嗽一声（100ms）不算一句话', () => {
    const vad = new VadSegmenter({ sampleRate: RATE });
    assert.equal(feed(vad, [[0, 3], [0.3, 1], [0, 12]]).length, 0);
  });

  it('一口气说超过 20 秒 → 强制切段，保证转写不卡住', () => {
    const vad = new VadSegmenter({ sampleRate: RATE });
    const segs = feed(vad, [[0.2, 250]]);
    assert.equal(segs.length, 1);
    assert.equal(segs[0].length, 200 * FRAME);
  });

  it('连续静音时长可用于「长时间没人说话 → 自动结束」', () => {
    const vad = new VadSegmenter({ sampleRate: RATE });
    feed(vad, [[0.2, 5], [0, 30]]);
    assert.ok(Math.abs(vad.silentForMs - 3000) < 1e-6);
  });

  it('停止录音时没说完的话也交出来', () => {
    const vad = new VadSegmenter({ sampleRate: RATE });
    feed(vad, [[0.2, 6]]);
    assert.equal(vad.flush()?.length, 6 * FRAME);
    assert.equal(vad.flush(), undefined);
  });
});

describe('encodeWav / downsample', () => {
  it('WAV 头：16kHz 单声道 16bit，长度 44 + 2n', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2]));
    const v = new DataView(wav.buffer);
    assert.equal(wav.length, 44 + 8);
    assert.equal(String.fromCharCode(...wav.subarray(0, 4)), 'RIFF');
    assert.equal(v.getUint16(22, true), 1);
    assert.equal(v.getUint32(24, true), 16000);
    assert.equal(v.getInt16(46, true), 32767);
    assert.equal(v.getInt16(48, true), -32768);
    assert.equal(v.getInt16(50, true), 32767, '超出范围的样本被削顶');
  });

  it('48k → 16k 长度变为 1/3，音量基本不变', () => {
    const src = Float32Array.from({ length: 4800 }, (_, i) => 0.5 * Math.sin(i / 50));
    const out = downsample(src, 48000);
    assert.equal(out.length, 1600);
    assert.ok(Math.abs(rms(out) - rms(src)) < 0.01);
  });

  it('Base64 能还原', () => {
    const bytes = Uint8Array.from({ length: 70000 }, (_, i) => i % 256);
    assert.deepEqual(Uint8Array.from(Buffer.from(toBase64(bytes), 'base64')), bytes);
  });
});
