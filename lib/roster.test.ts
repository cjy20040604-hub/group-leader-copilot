import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchOwnerDetailed, speakerOfEvidence, parseAliases } from './roster';

const ROSTER = [
  { id: 'linxiao', name: '林晓', aliases: ['晓姐', '组长', '晓晓'] },
  { id: 'ajie', name: '阿杰', aliases: ['杰哥', '小杰'] },
  { id: 'xiaoyu', name: '小雨', aliases: ['雨姐'] },
  { id: 'haoran', name: '浩然', aliases: ['然哥', '小然'] },
];

describe('matchOwnerDetailed（人名匹配）', () => {
  it('原名 / 别名 → 直接认', () => {
    assert.deepEqual(matchOwnerDetailed('然哥', ROSTER), { id: 'haoran', how: 'alias', candidates: [] });
  });
  it('「浩然哥」包含「浩然」→ 认，但标为猜测', () => {
    assert.equal(matchOwnerDetailed('浩然哥', ROSTER).how, 'contains');
  });
  it('「小宇」和小杰 / 小雨 / 小然都差一个字 → 不猜，交给组长', () => {
    const m = matchOwnerDetailed('小宇', ROSTER);
    assert.equal(m.id, null);
    assert.equal(m.how, 'ambiguous');
  });
  it('「那个谁」→ 待认领', () => {
    assert.equal(matchOwnerDetailed('那个谁', ROSTER).id, null);
  });
});

describe('speakerOfEvidence（「我来」= 说话人）', () => {
  it('按原话找到说话人', () => {
    assert.equal(speakerOfEvidence('汇总这块我下周三之前搞定', '阿杰：好的。\n林晓：汇总这块我下周三之前搞定。'), '林晓');
  });
});

describe('parseAliases', () => {
  it('中英文分隔符混用都能拆', () => {
    assert.deepEqual(parseAliases('杰哥,小杰，阿杰同学、Jie;杰仔  杰哥'), ['杰哥', '小杰', '阿杰同学', 'Jie', '杰仔']);
  });
  it('空串与纯空白 → 空数组', () => {
    assert.deepEqual(parseAliases(''), []);
    assert.deepEqual(parseAliases(' ，、 '), []);
  });
});
