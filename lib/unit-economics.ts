// 单位经济（纯函数，可单测）：一个付费小组一学期的变动成本、边际贡献、盈亏平衡
// 单价来自 config/pricing.ts（百炼原价）；其余参数都是假设 · 待验证，页面和文档里标明
// 2026-11-22：不同课的组员可以不一样，所以计价单位是「一门课的一支小组」（约 8 次会/学期），
// 不再把一个组长的三门课当成一个组；组长同时带多个组时买「多组包」（BUNDLE）
import { PRICING, ASR_PRICE_PER_SECOND, ASR_PRICES } from '@/config/pricing';

export interface EconInputs {
  meetingsPerSemester: number; // 每组每学期开几次会（一门课约 8 次）
  meetingHours: number;        // 每次会多长（小时）
  qaPerSemester: number;       // 每组每学期问几次「问问上次」
  recordedHours: number;       // 每组每学期有多少小时实时转写（纪要版 0，专业版 8）
  asrPerSecond: number;        // 转写单价：录音文件识别 0.00008 / 会议室实时转写（qwen3-asr-flash）0.00022
  pricePerSemester: number;    // 定价（每组每学期）
  freeToPaid: number;          // 每 1 个付费组带着几个体验版小组（体验版也会产生模型成本）
  freeMeetingsPerSemester: number; // 体验版每学期几次纪要（一支小组一学期只开约 8 次会，额度必须小于它，否则没人需要付费）
  freeRealtimeMinutes: number; // 体验版送几分钟会议室实时转写（产品里每位组长一学期一次；这里按每个体验版小组都用满算，偏保守）
  semesterMonths: number;      // 一学期几个月
  fixedPerMonth: number;       // 服务器、数据库、域名等固定成本（元/月）
  paymentFeeRate: number;      // 支付通道费率
}

export const ASR_FILE = ASR_PRICE_PER_SECOND;                       // paraformer-v2，已核对
export const ASR_REALTIME = ASR_PRICES['qwen3-asr-flash'].perSecond; // 会议室实际用的模型，2026-11-21 官方文档 + 控制台核实

// 2026-11-22 定价调整：把「纪要」和「录音转写」拆开卖。大部分小组用腾讯会议 / 钉钉开会，本来就有文字稿，只需要纪要；
// 在教室里面对面开会、要实时转写的小组买专业版。实时转写用完了不断：会照常录音，散会后走录音文件识别整理，或加购时长
// 纪要版：一门课的一支小组，一学期约 8 次会、约 67 次提问（3 门课 200 次 ÷ 3），纪要不限次，不含录音转写
export const NOTES: EconInputs = {
  meetingsPerSemester: 8,
  meetingHours: 1,
  qaPerSemester: 67,
  recordedHours: 0,
  asrPerSecond: ASR_REALTIME,
  pricePerSemester: 6.9,
  freeToPaid: 4,
  freeMeetingsPerSemester: 3,
  freeRealtimeMinutes: 5,
  semesterMonths: 4,
  fixedPerMonth: 100,
  paymentFeeRate: 0.006,
};

// 专业版：纪要版全部 + 8 小时会议室实时转写（qwen3-asr-flash）。8 次会每次 1 小时全程实时，按最坏情况算
export const PRO: EconInputs = { ...NOTES, recordedHours: 8, pricePerSemester: 14.9 };

// 加时包：实时转写 3 小时 3.9 元，哪个档位都能买；按满额用完算成本
export const ADDON = { hours: 3, price: 3.9 };
export function addonEconomics(a: { hours: number; price: number } = ADDON, asrPerSecond = ASR_REALTIME, paymentFeeRate = NOTES.paymentFeeRate) {
  const cost = a.hours * 3600 * asrPerSecond;
  const net = a.price * (1 - paymentFeeRate);
  return { cost, net, contribution: net - cost, margin: (net - cost) / a.price };
}

// 多组包：一个人当组长的全部小组（最多 4 个）一起开纪要版；按带 3 个组算，不含录音（要录音就给那个组加时长或单独升专业版）
export const BUNDLE: EconInputs = {
  ...NOTES,
  meetingsPerSemester: 24,
  qaPerSemester: 200,
  pricePerSemester: 14.9,
  freeToPaid: 12, // 3 个组 × 每组带 4 个体验版小组，和单组口径一致
};

