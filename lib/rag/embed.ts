// Mock embedding：确定性、离线、可复现语义近邻。
// 概念词袋（0.85）+ 字符 bigram 哈希（0.15），1024 维归一化。
// 真实模式走 text-embedding-v4（见 lib/llm.ts），接口一致。

export const EMBED_DIM = 1024;

export const CONCEPTS: string[][] = [
  ['ppt', '幻灯片', '模板', '蓝白', '商务', '风格', '美观', '丑', '版式', '配色'],
  ['er图', 'er 图', '实体', '关系图', '建表', '表结构', '主键', '自增', '外键', '数据库', 'mysql', 'sql', '字段', '范式'],
  ['问卷', '调研', '样本', '回收', '访谈', '提纲', '调查', '数据清洗', '问卷数据'],
  ['路演', '上台', '展示', '演讲', '排练', '教室', '答辩', '讲'],
  ['二手书', '平台', '选题', '创业', '商业计划书', '竞品', '项目'],
  ['报告', '篇幅', '附录', '字数', '文档', '结论'],
  ['预算', '组费', '经费', '报销', '花钱', '费用'],
  ['分工', '负责', '催', '进度', '截止', 'ddl', '任务', '认领'],
  ['会议', '下次', '开会', '议程', '纪要', '决议'],
  ['分数', '评分', '打分', '成绩', '老师评价'],
  ['营销', '市场', '推广', '宣传', '方案'],
  ['需求', '功能', '用户', '登录', '注册', '界面'],
];

function hashBigram(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % EMBED_DIM;
}

export function mockEmbed(text: string): Float32Array {
  const t = text.toLowerCase();
  const concept = new Float32Array(EMBED_DIM);
  let conceptHits = 0;
  CONCEPTS.forEach((terms, i) => {
    let w = 0;
    for (const term of terms) {
      let idx = t.indexOf(term);
      while (idx !== -1) {
        w += 1;
        idx = t.indexOf(term, idx + term.length);
      }
    }
    if (w > 0) {
      concept[i] = Math.min(w, 4);
      conceptHits += 1;
    }
  });
  const bigram = new Float32Array(EMBED_DIM);
  const clean = t.replace(/\s+/g, '');
  for (let i = 0; i < clean.length - 1; i++) {
    bigram[hashBigram(clean.slice(i, i + 2))] += 1;
  }
  normalize(concept);
  normalize(bigram);
  const out = new Float32Array(EMBED_DIM);
  const cw = conceptHits > 0 ? 0.85 : 0;
  const bw = conceptHits > 0 ? 0.15 : 1;
  for (let i = 0; i < EMBED_DIM; i++) out[i] = cw * concept[i] + bw * bigram[i];
  normalize(out);
  return out;
}

function normalize(v: Float32Array) {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export function toBlob(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

export function fromBlob(buf: Buffer | null): Float32Array | null {
  if (!buf || buf.byteLength === 0) return null;
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}