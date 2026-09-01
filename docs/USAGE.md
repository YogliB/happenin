# Usage

## Installation

Install from npm:

```bash
npm install -g happenin
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
# Install Cursor and Claude Code hooks (backs up existing configs)
happenin install

# Import existing transcripts
happenin import

# Start the realtime dashboard
happenin dashboard
```

The dashboard opens at `http://localhost:8765`. New events stream in automatically.

## Commands

### `happenin install [--cursor] [--claude]`

Backs up and appends `happenin record` hooks to `~/.cursor/hooks.json` and `~/.claude/settings.json`. Backups are written to `~/.happenin/backups/`.

### `happenin record <source> [event]`

The hook target. Reads a JSON payload from stdin, writes it to `~/.happenin/happenin.db`, and prints the required non-blocking response for the agent.

- `source` — `cursor` or `claude`.
- `event` — only required for Claude; Cursor payloads include `hook_event_name`.

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
- `--q <text>` — search event payloads.
- `--since <id>` — events with an id greater than `<id>`.
- `--limit <n>` — maximum rows to return (default: `100`).
- `--offset <n>` — skip the first `<n>` rows.
- `--format <json|jsonl|summary>` — output format (default: `json`).
- `--db <path>` — database path (default: `HAPPENIN_DB` or `~/.happenin/happenin.db`).

```bash
happenin query --limit 10
happenin query --source cursor --event subagentStart --format jsonl
happenin query --session abc123 --format summary
```

### `happenin dashboard [--port <port>] [--no-open] [--silent]`

Starts a local HTTP server and opens the dashboard in your browser.

- `--port` — port to listen on (default: `8765`).
- `--no-open` — do not open the browser.
- `--silent` — alias for `--no-open`; used automatically by `npm start`.

## Common commands

| Command                     | Purpose                          |
| --------------------------- | -------------------------------- |
| `happenin install`          | Install hooks.                   |
| `happenin import`           | Import existing transcripts.     |
| `happenin dashboard`        | Start the realtime dashboard.    |
| `happenin query --limit 10` | Print the 10 most recent events. |

## Configuration

- `HAPPENIN_DB` — override the SQLite database path. Default: `~/.happenin/happenin.db`.
- `NO_COLOR` — disable colored help output.
