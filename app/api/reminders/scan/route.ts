import { NextResponse } from 'next/server';
import { scanReminders } from '@/lib/reminders';

export async function POST() {
  return NextResponse.json(scanReminders());
}