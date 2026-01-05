export interface BenchmarkDefinition {
  name: string;
  args: string[];
  /** Optional function to run before the benchmark loop */
  setup?: () => Promise<void>;
  /** Optional function to run after the benchmark loop */
  teardown?: () => Promise<void>;
}
