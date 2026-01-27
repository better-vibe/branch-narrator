import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { execa } from "execa";

const CLI_PATH = join(import.meta.dir, "../src/cli.ts");
const PROFILE_NAMES = [
  "auto",
  "sveltekit",
  "next",
  "react",
  "vue",
  "astro",
  "stencil",
  "angular",
  "library",
  "python",
  "vite",
];

describe("CLI help profile list", () => {
  const commands = ["pretty", "pr-body", "facts", "zoom"];

  for (const command of commands) {
    it(`includes full profile list for ${command}`, async () => {
      const result = await execa("bun", [CLI_PATH, command, "--help"], {
        reject: true,
      });

      for (const profile of PROFILE_NAMES) {
        expect(result.stdout).toContain(profile);
      }
    });
  }
});
