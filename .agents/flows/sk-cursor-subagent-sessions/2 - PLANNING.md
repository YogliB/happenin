**Shape:** One repo, one PR.

## Goal

Capture and expose Cursor subagent metadata (`subagent_id`, `subagent_type`, `transcript_path`) from `subagentStart` hook events so happenin can distinguish a main Cursor session from a subagent run inside that session, and backfill the same metadata for existing `subagentStart` events.

## Files

`src/types.ts`
`src/db.ts`
`src/record.ts`
`src/view.ts`
`src/dashboard.ts`
`src/import.ts`
`src/query.ts`
`src/constants.ts`
`test/happenin.test.ts`
`test/record.failopen.test.ts`
`skills/happenin/SKILL.md`

## Context

- `src/types.ts` currently defines `EventInsert` with basic event fields and `EventRow` as `EventInsert & { id; receivedAt }`. Step 1 will add the new subagent fields to `EventInsert` and keep `EventRow` as the intersection, so existing `EventRow` literals in tests continue to compile.

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

- `src/view.ts` `eventView` (lines 12-27) returns the row as an object but does not include subagent fields. It must be extended to return `subagentId`, `subagentType`, and `transcriptPath` so the detail panel and `query` output show them.

- `src/dashboard.ts` `renderEventRow` (lines 47-59) renders `session`, `tool`, and `file` meta. It has no subagent/transcript output.

- Data gathered from `~/.happenin/happenin.db`:
  - `subagentStart` payload keys include `subagent_id`, `subagent_type`, `transcript_path`, `parent_conversation_id`, `conversation_id`, `is_background_agent`, `is_parallel_worker`.
  - In sampled payloads `conversation_id` and `parent_conversation_id` are the same and both equal the main `session_id`. `parent_conversation_id` is preferred as a defensive heuristic in case future Cursor builds distinguish the parent/main conversation from the subagent's own `conversation_id`; `conversation_id` is the backup. If future payloads use different semantics, the `sessionId` fallback can be revised because the full payload is preserved.
  - `transcript_path` points to `~/.cursor/projects/<project-id>/agent-transcripts/<conversation-id>/<conversation-id>.jsonl`.
  - No `subagentStop` events are recorded.
  - Existing `subagentStart` rows already store the full payload, so the new columns can be backfilled with `json_extract`.

## Scope

- **In Scope:**
  - Add `subagentId`, `subagentType`, and `transcriptPath` to `EventInsert`, `EventRow`, the DB schema, and the event insertion/selection SQL.
  - Migrate existing databases with `ALTER TABLE ADD COLUMN` and backfill existing `subagentStart` rows using `json_extract(payload, '$....')`.
  - Update `record.ts` to extract the three subagent fields from `subagentStart` payloads and the main session `conversation_id`/`parent_conversation_id`.
  - Update `dashboard.ts` to render `subagentType` and a `transcript` reference in `renderEventRow`.
  - Add tests for record extraction, DB migration/backfill, and dashboard rendering.

- **Out of Scope:**
  - Importing the subagent transcript file itself (the JSONL under `agent-transcripts/`). Deferred to a follow-up.
  - A separate `session_kind` table or parent/child session grouping beyond rendering subagent metadata.
  - Handling `is_background_agent` or `is_parallel_worker` as first-class columns (they are still in raw payload).
  - Manual session tagging (Option 3 from alternatives).

## Risks

