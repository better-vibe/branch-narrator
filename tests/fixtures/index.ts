/**
 * Test fixtures for branch-narrator.
 */

import type { ChangeSet, FileDiff, FileChange } from "../../src/core/types.js";

/**
 * Create a test ChangeSet with the given files and diffs.
 */
export function createChangeSet(overrides: Partial<ChangeSet> = {}): ChangeSet {
  return {
    base: "main",
    head: "HEAD",
    files: [],
    diffs: [],
    ...overrides,
  };
}

/**
 * Create a file change entry.
 */
export function createFileChange(
  path: string,
  status: FileChange["status"],
  oldPath?: string
): FileChange {
  return { path, status, oldPath };
}

/**
 * Create a file diff with additions.
 */
export function createFileDiff(
  path: string,
  additions: string[],
  deletions: string[] = [],
  status: FileDiff["status"] = "modified"
): FileDiff {
  return {
    path,
    status,
    hunks: [
      {
        oldStart: 1,
        oldLines: deletions.length,
        newStart: 1,
        newLines: additions.length,
        content: "@@ -1,0 +1,0 @@",
        additions,
        deletions,
      },
    ],
  };
}

// Sample SvelteKit route diffs
export const sampleRouteDiffs = {
  pageAdded: createFileDiff(
    "src/routes/dashboard/+page.svelte",
    [
      "<script>",
      "  export let data;",
      "</script>",
      "<h1>Dashboard</h1>",
    ],
    [],
    "added"
  ),

  endpointWithMethods: createFileDiff(
    "src/routes/api/users/+server.ts",
    [
      "import { json } from '@sveltejs/kit';",
      "export const GET = async () => {",
      "  return json({ users: [] });",
      "};",
      "export const POST = async ({ request }) => {",
      "  const data = await request.json();",
      "  return json({ created: true });",
      "};",
    ],
    [],
    "added"
  ),

  layoutModified: createFileDiff(
    "src/routes/(app)/+layout.svelte",
    [
      "<slot />",
      "<footer>New footer</footer>",
    ],
    [],
    "modified"
  ),

  nestedRoute: createFileDiff(
    "src/routes/blog/[slug]/+page.server.ts",
    [
      "export const load = async ({ params }) => {",
      "  return { slug: params.slug };",
      "};",
    ],
    [],
    "added"
  ),
};

// Sample SQL migration content
export const sampleMigrations = {
  safe: `
    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL UNIQUE,
      created_at timestamptz DEFAULT now()
    );
  `,

  dropTable: `
    DROP TABLE old_users;
    CREATE TABLE new_users (
      id uuid PRIMARY KEY
    );
  `,

  dropColumn: `
    ALTER TABLE users DROP COLUMN legacy_field;
  `,

  truncate: `
    TRUNCATE users;
    INSERT INTO users (id, email) VALUES ('1', 'admin@test.com');
  `,

  deleteWithoutWhere: `
    DELETE FROM sessions;
  `,

  deleteWithWhere: `
    DELETE FROM sessions WHERE expired_at < now();
  `,

  alterType: `
    ALTER TABLE products ALTER COLUMN price TYPE numeric(10, 2);
  `,
};

// Sample env var content
export const sampleEnvVarContent = {
  processEnv: `
    const apiUrl = process.env.API_URL;
    const secret = process.env.AUTH_SECRET;
  `,

  svelteKitPublic: `
    import { PUBLIC_API_URL, PUBLIC_APP_NAME } from '$env/static/public';
  `,

  svelteKitPrivate: `
    import { DATABASE_URL, AUTH_SECRET } from '$env/static/private';
  `,

  mixed: `
    import { PUBLIC_SUPABASE_URL } from '$env/static/public';
    import { SUPABASE_SERVICE_KEY as serviceKey } from '$env/static/private';
    const fallback = process.env.FALLBACK_URL;
  `,

  viteEnv: `
    const apiUrl = import.meta.env.VITE_API_URL;
    const apiKey = import.meta.env.VITE_API_KEY;
  `,

  reactAppEnv: `
    const apiUrl = process.env.REACT_APP_API_URL;
    const apiKey = process.env.REACT_APP_API_KEY;
  `,

  nextPublicEnv: `
    const publicUrl = process.env.NEXT_PUBLIC_API_URL;
    const secret = process.env.SECRET_KEY;
  `,
};

// Sample package.json for dependency tests
export const samplePackageJson = {
  base: {
    dependencies: {
      "@sveltejs/kit": "^1.0.0",
      "svelte": "^3.55.0",
    },
    devDependencies: {
      "vite": "^4.0.0",
      "vitest": "^0.28.0",
    },
  },
  head: {
    dependencies: {
      "@sveltejs/kit": "^2.0.0", // Major bump
      "svelte": "^4.0.0", // Major bump
      "lodash": "^4.17.21", // Added
    },
    devDependencies: {
      "vite": "^5.0.0", // Major bump
      "vitest": "^1.0.0", // Major bump
      // typescript removed
    },
  },
};

