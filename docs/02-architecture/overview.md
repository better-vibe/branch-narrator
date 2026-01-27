# Architecture Overview

## System Design

```mermaid
flowchart TB
    subgraph cliLayer [CLI Layer]
        pretty["pretty command"]
        prBody["pr-body command"]
        facts["facts command"]
        riskReport["risk-report command"]
        dumpDiff["dump-diff command"]
        zoom["zoom command"]
        integrate["integrate command"]
        snap["snap command"]
        cacheCmd["cache command"]
    end

    subgraph coreEngine [Core Engine]
        collector["Git Collector"]
        cacheLayer["Cache Layer"]
        changeset["ChangeSet"]
        resolver["Profile Resolver"]
        runner["Analyzer Runner"]
    end

    subgraph analyzers [Analyzer Layer]
        fileSummary["file-summary"]
        fileCategory["file-category"]
        impact["impact"]
        routes["route analyzers"]
        deps["dependency analyzers"]
        infra["infra/security analyzers"]
        tests["test analyzers"]
    end

    subgraph renderLayer [Render Layer]
        riskScore["Risk Score (facts)"]
        markdown["Markdown PR body"]
        terminal["Terminal summary"]
        factsJson["Facts JSON"]
        sarif["SARIF output"]
        riskReportRender["Risk Report (JSON/MD/TXT)"]
    end

    CLI --> collector
    CLI --> cacheLayer
    collector --> changeset
    changeset --> resolver
    resolver --> runner
    runner --> analyzers
    analyzers --> riskScore
    riskScore --> markdown
    riskScore --> terminal
    riskScore --> factsJson
    factsJson --> sarif
    analyzers --> riskReportRender
```

## Data Flow

```mermaid
sequenceDiagram
    participant User
    participant CLI
    participant Cache
    participant Git
    participant Profile
    participant Analyzers
    participant Renderer

    User->>CLI: branch-narrator facts
    CLI->>Cache: loadChangeSetCache()
    Cache-->>CLI: cached ChangeSet? (optional)
    CLI->>Git: collectChangeSet(base, head)
    Git->>Git: git diff --name-status
    Git->>Git: git diff --unified=0
    Git->>Git: git show (package.json)
    Git-->>CLI: ChangeSet
    CLI->>Profile: resolveProfile(auto)
    Profile-->>CLI: Profile with Analyzer[]
    CLI->>Analyzers: analyze(changeSet)
    Analyzers-->>CLI: Finding[]
    CLI->>Renderer: renderMarkdown / renderFacts / renderRiskReport
    Renderer-->>CLI: Markdown/JSON/SARIF/Text
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

### 5. Deterministic and Cached

- Stable IDs allow reproducible references across runs
- Caching reduces repeated git parsing and analysis work

