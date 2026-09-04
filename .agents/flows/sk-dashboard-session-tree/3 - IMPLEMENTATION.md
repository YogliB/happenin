# Implementation: Dashboard session tree

## What changed

### Data model

- `src/shared/types.ts` — added `subagentId?`, `subagentType?`, and `children?: Session[]` to the `Session` type.
- `src/shared/db.ts` — added a shared `toSession()` mapper and `SessionAggregateRow` type, then a new `getSubagentsBySession()` query that aggregates one `Session` row per distinct `(session_id, subagent_id)`. `getFilteredSessions()` now attaches the subagent rows as `children` on each parent session.

### UI

- `src/UI/dashboard/components/SessionsTable.ts` — parent rows with `children` render a `▸` toggle button and a nested `<ul class="session-children">` of subagent rows. Child rows display `subagentId`, `subagentType` badge, and link to the parent session detail.
- `src/UI/dashboard/styles.ts` — added `.session-parent`, `.session-toggle`, `.session-children`, `.session-subagent`, and `.subagent-type-badge` rules for indentation and expand/collapse.

### Tests

- `test/db.test.ts` — added `groups subagents by parent session` covering `getSubagentsBySession()` and the `happened_at` fallback branches.
- `test/dashboard.test.ts` — added `renders session tree with subagents` covering child rows, active state, toggle, and the null-subagent branches.

## Verification

- `nub run typecheck` ✅
- `nub run build` ✅
- `nub run test:ci` ✅ (100% coverage)
- `nub run lint:ci` ✅
- `nub run format:ci` ✅
- `nub run duplicates:ci` ✅
- `nub run knip:ci` ✅
