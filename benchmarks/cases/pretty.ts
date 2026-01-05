/**
 * Benchmark test case for the 'pretty' command.
 */
import type { BenchmarkDefinition } from '../types.js';

export const pretty: BenchmarkDefinition = {
  name: 'pretty',
  args: ['./dist/cli.js', 'pretty', '--mode', 'branch', '--base', 'develop'],
};
