import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { logUsage } from '@/lib/llm';
import { asrCost } from '@/config/pricing';

// Demo 模拟 ASR：不接真实 Paraformer，按 1 小时录音计量并返回预置转写
export async function POST() {
  const seconds = 3600;
  logUsage({ model: 'paraformer-asr', audioSeconds: seconds, feature: 'asr', cost: asrCost(seconds) });
  const text = fs.readFileSync(path.join(process.cwd(), 'seed/new_meeting.txt'), 'utf8');
  return NextResponse.json({ transcript: text, simulated: true, audioSeconds: seconds, costCny: asrCost(seconds) });
}