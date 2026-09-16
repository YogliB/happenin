# happenin changelog

## [Unreleased]

- Added multi-select "directories", "skills", and "integrations (MCP)" filters to the dashboard filter bar. Selected values within a category combine with OR; categories combine with each other (and with the existing filters) with AND. The MCP server list is derived from the `mcp__<server>__<tool>` names actually recorded, with no hardcoded list.
- Added a context breakdown widget to the dashboard (and session detail view) that buckets recorded payload size and imported-transcript token usage into MCP servers, markdown files, bloatware, and actual value.
- Pre-1.0: the CLI, database schema, and dashboard output may change in small ways until v1.0.0. Breaking changes will be listed here.

## [0.3.0]

- `npx -y happenin install` now writes hooks that run through `npx` instead of pointing at the ephemeral npx cache path, so a zero-install trial keeps working; re-running `install` replaces previous `happenin` hooks instead of duplicating them.
- Added a context breakdown widget to the dashboard (and session detail view) that buckets recorded payload size and imported-transcript token usage into MCP servers, markdown files, bloatware, and actual value.

## [0.2.0]

- Sessions sidebar nests subagent rows under their parent with a selectable, filterable detail view.

## [0.1.1]

- `npm install -g happenin` now works on Node.js 22.13 or later (previously 24 or later); the test suite and package smoke tests run on Node.js 22 and 24 in CI.

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

[Unreleased]: https://github.com/YogliB/happenin/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/YogliB/happenin/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/YogliB/happenin/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/YogliB/happenin/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/YogliB/happenin/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/YogliB/happenin/releases/tag/v0.0.1
