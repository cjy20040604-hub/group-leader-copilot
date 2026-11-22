import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canAddMeeting, canRecord, FREE_MEETINGS, PRO_RECORD_SECONDS } from './plans';

describe('小组套餐额度（和成本模型同一份数字）', () => {
  it('体验版每学期 3 次纪要，第 4 次拦下并提示开通专业版', () => {
    assert.equal(FREE_MEETINGS, 3);
    assert.equal(canAddMeeting('free', 2).ok, true);
    const r = canAddMeeting('free', 3);
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.reason.includes('9.9'));
  });
  it('专业版和多组包纪要不限次', () => {
    assert.equal(canAddMeeting('pro', 50).ok, true);
    assert.equal(canAddMeeting('bundle', 50).ok, true);
  });
  it('录音转写：体验版不含；专业版每组 3 小时，超出就拦', () => {
    assert.equal(PRO_RECORD_SECONDS, 3 * 3600);
    assert.equal(canRecord('free', 0, 10).ok, false);
    assert.equal(canRecord('pro', 3 * 3600 - 60, 30).ok, true);
    assert.equal(canRecord('pro', 3 * 3600 - 10, 30).ok, false);
  });
});
