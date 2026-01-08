/**
 * E2E test helpers for creating temporary git repositories.
 * Based on benchmarks/helpers/temp-repo.ts with additional scenarios.
 */

import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execa } from "execa";

/**
 * Test repository with cleanup function.
 */
export interface TestRepo {
  /** Working directory of the temp repository */
  cwd: string;
  /** Base branch name */
  base: string;
  /** Feature branch name (current HEAD) */
  head: string;
  /** Cleanup function to remove the temp directory */
  cleanup: () => Promise<void>;
}

/**
 * Execute a git command in the specified directory.
 */
async function git(args: string[], cwd: string): Promise<string> {
  const result = await execa("git", args, { cwd });
  return result.stdout;
}

/**
 * Run branch-narrator CLI command.
 */
export async function runCli(
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const cliPath = join(process.cwd(), "src/cli.ts");
  const result = await execa("bun", [cliPath, ...args], {
    cwd,
    reject: false,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? 0,
  };
}

/**
 * Initialize a git repo with base commit.
 */
async function initRepo(cwd: string, baseBranch = "main"): Promise<void> {
  await git(["init", "-b", baseBranch], cwd);
  await git(["config", "user.name", "Test Bot"], cwd);
  await git(["config", "user.email", "test@example.com"], cwd);

  // Initial commit
  await writeFile(join(cwd, ".gitkeep"), "");
  await git(["add", "."], cwd);
  await git(["commit", "-m", "Initial commit"], cwd);
}

/**
 * Create cleanup function for a repo path.
 */
function createCleanup(cwd: string): () => Promise<void> {
  return async () => {
    try {
      await rm(cwd, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  };
}

// ============================================================================
// Generic Test Repository
// ============================================================================

export interface CreateRepoOptions {
  /** Files to add and commit */
  files?: Record<string, string>;
  /** Files to stage but not commit */
  staged?: Record<string, string>;
  /** Files to leave unstaged */
  unstaged?: Record<string, string>;
  /** Package.json content */
  packageJson?: Record<string, unknown>;
}

/**
 * Create a generic test repository with custom files.
 */
export async function createTestRepo(
  options: CreateRepoOptions = {}
): Promise<TestRepo> {
  const cwd = await mkdtemp(join(tmpdir(), "e2e-repo-"));

  try {
    await initRepo(cwd);

    // Add package.json if provided
    if (options.packageJson) {
      await writeFile(
        join(cwd, "package.json"),
        JSON.stringify(options.packageJson, null, 2)
      );
      await git(["add", "package.json"], cwd);
      await git(["commit", "-m", "Add package.json"], cwd);
    }

    // Create feature branch
    await git(["checkout", "-b", "feature/test"], cwd);

    // Add committed files
    if (options.files) {
      for (const [path, content] of Object.entries(options.files)) {
        const fullPath = join(cwd, path);
        await mkdir(join(fullPath, ".."), { recursive: true });
        await writeFile(fullPath, content);
      }
      await git(["add", "."], cwd);
      await git(["commit", "-m", "Add test files"], cwd);
    }

    // Add staged files
    if (options.staged) {
      for (const [path, content] of Object.entries(options.staged)) {
        const fullPath = join(cwd, path);
        await mkdir(join(fullPath, ".."), { recursive: true });
        await writeFile(fullPath, content);
      }
      await git(["add", "."], cwd);
    }

    // Add unstaged files
    if (options.unstaged) {
      for (const [path, content] of Object.entries(options.unstaged)) {
        const fullPath = join(cwd, path);
        await mkdir(join(fullPath, ".."), { recursive: true });
        await writeFile(fullPath, content);
      }
    }

    return {
      cwd,
      base: "main",
      head: "feature/test",
      cleanup: createCleanup(cwd),
    };
  } catch (error) {
    await rm(cwd, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

// ============================================================================
// Framework-Specific Repositories
// ============================================================================

/**
 * Create a SvelteKit project repository.
 */
export async function createSvelteKitRepo(): Promise<TestRepo> {
  return createTestRepo({
    packageJson: {
      name: "test-sveltekit",
      dependencies: {
        "@sveltejs/kit": "^2.0.0",
        svelte: "^4.0.0",
      },
    },
    files: {
      "src/routes/+page.svelte": `<script>
  export let data;
</script>

<h1>Welcome</h1>`,
      "src/routes/+layout.svelte": `<slot />`,
      "src/routes/about/+page.svelte": `<h1>About</h1>`,
      "src/routes/api/users/+server.ts": `import { json } from '@sveltejs/kit';

export const GET = async () => {
  return json({ users: [] });
};

export const POST = async ({ request }) => {
  return json({ created: true });
};`,
    },
  });
}

/**
 * Create a Next.js App Router project repository.
 */
export async function createNextJsRepo(): Promise<TestRepo> {
  const cwd = await mkdtemp(join(tmpdir(), "e2e-nextjs-"));

  try {
    await initRepo(cwd);

    // Add package.json with next dependency
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "test-nextjs",
          dependencies: {
            next: "^14.0.0",
            react: "^18.0.0",
            "react-dom": "^18.0.0",
          },
        },
        null,
        2
      )
    );

    // Create app directory structure
    await mkdir(join(cwd, "app"), { recursive: true });
    await mkdir(join(cwd, "app/dashboard"), { recursive: true });
    await mkdir(join(cwd, "app/api/users"), { recursive: true });

    await git(["add", "."], cwd);
    await git(["commit", "-m", "Add package.json"], cwd);

    // Create feature branch
    await git(["checkout", "-b", "feature/test"], cwd);

    // Add Next.js App Router files
    await writeFile(
      join(cwd, "app/page.tsx"),
      `export default function Home() {
  return <h1>Welcome</h1>;
}`
    );

    await writeFile(
      join(cwd, "app/layout.tsx"),
      `export default function RootLayout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}`
    );

    await writeFile(
      join(cwd, "app/dashboard/page.tsx"),
      `export default function Dashboard() {
  return <h1>Dashboard</h1>;
}`
    );

    await writeFile(
      join(cwd, "app/api/users/route.ts"),
      `export async function GET() {
  return Response.json({ users: [] });
}

export async function POST(request: Request) {
  return Response.json({ created: true });
}`
    );

    await git(["add", "."], cwd);
    await git(["commit", "-m", "Add Next.js app files"], cwd);

    return {
      cwd,
      base: "main",
      head: "feature/test",
      cleanup: createCleanup(cwd),
    };
  } catch (error) {
    await rm(cwd, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

/**
 * Create a React + React Router project repository.
 */
export async function createReactRouterRepo(): Promise<TestRepo> {
  return createTestRepo({
    packageJson: {
      name: "test-react",
      dependencies: {
        react: "^18.0.0",
        "react-dom": "^18.0.0",
        "react-router-dom": "^6.0.0",
      },
    },
    files: {
      "src/App.tsx": `import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import About from './pages/About';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </BrowserRouter>
  );
}`,
      "src/pages/Home.tsx": `export default function Home() {
  return <h1>Home</h1>;
}`,
      "src/pages/About.tsx": `export default function About() {
  return <h1>About</h1>;
}`,
    },
  });
}

// ============================================================================
// Scenario-Specific Repositories
// ============================================================================

/**
 * Create a repository with database migrations.
 */
export async function createRepoWithMigrations(): Promise<TestRepo> {
  return createTestRepo({
    packageJson: {
      name: "test-migrations",
      devDependencies: {
        supabase: "^1.0.0",
      },
    },
    files: {
      "supabase/migrations/20240101000000_init.sql": `CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);`,
      "supabase/migrations/20240102000000_add_posts.sql": `CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  title text NOT NULL,
  content text
);`,
    },
  });
}

/**
 * Create a repository with dangerous SQL migrations.
 */
export async function createRepoWithDangerousSql(): Promise<TestRepo> {
  return createTestRepo({
    packageJson: {
      name: "test-dangerous-sql",
    },
    files: {
      "supabase/migrations/20240101000000_dangerous.sql": `DROP TABLE old_users;

DELETE FROM sessions;

TRUNCATE logs;`,
    },
  });
}

/**
 * Create a repository with environment variable changes.
 */
export async function createRepoWithEnvVars(): Promise<TestRepo> {
  return createTestRepo({
    files: {
      "src/config.ts": `const apiUrl = process.env.API_URL;
const secret = process.env.AUTH_SECRET;
const dbUrl = process.env.DATABASE_URL;

export const config = { apiUrl, secret, dbUrl };`,
      ".env.example": `API_URL=https://api.example.com
AUTH_SECRET=your-secret-here
DATABASE_URL=postgres://localhost/db`,
    },
  });
}

/**
 * Create a repository with dependency changes.
 */
export async function createRepoWithDependencyChanges(): Promise<TestRepo> {
  const cwd = await mkdtemp(join(tmpdir(), "e2e-deps-"));

  try {
    await initRepo(cwd);

    // Base package.json
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "test-deps",
          dependencies: {
            lodash: "^4.17.0",
            express: "^4.0.0",
          },
          devDependencies: {
            typescript: "^4.0.0",
          },
        },
        null,
        2
      )
    );
    await git(["add", "."], cwd);
    await git(["commit", "-m", "Add package.json"], cwd);

    // Create feature branch
    await git(["checkout", "-b", "feature/test"], cwd);

    // Update package.json with major bumps and new deps
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "test-deps",
          dependencies: {
            lodash: "^4.17.21",
            express: "^5.0.0", // Major bump
            "better-auth": "^1.0.0", // New auth package
          },
          devDependencies: {
            typescript: "^5.0.0", // Major bump
          },
        },
        null,
        2
      )
    );
    await git(["add", "."], cwd);
    await git(["commit", "-m", "Update dependencies"], cwd);

    return {
      cwd,
      base: "main",
      head: "feature/test",
      cleanup: createCleanup(cwd),
    };
  } catch (error) {
    await rm(cwd, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

/**
 * Create a repository with security-sensitive file changes.
 */
export async function createRepoWithSecurityFiles(): Promise<TestRepo> {
  return createTestRepo({
    files: {
      "src/auth/login.ts": `export async function login(email: string, password: string) {
  // Authentication logic
  return { token: 'jwt-token' };
}`,
      "src/middleware/auth.ts": `export function authMiddleware(req, res, next) {
  const token = req.headers.authorization;
  // Verify token
  next();
}`,
      "src/guards/admin.guard.ts": `export function adminGuard(user) {
  return user.role === 'admin';
}`,
    },
  });
}

/**
 * Create a repository with CI workflow changes.
 */
export async function createRepoWithCIChanges(): Promise<TestRepo> {
  return createTestRepo({
    files: {
      ".github/workflows/ci.yml": `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test`,
    },
  });
}

/**
 * Create a repository with mixed changes for comprehensive testing.
 */
export async function createComprehensiveRepo(): Promise<TestRepo> {
  const cwd = await mkdtemp(join(tmpdir(), "e2e-comprehensive-"));

  try {
    await initRepo(cwd);

    // Base package.json
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "test-comprehensive",
          dependencies: {
            express: "^4.0.0",
          },
        },
        null,
        2
      )
    );
    await git(["add", "."], cwd);
    await git(["commit", "-m", "Add package.json"], cwd);

    // Create feature branch
    await git(["checkout", "-b", "feature/test"], cwd);

    // Create directory structure
    await mkdir(join(cwd, "src/auth"), { recursive: true });
    await mkdir(join(cwd, "src/api"), { recursive: true });
    await mkdir(join(cwd, "tests"), { recursive: true });
    await mkdir(join(cwd, "supabase/migrations"), { recursive: true });
    await mkdir(join(cwd, ".github/workflows"), { recursive: true });

    // Add various files
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "test-comprehensive",
          dependencies: {
            express: "^5.0.0",
            "better-auth": "^1.0.0",
          },
        },
        null,
        2
      )
    );

    await writeFile(
      join(cwd, "src/auth/login.ts"),
      `export async function login() {
  const secret = process.env.AUTH_SECRET;
  return { token: 'jwt' };
}`
    );

    await writeFile(
      join(cwd, "src/api/users.ts"),
      `export async function getUsers() {
  return [];
}`
    );

    await writeFile(
      join(cwd, "tests/auth.test.ts"),
      `import { test } from 'bun:test';
test('login', () => {});`
    );

    await writeFile(
      join(cwd, "supabase/migrations/001_init.sql"),
      `CREATE TABLE users (id uuid PRIMARY KEY);`
    );

    await writeFile(
      join(cwd, ".github/workflows/ci.yml"),
      `name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4`
    );

    await git(["add", "."], cwd);
    await git(["commit", "-m", "Add comprehensive changes"], cwd);

    return {
      cwd,
      base: "main",
      head: "feature/test",
      cleanup: createCleanup(cwd),
    };
  } catch (error) {
    await rm(cwd, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
