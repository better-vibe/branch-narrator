---
"branch-narrator": patch
---

Improve highlights system with priority-based ordering and lockfile mismatch coverage

- Add lockfile mismatch highlights when package.json or lockfile changes independently
- Implement impact-first priority ordering for highlights (blast radius > breaking changes > risk/security > general changes > tests)
- Highlights now show both high and medium blast radius findings (previously only showed one)
- Ordering is deterministic and stable across runs
