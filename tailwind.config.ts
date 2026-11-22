import type { Config } from 'tailwindcss';

// 设计方向（unslop，2026-11-22）：性格「踏实、准确、带点学生气」，世界是课堂笔记和会议纪要。
// 应用里的表面、边框、文字都用一条中性灰阶（不带蓝），颜色只留给内容；强调色是钢笔墨水蓝，只给主操作、选中和要紧的数字。
// slate 这个名字沿用（全站已在用），值换成中性灰阶；400 加深到约 4.5:1，专给辅助说明文字
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e7e7e8',
          300: '#d4d4d6',
          400: '#76767c',
          500: '#636369',
          600: '#4f4f55',
          700: '#3d3d42',
          800: '#26262a',
          900: '#18181b',
        },
        // 钢笔墨水蓝：白字在 600 上对比度约 7:1
        brand: {
          50: '#eef2fb',
          100: '#dce4f6',
          500: '#3d5cc0',
          600: '#2c4aa6',
          700: '#233c8a',
        },
        // 落地页的纸面暖白（只给落地页背景用，应用内保持中性）
        paper: {
          DEFAULT: '#f7f5f0',
          line: '#e6e1d6',
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
