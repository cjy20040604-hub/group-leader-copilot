import type { Config } from 'tailwindcss';

// 设计方向（unslop，2026-11-22）：性格「踏实、准确、带点学生气」，世界是课堂笔记和会议纪要。
// 2026-11-22 二次调整：上面深棕、下面暖纸的对比（落地页和 Demo 统一）；强调色是钢笔墨水蓝，只给主操作、选中和要紧的数字。
// slate 这个名字沿用（全站已在用），值换成暖灰阶
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 暖灰阶（和落地页的纸面同一个色温）：400 约 4.6:1，专给辅助说明文字
        slate: {
          50: '#faf7f1',
          100: '#f3eee5',
          200: '#e6dfd3',
          300: '#d3cabb',
          400: '#6e675d',
          500: '#5f584f',
          600: '#4b453d',
          700: '#3a352e',
          800: '#26221d',
          900: '#1a1612',
        },
        // 钢笔墨水蓝：白字在 600 上对比度约 7:1
        brand: {
          50: '#eef2fb',
          100: '#dce4f6',
          500: '#3d5cc0',
          600: '#2c4aa6',
          700: '#233c8a',
        },
        // 两层主色：深棕（顶栏、落地页首屏）和暖纸（内容区）。深棕上的字用 cream：主文字 17:1、次要 13:1、辅助 9.6:1
        ink: {
          DEFAULT: '#17120e',
          raised: '#221b15',
          line: '#3a3028',
        },
        cream: {
          50: '#fbf7ef',
          200: '#e2d8c8',
          400: '#c4b9a7',
        },
        paper: {
          DEFAULT: '#f3ede1',
          card: '#fbf8f2',
          line: '#e3d9c8',
        },
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
export default config;
