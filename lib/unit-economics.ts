// 单位经济（纯函数，可单测）：一个付费小组一学期的变动成本、边际贡献、盈亏平衡
// 单价来自 config/pricing.ts（百炼原价）；其余参数都是假设 · 待验证，页面和文档里标明
// 2026-11-22：不同课的组员可以不一样，所以计价单位是「一门课的一支小组」（约 8 次会/学期），
// 不再把一个组长的三门课当成一个组；组长同时带多个组时买「多组包」（BUNDLE）
import { PRICING, ASR_PRICE_PER_SECOND, ASR_PRICES } from '@/config/pricing';

export interface EconInputs {
  meetingsPerSemester: number; // 每组每学期开几次会（一门课约 8 次）
  meetingHours: number;        // 每次会多长（小时）
  qaPerSemester: number;       // 每组每学期问几次「问问上次」
  recordedHours: number;       // 每组每学期有多少小时录音要我们转写（专业版单组含 3 小时）
  asrPerSecond: number;        // 转写单价：录音文件识别 0.00008 / 会议室实时转写（qwen3-asr-flash）0.00022
  pricePerSemester: number;    // 专业版定价（每组每学期）
  freeToPaid: number;          // 每 1 个付费组带着几个体验版小组（体验版也会产生模型成本）
  freeMeetingsPerSemester: number; // 体验版每学期几次纪要（一支小组一学期只开约 8 次会，额度必须小于它，否则没人需要付费）
  semesterMonths: number;      // 一学期几个月
  fixedPerMonth: number;       // 服务器、数据库、域名等固定成本（元/月）
  paymentFeeRate: number;      // 支付通道费率
}

export const ASR_FILE = ASR_PRICE_PER_SECOND;                       // paraformer-v2，已核对
export const ASR_REALTIME = ASR_PRICES['qwen3-asr-flash'].perSecond; // 会议室实际用的模型，2026-11-21 官方文档 + 控制台核实

// 专业版（单组）：一门课的一支小组，一学期约 8 次会、约 67 次提问（3 门课 200 次 ÷ 3）、含 3 小时录音转写
export const BASELINE: EconInputs = {
  meetingsPerSemester: 8,
  meetingHours: 1,
  qaPerSemester: 67,
  recordedHours: 3,
  asrPerSecond: ASR_FILE,
  pricePerSemester: 9.9,
  freeToPaid: 4,
  freeMeetingsPerSemester: 3,
  semesterMonths: 4,
  fixedPerMonth: 100,
  paymentFeeRate: 0.006,
};

// 多组包：一个人当组长的全部小组（最多 4 个）一起升级；按带 3 个组算，录音额度每组 3 小时
export const BUNDLE: EconInputs = {
  ...BASELINE,
  meetingsPerSemester: 24,
  qaPerSemester: 200,
  recordedHours: 9,
  pricePerSemester: 19.9,
  freeToPaid: 12, // 3 个组 × 每组带 4 个体验版小组，和单组口径一致
};

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
  freeCostPerUser: number;  // 每个体验版用户每学期的模型成本
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
  const freeCostPerUser = i.freeMeetingsPerSemester * textPerMeeting;
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

// 一次只动一个参数，其他保持基线
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
  { factor: '录音转写时长与方式', rows: [
    { label: '0 小时（只导入文字稿 / 钉钉闪记）', value: '0', patch: { recordedHours: 0 } },
    { label: '3 小时 · 录音文件识别（基线）', value: '3f', patch: {} },
    { label: '3 小时 · 会议室实时转写', value: '3r', patch: { asrPerSecond: ASR_REALTIME } },
    { label: '8 小时 · 每次会都实时转写', value: '8r', patch: { recordedHours: 8, asrPerSecond: ASR_REALTIME } },
  ] },
  { factor: '体验版小组 : 付费组', rows: [
    { label: '0 : 1', value: '0', patch: { freeToPaid: 0 } },
    { label: '4 : 1（基线，20% 付费）', value: '4', patch: {} },
    { label: '9 : 1（10% 付费）', value: '9', patch: { freeToPaid: 9 } },
  ] },
  { factor: '体验版额度', rows: [
    { label: '每学期 3 次（基线）', value: '3', patch: {} },
    { label: '每月 4 次（旧方案，约 16 次/学期）', value: '16', patch: { freeMeetingsPerSemester: 16 } },
  ] },
  { factor: '专业版定价', rows: [
    { label: '6.9 元', value: '6.9', patch: { pricePerSemester: 6.9 } },
    { label: '9.9 元（基线）', value: '9.9', patch: {} },
    { label: '12.9 元', value: '12.9', patch: { pricePerSemester: 12.9 } },
  ] },
  { factor: '固定成本（元/月）', rows: [
    { label: '50', value: '50', patch: { fixedPerMonth: 50 } },
    { label: '100（基线）', value: '100', patch: {} },
    { label: '300', value: '300', patch: { fixedPerMonth: 300 } },
  ] },
];

// 团体购入版：机构按人数买。一个学生在 k 门课里各有一个小组时，每人成本 = k × 每组成本 ÷ 每组人数
// 每组成本口径：8 次会（文字处理 + 每次 1 小时录音）+ 约 67 次问答 + 摊销 2/3 元
export function groupPurchaseCostPerStudent(opts: { asrPerSecond: number; coursesPerStudent: number; groupSize: number }): number {
  const perGroup = 8 * (textCostPerMeeting(1) + 3600 * opts.asrPerSecond) + (200 / 3) * qaCost() + INFRA_PER_GROUP;
  return (opts.coursesPerStudent * perGroup) / opts.groupSize;
}
