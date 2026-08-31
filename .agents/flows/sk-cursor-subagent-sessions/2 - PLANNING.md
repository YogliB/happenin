**Shape:** One repo, one PR.

## Goal

Capture and expose Cursor subagent metadata (`subagent_id`, `subagent_type`, `transcript_path`) from `subagentStart` hook events so happenin can distinguish a main Cursor session from a subagent run inside that session, and backfill the same metadata for existing `subagentStart` events.

## Files

`src/types.ts`
`src/db.ts`
`src/record.ts`
`src/dashboard.ts`
`test/happenin.test.ts`

## Context

- `src/types.ts` currently defines `EventInsert` with only basic event fields and `EventRow` as the same plus `id` and `receivedAt`. New subagent fields will be added as optional (`subagentId?: string`, etc.), so existing `EventRow` test object literals do not need updates unless a test specifically asserts those fields.

  ```ts
  export type EventInsert = {
  	source: Source;
  	client?: string;
  	event?: string;
  	sessionId?: string;
  	happenedAt?: string;
  	projectPath?: string;
  	filePath?: string;
  	toolName?: string;
  	payload: string;
  	sourcePath?: string;
  };

  export type EventRow = EventInsert & {
  	id: number;
  	receivedAt: number;
  };
  ```

- `src/db.ts` schema for `events` (lines 9-22) has no subagent columns:

  ```ts
  const eventsColumns = `
  	id INTEGER PRIMARY KEY AUTOINCREMENT,
  	source TEXT NOT NULL,
  	client TEXT,
  	event TEXT,
  	session_id TEXT,
  	happened_at TEXT,
  	received_at INTEGER NOT NULL,
  	project_path TEXT,
  	file_path TEXT,
  	tool_name TEXT,
  	payload TEXT NOT NULL,
  	source_path TEXT
  `;
  ```

- `src/db.ts` `insertEventSql` (lines 33-47) and `selectEventSql` (lines 49-64) must be updated to include the new columns.

- `src/record.ts` (lines 54-79) extracts `sessionId` from `payload.sessionId` / `payload.session_id`. It currently stores the raw `payload` string but does not extract subagent fields.

- `src/dashboard.ts` `renderEventRow` (lines 70-84) renders `session`, `tool`, and `file` meta. It has no subagent/transcript output.

- `src/dashboard.ts` `eventView` (lines 53-68) returns the row as an object but does not include subagent fields. It must be extended to return `subagentId`, `subagentType`, and `transcriptPath` so the detail panel shows them.

- Data gathered from `~/.happenin/happenin.db`:
  - `subagentStart` payload keys include `subagent_id`, `subagent_type`, `transcript_path`, `parent_conversation_id`, `conversation_id`, `is_background_agent`, `is_parallel_worker`.
  - `conversation_id` and `parent_conversation_id` are the same, and both equal the main `session_id`.
  - `transcript_path` points to `~/.cursor/projects/<project-id>/agent-transcripts/<conversation-id>/<conversation-id>.jsonl`.
  - No `subagentStop` events are recorded.
  - Existing `subagentStart` rows already store the full payload, so the new columns can be backfilled with `json_extract`.

## Scope

- **In Scope:**
  - Add `subagentId`, `transcriptPath`, and `subagentType` to `EventInsert`, `EventRow`, the DB schema, and the event insertion/selection SQL.
  - Migrate existing databases with `ALTER TABLE ADD COLUMN` and backfill existing `subagentStart` rows using `json_extract(payload, '$....')`.
  - Update `record.ts` to extract the three subagent fields from `subagentStart` payloads.
  - Update `dashboard.ts` to render `subagentType` and a `transcript` reference in `renderEventRow` and in the event detail view.
  - Add tests for record extraction, DB migration/backfill, and dashboard rendering.
  - Run the standard verification suite (`nub run build`, `typecheck`, `test`, `lint`, `format`, `duplicates`, `knip`).

