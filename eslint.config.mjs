import next from 'eslint-config-next/core-web-vitals';

const config = [
  ...next,
  { ignores: ['data/**', 'scripts/**'] },
];

export default config;