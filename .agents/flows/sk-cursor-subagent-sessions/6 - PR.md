# PR: cursor-subagent-sessions

## Title

feat: capture and expose Cursor subagent metadata

## Body

```markdown
## Summary

Distinguish Cursor main sessions from subagent runs by extracting `subagent_id`, `subagent_type`, and `transcript_path` from `subagentStart` hook events. Existing `subagentStart` rows are backfilled via `json_extract`, and the dashboard/query output now shows the new metadata.

## Changes

- Added `subagentId`, `subagentType`, and `transcriptPath` columns to `events`.
- Added idempotent `ALTER TABLE` migration guarded by `PRAGMA user_version`.
- Added `backfillSubagentMetadata` to populate new columns and re-derive `sessionId` from `parent_conversation_id` / `conversation_id` for existing `subagentStart` rows.
- For `subagentStart` payloads, `record` derives `sessionId` from `parent_conversation_id` → `conversation_id` → existing session keys, and extracts the three subagent fields.
- `record` is now fail-open for `SQLITE_BUSY` / `SQLITE_LOCKED` errors: hooks still get their required response even if the database is temporarily locked.
- `eventView` exposes the three new fields for `happenin query`.
- The dashboard renders `subagent:<type>` and `transcript:<basename>` in event rows.
- Updated `skills/happenin/SKILL.md` with the new field extraction table, backfill note, and fail-open note.

## Test plan

- [x] `nub run build`
- [x] `nub run typecheck`
- [x] `nub run test:ci`
- [x] `nub run lint:ci`
- [x] `nub run format:ci`
- [x] `nub run duplicates:ci`
- [x] `nub run knip:ci`
```
