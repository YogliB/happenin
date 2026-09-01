# Implementation: cursor-subagent-sessions

## Summary

Implemented support for capturing and exposing Cursor subagent metadata from `subagentStart` hook events, plus a one-time backfill for existing rows.

## Changes

- `src/types.ts`: added `subagentId`, `subagentType`, and `transcriptPath` to `EventInsert`.
- `src/db.ts`:
  - Added the three columns to the `events` schema, `insertEventSql`, and `selectEventSql`.
  - Added `getUserVersion` and `ensureSubagentColumns` helpers that use `PRAGMA user_version` and `PRAGMA table_info` to migrate existing databases idempotently inside a `BEGIN IMMEDIATE` / `COMMIT` transaction.
  - Added `backfillSubagentMetadata` to populate the new columns and re-derive `session_id` from `parent_conversation_id` / `conversation_id` for existing `subagentStart` rows using `json_extract`.
  - Updated `initDb` to set `busy_timeout`, run the migration, and close the database on setup failure.
  - Updated `insertEvent` to bind the new columns.
- `src/import.ts`: calls `backfillSubagentMetadata` once per import run before transcript imports.
- `src/record.ts`:
  - For Cursor `subagentStart` events, derives `sessionId` from `parent_conversation_id`, `conversation_id`, then existing session keys.
  - Extracts `subagentId`, `subagentType`, and `transcriptPath` only for `subagentStart` events.
  - Computes the required hook response before touching the database.
  - Opens/closes the database per hook call with a 500 ms busy timeout and fail-open behavior on `SQLITE_BUSY` / `SQLITE_LOCKED`.
- `src/view.ts`: `eventView` now returns the three subagent fields.
- `src/dashboard.ts`:
  - `groupEventsBySession` uses `sessionId ?? undefined` as its key.
  - `renderEventRow` renders `subagent:<type>` and `transcript:<basename>` meta, truncated and escaped.
- `test/happenin.test.ts`: added migration/backfill, record extraction, view, and dashboard rendering tests.
- `test/record.failopen.test.ts`: new file testing `recordFromRaw` fail-open behavior for busy and non-busy database errors.
- `skills/happenin/SKILL.md`: documented the new fields, backfill requirement, and fail-open behavior.

## Verification

All standard checks passed:

- `nub run build`
- `nub run typecheck`
- `nub run test` / `nub run test:ci`
- `nub run lint` / `nub run lint:ci`
- `nub run format` / `nub run format:ci`
- `nub run duplicates:ci`
- `nub run knip:ci`

## Divergence log

- None.
