// 中文检索分词：CJK 字符 bigram + 拉丁词（MiniSearch 用）
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const lower = text.toLowerCase();
  const latin = lower.match(/[a-z0-9]+/g);
  if (latin) tokens.push(...latin);
  const cjk = lower.replace(/[^\u4e00-\u9fff]/g, '');
  for (let i = 0; i < cjk.length - 1; i++) tokens.push(cjk.slice(i, i + 2));
  if (cjk.length === 1) tokens.push(cjk);
  return tokens;
}

export function estimateTokens(text: string): number {
  // 中文约 1 字 ≈ 1 token，英文按词估算；Demo 计量用
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const other = text.replace(/[\u4e00-\u9fff]/g, '').trim();
  const words = other ? other.split(/\s+/).length : 0;
  return cjk + Math.ceil(words * 1.3);
}