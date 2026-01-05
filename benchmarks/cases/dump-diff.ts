import type { BenchmarkDefinition } from '../types';
import { rm } from 'node:fs/promises';

export const dumpDiff: BenchmarkDefinition = {
  name: 'dump-diff',
  args: ['./dist/cli.js', 'dump-diff', '--mode', 'branch', '--base', 'develop', '--out', 'temp_diff'],
  teardown: async () => {
    try {
      await rm('temp_diff', { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  },
};
