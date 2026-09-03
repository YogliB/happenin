# Planning: Dashboard session tree

## Approach

Option A: extend the `Session` type and `getFilteredSessions()` with a single extra query, then render nested rows in `SessionsTable.ts`.

## Files

- `src/shared/types.ts` — add `subagentId?`, `subagentType?`, `children?: Session[]` to `Session`.
- `src/shared/db.ts` — add `getSubagentsBySession()`; call it from `getFilteredSessions()`.
- `src/UI/dashboard/components/SessionsTable.ts` — render nested child rows with toggle.
- `src/UI/dashboard/styles.ts` — add `.session-children`, `.session-item.subagent`, and toggle styles.
- `test/db.test.ts` — cover `getSubagentsBySession()`.
- `test/dashboard.test.ts` — cover nested `renderSessionsTable()` output.

## TODOs

- [ ] **types**: add `subagentId?: string | null`, `subagentType?: string | null`, `children?: Session[]` to `Session`.
- [ ] **db query**: add `getSubagentsBySession(db, parentSessionIds, now)` that returns a `Session` for each distinct `(session_id, subagent_id)` pair with `subagent_id IS NOT NULL`.
- [ ] **db attach**: in `getFilteredSessions()`, call `getSubagentsBySession()` and attach children to each parent `Session` by `sessionId`.
- [ ] **render parent row**: in `SessionsTable.ts`, add an expand/collapse toggle on parents that have `children`.
- [ ] **render child row**: render each child as an indented `<li>` with its own `hx-get` and `data-subagent` styling.
- [ ] **styles**: add CSS for the nested list, indentation, and subagent row styling.
- [ ] **tests**: add DB and dashboard tests for the new tree behavior.
- [ ] **verify**: run `nub run typecheck`, `nub run test:ci`, `nub run build`, `nub run format:ci`, `nub run lint:ci`, `nub run duplicates:ci`, `nub run knip:ci`.

## Risks

- Child rows should not interfere with the parent `hx-get` detail link. Use a separate expand toggle element.
- 100% coverage is enforced; the new query and render paths need tests.
- The `Session` type changes, but `sessions.ts` CLI only uses `JSON.stringify`, so it stays compatible.
