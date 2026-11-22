import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateAction } from './pipeline';
import { selfUpdateShare } from './metrics';

const roster = [{ id: 'linxiao', name: '林晓', aliases: ['组长'] }, { id: 'siqi', name: '思琪', aliases: ['琪琪'] }];
const outsiders = [{ id: 'haoran', name: '浩然', aliases: ['然哥'] }];
const action = (owner: string) => ({ task: '画 ER 图', owner_raw: owner, due_raw: '周五之前', due_date: null, confidence: 'high' as const, evidence: '' });

describe('不同课的小组成员不一样', () => {
  it('人名只和本课名单对：本组的人照常派', () => {
    const v = validateAction(action('琪琪'), { meetingDate: '2026-11-13', roster, transcript: '', outsiders });
    assert.equal(v.ownerId, 'siqi');
  });
  it('名字对得上别的组的人：不自动派，提示先把 TA 加进本组', () => {
    const v = validateAction(action('浩然'), { meetingDate: '2026-11-13', roster, transcript: '', outsiders });
    assert.equal(v.ownerId, null);
    assert.ok(v.flags.some((f) => f.includes('浩然 不在这个小组的名单里')), v.flags.join('；'));
  });
  it('自主更新占比：组长按课算（同一个人在 A 课是组长，B 课的任务仍算组员自己的）', () => {
    const r = selfUpdateShare(
      [{ taskId: 'a1', actorId: 'linxiao', kind: 'progress' }, { taskId: 'b1', actorId: 'linxiao', kind: 'progress' }],
      (id) => ({ a1: 'linxiao', b1: 'linxiao' } as Record<string, string>)[id] ?? null,
      (_owner, taskId) => taskId === 'a1',
    );
    assert.deepEqual({ total: r.total, self: r.self }, { total: 1, self: 1 });
  });
});
