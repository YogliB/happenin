# happenin changelog

## [Unreleased]

- Pre-1.0: the CLI, database schema, and dashboard output may change in small ways until v1.0.0. Breaking changes will be listed here.

## [0.1.0]

- Redesigned the browser dashboard into an analytics view: left sessions sidebar, metrics cards, event-frequency and tool-usage charts, full-height session detail with a subagent timeline, live SSE updates, and an emoji theme toggle.
- Added dashboard filters for source, event, tool, query, status, duration, and range, with sticky header/filters and responsive viewport-constrained layout.
- Added subagent fan-out grouping, live `tool_use_id` linking, historical backfill, and `idx_events_subagent_id`.
- `record` now extracts `happenedAt` from more timestamp fields and `ts`, `createdAt`, and `created_at` and falls back to `receivedAt` when no timestamp is present.
- `record` now extracts `projectPath` from multi-root Cursor workspace fields such as `workspace_roots` and `workspaceRoots`.
- Existing rows are backfilled for `happened_at` and `project_path` on the next database open.
- New `happenin sessions` command prints session-level summaries.

## [0.0.1]

- Initial release of `happenin`: track Cursor and Claude Code agent events locally.
