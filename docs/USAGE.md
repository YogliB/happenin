# Usage

## Installation

Install from npm:

```bash
npm install -g happenin
```

Or try it without installing (the packaged hooks run through `npx`):

```bash
npx -y happenin install
```

Or run from source:

```bash
git clone git@github.com:YogliB/happenin.git
cd happenin
npm install
npm run build
```

If you use `nub`, run `nub install` and `nub run build` instead.

## Stability

`happenin` is pre-1.0. The CLI, database schema, and dashboard output may change in small ways between releases until `v1.0.0`. Any breaking changes will be minor and listed in the [changelog](CHANGELOG.md).

## Quick start

```bash
# Show the Cursor and Claude Code plugin setup
happenin install

# Import existing transcripts
happenin import

# Start the realtime dashboard
happenin dashboard
```

The dashboard opens at `http://localhost:8765`. New events stream in automatically.

## Commands

### `happenin install [--cursor] [--claude]`

Prints the supported plugin setup for Cursor and Claude Code. The packaged plugins call `npx -y happenin record`, so they work with both the trial and global-install flows without rewriting `~/.cursor/hooks.json` or `~/.claude/settings.json`. Use `--cursor` or `--claude` to show one client only.

For an older direct-config setup, install both plugins first, then remove only the `happenin record` entries from those two files. Keep every unrelated hook. If you need the old setup temporarily, `happenin install --legacy [--cursor|--claude]` still makes a backup before editing.

### `happenin record <source> [event]`

The hook target. Reads a JSON payload from stdin, writes it to `~/.happenin/happenin.db`, and prints the required non-blocking response for the agent.

- `source` — `cursor` or `claude`.
- `event` — only required for Claude; Cursor payloads include `hook_event_name`.

This command is normally called by the agent hooks, not directly.

### `happenin import [--force]`

Imports existing transcripts:

- Claude Code JSONL from `~/.claude/projects/<project>/<session>.jsonl`. Each `tool_use` block in an
  assistant message is recorded as its own event with `tool_name` (and `file_path` for
  `Read`/`Edit`/`Write`/`MultiEdit`/`NotebookEdit`, `skill_name` for `Skill` calls) set, so tool
  usage, skills used, and files touched are queryable and show up on the dashboard.
- Cursor `prompt_history.json` and `meta.json` from `~/.cursor/chats/<hash>/<session>/`.

`store.db` is skipped because it is encrypted.

Files are only re-parsed when their modification time changes. `--force` clears that tracking and
re-imports every discovered file from scratch — use it after upgrading `happenin` to pick up
extraction changes for transcripts that were already imported.

### `happenin query [options]`

Query events from the local database and print them as JSON, JSONL, or a summary.

- `--source <source>` — filter by source.
- `--event <event>` — filter by event name.
- `--session <id>` — filter by session id (partial match).
- `--q <text>` — search event payloads and session ids.
- `--since <id>` — events with an id greater than `<id>`.
- `--range <range>` — time range: `24h`, `7d`, `30d`, `all` (default: `24h`).
- `--tool <tool>` — filter by tool name.
- `--limit <n>` — maximum rows to return (default: `100`).
- `--offset <n>` — skip the first `<n>` rows.
- `--format <json|jsonl|summary>` — output format (default: `json`).
- `--db <path>` — database path (default: `HAPPENIN_DB` or `~/.happenin/happenin.db`).

```bash
happenin query --limit 10
happenin query --source cursor --event subagentStart --format jsonl
happenin query --session abc123 --format summary
```

### `happenin sessions [options]`

Summarize recorded events grouped by session. Useful for reviewing activity across many sessions and event volumes. Each session includes `tools`, `skills`, and `files` — the distinct tool names, skill names (from `Skill` tool calls), and file paths (from `Read`/`Edit`/`Write`/`MultiEdit`/`NotebookEdit` calls) seen in that session. The dashboard's session detail view shows the same three lists.

- `--source <source>` — filter sessions by source.
- `--event <event>` — filter sessions by event name.
- `--session <id>` — filter by session id (partial match).
- `--q <text>` — search event payloads and session ids.
- `--since <id>` — sessions with an event id greater than `<id>`.
- `--range <range>` — time range: `24h`, `7d`, `30d`, `all` (default: `24h`).
- `--status <status>` — filter by session status: `active`, `completed`, `failed`.
- `--tool <tool>` — filter sessions by tool name.
- `--minDuration <minutes>` — minimum session duration.
- `--maxDuration <minutes>` — maximum session duration.
- `--limit <n>` — maximum sessions to return (default: `100`).
- `--offset <n>` — skip the first `<n>` sessions.
- `--format <json|jsonl|summary>` — output format (default: `json`).
- `--db <path>` — database path (default: `HAPPENIN_DB` or `~/.happenin/happenin.db`).

```bash
happenin sessions --limit 10
happenin sessions --source cursor --format jsonl
happenin sessions --session abc123 --format summary
```

### `happenin dashboard [--port <port>] [--no-open] [--silent]`

Starts a local HTTP server and opens the dashboard in your browser.

- `--port` — port to listen on (default: `8765`).
- `--no-open` — do not open the browser.
- `--silent` — alias for `--no-open`; used automatically by `npm start`.

## Common commands

| Command                        | Purpose                                     |
| ------------------------------ | ------------------------------------------- |
| `happenin install`             | Install hooks.                              |
| `happenin import`              | Import existing transcripts.                |
| `happenin dashboard`           | Start the realtime dashboard.               |
| `happenin query --limit 10`    | Print the 10 most recent events.            |
| `happenin sessions --limit 10` | Print the 10 most recent session summaries. |

## Configuration

- `HAPPENIN_DB` — override the SQLite database path. Default: `~/.happenin/happenin.db`.
- `NO_COLOR` — disable colored help output.
