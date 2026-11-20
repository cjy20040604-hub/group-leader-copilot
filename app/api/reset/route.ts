import { NextResponse } from 'next/server';
import { isLeader } from '@/lib/auth';
import { runSeed } from '@/seed/index';

// 直接调用种子函数，不再 execSync('npm run seed')（依赖 PATH、阻塞事件循环、部署环境不一定有 npm）
export async function POST() {
  if (!isLeader()) return NextResponse.json({ error: '只有组长能重置 Demo' }, { status: 403 });
  try {
    await runSeed();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
