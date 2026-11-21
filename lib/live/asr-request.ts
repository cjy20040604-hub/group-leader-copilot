// 百炼 Qwen-ASR（OpenAI 兼容接口）请求体。格式按官方文档：
// messages[0] 可放 system 上下文（背景文本、专有名词表，用来提高人名/课程术语的识别率，不能写角色设定）
// messages[1].content = [{ type: 'input_audio', input_audio: { data: 'data:audio/wav;base64,…' } }]
// asr_options 是百炼扩展参数：enable_itn 把「两百份」转成「200份」；不设 language（组会常中英混说 PPT、ER 图）
// ⚠️ 没有 Key，真实调用未联调；单段 ≤ 10 MB、≤ 5 分钟（会议室切段 ≤ 20 秒）

export const ASR_MAX_BYTES = 10 * 1024 * 1024;
export const ASR_MAX_SECONDS = 300;

export function buildAsrRequest(model: string, wavBase64: string, context: string) {
  const messages: unknown[] = [];
  if (context.trim()) messages.push({ role: 'system', content: [{ type: 'text', text: context.trim() }] });
  messages.push({ role: 'user', content: [{ type: 'input_audio', input_audio: { data: `data:audio/wav;base64,${wavBase64}` } }] });
  return { model, messages, stream: false, asr_options: { enable_itn: true } };
}

export function base64Bytes(b64: string): number {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}
