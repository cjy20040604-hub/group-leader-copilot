import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export async function GET() {
  const text = fs.readFileSync(path.join(process.cwd(), 'seed/new_meeting.txt'), 'utf8');
  return NextResponse.json({ transcript: text });
}