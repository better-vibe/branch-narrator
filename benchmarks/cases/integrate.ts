import type { BenchmarkDefinition } from '../types';

export const integrate: BenchmarkDefinition = {
  name: 'integrate',
  args: ['./dist/cli.js', 'integrate', 'cursor', '--dry-run'],
};
