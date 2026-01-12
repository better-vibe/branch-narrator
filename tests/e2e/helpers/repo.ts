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

// ============================================================================
// Additional Framework Repositories
// ============================================================================

/**
 * Create a Vue/Nuxt project repository.
 */
export async function createVueNuxtRepo(): Promise<TestRepo> {
  return createTestRepo({
    packageJson: {
      name: "test-nuxt",
      dependencies: {
        vue: "^3.4.0",
        nuxt: "^3.10.0",
      },
    },
    files: {
      "pages/index.vue": `<template>
  <div>
    <h1>Welcome to Nuxt</h1>
  </div>
</template>`,
      "pages/about.vue": `<template>
  <div>
    <h1>About</h1>
  </div>
</template>`,
      "pages/users/[id].vue": `<template>
  <div>
    <h1>User {{ $route.params.id }}</h1>
  </div>
</template>`,
      "server/api/users.get.ts": `export default defineEventHandler(() => {
  return { users: [] };
});`,
      "server/api/users.post.ts": `export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  return { created: true };
});`,
    },
  });
}

/**
 * Create an Astro project repository.
 */
export async function createAstroRepo(): Promise<TestRepo> {
  return createTestRepo({
    packageJson: {
      name: "test-astro",
      dependencies: {
        astro: "^4.0.0",
      },
    },
    files: {
      "src/pages/index.astro": `---
const title = 'Welcome';
---
<html>
  <head><title>{title}</title></head>
  <body><h1>{title}</h1></body>
</html>`,
      "src/pages/about.astro": `---
const title = 'About';
---
<html>
  <body><h1>{title}</h1></body>
</html>`,
      "src/pages/blog/[slug].astro": `---
export function getStaticPaths() {
  return [
    { params: { slug: 'post-1' } },
    { params: { slug: 'post-2' } },
  ];
}
const { slug } = Astro.params;
---
<html>
  <body><h1>Blog: {slug}</h1></body>
</html>`,
      "src/pages/api/health.ts": `export const GET = () => {
  return new Response(JSON.stringify({ status: 'ok' }));
};`,
    },
  });
}

/**
 * Create a Stencil project repository.
 */
export async function createStencilRepo(): Promise<TestRepo> {
  return createTestRepo({
    packageJson: {
      name: "test-stencil",
      dependencies: {
        "@stencil/core": "^4.0.0",
      },
    },
    files: {
      "src/components/my-button/my-button.tsx": `import { Component, Prop, Event, EventEmitter, h } from '@stencil/core';

@Component({
  tag: 'my-button',
  styleUrl: 'my-button.css',
  shadow: true,
})
export class MyButton {
  @Prop() disabled: boolean = false;
  @Prop() variant: 'primary' | 'secondary' = 'primary';
  
  @Event() buttonClick: EventEmitter<void>;

  render() {
    return (
      <button disabled={this.disabled} onClick={() => this.buttonClick.emit()}>
        <slot />
      </button>
    );
  }
}`,
      "src/components/my-modal/my-modal.tsx": `import { Component, Prop, Method, h } from '@stencil/core';

@Component({
  tag: 'my-modal',
  shadow: true,
})
export class MyModal {
  @Prop() open: boolean = false;
  
  @Method()
  async show() {
    this.open = true;
  }

  render() {
    return this.open ? <div class="modal"><slot /></div> : null;
  }
}`,
      "stencil.config.ts": `import { Config } from '@stencil/core';

export const config: Config = {
  namespace: 'test-stencil',
  outputTargets: [
    { type: 'dist' },
    { type: 'www' },
  ],
};`,
    },
  });
}

/**
 * Create a library project repository (with exports).
 */
export async function createLibraryRepo(): Promise<TestRepo> {
  return createTestRepo({
    packageJson: {
      name: "@my-org/my-lib",
      version: "1.0.0",
      type: "module",
      main: "./dist/index.cjs",
      module: "./dist/index.js",
      types: "./dist/index.d.ts",
      exports: {
        ".": {
          import: "./dist/index.js",
          require: "./dist/index.cjs",
          types: "./dist/index.d.ts",
        },
        "./utils": {
          import: "./dist/utils.js",
          require: "./dist/utils.cjs",
          types: "./dist/utils.d.ts",
        },
        "./helpers": {
          import: "./dist/helpers.js",
          require: "./dist/helpers.cjs",
        },
      },
      bin: {
        "my-cli": "./bin/cli.js",
      },
    },
    files: {
      "src/index.ts": `export const VERSION = '1.0.0';
export { add, subtract } from './math.js';`,
      "src/utils.ts": `export function formatDate(date: Date): string {
  return date.toISOString();
}`,
      "src/helpers.ts": `export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}`,
      "src/math.ts": `export function add(a: number, b: number): number {
  return a + b;
}
export function subtract(a: number, b: number): number {
  return a - b;
}`,
    },
  });
}

