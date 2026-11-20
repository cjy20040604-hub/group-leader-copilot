// Meeting title: prefer AI-extracted topics; fall back to a deterministic template when none.
export function deriveTitle(topics: string[], fallback: string): { title: string; source: 'ai' | 'template' } {
  const clean = topics.map((t) => t.trim()).filter(Boolean);
  if (!clean.length) return { title: fallback, source: 'template' };
  const joined = clean.slice(0, 2).join('、');
  return { title: joined.length > 30 ? `${joined.slice(0, 30)}…` : joined, source: 'ai' };
}