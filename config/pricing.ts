// 单价表：元 / 百万 tokens（阿里云百炼 2026-11 原价，上线前请到控制台核对）
// ASR 为元 / 秒。模型名从环境变量读取，这里按模型名查价。

export interface ModelPrice {
  input: number;
  output: number;
}

export const PRICING: Record<string, ModelPrice> = {
  'qwen3.7-plus': { input: 2, output: 8 },
  'qwen-plus': { input: 0.8, output: 2 },
  'text-embedding-v4': { input: 0.5, output: 0 },
};

export const ASR_PRICE_PER_SECOND = 0.00008; // paraformer-v2 ≈ 0.29 元/小时（百炼模型页华北2 原价，2026-11-21 复核）

// 实时 / 准实时语音识别（元 / 秒）。会议室按静音切段，只有有人说话的部分计费
export const ASR_PRICES: Record<string, { perSecond: number; verified: boolean; note: string }> = {
  'paraformer-realtime-v2': { perSecond: 0.00024, verified: true, note: '百炼模型页 华北2 原价（2026-11-21 检索）' },
  'fun-asr-realtime': { perSecond: 0.00033, verified: true, note: '百炼模型页 华北2 原价（2026-11-21 检索）' },
  'qwen3-asr-flash': { perSecond: 0.00022, verified: true, note: '官方价格文档 华北2（北京）原价，2026-11-21 查价；输出不计费，免费额度 36000 秒/90 天；控制台活动优惠未核对' },
};

export function asrPrice(model: string) {
  return ASR_PRICES[model] ?? { perSecond: 0.00024, verified: false, note: `假设：${model || '未配置 ASR_MODEL'} 单价未知，按 paraformer-realtime-v2 估算` };
}

export function asrCostFor(model: string, seconds: number): number {
  return seconds * asrPrice(model).perSecond;
}

export function getPrice(model: string): ModelPrice {
  return PRICING[model] ?? { input: 0.8, output: 2 };
}

export function llmCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = getPrice(model);
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export function embeddingCost(model: string, tokens: number): number {
  return (tokens * getPrice(model).input) / 1_000_000;
}

export function asrCost(seconds: number): number {
  return seconds * ASR_PRICE_PER_SECOND;
}

// 标准 1 小时会议的用量假设（用于成本看板的“标准会议推算”，与 docs/cost-model.md 一致）
export const STANDARD_MEETING = {
  extract: { input: 16000, output: 2500 },
  index: { tokens: 16000 },
  briefing: { input: 4000, output: 800 },
  qa: { input: 3000, output: 400 },
  asrSeconds: 3600,
  meetingsPerSemester: 24, // 3 门课 × 8 次
  qaPerSemester: 200,
  infraPerSemester: 2,
};