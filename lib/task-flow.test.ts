import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyTaskAction, type FlowTask } from './task-flow';

const leader = { id: 'linxiao', role: 'leader' as const };
const siqi = { id: 'siqi', role: 'member' as const };
const ajie = { id: 'ajie', role: 'member' as const };
const ctx = { today: '2026-11-19', pending: null };
const task = (over: Partial<FlowTask> = {}): FlowTask => ({ id: 't1', ownerId: 'siqi', status: 'in_progress', dueDate: '2026-11-24', blocker: null, ...over });

describe('applyTaskAction · 组员', () => {
  it('没人认领的任务，组员可以自己认领 → 进行中', () => {
    const r = applyTaskAction(task({ ownerId: null, status: 'unclaimed' }), ajie, { type: 'claim' }, ctx);
    assert.ok(r.ok);
    assert.deepEqual(r.ok && r.patch, { ownerId: 'ajie', status: 'in_progress', progressNote: null });
  });

  it('已经有负责人就不能再认领', () => {
    const r = applyTaskAction(task(), ajie, { type: 'claim' }, ctx);
    assert.equal(r.ok, false);
  });

  it('做完了 → 待审核，并清掉卡点', () => {
    const r = applyTaskAction(task({ blocker: '等 ER 图' }), siqi, { type: 'submit', note: '脚本已发群' }, ctx);
    assert.ok(r.ok && r.patch.status === 'awaiting_review' && r.patch.blocker === null && r.patch.progressNote === '脚本已发群');
  });

  it('组长自己的任务提交即完成（没人审）', () => {
    const r = applyTaskAction(task({ ownerId: 'linxiao' }), leader, { type: 'submit' }, ctx);
    assert.ok(r.ok && r.patch.status === 'done');
  });

  it('别人的任务不能替他写进度', () => {
    const r = applyTaskAction(task(), ajie, { type: 'progress', note: '帮他写' }, ctx);
    assert.ok(!r.ok && r.code === 403);
  });

  it('卡住了必须写原因', () => {
    assert.equal(applyTaskAction(task(), siqi, { type: 'block', reason: '  ' }, ctx).ok, false);
    const r = applyTaskAction(task(), siqi, { type: 'block', reason: '等浩然的 ER 图定稿' }, ctx);
    assert.ok(r.ok && r.patch.blocker === '等浩然的 ER 图定稿' && r.update.kind === 'blocked');
  });

  it('申请延期：新日期必须晚于原 DDL、不早于今天，且不能重复申请', () => {
    assert.equal(applyTaskAction(task(), siqi, { type: 'request_extension', proposedDue: '2026-11-23', reason: 'x' }, ctx).ok, false);
    assert.equal(applyTaskAction(task({ dueDate: null }), siqi, { type: 'request_extension', proposedDue: '2026-11-18', reason: 'x' }, ctx).ok, false);
    assert.equal(applyTaskAction(task(), siqi, { type: 'request_extension', proposedDue: '2026-11-26', reason: 'x' }, { ...ctx, pending: { id: 'u1', proposedDue: '2026-11-26' } }).ok, false);
    const r = applyTaskAction(task(), siqi, { type: 'request_extension', proposedDue: '2026-11-26', reason: 'ER 图周六才定稿' }, ctx);
    assert.ok(r.ok && r.update.proposedDue === '2026-11-26' && Object.keys(r.patch).length === 0, '申请本身不改 DDL');
  });

  it('已完成的任务不能再操作', () => {
    assert.equal(applyTaskAction(task({ status: 'done' }), siqi, { type: 'progress', note: 'x' }, ctx).ok, false);
  });
});

describe('applyTaskAction · 组长', () => {
  it('确认完成：只有待审核能通过', () => {
    assert.equal(applyTaskAction(task(), leader, { type: 'approve' }, ctx).ok, false);
    const r = applyTaskAction(task({ status: 'awaiting_review' }), leader, { type: 'approve' }, ctx);
    assert.ok(r.ok && r.patch.status === 'done' && r.statusChanged);
  });

  it('组员不能确认完成', () => {
    assert.ok(!applyTaskAction(task({ status: 'awaiting_review' }), siqi, { type: 'approve' }, ctx).ok);
  });

  it('打回要写还差什么 → 回到进行中', () => {
    assert.equal(applyTaskAction(task({ status: 'awaiting_review' }), leader, { type: 'return', note: '' }, ctx).ok, false);
    const r = applyTaskAction(task({ status: 'awaiting_review' }), leader, { type: 'return', note: '外键还没加' }, ctx);
    assert.ok(r.ok && r.patch.status === 'in_progress');
  });

  it('批准延期 → 改 DDL 并标记要重建提醒；拒绝不改 DDL', () => {
    const pending = { id: 'u1', proposedDue: '2026-11-26' };
    const ok = applyTaskAction(task(), leader, { type: 'approve_extension', updateId: 'u1' }, { ...ctx, pending });
    assert.ok(ok.ok && ok.patch.dueDate === '2026-11-26' && ok.dueChanged && ok.resolveUpdateId === 'u1');
    const no = applyTaskAction(task(), leader, { type: 'reject_extension', updateId: 'u1', note: '周五要合稿' }, { ...ctx, pending });
    assert.ok(no.ok && no.patch.dueDate === undefined && !no.dueChanged && no.resolveUpdateId === 'u1');
  });

  it('延期申请已处理过就不能重复处理', () => {
    assert.equal(applyTaskAction(task(), leader, { type: 'approve_extension', updateId: 'u1' }, ctx).ok, false);
  });
});
