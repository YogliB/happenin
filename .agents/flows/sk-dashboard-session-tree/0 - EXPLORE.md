# Explore: Dashboard session tree

## Goal

Render a parent/child session tree in the dashboard's "Recent Sessions" list. A parent session row should be expandable/collapsible and show its subagent (subsession) rows indented below it, like the provided mockup:

- `SESS-28490` (parent)
  - `SESS-28490-A (Child)`
  - `SESS-28490-B (Sequential)`

## Current code

- `src/shared/db.ts`
  - `getFilteredSessions()` returns flat `Session[]` grouped by `session_id`.
  - Subagent metadata is already stored: `subagent_id`, `subagent_type`, `transcript_path` columns, and a `subagent_id` index.
  - `backfillSubagentMetadata()` already links non-`subagentStart` events to a `subagent_id` via `tool_use_id`.
  - `getEvents()` supports `sessionId` and `sessionIdExact` filters.
- `src/shared/types.ts`
  - `Session` has no `children` or `subagentId` fields. A `Subagent` type was recently removed.
- `src/UI/dashboard/components/SessionsTable.ts`
  - Renders a flat `<ul class="session-list sessions-table">`.
  - Each `<li>` has an `hx-get` that loads `fragments/detail?session=<id>` into `#dashboard-content`.
- `src/UI/dashboard/components/DetailPanel.ts`
  - Already groups events by `subagentId` inside the session detail view.
  - Shows `subagent:<type>` and `transcript:<basename>` labels.
- `src/UI/dashboard/fragments.ts`
  - `renderSessionsContent()` calls `getFilteredSessions()` and passes the list to `renderSessionsTable()`.
- `test/dashboard.test.ts` and `test/db.test.ts`
  - 100% coverage is enforced; tests for `Session` tree and `getSubagentsBySession` need updating.

## Data model

- A Cursor `subagentStart` event records:
  - `session_id` = parent conversation id
  - `subagent_id` = subagent conversation id
  - `subagent_type` = e.g. `shell`
  - `transcript_path`
- Other subagent events share the same `session_id` and have `subagent_id` set via `tool_use_id` backfill.

## Key question

How do we represent and query subagents so the session table can nest them under the parent without duplicating the parent session or breaking the existing detail navigation?
