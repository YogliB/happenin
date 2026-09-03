# PR: Dashboard session tree

- Branch: `feat/dashboard-session-tree`
- Pull request: https://github.com/YogliB/happenin/pull/7
- Title: `feat(dashboard): render parent session with nested subagent rows`
- Status: open

## What changed

- `src/shared/types.ts` — `Session` gains `subagentId?`, `subagentType?`, `children?: Session[]`.
- `src/shared/db.ts` — shared `toSession()` mapper, `getSubagentsBySession()`, and child attachment in `getFilteredSessions()`.
- `src/UI/dashboard/components/SessionsTable.ts` — expandable parent/child tree UI.
- `src/UI/dashboard/styles.ts` — tree CSS.
- `test/dashboard.test.ts` and `test/db.test.ts` — nested session coverage.

## Checklist

- [x] typecheck
- [x] build
- [x] lint:ci
- [x] format:ci
- [x] duplicates:ci
- [x] knip:ci
- [x] test:ci — 204 passed, 100% coverage