- **Schema migration on existing DB fails or is not atomic:** `ALTER TABLE ADD COLUMN` is not idempotent. Mitigation: query `PRAGMA table_info(events)` inside a `BEGIN IMMEDIATE` transaction, add each missing column, set `PRAGMA user_version = 1` as the final statement in the same transaction, then `COMMIT`. If any step fails, `ROLLBACK` reverts everything.
- **Backfill blocks the hook hot path or times out on a large DB:** `recordFromRaw` calls `initDb` for every incoming hook. Mitigation: `initDb` only adds the new columns and bumps the schema version; the heavy backfill lives in a separate `backfillSubagentMetadata(db)` helper. Call `backfillSubagentMetadata` from `runImport` (it is also invoked by `runDashboard` because `runDashboard` calls `runImport` before starting the server) so existing data is backfilled on the first import or dashboard run, not on the first hook.
- **A hook races a running migration/backfill and the event is dropped:** `recordFromRaw` opens the DB with `busyTimeout = 500` ms, while `query`/`import`/`dashboard` use the default 5000 ms and `backfillSubagentMetadata` uses 30000 ms. If a `record` call arrives while `query`/`import`/`dashboard` holds the write lock for the one-time migration or backfill, the hook may time out with `SQLITE_BUSY`; `recordFromRaw` returns the precomputed response but drops the event so the blocking hook does not fail. After upgrading, run `happenin query`/`import`/`dashboard` once before resuming heavy Cursor/Claude use so the schema migration and backfill complete outside the hook hot path.
- **Backfill runs repeatedly or is slow on the 119MB DB:** `backfillSubagentMetadata` runs the `UPDATE` on `subagentStart` rows where any of the new subagent columns is `NULL`; the second run is a no-op because the `WHERE` clause matches no rows. It uses `json_valid(payload) = 1` and the existing `idx_events_event` index, which is selective for the rare `subagentStart` event. Set `PRAGMA busy_timeout = 30000` before the backfill transaction.
- **Backfill is only triggered by import/dashboard:** `recordFromRaw` does not call `backfillSubagentMetadata`, so users who only run the Cursor/Claude hook and never run `happenin import` or `happenin dashboard` will not have old `subagentStart` rows backfilled. Mitigation: run `happenin import` or `happenin dashboard` once after upgrade to trigger the backfill.
- **Cursor payload field names change:** The keys `subagent_id`, `subagent_type`, `transcript_path` are from observed payloads in Cursor 3.17.21. Mitigation: continue to store raw `payload`; the extraction is additive, so future shape changes just mean the new columns stay null and the raw data is still available.
- **Dashboard UI becomes noisy:** Rendering a long `transcript_path` in the row could overflow. Mitigation: render `subagent:<type>` and `transcript:<basename>` in the row meta (escaped and truncated to 30 visible characters); show the full `transcriptPath` in the detail panel.
- **Non-busy DB errors may fail the Cursor/Claude hook:** `recordFromRaw` only swallows `SQLITE_BUSY`/`SQLITE_LOCKED` errors to keep blocking hooks responsive. `SQLITE_CORRUPT`, disk-full, and other non-transient errors are rethrown, which may cause the hook to fail. Mitigation: monitor logs and run `happenin` with a writable, non-corrupt database.

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
  - [ ] Add `subagentId?: string | null`, `subagentType?: string | null`, and `transcriptPath?: string | null` to `EventInsert` in `src/types.ts`. `EventRow` remains `EventInsert & { id: number; receivedAt: number }` and inherits the new optional fields.

- [ ] **Step 2: Extend DB schema and migration**
  - [ ] Add `subagent_id TEXT`, `subagent_type TEXT`, and `transcript_path TEXT` to `eventsColumns` in `src/db.ts`.
  - [ ] Add the three columns and three `?` placeholders to `insertEventSql` in `src/db.ts`; the binding order ends with `subagentId, subagentType, transcriptPath`.
  - [ ] Update `insertEvent` in `src/db.ts` to bind the three new fields after `sourcePath`, using `event.subagentId ?? null`, `event.subagentType ?? null`, and `event.transcriptPath ?? null` for consistency with the other optional columns.
  - [ ] Add the three columns to `selectEventSql` in `src/db.ts` with camelCase aliases: `subagent_id AS subagentId, subagent_type AS subagentType, transcript_path AS transcriptPath`.
  - [ ] In `initDb`, create the parent directory with `mkdirSync(path.dirname(resolvedPath), { recursive: true })`, then open the DB with `const db = new DatabaseSync(resolvedPath);`. Wrap the rest of the setup in `try { ...; return db; } catch (err) { try { db.close(); } catch {} throw err; }` so a `PRAGMA`, table-creation, migration, or index failure does not leak the connection on the hook hot path and the original error is always rethrown.
  - [ ] Change `initDb` signature to `initDb(dbPath?: string, busyTimeout = 5000): DatabaseSync`. Inside that `try` block, set `PRAGMA busy_timeout = ${busyTimeout}` and `PRAGMA journal_mode = WAL`.
  - [ ] Run `CREATE TABLE IF NOT EXISTS events` and `CREATE TABLE IF NOT EXISTS imports` unconditionally, then call a private `ensureSubagentColumns(db: DatabaseSync): void` helper:
    - [ ] Read `PRAGMA user_version` outside a transaction with `const version = Number((db.prepare("PRAGMA user_version").get() as { user_version: number } | undefined)?.user_version ?? 0);`. If `version >= 1`, return.
    - [ ] `BEGIN IMMEDIATE`, re-read `PRAGMA user_version` the same way, and `ROLLBACK` and `return` if it is now `>= 1`.
    - [ ] `try` the migration body, `ROLLBACK` on error, then rethrow.
    - [ ] Query `PRAGMA table_info(events)` with `db.prepare("PRAGMA table_info(events)").all() as { name: string }[]` and collect the `name` values.
    - [ ] For each of `subagent_id`, `subagent_type`, and `transcript_path`, run `ALTER TABLE events ADD COLUMN <col> TEXT` only if the column is missing.
    - [ ] Set `PRAGMA user_version = 1` as the final statement inside the migration transaction, then `COMMIT`. If any step fails, `ROLLBACK` and rethrow.
  - [ ] Apply the existing `indexes` array outside the migration transaction, after `ensureSubagentColumns` returns. Do not add a new composite index; the existing `idx_events_event` is already selective for the rare `subagentStart` event.

