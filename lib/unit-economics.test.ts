import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeEconomics, textCostPerMeeting, qaCost, marginAtScale, BASELINE, ASR_REALTIME } from './unit-economics';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

describe('unit economics', () => {
  it('1 小时会文字处理 0.0648、问答 0.0032（和成本看板的标准会议推算一致）', () => {
    near(textCostPerMeeting(1), 0.0648);
    near(qaCost(), 0.0032);
  });

  it('基线：变动成本 5.0752，边际贡献 10.5582，38 个付费组覆盖每月 100 元固定成本', () => {
    const r = computeEconomics(BASELINE);
    near(r.modelCost, 2.1952);
    near(r.asrCost, 2.88);
    near(r.variableCost, 5.0752);
    near(r.freeCostPerUser, 1.0368);
    near(r.netRevenue, 19.7806);
    near(r.contribution, 19.7806 - 5.0752 - 4 * 1.0368);
    assert.equal(r.breakEvenGroups, 38);
  });

  it('录音全走会议室实时转写（qwen3-asr-flash 0.00022 元/秒）：盈亏平衡升到 73 组', () => {
    const r = computeEconomics({ ...BASELINE, asrPerSecond: ASR_REALTIME });
    near(r.asrCost, 7.92);
    assert.equal(r.breakEvenGroups, 73);
  });

  it('贡献为负时盈亏平衡为无穷大', () => {
    assert.equal(computeEconomics({ ...BASELINE, pricePerSemester: 5 }).breakEvenGroups, Infinity);
  });

  it('规模到 500 组时整体毛利 = (500 × 贡献 − 固定) ÷ (500 × 净收入)', () => {
    const r = computeEconomics(BASELINE);
    near(marginAtScale(BASELINE, 500), (500 * r.contribution - 400) / (500 * r.netRevenue));
  });
});