// ============================================================================
// Additional Scenario Repositories
// ============================================================================

/**
 * Create a repository with GraphQL schema changes.
 */
export async function createRepoWithGraphQL(): Promise<TestRepo> {
  const cwd = await mkdtemp(join(tmpdir(), "e2e-graphql-"));

  try {
    await initRepo(cwd);

    // Base schema
    await writeFile(
      join(cwd, "schema.graphql"),
      `type Query {
  users: [User!]!
  user(id: ID!): User
}

type User {
  id: ID!
  name: String!
  email: String!
  posts: [Post!]!
}

type Post {
  id: ID!
  title: String!
  content: String
}
`
    );
    await git(["add", "."], cwd);
    await git(["commit", "-m", "Add initial schema"], cwd);

    // Create feature branch
    await git(["checkout", "-b", "feature/test"], cwd);

    // Modified schema with breaking and non-breaking changes
    await writeFile(
      join(cwd, "schema.graphql"),
      `type Query {
  users: [User!]!
  user(id: ID!): User
  posts: [Post!]!
}

type Mutation {
  createUser(input: CreateUserInput!): User!
}

input CreateUserInput {
  name: String!
  email: String!
}

type User {
  id: ID!
  name: String!
  username: String!
  posts: [Post!]!
}

type Post {
  id: ID!
  title: String!
  content: String
  author: User!
}
`
    );

    await git(["add", "."], cwd);
    await git(["commit", "-m", "Update GraphQL schema"], cwd);

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
 * Create a repository with TypeScript config changes.
 */
export async function createRepoWithTSConfig(): Promise<TestRepo> {
  const cwd = await mkdtemp(join(tmpdir(), "e2e-tsconfig-"));

  try {
    await initRepo(cwd);

    // Base tsconfig
    await writeFile(
      join(cwd, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2020",
            module: "ESNext",
            strict: false,
            skipLibCheck: true,
          },
        },
        null,
        2
      )
    );
    await git(["add", "."], cwd);
    await git(["commit", "-m", "Add tsconfig"], cwd);

    // Create feature branch
    await git(["checkout", "-b", "feature/test"], cwd);

    // Enable strict mode (breaking change)
    await writeFile(
      join(cwd, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            strict: true,
            strictNullChecks: true,
            noImplicitAny: true,
            skipLibCheck: true,
          },
        },
        null,
        2
      )
    );

    await git(["add", "."], cwd);
    await git(["commit", "-m", "Enable strict mode"], cwd);

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
 * Create a repository with Tailwind config changes.
 */
