# happenin changelog

## Unreleased

- Pre-1.0: the CLI, database schema, and dashboard output may change in small ways until v1.0.0. Breaking changes will be listed here.
- `record` now extracts `happenedAt` from more timestamp fields and `ts`, `createdAt`, and `created_at` and falls back to `receivedAt` when no timestamp is present.
- `record` now extracts `projectPath` from multi-root Cursor workspace fields such as `workspace_roots` and `workspaceRoots`.
- Existing rows are backfilled for `happened_at` and `project_path` on the next database open.
- New `happenin sessions` command prints session-level summaries.

## 0.0.1

- Initial release of `happenin`: track Cursor and Claude Code agent events locally.