- [ ] **Step 2b: Add a backfill helper**
  - [ ] In `src/db.ts`, add `export const backfillSubagentMetadata = (db: DatabaseSync): void`.
  - [ ] At the top of the helper, set `PRAGMA busy_timeout = 30000`.
  - [ ] Read `PRAGMA user_version` without a transaction. If `version < 1`, throw an error (the schema must be migrated first).
  - [ ] `BEGIN IMMEDIATE`, re-read `PRAGMA user_version`, and `ROLLBACK` and `return` if it is now `< 1`.
  - [ ] `try` the backfill body, `ROLLBACK` on error, then rethrow.
  - [ ] The backfill `UPDATE` normalizes empty strings to `NULL` and, for `subagentStart` rows, sets `session_id` from the parent/main conversation identifiers, falling back to the existing `session_id` only when neither is present. The `WHERE` matches only rows where any of the three subagent columns is `NULL`; once all three are populated on a row, that row is no longer touched. Rows with partial payloads (e.g., one missing JSON key) will be revisited on each backfill call, which is safe because the `UPDATE` is idempotent and the matched set is small.
    ```sql
    UPDATE events
    SET
    	subagent_id = NULLIF(trim(json_extract(payload, '$.subagent_id')), ''),
    	subagent_type = NULLIF(trim(json_extract(payload, '$.subagent_type')), ''),
    	transcript_path = NULLIF(trim(json_extract(payload, '$.transcript_path')), ''),
    	session_id = COALESCE(
    		NULLIF(trim(json_extract(payload, '$.parent_conversation_id')), ''),
    		NULLIF(trim(json_extract(payload, '$.conversation_id')), ''),
    		NULLIF(trim(session_id), '')
    	)
    WHERE
    	source = 'cursor'
    	AND event = 'subagentStart'
    	AND json_valid(payload) = 1
    	AND (
    		subagent_id IS NULL
    		OR subagent_type IS NULL
    		OR transcript_path IS NULL
    	);
    ```
  - [ ] `COMMIT` the backfill.
  - [ ] Update the `initDb` import in `src/import.ts` to also import `backfillSubagentMetadata` from `./db.js`.
  - [ ] In `src/import.ts`, in the `runImport` `try` block, open the DB with `const db = initDb(dbPath);`, then call `backfillSubagentMetadata(db)` before `importTranscripts`, so the one-time backfill runs independently of transcript import success.
  - [ ] Do **not** call `backfillSubagentMetadata` from `src/query.ts`; a read command should not perform a long write. `runQuery` will simply see `null` subagent columns for old events until `runImport` or `runDashboard` has run.
  - [ ] `runDashboard` already calls `runImport` before it initializes the dashboard DB, so no additional call is needed there. Do **not** call it from `src/record.ts`; the hook hot path is intentionally not blocked by the one-time backfill.

