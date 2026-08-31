# 0 - EXPLORE: Distinguish Cursor main sessions from subagent sessions in happenin

## Goal

Understand how to tell whether a Cursor session is a main (parent) session or a subagent (child) session, and whether happenin already captures the data needed to do so.

## Files and Context

- `src/record.ts` — Hook target. Parses JSON from `stdin` and stores one row per event. Extracts `sessionId` from `payload.sessionId` or `payload.session_id`; stores the full raw payload in the `payload` column. No parent/child or subagent flag is extracted.

  ```ts
  const sessionId = asString(payload.sessionId ?? payload.session_id);
  const client = asString(payload.client) ?? (source === "cursor" ? "cursor" : "claude_code");
  ```

- `src/constants.ts` — Defines `CURSOR_HOOK_EVENTS` including `subagentStart` and `subagentStop`. These fire inside a session, not on the session itself.

  ```ts
  "subagentStart",
  "subagentStop",
  ```

- `src/import.ts` — Imports Cursor `prompt_history.json` and `meta.json` from `~/.cursor/chats/<hash>/<session>/`. Stores `meta.json` as a `session_meta` event but does not parse it for subagent metadata.

- `src/db.ts` — SQLite `events` table has `session_id TEXT` but no `parent_session_id`, `session_kind`, or `is_subagent` column.

  ```sql
  session_id TEXT,
  ```

- `src/types.ts` — `EventInsert` / `EventRow` only have `sessionId?: string`.
- `src/dashboard.ts` — Groups events by `sessionId` with `groupEventsBySession()` and renders foldable `<details>` cards. No notion of session kind; subagent sessions would render as independent groups.
- `test/happenin.test.ts` — Tests for record, import, dashboard, and session grouping. No subagent/main session tests.

## Findings

1. happenin currently **cannot** distinguish a Cursor main session from a subagent session.
2. The only session-level identifier captured is `sessionId`.
3. `subagentStart`/`subagentStop` events are emitted from within a session, but they do not identify the session itself as the subagent. They also do not identify a separate subagent session ID.
4. Raw payloads are stored, so if Cursor sends `parentSessionId`, `isSubagent`, `agentType`, `role`, or similar, that data is already in `happenin.db` but not exposed.
5. The dashboard groups by `sessionId`; a subagent with a distinct `sessionId` would appear as its own top-level group with no link to the parent.
6. The live feed uses SSE to trigger full `/fragments/events` reloads, so any new session-kind filter or grouping would integrate there.

## Assumptions and Open Questions

- What fields, if any, does Cursor include in `subagentStart`/`subagentStop` and `sessionStart` hook payloads to identify parent/child sessions?
- Does Cursor's `meta.json` include `parent_id`, `conversationType`, `isSubagent`, or other session-kind metadata?
- Is the goal to (a) tag sessions, (b) filter/hide subagent sessions, (c) group subagents under their parent, or (d) all three?
- Should this distinction also apply to Claude Code (`SubagentStart`/`SubagentStop` events exist for Claude too)?

## Risks

- Cursor may not expose a stable `parentSessionId` or `isSubagent` field; this may be impossible to do reliably from hooks alone.
- Even if payloads contain hints, the shape may change across Cursor versions.
- Adding session kind to the schema requires a migration or new columns; existing `.happenin.db` files would not have the data unless re-imported/re-recorded.
- Grouping subagents under parents may conflict with current "newest first" ordering and pagination.
- This work touches `record.ts`, `import.ts`, `db.ts`, `types.ts`, and `dashboard.ts`.

## Next Step Recommendation

`sk-alternatives`. The right approach depends on what Cursor actually exposes, and there are several possible strategies (payload-field parsing, transcript meta parsing, heuristic detection, or explicit user tagging).
