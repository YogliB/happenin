# happenin changelog

## [Unreleased]

- Pre-1.0: the CLI, database schema, and dashboard output may change in small ways until v1.0.0. Breaking changes will be listed here.

- Dashboard filter bar labels are now associated with their inputs (`for`/`id` on selects and inputs, `aria-labelledby` on the multi-selects), fixing screen-reader announcement of the filter controls. (#35)

## [0.6.0]

- The packaged Cursor and Claude Code plugins now bundle the `happenin` agent skill, so installing a plugin also installs the skill.
- Removed the `DirectoryAdded` hook from the Claude Code plugin; current Claude Code no longer emits that event.

## [0.5.0]

- `happenin install` no longer edits `~/.cursor/hooks.json` or `~/.claude/settings.json`. The record hooks are now packaged as Cursor and Claude Code plugins, and `install` prints the marketplace setup steps instead of touching your config.
- Installed with an older happenin? Remove the old `happenin record` entries from those two files by hand and install the plugin instead (one-time step; see the migration guide in README.md).

## [0.4.0]

- Added multi-select "directories", "skills", and "integrations (MCP)" filters to the dashboard. Values within a category combine with OR, categories with AND; the MCP server list comes from the servers actually recorded.
- Added a context breakdown widget to the dashboard and session detail view, bucketing payload size and token usage into MCP servers, markdown files, bloatware, and actual value.
- Added Linux and Windows support alongside macOS.

## [0.3.0]

- `npx -y happenin install` now keeps working after install: hooks run through `npx` instead of the ephemeral cache path, and re-running `install` replaces old hooks instead of duplicating them.

## [0.2.0]

- The sessions sidebar nests subagent rows under their parent, with a selectable, filterable detail view.

## [0.1.1]

- `happenin` now runs on Node.js 22.13 or later (previously 24 or later).

## [0.1.0]

- Redesigned the dashboard into an analytics view: sessions sidebar, metrics cards, event-frequency and tool-usage charts, full-height session detail with a subagent timeline, live updates, and an emoji theme toggle.
- Added dashboard filters for source, event, tool, query, status, duration, and range.
- Subagent events are grouped under their parent session and backfilled for existing data.
- `record` reads timestamps and project paths from more event fields, with sensible fallbacks.
- New `happenin sessions` command prints session-level summaries.

## [0.0.1]

- Initial release of `happenin`: track Cursor and Claude Code agent events locally.

[Unreleased]: https://github.com/YogliB/happenin/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/YogliB/happenin/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/YogliB/happenin/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/YogliB/happenin/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/YogliB/happenin/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/YogliB/happenin/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/YogliB/happenin/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/YogliB/happenin/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/YogliB/happenin/releases/tag/v0.0.1
