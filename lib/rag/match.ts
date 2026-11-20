// 「说的是不是同一件事」（确定性代码，不调模型）：问答、议程查重、决议冲突检测共用
// 规则：关键词（两字以上的实词）必须都能在对方文本里找到——要么原词出现，
//      要么同一概念组里有「另一个词」出现（「风格」≈「模板」），且至少一个原词对上。
// 为什么要它：Mock 向量 85% 权重压在 12 组概念上，同组的话题一律 98% 相似，
//            「PPT 要不要加动画」也会撞上「PPT 用学校模板」。真实向量不需要这层兜底。
import { CONCEPTS } from './embed';
import { normalizeText, type Term } from './terms';

// 太泛、说明不了是哪件事的词
// 太泛的词，以及「改用 / 定为」这类表示拍板动作的词：说明不了是哪件事
const GENERIC = new Set([
  '方案', '问题', '事情', '情况', '东西', '还是', '继续', '重新', '讨论', '统一', '要不',
  '换成', '改成', '改用', '换用', '改为', '换为', '定为', '定在', '就用', '采用', '确定', '决定', '同意',
]);

const CONCEPT_WORDS = CONCEPTS.map((ws) => ws.map((w) => w.toLowerCase().replace(/\s+/g, '')));

function conceptsOf(word: string): number[] {
  return CONCEPT_WORDS.flatMap((ws, i) => (ws.some((w) => word === w || word.includes(w) || (word.length >= 2 && w.includes(word))) ? [i] : []));
}

export interface Cover {
  ok: boolean;
  strong: string[];      // 参与判断的关键词
  literal: string[];     // 原词对上的
  viaConcept: string[];  // 同义对上的，如「风格≈模板」
  missing: string[];
}

// exclude：只出现在这里的词不算关键词（比如课程名里的「营销」）
export function coverStrong(terms: Term[], text: string, opts: { exclude?: string; concept?: boolean } = {}): Cover {
  const norm = normalizeText(text);
  const excl = normalizeText(opts.exclude ?? '');
  const strong = terms.map((t) => t.t).filter((t) => t.length >= 2 && !GENERIC.has(t) && !(excl && excl.includes(t) && !norm.includes(t)));
  const literal = strong.filter((t) => norm.includes(t));
  const viaConcept: string[] = [];
  const missing: string[] = [];
  for (const t of strong) {
    if (literal.includes(t)) continue;
    const alt = opts.concept === false ? [] : conceptsOf(t)
      .flatMap((i) => CONCEPT_WORDS[i])
      .filter((w) => w.length >= 2 && norm.includes(w) && !literal.some((l) => l.includes(w) || w.includes(l)));
    if (alt.length) viaConcept.push(`${t}≈${alt[0]}`);
    else missing.push(t);
  }
  return { ok: strong.length > 0 && literal.length > 0 && missing.length === 0, strong, literal, viaConcept, missing };
}

export function describeCover(c: Cover): string {
  return [...c.literal, ...c.viaConcept].join('、');
}