// 两档按比例混在一起时的回本组数（默认 7 成纪要版、3 成专业版）：用加权平均的单组贡献去摊固定成本
export function blendedBreakEven(mix: { inputs: EconInputs; share: number }[]): { contribution: number; breakEvenGroups: number } {
  const total = mix.reduce((a, m) => a + m.share, 0);
  const contribution = mix.reduce((a, m) => a + (m.share / total) * computeEconomics(m.inputs).contribution, 0);
  const fixed = computeEconomics(mix[0].inputs).fixedPerSemester;
  return { contribution, breakEvenGroups: contribution > 0 ? Math.ceil(fixed / contribution - 1e-9) : Infinity };
}
export const MIX = [{ inputs: NOTES, share: 0.7 }, { inputs: PRO, share: 0.3 }];

// 服务器 / 数据库 / 推送摊销：原来按「一个组长三门课」估 2 元/学期，按单组算约 2/3 元（只用于展示单组毛利；单位经济里固定成本按月单列）
export const INFRA_PER_GROUP = 2 / 3;
export const INFRA_PER_BUNDLE = 2;

const per = (tokens: number, yuanPerM: number) => (tokens * yuanPerM) / 1_000_000;

// 一场会的文字处理：抽取输入 = 每小时转写 12k + 历史上下文 2.5k + 提示词 1.5k；输出每小时 2.5k；索引每小时 16k；简报固定 4k/0.8k
export function textCostPerMeeting(hours: number): number {
  const ex = PRICING['qwen3.7-plus'];
  const chat = PRICING['qwen-plus'];
  const emb = PRICING['text-embedding-v4'];
  const extract = per(12000 * hours + 4000, ex.input) + per(2500 * hours, ex.output);
  const index = per(16000 * hours, emb.input);
  const briefing = per(4000, chat.input) + per(800, chat.output);
  return extract + index + briefing;
}

export function qaCost(): number {
  const chat = PRICING['qwen-plus'];
  return per(3000, chat.input) + per(400, chat.output);
}

export interface EconResult {
  textPerMeeting: number;
  modelCost: number;        // 会议文字处理 + 问答
  asrCost: number;
  variableCost: number;     // 每个付费组每学期的变动成本
  freeCostPerUser: number;  // 每个体验版小组每学期的成本（纪要 + 送的实时转写）
  netRevenue: number;       // 扣支付通道费后的收入
  contribution: number;     // 每个付费组的边际贡献（扣变动成本和它带着的体验版用户成本）
  unitMargin: number;       // contribution / netRevenue
  fixedPerSemester: number;
  breakEvenGroups: number;  // 覆盖固定成本需要的付费组数（向上取整；贡献 ≤ 0 时为 Infinity）
}

export function computeEconomics(i: EconInputs): EconResult {
  const textPerMeeting = textCostPerMeeting(i.meetingHours);
  const modelCost = i.meetingsPerSemester * textPerMeeting + i.qaPerSemester * qaCost();
  const asrCost = i.recordedHours * 3600 * i.asrPerSecond;
  const variableCost = modelCost + asrCost;
  const freeCostPerUser = i.freeMeetingsPerSemester * textPerMeeting + i.freeRealtimeMinutes * 60 * ASR_REALTIME;
  const netRevenue = i.pricePerSemester * (1 - i.paymentFeeRate);
  const contribution = netRevenue - variableCost - i.freeToPaid * freeCostPerUser;
  const fixedPerSemester = i.fixedPerMonth * i.semesterMonths;
  return {
    textPerMeeting, modelCost, asrCost, variableCost, freeCostPerUser, netRevenue, contribution,
    unitMargin: netRevenue > 0 ? contribution / netRevenue : 0,
    fixedPerSemester,
    breakEvenGroups: contribution > 0 ? Math.ceil(fixedPerSemester / contribution - 1e-9) : Infinity,
  };
}

// 到了 N 个付费组时的整体毛利（含固定成本）
export function marginAtScale(i: EconInputs, groups: number): number {
  const r = computeEconomics(i);
  const revenue = groups * r.netRevenue;
  return revenue > 0 ? (groups * r.contribution - r.fixedPerSemester) / revenue : 0;
}

export interface SensitivityRow { label: string; value: string; patch: Partial<EconInputs> }

