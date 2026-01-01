# Copilot Instructions for branch-narrator

## Project Overview

branch-narrator is a local-first CLI tool that reads `git diff` and generates structured PR descriptions (Markdown) and machine-readable facts (JSON). It uses heuristics-only analysis (no LLM calls, no network calls) and is fully deterministic.

## Technology Stack

- **Language**: TypeScript (ES2022)
- **Runtime**: Node.js >= 18
- **Package Manager**: bun (also supports npm)
- **Test Framework**: Vitest
- **Build Tool**: tsup
- **CLI Framework**: commander

## Project Structure

```
src/
├── cli.ts                    # CLI entry point
├── index.ts                  # Library exports
├── core/                     # Core types and utilities
│   ├── types.ts              # All TypeScript type definitions
│   ├── change-set.ts         # ChangeSet builder
│   ├── errors.ts             # Custom error classes
│   └── filters.ts            # File exclusion patterns
├── git/                      # Git operations
│   ├── collector.ts          # Git data collection
│   └── parser.ts             # Diff parsing
├── analyzers/                # Heuristic analyzers
│   ├── file-summary.ts       # File change summary
│   ├── route-detector.ts     # SvelteKit routes
│   ├── supabase.ts           # Migration analysis
│   ├── env-var.ts            # Environment variables
│   ├── cloudflare.ts         # Cloudflare detection
│   ├── vitest.ts             # Test file detection
│   ├── dependencies.ts       # Package.json analysis
│   └── security-files.ts     # Security file detection
├── profiles/                 # Profile configurations
│   ├── sveltekit.ts          # SvelteKit profile
│   └── default.ts            # Default profile
└── render/                   # Output renderers
    ├── markdown.ts           # Markdown PR body
    ├── json.ts               # JSON facts
    ├── terminal.ts           # Colorized terminal
    └── risk-score.ts         # Risk computation

docs/                         # Documentation
├── 01-product/               # Overview and roadmap
├── 02-architecture/          # System design and structure
├── 03-analyzers/             # Analyzer-specific docs
├── 04-types/                 # TypeScript types reference
├── 05-cli/                   # CLI commands and options
├── 06-development/           # Coding standards and testing
├── 07-profiles/              # Profile documentation
└── 08-rendering/             # Output formats and risk scoring
```

## Development Commands

```bash
# Install dependencies
bun install

# Run tests
bun test

# Run tests in watch mode
bun run test:watch

# Build the project
bun run build

# Type check
bun run typecheck

# Development mode (watch and rebuild)
bun run dev
```

## Coding Conventions

### TypeScript

- Use **strict mode** with all strict TypeScript compiler options enabled
- Prefer **explicit types** for function parameters and return values
- Use **discriminated unions** for Finding types (see `core/types.ts`)
- All types are defined in `core/types.ts` - do not duplicate type definitions
- Use `.js` extensions in imports (not `.ts`) for ESM compatibility

### Code Style

- Use **JSDoc comments** at the file level to describe module purpose
- Add JSDoc comments for public functions and complex logic
- Use **named exports** (avoid default exports)
- Prefer **pure functions** when possible, especially in analyzers
- Use descriptive variable names (no single-letter variables except in loops)
- Separate concerns: one analyzer per file, one responsibility per function

### File Organization

- Group related functions with comment headers using `// ============`
- Order imports: Node.js built-ins → external packages → internal modules
- Export everything through `index.ts` barrel files in each directory
- Keep files focused: analyzers should be self-contained

### Error Handling

- Use custom error classes from `core/errors.ts`
- All errors extend `BranchNarratorError` with an `exitCode` property
- Error messages should be user-friendly and actionable
- Include context in error messages (e.g., file paths, git refs)

### Testing

- Test files use `.test.ts` suffix in the `tests/` directory
- Use Vitest's `describe`, `it`, and `expect` API
- Test fixtures are in `tests/fixtures/index.ts`
- Write focused unit tests for analyzers and pure functions
- Test both success and error cases
- Use descriptive test names that explain the expected behavior

### Analyzers

