# happenin

A macOS CLI that records Cursor and Claude Code agent events to a local SQLite database and serves a live browser dashboard.

## Commands

### `happenin install [--cursor] [--claude]`

Backs up and appends `happenin record` hooks to your Cursor and Claude Code configuration files.

- `--cursor` — install Cursor hooks only.
- `--claude` — install Claude Code hooks only.

By default both are installed. Backups are written to `~/.happenin/backups/`.

### `happenin record <source> [event]`

The hook target. Reads a JSON payload from stdin, writes it to `~/.happenin/happenin.db`, and prints the required non-blocking response for the agent.

- `source` — `cursor` or `claude`.
- `event` — event name, only required for Claude (Cursor payloads include `hook_event_name`).

This command is normally called by the agent hooks, not directly.

### `happenin import`

Imports existing transcripts:

- Claude Code JSONL from `~/.claude/projects/<project>/<session>.jsonl`.
- Cursor `prompt_history.json` and `meta.json` from `~/.cursor/chats/<hash>/<session>/`.

`store.db` is skipped because it is encrypted.

### `happenin query [options]`

Query events from the local database and print them as JSON, JSONL, or a summary.

- `--source <source>` — filter by source.
- `--event <event>` — filter by event name.
- `--session <id>` — filter by session id (partial match).
- `--q <text>` — search event payloads and session ids.
- `--since <id>` — events with an id greater than `<id>`.
- `--range <range>` — time range: `24h`, `7d`, `30d` (default: `24h`).
- `--tool <tool>` — filter by tool name.
- `--limit <n>` — maximum rows to return (default: `100`).
- `--offset <n>` — skip the first `<n>` rows.
- `--format <json|jsonl|summary>` — output format (default: `json`).
- `--db <path>` — database path (default: `HAPPENIN_DB` or `~/.happenin/happenin.db`).

### `happenin sessions [options]`

List sessions with id, start/end time, duration, event count, project path, tools used, and failure count.

- `--source <source>` — filter sessions by source.
- `--event <event>` — filter sessions by event name.
- `--session <id>` — filter by session id (partial match).
- `--q <text>` — search event payloads and session ids.
- `--since <id>` — events with an id greater than `<id>`.
- `--range <range>` — time range: `24h`, `7d`, `30d` (default: `24h`).
- `--status <status>` — filter by session status: `active`, `completed`, `failed`.
- `--tool <tool>` — filter by tool name.
- `--minDuration <m>` — minimum session duration in minutes.
- `--maxDuration <m>` — maximum session duration in minutes.
- `--limit <n>` — maximum sessions to return (default: `100`).
- `--offset <n>` — skip the first `<n>` sessions.
- `--format <json|jsonl|summary>` — output format (default: `json`).
- `--db <path>` — database path (default: `HAPPENIN_DB` or `~/.happenin/happenin.db`).

### `happenin dashboard [--port <port>] [--no-open] [--silent]`

Starts a local HTTP server and opens the dashboard in your browser.

- `--port` — port to listen on (default: `8765`).
- `--no-open` — do not open the browser.
- `--silent` — alias for `--no-open`; used automatically by `npm start`.

## Configuration

- `HAPPENIN_DB` — override the SQLite database path (default: `~/.happenin/happenin.db`).
- `NO_COLOR` — disable colored help output.
