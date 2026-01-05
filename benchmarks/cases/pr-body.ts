/**
 * Benchmark test case for the 'pr-body' command.
 */
import type { BenchmarkDefinition } from '../types.js';

export const prBody: BenchmarkDefinition = {
  name: 'pr-body',
  args: ['./dist/cli.js', 'pr-body', '--base', 'develop'],
};
