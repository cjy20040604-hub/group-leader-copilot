import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '组长减负 — 小组作业协作纪要工具',
  description: '把会议转写变成纪要、任务和提醒，让小组组长不用再整理纪要、记旧决议、追 DDL。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}