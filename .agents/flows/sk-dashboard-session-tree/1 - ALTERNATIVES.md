# Alternatives: Dashboard session tree

## Option A: Add subagent children directly into `Session` via a new `getSubagentsBySession` query

- Add `children?: Session[]` to the `Session` type, where each child has `subagentId` set.
- Add `getSubagentsBySession(db, parentSessionIds)` that aggregates by `subagent_id` for the given parent `session_id`s in one SQL query.
- Modify `getFilteredSessions()` to attach children to each parent.
- Render nested `<li>` elements in `SessionsTable.ts` under each parent row.

**Pros:** Clean data model, one extra query for the whole page, easy to render.
**Cons:** Slightly changes `Session` type; child rows reuse `Session` shape but some fields are null.

## Option B: Render tree in the detail panel instead of the sidebar

- Keep the flat sessions list; when a session is selected, the existing detail panel already groups events by `subagentId`.
- Add a "Subagents" summary at the top of `DetailPanel.ts` that lists the subagent ids/types as a mini-tree.

**Pros:** No changes to `getSessions` or the sidebar; minimal.
**Cons:** Doesn't match the mockup, which shows the tree in the session list.

## Option C: Fetch subagents client-side with HTMX

- Keep the sessions list flat.
- Add an expand button on each session row that fetches `/fragments/session-children?session=<id>` and renders the child rows via HTMX.

**Pros:** Lazy loading, server data stays simple.
**Cons:** More routes and client logic; over-engineered for a static list.

## Decision

Choose **Option A**. It matches the mockup, keeps the server-side rendering pattern already used, and can reuse the existing `Session` type with one additional optional `children` field and a single extra SQL query.
