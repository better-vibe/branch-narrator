/**
 * Benchmark test case for the 'dump-diff' command.
 */
import type { BenchmarkDefinition } from '../types.js';

export const dumpDiff: BenchmarkDefinition = {
  name: 'dump-diff',
  // Note: Benchmarks run in a temporary git repository that is deleted after each run,
  // so the 'temp_diff' output directory is cleaned up as part of that teardown.
  args: ['./dist/cli.js', 'dump-diff', '--mode', 'branch', '--base', 'develop', '--out', 'temp_diff'],
};