- **Out of Scope:**
  - Importing the subagent transcript file itself (the JSONL under `agent-transcripts/`). Deferred to a follow-up.
  - A separate `session_kind` table or parent/child session grouping beyond rendering subagent metadata.
  - Handling `is_background_agent` or `is_parallel_worker` as first-class columns (they are still in raw payload).
  - Manual session tagging (Option 3 from alternatives).

## Risks

- **Schema migration on existing DB fails:** `ALTER TABLE ADD COLUMN` is not idempotent. Mitigation: wrap each statement in `try/catch` and ignore "duplicate column" errors.
- **Backfill misses rows or is slow:** `UPDATE ... WHERE source = 'cursor' AND event = 'subagentStart' AND subagent_id IS NULL` is bounded and idempotent. Only runs until all rows are filled, then is a no-op.
- **Cursor payload field names change:** The keys `subagent_id`, `subagent_type`, `transcript_path` are from observed payloads in Cursor 3.17.21. Mitigation: continue to store raw `payload`; the extraction is additive, so future shape changes just mean the new columns stay null and the raw data is still available.
- **Dashboard UI becomes noisy:** Rendering a long `transcript_path` in the row could overflow. Mitigation: render only `subagentType` in the row; show `transcriptPath` in the detail panel and/or truncate the path.

## Dependencies

- SQLite JSON1 support for the backfill `UPDATE` with `json_extract`. `node:sqlite` in Node 22+ includes JSON1.
- No new npm dependencies.

## Priority

High.

## Logging / Observability

- None beyond existing console output in `dashboard.ts`.

## Branch setup

- [ ] `git checkout main` and `git pull`
- [ ] `git checkout -b feature/cursor-subagent-metadata`

## Implementation Plan (TODOs)

- [ ] **Step 1: Extend types**
  - [ ] Add `subagentId?: string`, `subagentType?: string`, and `transcriptPath?: string` to `EventInsert` and `EventRow` in `src/types.ts`.

- [ ] **Step 2: Extend DB schema and migration**
  - [ ] Add `subagent_id TEXT`, `subagent_type TEXT`, and `transcript_path TEXT` to `eventsColumns` in `src/db.ts`.
  - [ ] Add the three columns to `insertEventSql` in `src/db.ts`. The binding order at the end of `insertEvent` becomes: `source, client, event, sessionId, happenedAt, receivedAt, projectPath, filePath, toolName, payload, sourcePath, subagentId, subagentType, transcriptPath`.
  - [ ] Add the three columns to `selectEventSql` in `src/db.ts` with camelCase aliases: `subagent_id AS subagentId, subagent_type AS subagentType, transcript_path AS transcriptPath`.
  - [ ] Add an `initDb` migration block immediately after the `CREATE TABLE IF NOT EXISTS events` statement and before creating indexes: query `PRAGMA table_info(events)` to get existing column names, then run `ALTER TABLE events ADD COLUMN <col> TEXT` only for `subagent_id`, `subagent_type`, and `transcript_path` that are missing.
  - [ ] Add an `initDb` backfill block immediately after the migration block, guarded by `PRAGMA user_version`: if `user_version` is 0, run `UPDATE events SET subagent_id = json_extract(payload, '$.subagent_id'), subagent_type = json_extract(payload, '$.subagent_type'), transcript_path = json_extract(payload, '$.transcript_path') WHERE source = 'cursor' AND event = 'subagentStart' AND (subagent_id IS NULL OR subagent_type IS NULL OR transcript_path IS NULL)`, then set `PRAGMA user_version = 1`.

- [ ] **Step 3: Extract subagent fields at record time**
  - [ ] In `src/record.ts`, after the existing field extractions, add:
    ```ts
    const subagentId = asString(payload.subagent_id);
    const subagentType = asString(payload.subagent_type);
    const transcriptPath = asString(payload.transcript_path);
    ```
  - [ ] Add the three fields to the `insert` object.

