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

export const ASR_PRICE_PER_SECOND = 0.00008; // Paraformer ≈ 0.29 元/小时（待核对：来自需求 prompt，未在百炼价格页核实）

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