import type { BenchmarkDefinition } from '../types';

export const facts: BenchmarkDefinition = {
  name: 'facts',
  args: ['./dist/cli.js', 'facts', '--mode', 'branch', '--base', 'develop'],
};
