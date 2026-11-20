export interface RosterMember {
  id: string;
  name: string;
  aliases: string[];
}

// 别名输入框 → 数组：中英文逗号/顿号/分号/空白分隔，去空去重
export function parseAliases(input: string): string[] {
  return [...new Set(input.split(/[,，、;；\s]+/).map((s) => s.trim()).filter(Boolean))];
}

export interface OwnerMatch {
  id: string | null;
  how: 'exact' | 'alias' | 'contains' | 'fuzzy' | 'ambiguous' | 'none';
  candidates: string[]; // 模糊/歧义时的候选成员 id
}

// 人名匹配：完全匹配 → 别名 → 互相包含 → 编辑距离 ≤ 1
// 后两种只是「猜」，返回 how 让校验步骤标黄；同时猜中两个人就不猜，交给组长选
export function matchOwnerDetailed(raw: string | null | undefined, roster: RosterMember[]): OwnerMatch {
  const none: OwnerMatch = { id: null, how: 'none', candidates: [] };
  if (!raw) return none;
  const text = raw.trim();
  if (!text) return none;
  for (const m of roster) if (text === m.name) return { id: m.id, how: 'exact', candidates: [] };
  for (const m of roster) if (m.aliases.includes(text)) return { id: m.id, how: 'alias', candidates: [] };

  const pick = (how: OwnerMatch['how'], ids: string[]): OwnerMatch | null => {
    const uniq = [...new Set(ids)];
    if (uniq.length === 1) return { id: uniq[0], how, candidates: uniq };
    if (uniq.length > 1) return { id: null, how: 'ambiguous', candidates: uniq };
    return null;
  };
  // 「浩然哥」包含「浩然」；单字（「小」）不拿来反向包含
  const contains = roster.filter((m) => [m.name, ...m.aliases].some((n) => text.includes(n) || (text.length >= 2 && n.includes(text))));
  const c = pick('contains', contains.map((m) => m.id));
  if (c) return c;
  const fuzzy = roster.filter((m) => [m.name, ...m.aliases].some((n) => n.length >= 2 && editDistance(text, n) <= 1));
  return pick('fuzzy', fuzzy.map((m) => m.id)) ?? none;
}

export function matchOwner(raw: string | null | undefined, roster: RosterMember[]): string | null {
  return matchOwnerDetailed(raw, roster).id;
}

// 「我来做」的「我」= 说这句话的人：在转写里找到原话所在的那一行，取说话人
export function speakerOfEvidence(evidence: string | null | undefined, transcript: string): string | null {
  if (!evidence) return null;
  const key = evidence.replace(/\s+/g, '').slice(0, 12);
  if (!key) return null;
  for (const line of transcript.split('\n')) {
    const m = line.match(/^\s*(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*)?([^：:\s]{1,8})[：:](.*)$/);
    if (m && m[2].replace(/\s+/g, '').includes(key)) return m[1];
  }
  return null;
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}
