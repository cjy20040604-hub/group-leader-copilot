import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { questionTerms, coverage } from './terms';

const words = (q: string) => questionTerms(q).map((t) => t.t);

describe('questionTerms', () => {
  it('去掉疑问词和语气词，只留关键词', () => {
    assert.deepEqual(words('我们PPT最后定的什么风格？'), ['ppt', '风格']);
  });
  it('分词器切碎的单字拼回来（路|演 → 路演）', () => {
    assert.deepEqual(words('路演谁上台定了吗？'), ['路演', '上台']);
  });
  it('四字以上复合词拆成两字一组（营销调研 → 营销 + 调研）', () => {
    assert.deepEqual(words('营销调研怎么做的？'), ['营销', '调研']);
  });
});

describe('coverage（证据闸门用）', () => {
  const mktCorpus = 'PPT 统一用蓝白商务风 PPT 改用学校官方模板 PPT 风格 调研采用问卷加访谈结合的方式';
  it('关键词都在记录里 → 1', () => {
    assert.equal(coverage(questionTerms('我们PPT最后定的什么风格？'), mktCorpus), 1);
  });
  it('只沾到一半（「PPT 字体」）→ 不过半，应拒答', () => {
    assert.ok(coverage(questionTerms('PPT 字体用多大？'), mktCorpus) <= 0.5);
  });
  it('别的课的问题 → 0', () => {
    assert.equal(coverage(questionTerms('数据库用的什么？'), mktCorpus), 0);
  });
});

describe('questionTerms 分词兜底', () => {
  it('「的是」「几页」这类分词碎片不当关键词', () => {
    assert.deepEqual(words('PPT 最终用的是哪个模板？'), ['ppt', '模板']);
    assert.deepEqual(questionTerms('路演 PPT 做几页？').filter((t) => t.w === 1).map((t) => t.t), ['路演', 'ppt']);
  });
});
