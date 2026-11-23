import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canAddMeeting, canRecord, realtimeQuota, FREE_MEETINGS, FREE_RECORD_SECONDS, PRO_RECORD_SECONDS, ADDON_SECONDS, PRICE } from './plans';

describe('小组套餐额度（和成本模型同一份数字）', () => {
  it('价格：纪要版 6.9、专业版 14.9、多组包 14.9、加时包 3 小时 3.9', () => {
    assert.deepEqual(PRICE, { notes: 6.9, pro: 14.9, bundle: 14.9, addon: 3.9, addonHours: 3 });
  });
  it('体验版每学期 3 次纪要，第 4 次拦下并提示开通纪要版', () => {
    assert.equal(FREE_MEETINGS, 3);
    assert.equal(canAddMeeting('free', 2).ok, true);
    const r = canAddMeeting('free', 3);
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.reason.includes('6.9'));
  });
  it('纪要版、专业版、多组包纪要都不限次', () => {
    for (const t of ['notes', 'pro', 'bundle'] as const) assert.equal(canAddMeeting(t, 50).ok, true);
  });
  it('实时转写：专业版 8 小时，体验版送 5 分钟；纪要版、多组包只有加时包', () => {
    assert.equal(FREE_RECORD_SECONDS, 300);
    assert.equal(realtimeQuota('free', 0), 300);
    assert.equal(PRO_RECORD_SECONDS, 8 * 3600);
    assert.equal(ADDON_SECONDS, 3 * 3600);
    assert.equal(realtimeQuota('pro', 0), 8 * 3600);
    assert.equal(realtimeQuota('pro', ADDON_SECONDS), 11 * 3600);
    assert.equal(realtimeQuota('notes', 0), 0);
    assert.equal(realtimeQuota('bundle', ADDON_SECONDS), 3 * 3600);
  });
  it('专业版用完 8 小时：拦下实时转写，提示散会后整理或加购', () => {
    assert.equal(canRecord('pro', 8 * 3600 - 60, 30).ok, true);
    const r = canRecord('pro', 8 * 3600 - 10, 30);
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.reason.includes('散会后') && r.reason.includes('3.9'));
    assert.equal(canRecord('pro', 8 * 3600 - 10, 30, ADDON_SECONDS).ok, true);
  });
  it('纪要版不含实时转写，买了加时包就能用；体验版 5 分钟用完就拦', () => {
    assert.equal(canRecord('notes', 0, 10).ok, false);
    assert.equal(canRecord('free', 0, 10).ok, true);
    const f = canRecord('free', 290, 20);
    assert.equal(f.ok, false);
    assert.ok(!f.ok && f.reason.includes('5 分钟') && f.reason.includes('14.9'));
    assert.equal(canRecord('notes', 0, 10, ADDON_SECONDS).ok, true);
  });
});
