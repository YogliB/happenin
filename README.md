# happenin

A macOS CLI that records Cursor and Claude Code agent events to a local SQLite database and serves a live browser dashboard.

## Why

Cursor and Claude Code can emit local hooks for each session, tool use, prompt, file edit, and lifecycle event. `happenin` adds `record` hooks to those agents, writes the payloads to a local SQLite database, and serves a live browser dashboard. Data never leaves your machine.

## Stability

`happenin` is pre-1.0. The CLI, database schema, and dashboard output may change in small ways between releases until `v1.0.0`. Any breaking changes will be minor and listed in the [changelog](docs/CHANGELOG.md).

## Requirements

- macOS
- Node.js `>= 24.0.0` (uses the built-in `node:sqlite` module)
- Zero runtime dependencies
- The dashboard loads htmx, AlpineJS, and htmx-ext-sse from a CDN

## Install

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

## Quick start

```bash
# Install hooks into Cursor and Claude Code (backs up existing configs)
happenin install

# Import existing transcripts
happenin import

# Start the live dashboard
happenin dashboard
```

The dashboard opens at `http://localhost:8765`. New events appear automatically.

## Commands

### `happenin install [--cursor] [--claude]`

Backs up and appends `happenin record` hooks to `~/.cursor/hooks.json` and `~/.claude/settings.json`. Backups are written to `~/.happenin/backups/`.

```bash
happenin install --cursor
happenin install --claude
```

### `happenin record <source> [event]`

The hook target. Reads a JSON payload from stdin, writes it to `~/.happenin/happenin.db`, and prints the required non-blocking response for the agent.

- `source` — `cursor` or `claude`.
- `event` — only required for Claude; Cursor payloads include `hook_event_name`.

This command is normally called by the agent hooks, not directly:

```bash
echo '{"hook_event_name":"sessionStart","sessionId":"abc123"}' | happenin record cursor
echo '{"sessionId":"abc123"}' | happenin record claude SessionStart
```

### `happenin import`

Imports existing transcripts:

- Claude Code JSONL from `~/.claude/projects/<project>/<session>.jsonl`.
- Cursor `prompt_history.json` and `meta.json` from `~/.cursor/chats/<hash>/<session>/`.

`store.db` is skipped because it is encrypted.

### `happenin query [options]`

Query events from the local database and print them as JSON, JSONL, or a summary.

```bash
happenin query --limit 10
happenin query --source cursor --event subagentStart --format jsonl
happenin query --session abc123 --format summary
```

See [docs/USAGE.md](docs/USAGE.md) for all filters.

### `happenin dashboard [--port <port>] [--no-open] [--silent]`

Starts a local HTTP server and opens the dashboard.

- `--port` — port to listen on (default: `8765`).
- `--no-open` — do not open the browser.
- `--silent` — alias for `--no-open`; used automatically by `npm start`.

```bash
happenin dashboard --port 9000 --silent
```

## Configuration

- `HAPPENIN_DB` — override the SQLite database path. Default: `~/.happenin/happenin.db`.
- `NO_COLOR` — disable colored help output.

## Privacy

`happenin` stores full hook payloads and transcripts locally. No data is sent over the network except for the CDN-loaded dashboard libraries (htmx, AlpineJS, htmx-ext-sse) when the dashboard is open.

## Development

```bash
nub install
nub run build
```

The same scripts also work with npm:

```bash
npm install
npm run build
```

Before opening a pull request, run the full check suite:

```bash
npm run build
npm run typecheck
npm run format
npm run lint
npm run duplicates:ci
npm run knip:ci
npm run test:ci
```

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for details.

## Documentation

### User docs

| Doc                                                | Purpose                          |
| -------------------------------------------------- | -------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)       | How the pieces fit together.     |
| [docs/USAGE.md](docs/USAGE.md)                     | Full usage guide.                |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common problems.                 |
| [docs/CHANGELOG.md](docs/CHANGELOG.md)             | Release notes.                   |
| [assets/help.md](assets/help.md)                   | CLI help text shown by `--help`. |

### Agent and LLM docs

| Doc                                                  | Purpose                           |
| ---------------------------------------------------- | --------------------------------- |
| [AGENTS.md](AGENTS.md)                               | Agent-facing entry point.         |
| [CLAUDE.md](CLAUDE.md)                               | Symlink to `AGENTS.md`.           |
| [llms.txt](llms.txt)                                 | LLM/AI index of docs and sources. |
| [skills/happenin/SKILL.md](skills/happenin/SKILL.md) | Cross-agent skill instructions.   |

## Agent skill

Install the reusable `happenin` skill for agents that support `SKILL.md` files:

```bash
npx skills add YogliB/happenin --skill happenin
```

Then ask the agent to record or inspect agent events. The skill covers `install`, `record`, `import`, `query`, and `dashboard`, plus field extraction and required hook responses.

See [skills/happenin/SKILL.md](skills/happenin/SKILL.md) for the full instructions.

## License

[MIT](LICENSE.md)
