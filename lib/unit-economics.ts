// 单位经济（纯函数，可单测）：一个付费小组一学期的变动成本、边际贡献、盈亏平衡
// 单价来自 config/pricing.ts（百炼原价）；其余参数都是假设 · 待验证，页面和文档里标明
import { PRICING, ASR_PRICE_PER_SECOND, ASR_PRICES } from '@/config/pricing';

export interface EconInputs {
  meetingsPerSemester: number; // 每组每学期开几次会（3 门课 × 8 次 = 24）
  meetingHours: number;        // 每次会多长（小时）
  qaPerSemester: number;       // 每组每学期问几次「问问上次」
  recordedHours: number;       // 每组每学期有多少小时录音要我们转写（专业版含 10 小时）
  asrPerSecond: number;        // 转写单价：录音文件识别 0.00008 / 会议室实时转写（qwen3-asr-flash）0.00022
  pricePerSemester: number;    // 专业版定价（每组每学期）
  freeToPaid: number;          // 每 1 个付费组带着几个体验版用户（体验版用户也会产生模型成本）
  freeMeetingsPerMonth: number;// 体验版每月几次纪要
  semesterMonths: number;      // 一学期几个月
  fixedPerMonth: number;       // 服务器、数据库、域名等固定成本（元/月）
  paymentFeeRate: number;      // 支付通道费率
}

export const ASR_FILE = ASR_PRICE_PER_SECOND;                       // paraformer-v2，已核对
export const ASR_REALTIME = ASR_PRICES['qwen3-asr-flash'].perSecond; // 会议室实际用的模型，2026-11-21 官方文档 + 控制台核实

export const BASELINE: EconInputs = {
  meetingsPerSemester: 24,
  meetingHours: 1,
  qaPerSemester: 200,
  recordedHours: 10,
  asrPerSecond: ASR_FILE,
  pricePerSemester: 19.9,
  freeToPaid: 4,
  freeMeetingsPerMonth: 4,
  semesterMonths: 4,
  fixedPerMonth: 100,
  paymentFeeRate: 0.006,
};

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
  const freeCostPerUser = i.freeMeetingsPerMonth * i.semesterMonths * textPerMeeting;
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
  { factor: '每组每学期问答', rows: [
    { label: '100 次', value: '100', patch: { qaPerSemester: 100 } },
    { label: '200 次（基线）', value: '200', patch: {} },
    { label: '400 次', value: '400', patch: { qaPerSemester: 400 } },
  ] },
  { factor: '录音转写时长与方式', rows: [
    { label: '0 小时（只导入文字稿 / 钉钉闪记）', value: '0', patch: { recordedHours: 0 } },
    { label: '10 小时 · 录音文件识别（基线）', value: '10f', patch: {} },
    { label: '10 小时 · 会议室实时转写', value: '10r', patch: { asrPerSecond: ASR_REALTIME } },
  ] },
  { factor: '体验版用户 : 付费组', rows: [
    { label: '0 : 1', value: '0', patch: { freeToPaid: 0 } },
    { label: '4 : 1（基线，20% 付费）', value: '4', patch: {} },
    { label: '9 : 1（10% 付费）', value: '9', patch: { freeToPaid: 9 } },
  ] },
  { factor: '专业版定价', rows: [
    { label: '9.9 元', value: '9.9', patch: { pricePerSemester: 9.9 } },
    { label: '19.9 元（基线）', value: '19.9', patch: {} },
    { label: '29.9 元', value: '29.9', patch: { pricePerSemester: 29.9 } },
  ] },
  { factor: '固定成本（元/月）', rows: [
    { label: '50', value: '50', patch: { fixedPerMonth: 50 } },
    { label: '100（基线）', value: '100', patch: {} },
    { label: '300', value: '300', patch: { fixedPerMonth: 300 } },
  ] },
];
