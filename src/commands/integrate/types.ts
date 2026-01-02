
export interface FileOperation {
  path: string;
  content: string;
}

export interface Provider {
  name: string;
  description: string;
  generate(cwd: string): FileOperation[] | Promise<FileOperation[]>;
}

export interface IntegrateOptions {
  target: string;
  dryRun: boolean;
  force: boolean;
  cwd?: string;
}
