import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeEconomics, textCostPerMeeting, qaCost, marginAtScale, groupPurchaseCostPerStudent, blendedBreakEven, addonEconomics, breakEvenConversion, monthlyProfit, campusCourseContribution, ECS_YEARLY, ECS_LIST_YEARLY, NOTES, PRO, BUNDLE, MIX, ADDON, ASR_FILE, ASR_REALTIME } from './unit-economics';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

describe('unit economics', () => {
  it('1 小时会文字处理 0.0648、问答 0.0032（和成本看板的标准会议推算一致）', () => {
    near(textCostPerMeeting(1), 0.0648);
    near(qaCost(), 0.0032);
  });

  it('体验版送 5 分钟实时转写：每个体验版小组成本 = 3 次纪要 0.1944 + 实时转写 0.066（按每组都用满算）', () => {
    near(computeEconomics(NOTES).freeCostPerUser, 3 * 0.0648 + 300 * ASR_REALTIME);
    near(300 * ASR_REALTIME, 0.066);
  });

  it('纪要版（一门课一支小组：8 次会、67 次问答、不含录音，6.9 元）：贡献约 5.08，服务器按 ECS 99 元/年算 7 个付费组回本', () => {
    const r = computeEconomics(NOTES);
    near(r.modelCost, 8 * 0.0648 + 67 * 0.0032);
    near(r.asrCost, 0);
    near(r.variableCost, 0.7328);
    near(r.contribution, 6.9 * 0.994 - 0.7328 - 4 * (3 * 0.0648 + 0.066));
    assert.equal(r.breakEvenGroups, 7);
  });

  it('专业版（纪要版 + 8 小时会议室实时转写 qwen3-asr-flash，14.9 元）：转写 6.336 元，5 个付费组回本', () => {
    const r = computeEconomics(PRO);
    near(r.asrCost, 8 * 3600 * ASR_REALTIME);
    near(r.asrCost, 6.336);
    near(r.variableCost, 7.0688);
    assert.equal(r.breakEvenGroups, 5);
  });

  it('专业版实际只用 6 小时（只送有人说话的部分）：4 组回本', () => {
    assert.equal(computeEconomics({ ...PRO, recordedHours: 6 }).breakEvenGroups, 4);
  });

  it('7 成纪要版 + 3 成专业版：加权贡献约 5.57，6 个付费组回本；服务器按目录价 906.24 元/年时 55 组，按原来的 100 元/月时 72 组', () => {
    const r = blendedBreakEven(MIX);
    near(r.contribution, 0.7 * computeEconomics(NOTES).contribution + 0.3 * computeEconomics(PRO).contribution);
    assert.equal(r.breakEvenGroups, 6);
    assert.equal(blendedBreakEven(MIX.map((m) => ({ ...m, inputs: { ...m.inputs, fixedPerMonth: ECS_LIST_YEARLY / 12 } }))).breakEvenGroups, 55);
    assert.equal(blendedBreakEven(MIX.map((m) => ({ ...m, inputs: { ...m.inputs, fixedPerMonth: 100 } }))).breakEvenGroups, 72);
  });

  it('加时包 3 小时 3.9 元：成本 2.376，扣通道费后毛利约 38.5%', () => {
    const a = addonEconomics(ADDON);
    near(a.cost, 2.376);
    near(a.margin, (3.9 * 0.994 - 2.376) / 3.9);
  });

  it('专业版同样给 8 小时却只卖 9.9 元：每组贡献只剩 1.73 元，回本组数是 14.9 元时的 4 倍（所以不降价）', () => {
    near(computeEconomics({ ...PRO, pricePerSemester: 9.9 }).contribution, 9.9 * 0.994 - 7.0688 - 4 * 0.2604);
    assert.equal(computeEconomics({ ...PRO, pricePerSemester: 9.9 }).breakEvenGroups, 20);
  });

  it('体验版沿用旧额度「每月 4 次」（约 16 次/学期）：专业版回本从 5 升到 10 组', () => {
    assert.equal(computeEconomics({ ...PRO, freeMeetingsPerSemester: 16 }).breakEvenGroups, 10);
  });

  it('多组包（组长带 3 个组都开纪要版，14.9 元，配 12 个体验版小组）：变动成本 2.1952，4 个包回本', () => {
    const r = computeEconomics(BUNDLE);
    near(r.variableCost, 2.1952);
    assert.equal(r.breakEvenGroups, 4);
  });

  it('付费转化底线：纪要版一个付费组最多背约 23.5 个体验版小组（转化率约 4.1%），低于就每单亏；送 10 分钟时这条线约 5.1%', () => {
    const b = breakEvenConversion(NOTES);
    near(b.maxFreePerPaid, (6.9 * 0.994 - 0.7328) / (3 * 0.0648 + 0.066));
    assert.ok(b.minConversion > 0.04 && b.minConversion < 0.041);
    assert.ok(breakEvenConversion({ ...NOTES, freeRealtimeMinutes: 10 }).minConversion > 0.05);
    assert.equal(computeEconomics({ ...NOTES, freeToPaid: 9 }).breakEvenGroups, 9);
    assert.equal(computeEconomics({ ...NOTES, freeToPaid: 19 }).breakEvenGroups, 29);
  });

  it('服务器按阿里云 ECS 经济型 e 实例 99 元/年：每月 8.25 元、每学期 33 元', () => {
    near(NOTES.fixedPerMonth, ECS_YEARLY / 12);
    near(computeEconomics(NOTES).fixedPerSemester, 33);
  });

  it('单月利润：7:3 混合 100 / 500 / 1000 个付费组约 131 / 688 / 1384 元；团体购入 10 / 50 门 60 人的课约 631 / 3186 元', () => {
    const c = blendedBreakEven(MIX).contribution;
    assert.deepEqual([100, 500, 1000].map((n) => Math.round(monthlyProfit(c, n))), [131, 688, 1384]);
    near(campusCourseContribution(), 60 * (5 - groupPurchaseCostPerStudent({ asrPerSecond: ASR_FILE, coursesPerStudent: 1, groupSize: 5 })));
    assert.deepEqual([10, 50].map((k) => Math.round(monthlyProfit(campusCourseContribution(), k))), [631, 3186]);
  });

  it('贡献为负时盈亏平衡为无穷大', () => {
    assert.equal(computeEconomics({ ...PRO, pricePerSemester: 1.5 }).breakEvenGroups, Infinity);
  });

  it('规模到 500 组时整体毛利 = (500 × 贡献 − 固定) ÷ (500 × 净收入)', () => {
    const r = computeEconomics(PRO);
    near(marginAtScale(PRO, 500), (500 * r.contribution - r.fixedPerSemester) / (500 * r.netRevenue));
  });

  it('团体购入：每人成本随这个学生有几门课的小组线性增加', () => {
    near(groupPurchaseCostPerStudent({ asrPerSecond: ASR_FILE, coursesPerStudent: 1, groupSize: 5 }), 3.7024 / 5, 1e-4);
    near(groupPurchaseCostPerStudent({ asrPerSecond: ASR_FILE, coursesPerStudent: 3, groupSize: 5 }), 3 * 3.7024 / 5, 1e-4);
    near(groupPurchaseCostPerStudent({ asrPerSecond: ASR_REALTIME, coursesPerStudent: 1, groupSize: 5 }), 7.7344 / 5, 1e-4);
  });
});
