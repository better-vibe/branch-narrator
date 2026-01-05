import type { BenchmarkDefinition } from '../types';

export const pretty: BenchmarkDefinition = {
  name: 'pretty',
  args: ['./dist/cli.js', 'pretty', '--mode', 'branch', '--base', 'develop'],
};