- [ ] **Step 3: Extract session and subagent fields at record time**
  - [ ] In `src/record.ts`, after `event` is determined, compute `const shouldExtractSubagent = source === 'cursor' && event === 'subagentStart';`.
  - [ ] Update the `sessionId` extraction. For `subagentStart`, prefer the parent/main conversation identifiers and fall back to the existing session keys only when those are absent; for all other events, use the existing session keys as before:
    ```ts
    const sessionId = shouldExtractSubagent
    	? (asString(payload.parent_conversation_id) ??
    		asString(payload.conversation_id) ??
    		asString(payload.sessionId) ??
    		asString(payload.session_id))
    	: (asString(payload.sessionId) ?? asString(payload.session_id));
    ```
  - [ ] Add the three subagent fields only when `shouldExtractSubagent` is true:
    ```ts
    const subagentId = shouldExtractSubagent ? asString(payload.subagent_id) : undefined;
    const subagentType = shouldExtractSubagent ? asString(payload.subagent_type) : undefined;
    const transcriptPath = shouldExtractSubagent ? asString(payload.transcript_path) : undefined;
    ```
    `asString` already returns `undefined` for empty/whitespace values, so `insertEvent` will store `NULL` for missing subagent fields.
  - [ ] Add the three new subagent fields to the `insert` object.
  - [ ] Compute the response with `DEFAULT_RESPONSES(source as Source, event ?? "")` before touching the database. Then use `let db: ReturnType<typeof initDb> | undefined; try { db = initDb(dbPath, 500); insertEvent(db, insert); } catch (err) { if (isBusyError(err)) { console.warn("happenin: dropping event due to database lock", err); } else { throw err; } } finally { try { db?.close(); } catch {} }` and finally return the pre-computed response. Add a small `isBusyError(err: unknown): boolean` helper:
    ```ts
    function isBusyError(err: unknown): boolean {
    	if (typeof err !== "object" || err === null) return false;
    	const e = err as { code?: string; errcode?: number };
    	const code = e.errcode ?? 0;
    	return e.code === "ERR_SQLITE_ERROR" && ((code & 0xff) === 5 || (code & 0xff) === 6);
    }
    ```
    This ensures Cursor hooks still receive their expected response on a transient lock, while non-transient DB errors are not silently dropped.

- [ ] **Step 4: Expose subagent metadata in the dashboard and query view** (depends on Step 1)
  - [ ] Add `subagentId`, `subagentType`, and `transcriptPath` to the object returned by `src/view.ts` `eventView`; return the raw SQLite values (`string | null` at runtime, `string | null | undefined` in the `EventRow` type).
  - [ ] Update `src/dashboard.ts` `groupEventsBySession` to use `const key = row.sessionId ?? undefined` and use `key` everywhere: `bySession.get(key)`, `order.push(key)`, `bySession.set(key, ...)`, and the returned `sessionId: key`.
  - [ ] Add `import path from "node:path";` to `src/dashboard.ts`.
  - [ ] Add a small `truncate(value: string, limit = 30): string` helper to `src/dashboard.ts` that returns `value` if it is `<= limit` characters, otherwise returns the first `limit - 1` characters plus `…`.
  - [ ] Use `truncate` first, then `escapeHtml`, only for the new `subagent` and `transcript` meta strings in `renderEventRow`, leaving the existing `session`, `tool`, and `file` rendering unchanged to reduce churn. Full values remain available in the detail panel.
  - [ ] In `renderEventRow`, if `subagentType` is present, append `subagent:<truncated-escaped-subagentType>` to the `meta` array.
  - [ ] If `transcriptPath` is present, compute `path.basename(row.transcriptPath)`, truncate and escape it, and append `transcript:<truncated-escaped-basename>` to the `meta` array. The detail panel shows the full `transcriptPath` string.

- [ ] **Step 5: Tests** (depends on Steps 1–4)
  - [ ] Add `import { DatabaseSync } from "node:sqlite";` to `test/happenin.test.ts` for the migration tests.
  - [ ] Update the `../src/db.js` import in `test/happenin.test.ts` to also import `backfillSubagentMetadata`.
  - [ ] In `test/happenin.test.ts` `record` suite, add a `subagentStart` payload that omits `sessionId`/`session_id` and includes `hook_event_name: "subagentStart"`, `parent_conversation_id`, `conversation_id`, `subagent_id`, `subagent_type`, and `transcript_path`. Assert the row has `subagentId`, `subagentType`, `transcriptPath`, that `sessionId` is set from `parent_conversation_id`/`conversation_id`, and that the returned response is `JSON.stringify({ permission: "allow" })`.
  - [ ] In the `record` suite, add a negative test for a non-`subagentStart` Cursor event (e.g., `preToolUse`) with `conversation_id` and `subagent_id` keys. Assert `subagentId`, `subagentType`, and `transcriptPath` are `null` and that `sessionId` does **not** fall back to `conversation_id`.
  - [ ] Add a dedicated `test/record.failopen.test.ts` file. Use `vi.mock("../src/db.js", async (importOriginal) => ({ ...await importOriginal(), initDb: vi.fn(() => { throw Object.assign(new Error("database is locked"), { code: "ERR_SQLITE_ERROR", errcode: 5 }); }) }))` for one test to cover `initDb` busy errors; `await import("../src/record.js")` inside the test to pick up the mocked `initDb`. Add another test where `initDb` succeeds and a mocked `insertEvent` throws a busy `SQLiteError`, and a third test where `insertEvent` throws a non-busy error and `recordFromRaw` rethrows it.
  - [ ] In `test/happenin.test.ts` `db` suite, create a temporary directory on disk and a DB file inside it, open it with `DatabaseSync`, create an `events` table using this inline legacy schema (no subagent columns):
    ```sql
    CREATE TABLE events (
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
    );
    ```
    Add three focused tests using a temporary directory and a raw legacy `events` table (no subagent columns):
    - **Migration test:** Insert the legacy `subagentStart` row, close the legacy connection, call `initDb(<path>)`, and assert `PRAGMA user_version` is `1`, the new columns exist, and `subagent_id`/`subagent_type`/`transcript_path` are still `NULL`.
    - **Backfill test:** On the migrated DB, call `backfillSubagentMetadata(<db>)`, assert `subagent_id`, `subagent_type`, `transcript_path`, and `session_id` are populated.
    - **Idempotence test:** Call `backfillSubagentMetadata(<db>)` again and confirm it is a no-op (no error), then call `initDb(<path>)` again and assert `PRAGMA user_version` stays `1` and no `ALTER TABLE` error is thrown.
      Close all `DatabaseSync` connections and remove the temporary directory (including `-wal`/`-shm` sidecars) with `rmSync(dir, { recursive: true, force: true })` in `finally`.
  - [ ] Add `import { eventView } from "../src/view.js";` to `test/happenin.test.ts`.
  - [ ] Add a `describe("view", ...)` block to `test/happenin.test.ts` and assert `eventView` returns `subagentId`, `subagentType`, and `transcriptPath` as top-level fields for a row that has them.
  - [ ] In `test/happenin.test.ts` `dashboard` suite, assert `renderEventRow` includes `subagent:shell` and a transcript reference when the fields are set.

