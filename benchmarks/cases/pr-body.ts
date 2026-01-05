import type { BenchmarkDefinition } from '../types';

export const prBody: BenchmarkDefinition = {
  name: 'pr-body',
  args: ['./dist/cli.js', 'pr-body', '--base', 'develop'],
};
