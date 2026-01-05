/**
 * Benchmark test case for the 'integrate' command.
 */
import type { BenchmarkDefinition } from '../types.js';

export const integrate: BenchmarkDefinition = {
  name: 'integrate',
  args: ['./dist/cli.js', 'integrate', 'cursor', '--dry-run'],
};
