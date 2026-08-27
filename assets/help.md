# happenin

A minimal macOS CLI that captures Cursor and Claude Code agent events into a local SQLite database and serves a realtime dashboard.

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

### `happenin dashboard [--port <port>] [--no-open] [--silent]`

Starts a local HTTP server and opens the dashboard in your browser.

- `--port` — port to listen on (default: `8765`).
- `--no-open` — do not open the browser.
- `--silent` — alias for `--no-open`; used automatically by `npm start`.

## Configuration

- `HAPPENIN_DB` — override the SQLite database path (default: `~/.happenin/happenin.db`).
- `NO_COLOR` — disable colored help output.
