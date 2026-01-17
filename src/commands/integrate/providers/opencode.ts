import { join } from "node:path";
import { Provider } from "../types.js";
import { BRANCH_NARRATOR_USAGE } from "../shared.js";
import { isDirectory, isFile } from "../fs.js";

const OPENCODE_FILES = ["OPENCODE.md", "opencode.md"];

interface OpencodeTarget {
  path: string;
  useSection: boolean;
}

async function resolveOpencodeTarget(cwd: string): Promise<OpencodeTarget> {
  for (const file of OPENCODE_FILES) {
    if (await isFile(join(cwd, file))) {
      return { path: file, useSection: true };
    }
  }

  if (await isDirectory(join(cwd, ".opencode"))) {
    return { path: ".opencode/branch-narrator.md", useSection: false };
  }

  return { path: "OPENCODE.md", useSection: true };
}

export const opencodeProvider: Provider = {
  name: "opencode",
  description: "Integrate with OPENCODE.md or .opencode/",
  detect: async (cwd: string) => {
    for (const file of OPENCODE_FILES) {
      if (await isFile(join(cwd, file))) {
        return true;
      }
    }
    return isDirectory(join(cwd, ".opencode"));
  },
  generate: async (cwd: string) => {
    const target = await resolveOpencodeTarget(cwd);
    const content = target.useSection
      ? `\n\n## Branch Narrator Usage\n\n${BRANCH_NARRATOR_USAGE}`
      : BRANCH_NARRATOR_USAGE;

    return [
      {
        path: target.path,
        content,
      },
    ];
  },
};