export async function createRepoWithTailwind(): Promise<TestRepo> {
  const cwd = await mkdtemp(join(tmpdir(), "e2e-tailwind-"));

  try {
    await initRepo(cwd);

    // Base tailwind config
    await writeFile(
      join(cwd, "tailwind.config.js"),
      `module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};`
    );
    await git(["add", "."], cwd);
    await git(["commit", "-m", "Add tailwind config"], cwd);

    // Create feature branch
    await git(["checkout", "-b", "feature/test"], cwd);

    // Update with theme changes
    await writeFile(
      join(cwd, "tailwind.config.js"),
      `module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        secondary: '#10b981',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};`
    );

    await git(["add", "."], cwd);
    await git(["commit", "-m", "Update tailwind theme"], cwd);

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
 * Create a repository with infrastructure changes.
 */
export async function createRepoWithInfra(): Promise<TestRepo> {
  return createTestRepo({
    files: {
      "Dockerfile": `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "dist/index.js"]`,
      "Dockerfile.dev": `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]`,
      "main.tf": `terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_instance" "app" {
  ami           = var.ami_id
  instance_type = "t3.micro"
  
  tags = {
    Name = "app-server"
  }
}`,
      "variables.tf": `variable "aws_region" {
  default = "us-east-1"
}

variable "ami_id" {
  description = "AMI ID for the instance"
}`,
      "k8s/deployment.yaml": `apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
        - name: app
          image: myapp:latest
          ports:
            - containerPort: 3000`,
      "k8s/service.yaml": `apiVersion: v1
kind: Service
metadata:
  name: app-service
spec:
  selector:
    app: myapp
  ports:
    - port: 80
      targetPort: 3000`,
    },
  });
}

/**
 * Create a repository with a large diff (many files/lines).
 */
export async function createRepoWithLargeDiff(): Promise<TestRepo> {
  const files: Record<string, string> = {};
  
  // Create 35+ files with substantial content
  for (let i = 0; i < 40; i++) {
    const content = Array.from({ length: 50 }, (_, j) =>
      `export const value${j} = ${j * i};`
    ).join("\n");
    files[`src/module${i}/index.ts`] = content;
    files[`src/module${i}/utils.ts`] = `// Utils for module ${i}\n${content}`;
  }

  return createTestRepo({ files });
}

/**
 * Create a repository with lockfile mismatch.
 */
export async function createRepoWithLockfileMismatch(): Promise<TestRepo> {
  const cwd = await mkdtemp(join(tmpdir(), "e2e-lockfile-"));

  try {
    await initRepo(cwd);

    // Base state with both package.json and lockfile
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "test-lockfile",
          dependencies: {
            lodash: "^4.17.20",
          },
        },
        null,
        2
      )
    );
    await writeFile(
      join(cwd, "package-lock.json"),
      JSON.stringify(
        {
          name: "test-lockfile",
          lockfileVersion: 3,
          packages: {},
        },
        null,
        2
      )
    );
    await git(["add", "."], cwd);
    await git(["commit", "-m", "Add package files"], cwd);

    // Create feature branch
    await git(["checkout", "-b", "feature/test"], cwd);

    // Update package.json WITHOUT updating lockfile
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "test-lockfile",
          dependencies: {
            lodash: "^4.17.21",
            express: "^4.18.0",
          },
        },
        null,
        2
      )
    );

    await git(["add", "."], cwd);
    await git(["commit", "-m", "Add dependency without lockfile"], cwd);

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
 * Create a monorepo with workspaces.
 */
export async function createRepoWithMonorepo(): Promise<TestRepo> {
  return createTestRepo({
    packageJson: {
      name: "test-monorepo",
      private: true,
      workspaces: ["packages/*"],
    },
    files: {
      "turbo.json": `{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"]
    }
  }
}`,
      "pnpm-workspace.yaml": `packages:
  - 'packages/*'
  - 'apps/*'`,
      "packages/core/package.json": JSON.stringify({
        name: "@monorepo/core",
        version: "1.0.0",
        main: "./dist/index.js",
      }),
      "packages/core/src/index.ts": `export const VERSION = '1.0.0';
export function greet(name: string) {
  return \`Hello, \${name}!\`;
}`,
      "packages/utils/package.json": JSON.stringify({
        name: "@monorepo/utils",
        version: "1.0.0",
        dependencies: {
          "@monorepo/core": "workspace:*",
        },
      }),
      "packages/utils/src/index.ts": `import { greet } from '@monorepo/core';
export function welcome(name: string) {
  return greet(name) + ' Welcome!';
}`,
      "apps/web/package.json": JSON.stringify({
        name: "@monorepo/web",
        dependencies: {
          "@monorepo/core": "workspace:*",
          "@monorepo/utils": "workspace:*",
        },
      }),
    },
  });
}

/**
 * Create a repository with package.json exports changes.
 */
export async function createRepoWithPackageExports(): Promise<TestRepo> {
  const cwd = await mkdtemp(join(tmpdir(), "e2e-exports-"));

  try {
    await initRepo(cwd);

    // Base package.json with exports
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "@my-lib/core",
          version: "1.0.0",
          exports: {
            ".": "./dist/index.js",
            "./utils": "./dist/utils.js",
            "./helpers": "./dist/helpers.js",
            "./internal": "./dist/internal.js",
          },
          bin: {
            "my-cli": "./bin/cli.js",
            "my-tool": "./bin/tool.js",
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

    // Remove some exports (breaking changes)
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "@my-lib/core",
          version: "2.0.0",
          exports: {
            ".": "./dist/index.js",
            "./utils": "./dist/utils.js",
            "./new-feature": "./dist/new-feature.js",
          },
          bin: {
            "my-cli": "./bin/cli.js",
          },
        },
        null,
        2
      )
    );

    await git(["add", "."], cwd);
    await git(["commit", "-m", "Update exports (breaking)"], cwd);

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