- [ ] **Step 4: Expose subagent metadata in the dashboard** (depends on Step 1)
  - [ ] Add `import path from "node:path";` to `src/dashboard.ts`.
  - [ ] In `src/dashboard.ts` `renderEventRow`, if `subagentType` is present, append `subagent:<subagentType>` to the `meta` array.
  - [ ] If `transcriptPath` is present, append a `transcript:<basename>` indicator to the row, matching the existing `key:value` meta format (`session:...`, `tool:...`, `file:...`). If the basename is longer than 30 characters, display the first 29 characters followed by `…` (for a maximum display length of 30 characters) after the `transcript:` prefix; otherwise display the full basename. The detail panel shows the full `transcriptPath` string.
  - [ ] In `src/dashboard.ts` `eventView`, add `subagentId`, `subagentType`, and `transcriptPath` as top-level string properties to the returned object. The existing detail panel renders the full object via `<pre x-text="JSON.stringify(detail, null, 2)"></pre>`, so the new fields appear there automatically.

- [ ] **Step 5: Tests** (depends on Steps 1–4)
  - [ ] In `test/happenin.test.ts` `record` suite, add a `subagentStart` payload and assert the row has `subagentId`, `subagentType`, and `transcriptPath`.
  - [ ] In `test/happenin.test.ts` `db` suite, create a temp file on disk, open it with `DatabaseSync`, create an `events` table using the pre-migration schema, close it, call `initDb(<path>)`, and assert the `subagent_id`, `subagent_type`, and `transcript_path` columns exist via `PRAGMA table_info(events)`.
  - [ ] In `test/happenin.test.ts` `db` suite, create a temp DB file with the pre-migration `events` schema, insert an old-style `subagentStart` row with the full payload, call `initDb(<path>)` to migrate and backfill, then assert the new columns are populated.
  - [ ] In `test/happenin.test.ts` `dashboard` suite, assert `renderEventRow` includes `subagent:shell` and a transcript reference when the fields are set.

- [ ] **Step 6: Verification**
  - [ ] Run `nub run build`.
  - [ ] Run `nub run typecheck`.
  - [ ] Run `nub run test:ci`.
  - [ ] Run `nub run lint:ci`.
  - [ ] Run `nub run format:ci`.
  - [ ] Run `nub run duplicates:ci`.
  - [ ] Run `nub run knip:ci`.

## Delivery

- [ ] Stage and commit changes with a Conventional Commit message.
- [ ] Push the `feature/cursor-subagent-metadata` branch only when requested.

## Docs

- [ ] Update `assets/help.md` only if a new CLI flag or command is added (none planned for this PR).

## Testing

- [ ] Unit tests in `test/happenin.test.ts` cover record extraction, DB backfill, and dashboard rendering.
- [ ] Manual check: run `happenin dashboard`, trigger or observe a Cursor `subagentStart` event, and confirm the row shows `subagent:shell` and a transcript reference.

## Verification

- [ ] `nub run build` passes.
- [ ] `nub run typecheck` passes.
- [ ] `nub run test:ci` passes.
- [ ] `nub run lint:ci` passes.
- [ ] `nub run format:ci` passes.
- [ ] `nub run duplicates:ci` passes.
- [ ] `nub run knip:ci` passes.

## Acceptance

- [ ] `subagentStart` events captured after this change have `subagentId`, `subagentType`, and `transcriptPath` populated.
- [ ] Existing `subagentStart` events in `~/.happenin/happenin.db` are backfilled with the same three fields.
- [ ] The dashboard renders the subagent type and a transcript reference for rows that have the metadata.
- [ ] All standard verification commands pass.

## Fallback Plan

- If `json_extract` backfill fails due to JSON1 not being available, replace it with a Node-based backfill script in `import.ts` and require `happenin import` to backfill.
- If Cursor payloads do not contain the expected keys on a future version, the raw `payload` is still stored and the new columns are null. No data is lost.

## References

- `1 - ALTERNATIVES.md` in the same flow folder.

## Complexity Check

- Implementation TODO count: 11
- Total checklist items: ~28
- Depth: 2
- Cross-deps: 0
- **Decision:** Proceed
