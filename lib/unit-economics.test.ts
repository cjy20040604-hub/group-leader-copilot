import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeEconomics, textCostPerMeeting, qaCost, marginAtScale, groupPurchaseCostPerStudent, BASELINE, BUNDLE, ASR_FILE, ASR_REALTIME } from './unit-economics';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

describe('unit economics', () => {
  it('1 小时会文字处理 0.0648、问答 0.0032（和成本看板的标准会议推算一致）', () => {
    near(textCostPerMeeting(1), 0.0648);
    near(qaCost(), 0.0032);
  });

  it('专业版单组（一门课一支小组：8 次会、67 次问答、3 小时录音，9.9 元）：贡献 7.4662，54 个付费组回本', () => {
    const r = computeEconomics(BASELINE);
    near(r.modelCost, 8 * 0.0648 + 67 * 0.0032);
    near(r.asrCost, 0.864);
    near(r.variableCost, 1.5968);
    near(r.freeCostPerUser, 3 * 0.0648);
    near(r.netRevenue, 9.9 * 0.994);
    near(r.contribution, 9.9 * 0.994 - 1.5968 - 4 * 3 * 0.0648);
    assert.equal(r.breakEvenGroups, 54);
  });

  it('录音全走会议室实时转写（qwen3-asr-flash 0.00022 元/秒）：单组回本升到 68 组', () => {
    const r = computeEconomics({ ...BASELINE, asrPerSecond: ASR_REALTIME });
    near(r.asrCost, 2.376);
    assert.equal(r.breakEvenGroups, 68);
  });

  it('体验版沿用旧额度「每月 4 次」（约 16 次/学期，比一支小组一学期开的会还多）：回本要 98 组', () => {
    assert.equal(computeEconomics({ ...BASELINE, freeMeetingsPerSemester: 16 }).breakEvenGroups, 98);
  });

  it('多组包（组长带 3 个组，19.9 元，配 12 个体验版小组）：变动成本 4.7872，32 个付费包回本', () => {
    const r = computeEconomics(BUNDLE);
    near(r.variableCost, 2.1952 + 2.592);
    assert.equal(r.breakEvenGroups, 32);
  });

  it('贡献为负时盈亏平衡为无穷大', () => {
    assert.equal(computeEconomics({ ...BASELINE, pricePerSemester: 1.5 }).breakEvenGroups, Infinity);
  });

  it('规模到 500 组时整体毛利 = (500 × 贡献 − 固定) ÷ (500 × 净收入)', () => {
    const r = computeEconomics(BASELINE);
    near(marginAtScale(BASELINE, 500), (500 * r.contribution - 400) / (500 * r.netRevenue));
  });

  it('团体购入：每人成本随这个学生有几门课的小组线性增加', () => {
    near(groupPurchaseCostPerStudent({ asrPerSecond: ASR_FILE, coursesPerStudent: 1, groupSize: 5 }), 3.7024 / 5, 1e-4);
    near(groupPurchaseCostPerStudent({ asrPerSecond: ASR_FILE, coursesPerStudent: 3, groupSize: 5 }), 3 * 3.7024 / 5, 1e-4);
    near(groupPurchaseCostPerStudent({ asrPerSecond: ASR_REALTIME, coursesPerStudent: 1, groupSize: 5 }), 7.7344 / 5, 1e-4);
  });
});
