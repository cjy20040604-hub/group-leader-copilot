import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveTitle } from './title';

describe('deriveTitle', () => {
  it('无议题时回退模板标题', () => {
    assert.deepEqual(deriveTitle([], '市场营销学 11月19日 组会'), { title: '市场营销学 11月19日 组会', source: 'template' });
    assert.deepEqual(deriveTitle(['', '  '], 'fallback'), { title: 'fallback', source: 'template' });
  });

  it('单议题原样用作标题', () => {
    assert.deepEqual(deriveTitle(['PPT 风格定稿'], 'fb'), { title: 'PPT 风格定稿', source: 'ai' });
  });

  it('最多拼两个议题', () => {
    assert.equal(deriveTitle(['分工', 'DDL 对齐', '预算'], 'fb').title, '分工、DDL 对齐');
  });

  it('超过 30 字截断加省略号', () => {
    const long = '这是一个非常非常非常非常非常非常非常非常非常非常长的议题名称超过三十个字';
    const r = deriveTitle([long], 'fb');
    assert.equal(r.source, 'ai');
    assert.equal(r.title.length, 31);
    assert.ok(r.title.endsWith('…'));
  });
});