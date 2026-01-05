/**
 * Benchmark test case for the 'facts' command.
 */
import type { BenchmarkDefinition } from '../types.js';

export const facts: BenchmarkDefinition = {
  name: 'facts',
  args: ['./dist/cli.js', 'facts', '--mode', 'branch', '--base', 'develop'],
};