- [ ] **Step 6: Verification**
  - [ ] Run `nub run build`.
  - [ ] Run `nub run typecheck`.
  - [ ] Run `nub run test:ci`.
  - [ ] Run `nub run lint` (auto-fix) then `nub run lint:ci`.
  - [ ] Run `nub run format` (apply) then `nub run format:ci`.
  - [ ] Run `nub run duplicates:ci`.
  - [ ] Run `nub run knip:ci`.

## Delivery

- [ ] Stage and commit changes with a Conventional Commit message.
- [ ] Push the `feature/cursor-subagent-metadata` branch only when requested.

## Docs

- [ ] Update `skills/happenin/SKILL.md` field extraction table to include `subagentId`, `subagentType`, and `transcriptPath` for `subagentStart` payloads, and note that `conversation_id` and `parent_conversation_id` are `sessionId` fallbacks only for `subagentStart` payloads. Also document that users must run `happenin import` or `happenin dashboard` once after upgrade to trigger the one-time backfill of existing `subagentStart` rows. Finally, document the fail-open behavior: if the database is locked by a concurrent backfill, any Cursor/Claude hook returns its expected default response but the event is not recorded.
- [ ] Update `assets/help.md` only if a new CLI flag or command is added (none planned for this PR).

## Testing

- [ ] Unit tests in `test/happenin.test.ts` cover record extraction, DB backfill, and dashboard rendering.
- [ ] Manual check: run `happenin dashboard`, trigger or observe a Cursor `subagentStart` event, and confirm the row shows `subagent:shell` and a transcript reference.

## Acceptance

- [ ] `subagentStart` events captured after this change have `subagentId`, `subagentType`, and `transcriptPath` populated, and `sessionId` is derived from `parent_conversation_id` first, `conversation_id` second, and the existing `sessionId`/`session_id` payload keys only as a last resort so the row groups with the main Cursor session when the conversation identifiers are present.
- [ ] Run `happenin import` or `happenin dashboard` once after upgrade to migrate the schema and backfill existing `subagentStart` events in `~/.happenin/happenin.db` with `subagentId`, `subagentType`, `transcriptPath`, and `sessionId` (re-derived from `parent_conversation_id`/`conversation_id`). The backfill is idempotent and runs only on rows with missing subagent columns; `runDashboard` invokes the backfill via `runImport`.
- [ ] The dashboard renders the subagent type and a transcript reference for rows that have the metadata.
- [ ] All standard verification commands pass.

## Fallback Plan

- If Cursor payloads do not contain the expected keys on a future version, the raw `payload` is still stored and the new columns are null. No data is lost.

## References

- `1 - ALTERNATIVES.md` in the same flow folder.

## Complexity Check

- Implementation TODO count: ~42
- Total checklist items: ~60
- Depth: 2
- Cross-deps: 0
- **Decision:** Proceed
