/**
 * Custom error classes for branch-narrator.
 */

export class BranchNarratorError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = 1
  ) {
    super(message);
    this.name = "BranchNarratorError";
  }
}

export class NotAGitRepoError extends BranchNarratorError {
  constructor(path: string = process.cwd()) {
    super(
      `Not a git repository: ${path}\n` +
        "Please run this command from within a git repository.",
      1
    );
    this.name = "NotAGitRepoError";
  }
}

export class InvalidRefError extends BranchNarratorError {
  constructor(ref: string) {
    super(
      `Invalid git reference: ${ref}\n` +
        "Please ensure the branch or commit exists.",
      1
    );
    this.name = "InvalidRefError";
  }
}

export class NoDiffError extends BranchNarratorError {
  constructor(base: string, head: string) {
    super(
      `No differences found between ${base} and ${head}.\n` +
        "The branches may be identical or one may not exist.",
      1
    );
    this.name = "NoDiffError";
  }
}

export class GitCommandError extends BranchNarratorError {
  constructor(
    command: string,
    public readonly stderr: string
  ) {
    super(`Git command failed: ${command}\n${stderr}`, 1);
    this.name = "GitCommandError";
  }
}

