# Stencil Profile

The `stencil` profile is designed for StencilJS component libraries and applications. It focuses on detecting API changes in Web Components.

## Detection

The profile is automatically detected if:
- `package.json` includes `@stencil/core` in `dependencies` or `devDependencies`.
- `stencil.config.ts` or `stencil.config.js` exists in the root directory.

## Analyzers

The following analyzers are enabled in this profile:

- **stencil**: AST-based analysis of Stencil components (props, events, methods, slots).
- **file-summary**: General file change statistics.
- **file-category**: Categorization of changed files.
- **dependencies**: Analysis of package.json changes.
- **test-parity**: Checks for corresponding test files.
- **impact**: Analyzes the impact of changes on other files.

## Usage

You can force the usage of this profile with the `--profile` flag:

```bash
branch-narrator facts --profile stencil
```

Or let it be auto-detected:

```bash
branch-narrator facts --profile auto
```
