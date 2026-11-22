import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeEconomics, textCostPerMeeting, qaCost, marginAtScale, groupPurchaseCostPerStudent, blendedBreakEven, addonEconomics, NOTES, PRO, BUNDLE, MIX, ADDON, ASR_FILE, ASR_REALTIME } from './unit-economics';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

describe('unit economics', () => {
  it('1 小时会文字处理 0.0648、问答 0.0032（和成本看板的标准会议推算一致）', () => {
    near(textCostPerMeeting(1), 0.0648);
    near(qaCost(), 0.0032);
  });

  it('纪要版（一门课一支小组：8 次会、67 次问答、不含录音，6.9 元）：贡献约 5.35，75 个付费组回本', () => {
    const r = computeEconomics(NOTES);
    near(r.modelCost, 8 * 0.0648 + 67 * 0.0032);
    near(r.asrCost, 0);
    near(r.variableCost, 0.7328);
    near(r.freeCostPerUser, 3 * 0.0648);
    near(r.contribution, 6.9 * 0.994 - 0.7328 - 4 * 3 * 0.0648);
    assert.equal(r.breakEvenGroups, 75);
  });

  it('专业版（纪要版 + 8 小时会议室实时转写 qwen3-asr-flash，14.9 元）：转写 6.336 元，58 个付费组回本', () => {
    const r = computeEconomics(PRO);
    near(r.asrCost, 8 * 3600 * ASR_REALTIME);
    near(r.asrCost, 6.336);
    near(r.variableCost, 7.0688);
    assert.equal(r.breakEvenGroups, 58);
  });

  it('专业版实际只用 6 小时（只送有人说话的部分）：47 组回本', () => {
    assert.equal(computeEconomics({ ...PRO, recordedHours: 6 }).breakEvenGroups, 47);
  });

  it('7 成纪要版 + 3 成专业版：加权贡献约 5.83，69 个付费组回本', () => {
    const r = blendedBreakEven(MIX);
    near(r.contribution, 0.7 * computeEconomics(NOTES).contribution + 0.3 * computeEconomics(PRO).contribution);
    assert.equal(r.breakEvenGroups, 69);
  });

  it('加时包 3 小时 3.9 元：成本 2.376，扣通道费后毛利约 38.5%', () => {
    const a = addonEconomics(ADDON);
    near(a.cost, 2.376);
    near(a.margin, (3.9 * 0.994 - 2.376) / 3.9);
  });

  it('专业版同样给 8 小时却只卖 9.9 元：要 201 组才回本（所以不降价）', () => {
    assert.equal(computeEconomics({ ...PRO, pricePerSemester: 9.9 }).breakEvenGroups, 201);
  });

  it('体验版沿用旧额度「每月 4 次」（约 16 次/学期）：专业版回本从 58 升到 112 组', () => {
    assert.equal(computeEconomics({ ...PRO, freeMeetingsPerSemester: 16 }).breakEvenGroups, 112);
  });

  it('多组包（组长带 3 个组都开纪要版，14.9 元，配 12 个体验版小组）：变动成本 2.1952，39 个包回本', () => {
    const r = computeEconomics(BUNDLE);
    near(r.variableCost, 2.1952);
    assert.equal(r.breakEvenGroups, 39);
  });

  it('贡献为负时盈亏平衡为无穷大', () => {
    assert.equal(computeEconomics({ ...PRO, pricePerSemester: 1.5 }).breakEvenGroups, Infinity);
  });

  it('规模到 500 组时整体毛利 = (500 × 贡献 − 固定) ÷ (500 × 净收入)', () => {
    const r = computeEconomics(PRO);
    near(marginAtScale(PRO, 500), (500 * r.contribution - 400) / (500 * r.netRevenue));
  });

  it('团体购入：每人成本随这个学生有几门课的小组线性增加', () => {
    near(groupPurchaseCostPerStudent({ asrPerSecond: ASR_FILE, coursesPerStudent: 1, groupSize: 5 }), 3.7024 / 5, 1e-4);
    near(groupPurchaseCostPerStudent({ asrPerSecond: ASR_FILE, coursesPerStudent: 3, groupSize: 5 }), 3 * 3.7024 / 5, 1e-4);
    near(groupPurchaseCostPerStudent({ asrPerSecond: ASR_REALTIME, coursesPerStudent: 1, groupSize: 5 }), 7.7344 / 5, 1e-4);
  });
});