// 一次只动一个参数，其他保持专业版基线（纪要版只差录音这一项，见「实时转写时长」第一行）
export const SENSITIVITY: { factor: string; rows: SensitivityRow[] }[] = [
  { factor: '每次会时长', rows: [
    { label: '0.5 小时', value: '0.5', patch: { meetingHours: 0.5 } },
    { label: '1 小时（基线）', value: '1', patch: {} },
    { label: '2 小时', value: '2', patch: { meetingHours: 2 } },
  ] },
  { factor: '每组每学期会议', rows: [
    { label: '4 次', value: '4', patch: { meetingsPerSemester: 4 } },
    { label: '8 次（基线）', value: '8', patch: {} },
    { label: '16 次', value: '16', patch: { meetingsPerSemester: 16 } },
  ] },
  { factor: '实时转写实际用了多少', rows: [
    { label: '0 小时（成本和纪要版一样）', value: '0', patch: { recordedHours: 0 } },
    { label: '6 小时（只算有人说话的部分）', value: '6', patch: { recordedHours: 6 } },
    { label: '8 小时 · 额度用满（基线）', value: '8', patch: {} },
    { label: '8 小时 + 散会后再转 5 小时录音文件', value: '8+5', patch: { recordedHours: 8 + 5 * (ASR_FILE / ASR_REALTIME) } },
  ] },
  { factor: '体验版小组 : 付费组', rows: [
    { label: '0 : 1', value: '0', patch: { freeToPaid: 0 } },
    { label: '4 : 1（基线，20% 付费）', value: '4', patch: {} },
    { label: '9 : 1（10% 付费）', value: '9', patch: { freeToPaid: 9 } },
    { label: '19 : 1（5% 付费）', value: '19', patch: { freeToPaid: 19 } },
  ] },
  { factor: '体验版额度', rows: [
    { label: '每学期 3 次纪要 + 5 分钟实时转写（基线）', value: '3', patch: {} },
    { label: '不送实时转写', value: '3-0', patch: { freeRealtimeMinutes: 0 } },
    { label: '送 10 分钟实时转写', value: '3-10', patch: { freeRealtimeMinutes: 10 } },
    { label: '送 30 分钟实时转写', value: '3-30', patch: { freeRealtimeMinutes: 30 } },
    { label: '每月 4 次（旧方案，约 16 次/学期）', value: '16', patch: { freeMeetingsPerSemester: 16 } },
  ] },
  { factor: '专业版定价', rows: [
    { label: '12.9 元', value: '12.9', patch: { pricePerSemester: 12.9 } },
    { label: '14.9 元（基线）', value: '14.9', patch: {} },
    { label: '9.9 元（同样 8 小时）', value: '9.9', patch: { pricePerSemester: 9.9 } },
  ] },
  { factor: '固定成本（元/月）', rows: [
    { label: '50', value: '50', patch: { fixedPerMonth: 50 } },
    { label: '100（基线）', value: '100', patch: {} },
    { label: '300', value: '300', patch: { fixedPerMonth: 300 } },
  ] },
];

// 付费转化的底线：一个付费组最多能背几个体验版小组还不亏，换算成付费转化率（低于它每卖一单都在亏）
export function breakEvenConversion(i: EconInputs): { maxFreePerPaid: number; minConversion: number } {
  const r = computeEconomics({ ...i, freeToPaid: 0 });
  const maxFreePerPaid = r.freeCostPerUser > 0 ? (r.netRevenue - r.variableCost) / r.freeCostPerUser : Infinity;
  return { maxFreePerPaid, minConversion: 1 / (1 + maxFreePerPaid) };
}

// 回本只说明服务器不亏。要养活人，还得问：一学期要赚多少，需要多少个付费组（或多少门课的团体购入）
export const FOUNDER_TARGET_PER_SEMESTER = 40000; // 假设：创始人每月 1 万元，一学期 4 个月
export function unitsForIncome(contributionPerUnit: number, fixedPerSemester: number, target = FOUNDER_TARGET_PER_SEMESTER): number {
  return contributionPerUnit > 0 ? Math.ceil((target + fixedPerSemester) / contributionPerUnit - 1e-9) : Infinity;
}

// 团体购入版：机构按人数买。一个学生在 k 门课里各有一个小组时，每人成本 = k × 每组成本 ÷ 每组人数
// 每组成本口径：8 次会（文字处理 + 每次 1 小时录音）+ 约 67 次问答 + 摊销 2/3 元
export function groupPurchaseCostPerStudent(opts: { asrPerSecond: number; coursesPerStudent: number; groupSize: number }): number {
  const perGroup = 8 * (textCostPerMeeting(1) + 3600 * opts.asrPerSecond) + (200 / 3) * qaCost() + INFRA_PER_GROUP;
  return (opts.coursesPerStudent * perGroup) / opts.groupSize;
}
