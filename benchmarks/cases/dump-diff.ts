/**
 * Benchmark test case for the 'dump-diff' command.
 */
import type { BenchmarkDefinition } from '../types.js';

export const dumpDiff: BenchmarkDefinition = {
  name: 'dump-diff',
  args: ['./dist/cli.js', 'dump-diff', '--mode', 'branch', '--base', 'develop', '--out', 'temp_diff'],
};
