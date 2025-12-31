# Architecture Overview

## System Design

```mermaid
flowchart TB
    subgraph CLI["CLI Layer"]
        pr-body["pr-body command"]
        facts["facts command"]
    end

    subgraph Core["Core Engine"]
        collector["Git Collector"]
        changeset["ChangeSet"]
        resolver["Profile Resolver"]
    end

    subgraph Analyzers["Analyzer Layer"]
        A1["file-summary"]
        A2["file-category"]
        A3["route-detector"]
        A4["supabase"]
        A5["env-var"]
        A6["cloudflare"]
        A7["vitest"]
        A8["dependencies"]
        A9["security-files"]
    end

    subgraph Render["Render Layer"]
        risk["Risk Score"]
        md["Markdown"]
        json["JSON"]
    end

    CLI --> collector
    collector --> changeset
    changeset --> resolver
    resolver --> Analyzers
    Analyzers --> risk
    risk --> md
    risk --> json
```

## Data Flow

```mermaid
sequenceDiagram
    participant User
    participant CLI
    participant Git
    participant Profile
    participant Analyzers
    participant Renderer

    User->>CLI: branch-narrator pr-body
    CLI->>Git: collectChangeSet(base, head)
    Git->>Git: git diff --name-status
    Git->>Git: git diff --unified=0
    Git->>Git: git show (package.json)
    Git-->>CLI: ChangeSet
    CLI->>Profile: resolveProfile(auto)
    Profile-->>CLI: Profile with Analyzer[]
    CLI->>Analyzers: analyze(changeSet)
    Analyzers-->>CLI: Finding[]
    CLI->>Renderer: render(findings)
    Renderer-->>CLI: Markdown/JSON
    CLI-->>User: stdout
```

## Design Principles

### 1. Heuristics-Only

No AI/LLM means:
- **Deterministic** - Same input always produces same output
- **Fast** - No network latency
- **Private** - Code never leaves the machine
- **Reliable** - No API dependencies

### 2. Profile-Based Architecture

Different frameworks need different analysis:
- SvelteKit has routes in `src/routes/`
- Next.js has routes in `pages/` or `app/`
- Each profile includes relevant analyzers

### 3. Evidence-Based Output

Never invent "why":
- Report what changed, not why
- Cite files as evidence
- Let humans provide context via `--interactive`

### 4. Extensible

Easy to add:
- New analyzers (one file each)
- New profiles (compose analyzers)
- New output formats (renderers)

