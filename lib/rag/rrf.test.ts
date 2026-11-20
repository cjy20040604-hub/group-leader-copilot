import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rrfFuse } from './search';

describe('rrfFuse', () => {
  it('两路都命中的排前面', () => {
    const fused = rrfFuse([['a', 'b', 'c'], ['b', 'd', 'a']]);
    const ranked = [...fused.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id);
    assert.equal(ranked[0], 'b');
    assert.ok(ranked.indexOf('a') < ranked.indexOf('c'));
    assert.ok(ranked.indexOf('a') < ranked.indexOf('d'));
  });

  it('分数公式 1/(k+rank+1)', () => {
    const fused = rrfFuse([['x']], 60);
    assert.ok(Math.abs((fused.get('x') ?? 0) - 1 / 61) < 1e-9);
  });
});