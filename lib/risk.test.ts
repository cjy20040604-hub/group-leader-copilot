import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { riskLevel, nudgeMessage, dueText } from './risk';

const NOW = new Date('2026-11-19T09:00:00');

describe('riskLevel', () => {
  it('已完成永远绿', () => {
    assert.equal(riskLevel({ dueDate: '2026-11-01', status: 'done', lastUpdateAt: null }, NOW), 'green');
  });

  it('已过 DDL 未完成 → 红', () => {
    assert.equal(riskLevel({ dueDate: '2026-11-18', status: 'in_progress', lastUpdateAt: '2026-11-19T08:00:00' }, NOW), 'red');
  });

  it('距 DDL 1 天且进行中 → 红', () => {
    assert.equal(riskLevel({ dueDate: '2026-11-20', status: 'in_progress', lastUpdateAt: '2026-11-19T08:00:00' }, NOW), 'red');
  });

  it('距 DDL 1 天但待审核且刚更新 → 绿', () => {
    assert.equal(riskLevel({ dueDate: '2026-11-20', status: 'awaiting_review', lastUpdateAt: '2026-11-19T08:00:00' }, NOW), 'green');
  });

  it('当天截止且进行中 → 红', () => {
    assert.equal(riskLevel({ dueDate: '2026-11-19', status: 'in_progress', lastUpdateAt: '2026-11-19T08:00:00' }, NOW), 'red');
  });

  it('距 DDL 2 天且 48 小时没更新 → 黄（浩然 ER 图剧情）', () => {
    assert.equal(riskLevel({ dueDate: '2026-11-21', status: 'in_progress', lastUpdateAt: '2026-11-15T10:00:00' }, NOW), 'yellow');
  });

  it('快进 3 天后 ER 图过期 → 红', () => {
    const later = new Date('2026-11-22T09:00:00');
    assert.equal(riskLevel({ dueDate: '2026-11-21', status: 'in_progress', lastUpdateAt: '2026-11-15T10:00:00' }, later), 'red');
  });

  it('距 DDL 2 天但刚更新 → 绿', () => {
    assert.equal(riskLevel({ dueDate: '2026-11-21', status: 'in_progress', lastUpdateAt: '2026-11-19T08:00:00' }, NOW), 'green');
  });

  it('待认领 → 黄', () => {
    assert.equal(riskLevel({ dueDate: '2026-12-01', status: 'unclaimed', lastUpdateAt: null }, NOW), 'yellow');
  });

  it('待认领且已过期 → 红（红灯规则优先）', () => {
    assert.equal(riskLevel({ dueDate: '2026-11-10', status: 'unclaimed', lastUpdateAt: null }, NOW), 'red');
  });

  it('待认领且明天截止 → 红', () => {
    assert.equal(riskLevel({ dueDate: '2026-11-20', status: 'unclaimed', lastUpdateAt: null }, NOW), 'red');
  });

  it('无 DDL 且进行中 → 绿', () => {
    assert.equal(riskLevel({ dueDate: null, status: 'in_progress', lastUpdateAt: null }, NOW), 'green');
  });

  it('距 DDL 4 天且久未更新 → 绿', () => {
    assert.equal(riskLevel({ dueDate: '2026-11-23', status: 'in_progress', lastUpdateAt: '2026-11-10T00:00:00' }, NOW), 'green');
  });
});

describe('nudgeMessage', () => {
  it('按模板生成催办文案', () => {
    assert.equal(
      nudgeMessage({ owner: '浩然', course: '数据库原理', task: '完成 ER 图', dueText: '已过期 1 天（2026-11-21）', status: '进行中' }),
      '@浩然 数据库原理 的「完成 ER 图」已过期 1 天，目前状态：进行中，需要帮忙吗？',
    );
  });
});

describe('dueText', () => {
  it('过期/今天/明天/N天', () => {
    assert.ok(dueText('2026-11-18', NOW).includes('已过期 1 天'));
    assert.equal(dueText('2026-11-19', NOW), '今天截止');
    assert.equal(dueText('2026-11-20', NOW), '明天截止');
    assert.ok(dueText('2026-11-25', NOW).includes('6 天后'));
    assert.equal(dueText(null, NOW), '日期待定');
  });
});
describe('riskLevel · 卡住了', () => {
  it('卡住但离 DDL 还远 → 黄', () => {
    assert.equal(riskLevel({ dueDate: '2026-11-24', status: 'in_progress', lastUpdateAt: '2026-11-19T08:00:00', blocked: true }, NOW), 'yellow');
  });
  it('卡住且 3 天内到期 → 红', () => {
    assert.equal(riskLevel({ dueDate: '2026-11-22', status: 'in_progress', lastUpdateAt: '2026-11-19T08:00:00', blocked: true }, NOW), 'red');
  });
  it('已经交给组长确认的，不算卡住', () => {
    assert.equal(riskLevel({ dueDate: '2026-11-22', status: 'awaiting_review', lastUpdateAt: '2026-11-19T08:00:00', blocked: true }, NOW), 'green');
  });
});
