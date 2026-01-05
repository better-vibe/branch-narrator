/**
 * Benchmark test case for the 'risk-report' command.
 */
import type { BenchmarkDefinition } from '../types.js';

export const riskReport: BenchmarkDefinition = {
  name: 'risk-report',
  args: ['./dist/cli.js', 'risk-report', '--mode', 'branch', '--base', 'develop'],
};
