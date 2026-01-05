import type { BenchmarkDefinition } from '../types';

export const riskReport: BenchmarkDefinition = {
  name: 'risk-report',
  args: ['./dist/cli.js', 'risk-report', '--mode', 'branch', '--base', 'develop'],
};
