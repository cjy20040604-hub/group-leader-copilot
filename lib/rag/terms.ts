// 问题关键词 + 课程记录覆盖率（确定性代码，不调模型）
// 用途：① 证据闸门——问题的关键词过半在本课程记录里从没出现过 → 直接「记录里没找到」
//      ② Mock 作答——挑和问题关键词对得上的记录，对不上就拒答

// 疑问词、代词、语气词：不算「关键词」
const STOP = new Set([
  '我们', '你们', '他们', '咱们', '大家', '我', '你', '他', '她',
  '什么', '什么时候', '怎么', '怎么样', '怎么办', '为什么', '哪个', '哪些', '哪里', '哪天', '哪', '多少', '多大', '多久', '几号', '几点', '几个', '几',
  '是不是', '有没有', '能不能', '要不要', '不要', '要不', '是否', '的是', '是什么', '用的是', '叫什么', '有哪些', '哪位',
  '谁', '谁负责', '谁在', '负责', '谁来', '来', '写', '做', '弄', '交', '截止', '完成',
  '上次', '这次', '那次', '这个', '那个', '现在', '最后', '最终', '之前', '以后', '当时', '一下', '目前',
  '定', '定了', '定的', '决定', '用', '用的', '做的', '弄的', '写的', '说的', '选的', '要', '是', '的', '了', '吗', '呢', '吧', '啊', '呀', '和', '跟', '给', '在', '把', '被',
  '还', '又', '也', '都', '就', '有', '没', '不', '到', '去', '说', '这', '那', '个', '些', '会', '能', '让',
]);

export interface Term {
  t: string;
  w: number; // 单字 0.5，其余 1
}

const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });

// 记录里用 PPT，问题里常说「幻灯片」：证据闸门只认原词，这里先归一（2026-11-21 真实 eval p2 误拒后加）
const SYNONYMS: Record<string, string> = { '幻灯片': 'ppt', '幻灯': 'ppt' };

export function questionTerms(question: string): Term[] {
  const segs = [...segmenter.segment(question.toLowerCase())]
    .filter((s) => s.isWordLike)
    .map((s) => s.segment.trim())
    .filter(Boolean);
  const terms: Term[] = [];
  let run = ''; // 连续的单字（分词器把「路演」切成「路|演」时拼回来）
  const pushWord = (w: string) => {
    const syn = SYNONYMS[w];
    if (syn) { terms.push({ t: syn, w: 1 }); return; }
    if (w.length >= 4) {
      // 「营销调研」这类复合词：拆成两字一组，各占一部分权重，免得整词在记录里对不上
      const parts = w.match(/.{1,2}/g) ?? [w];
      parts.forEach((p) => terms.push({ t: p, w: 1 / parts.length }));
    } else {
      terms.push({ t: w, w: w.length === 1 ? 0.5 : 1 });
    }
  };
  const flush = () => {
    if (run) pushWord(run);
    run = '';
  };
  for (const raw of segs) {
    // 「几页」「几个人」：去掉疑问的「几」，剩下的量词当单字
    const s = /^几[一-鿿]$/.test(raw) ? raw.slice(1) : raw;
    if (STOP.has(s)) { flush(); continue; }
    if (/^[一-鿿]$/.test(s)) { run += s; continue; }
    flush();
    if (/^[一-鿿]+$/.test(s)) pushWord(s);
    else terms.push({ t: s, w: 1 });
  }
  flush();
  const seen = new Set<string>();
  return terms.filter((x) => (seen.has(x.t) ? false : (seen.add(x.t), true)));
}

export function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

// 覆盖率：关键词权重里有多少出现在 text 中
export function coverage(terms: Term[], text: string): number {
  const total = terms.reduce((s, x) => s + x.w, 0);
  if (!total) return 0;
  const norm = normalizeText(text);
  return terms.reduce((s, x) => s + (norm.includes(x.t) ? x.w : 0), 0) / total;
}
