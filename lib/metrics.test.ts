import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { replyRate, selfUpdateShare, onTimeRate } from './metrics';

describe('成功指标计算', () => {
  it('提醒 24 小时内回复率：只算已触发的；超过 24 小时回复的不算达标', () => {
    const r = replyRate([
      { fireDate: '2026-11-18', respondedAt: '2026-11-18T20:00:00' },
      { fireDate: '2026-11-17', respondedAt: '2026-11-19T09:00:00' },
      { fireDate: '2026-11-19', respondedAt: null },
      { fireDate: '2026-11-25', respondedAt: null },
    ], '2026-11-19');
    assert.deepEqual(r, { fired: 3, replied: 2, within24h: 1, rate: 1 / 3 });
  });

  it('组员自主更新占比：组长替组员改的不算自主；组长自己的任务不计入', () => {
    const owner = (id: string) => ({ t1: 'siqi', t2: 'haoran', t3: 'linxiao' }[id] ?? null);
    const r = selfUpdateShare([
      { taskId: 't1', actorId: 'siqi', kind: 'progress' },
      { taskId: 't1', actorId: 'linxiao', kind: 'status' },
      { taskId: 't2', actorId: 'haoran', kind: 'blocked' },
      { taskId: 't3', actorId: 'linxiao', kind: 'progress' },
      { taskId: 't1', actorId: 'linxiao', kind: 'review_pass' },
    ], owner, new Set(['linxiao']));
    assert.deepEqual(r, { total: 3, self: 2, rate: 2 / 3 });
  });

  it('按时完成率：完成日不晚于 DDL 算按时', () => {
    const r = onTimeRate([
      { status: 'done', dueDate: '2026-11-13', lastUpdateAt: '2026-11-13T18:00:00' },
      { status: 'done', dueDate: '2026-11-17', lastUpdateAt: '2026-11-18T14:20:00' },
      { status: 'done', dueDate: null, lastUpdateAt: '2026-11-18T14:20:00' },
      { status: 'in_progress', dueDate: '2026-11-21', lastUpdateAt: '2026-11-15T10:00:00' },
    ]);
    assert.deepEqual(r, { done: 2, onTime: 1, rate: 0.5 });
  });
});