- Each analyzer implements the `Analyzer` interface
- Analyzers are pure functions: `(changeSet: ChangeSet) => Finding[]`
- Analyzers should be deterministic and stateless
- Return an empty array if no findings (don't return null/undefined)
- Use appropriate Finding types from the discriminated union
- Include evidence in findings (file paths, reasons, etc.)

### Git Operations

- Use `execa` for running git commands
- Always handle git errors with custom error classes
- Use `--no-pager` flag for git commands to avoid interactive mode
- Parse git output carefully (consider edge cases like renamed files)
- Test git operations with realistic fixtures

### Rendering

- Markdown renderer uses **GitHub-flavored Markdown**
- JSON renderer outputs structured facts for programmatic use
- Terminal renderer uses `chalk` for colors and `cli-table3` for tables
- Risk scores use emoji indicators: 🔴 HIGH, 🟡 MEDIUM, 🟢 LOW
- Keep output concise and actionable

## Profile System

- Profiles determine which analyzers run
- `auto` profile detects project type automatically
- `sveltekit` profile is optimized for SvelteKit projects
- Profiles are resolved in `profiles/index.ts`
- Add new profiles by creating a new file in `profiles/`

## SvelteKit-Specific Features

- Route detection recognizes SvelteKit file conventions
- `+page.svelte`, `+layout.svelte`, `+server.ts`, `+error.svelte`
- Route groups: `(app)`, `(auth)` are removed from URL paths
- Dynamic params: `[slug]`, `[[id]]`, `[...rest]` preserved
- HTTP methods detected from endpoint exports (GET, POST, etc.)

## Common Patterns

### Creating a New Analyzer

1. Create a new file in `src/analyzers/`
2. Import types from `core/types.ts`
3. Implement the `Analyzer` function signature
4. Add tests in `tests/`
5. Export from `src/analyzers/index.ts`
6. Add to appropriate profile in `src/profiles/`

### Adding a New Finding Type

1. Define the interface in `core/types.ts`
2. Add it to the `Finding` discriminated union
3. Update renderers in `render/` to handle the new type
4. Add risk scoring logic if needed in `risk-score.ts`

### Working with Git Diffs

1. Use `collectChangeSet()` to get structured diff data
2. Parse individual file diffs with `parseGitDiff()`
3. Access hunks for line-by-line analysis
4. Use `ChangeSet` for high-level file status information

## Best Practices

- **No side effects** in analyzers - they should be pure functions
- **Validate inputs** - check for null/undefined, empty arrays, etc.
- **Handle edge cases** - empty diffs, missing files, invalid git refs
- **Write tests first** for new analyzers or complex logic
- **Keep dependencies minimal** - avoid adding unnecessary packages
- **Document non-obvious logic** with comments
- **Use TypeScript's type system** to catch errors at compile time
- **Follow existing patterns** when adding new features
- **Test with real git repositories** when possible

## Dependencies

### Production

- `execa` - Running git commands
- `parse-diff` - Parsing git diff output
- `commander` - CLI framework
- `chalk` - Terminal colors
- `boxen` - Terminal boxes
- `cli-table3` - Terminal tables
- `ora` - Spinners
- `semver` - Version comparison
- `picomatch` - Glob matching

### Development

- `typescript` - Type checking
- `tsup` - Build tool
- `vitest` - Testing framework
- `@changesets/cli` - Version management

## Common Tasks

### Adding Support for a New Framework

1. Create a new analyzer in `src/analyzers/`
2. Add framework-specific detection logic
3. Create a new profile in `src/profiles/`
4. Update documentation in `docs/`
5. Add examples to README

### Debugging Git Operations

1. Check git command output with `--no-pager`
2. Test with different git refs (branches, tags, commits)
3. Handle renamed files carefully (oldPath vs newPath)
4. Test with uncommitted changes (`-u` flag)

### Improving Risk Scoring

1. Review evidence bullets in `risk-score.ts`
2. Add new risk factors for specific file types
3. Test with realistic changesets
4. Document risk scoring logic

## Architecture Principles

- **Local-first**: No network calls, no external APIs
- **Deterministic**: Same input always produces same output
- **Fast**: Optimize for speed, use streaming where possible
- **Accurate**: Prefer false negatives over false positives
- **Extensible**: Easy to add new analyzers and profiles
- **Testable**: Pure functions, dependency injection

## Security Considerations

- Never execute arbitrary code from git diffs
- Sanitize file paths before using in git commands
- Don't expose sensitive data in error messages
- Validate all user inputs (refs, file paths, options)

## Documentation

The `docs/` directory contains comprehensive documentation organized by topic. When making changes to the codebase, update the corresponding documentation:

### Documentation Structure

- `docs/01-product/` - Project overview, vision, and roadmap
- `docs/02-architecture/` - System design, data flow, project structure
- `docs/03-analyzers/` - Individual analyzer documentation
- `docs/04-types/` - TypeScript types and schemas
- `docs/05-cli/` - Command-line interface reference
- `docs/06-development/` - Contributing, testing, coding standards
- `docs/07-profiles/` - Framework profiles and detection
- `docs/08-rendering/` - Output generation and risk scoring

### Documentation Guidelines

- **New analyzers**: Create a corresponding doc in `docs/03-analyzers/` explaining what it detects and why
- **New CLI commands**: Update `docs/05-cli/commands.md` with syntax and examples
- **New Finding types**: Document in `docs/04-types/findings.md` with interface and examples
- **New profiles**: Add profile documentation in `docs/07-profiles/`
- **Architecture changes**: Update `docs/02-architecture/` when modifying core structure
- **Breaking changes**: Update README.md and relevant docs immediately
- **Code examples**: Add to `docs/05-cli/examples.md` for common use cases

### When to Update Documentation

- Adding a new analyzer → Update `docs/03-analyzers/`
- Adding a new CLI option → Update `docs/05-cli/options.md`
- Modifying risk scoring → Update `docs/08-rendering/risk-scoring.md`
- Changing file structure → Update `docs/02-architecture/project-structure.md`
- Adding a new Finding type → Update `docs/04-types/findings.md`
