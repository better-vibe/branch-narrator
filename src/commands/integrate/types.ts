
export interface FileOperation {
  path: string;
  content: string;
}

export interface Provider {
  name: string;
  description: string;
  generate(cwd: string): FileOperation[] | Promise<FileOperation[]>;
  detect?: (cwd: string) => boolean | Promise<boolean>;
}

export interface IntegrateOptions {
  target?: string;
  dryRun: boolean;
  force: boolean;
  cwd?: string;
}
