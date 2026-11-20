import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { questionTerms } from './terms';
import { coverStrong } from './match';

const same = (a: string, ctx: string) => coverStrong(questionTerms(a), ctx).ok;

describe('coverStrong（议程查重 / 冲突检测的关键词规则）', () => {
  const ppt = 'PPT 改用学校官方模板 蓝白那个不行，老师说要用学校模板 PPT 统一用蓝白商务风';
  it('同义词靠概念组对上：「风格」≈「模板」', () => {
    assert.equal(same('PPT 用什么风格', ppt), true);
  });
  it('只沾到「PPT」不算同一件事', () => {
    assert.equal(same('PPT 要不要加动画', ppt), false);
  });
  it('「换成 PostgreSQL」撞上「用 MySQL 8」：同组的另一个词', () => {
    assert.equal(same('数据库要不要换成 PostgreSQL', '数据库用 MySQL 8 数据库就用 MySQL 8，别纠结了'), true);
  });
  it('关键词全靠概念、没有一个原词对上 → 不算', () => {
    assert.equal(same('数据库要不要换成 PostgreSQL', '先画 ER 图再建表'), false);
  });
  it('新信息（「工具」）对不上 → 不算', () => {
    assert.equal(same('ER 图用什么工具画', '先画 ER 图再建表'), false);
  });
  it('拍板动词不算关键词：「数据库改用 PostgreSQL」', () => {
    assert.equal(same('数据库改用 PostgreSQL', '数据库用 MySQL 8'), true);
  });
});
