# happenin

A minimal macOS CLI that captures Cursor and Claude Code agent events into a local SQLite database and serves a realtime AlpineJS + htmx dashboard.

## Why

Cursor and Claude Code can fire local hooks for every session, tool use, prompt, file edit, and lifecycle event. `happenin` installs those hooks, stores the full payloads locally, and gives you a browser dashboard that updates in real time. All data stays on your machine.

## Install

```bash
npm install -g happenin
```

Or run from source:

```bash
nub install
nub run build
```

## Quick start

```bash
# Install hooks into Cursor and Claude Code (backs up existing configs)
happenin install

# Import existing transcripts (Claude JSONL, Cursor prompt history)
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

### `happenin import`

Imports existing transcripts:

- Claude Code JSONL from `~/.claude/projects/<project>/<session>.jsonl`.
- Cursor `prompt_history.json` and `meta.json` from `~/.cursor/chats/<hash>/<session>/`.

`store.db` is skipped because it is encrypted.

### `happenin dashboard [--port <port>] [--no-open]`

Starts the local HTTP server and opens the dashboard. Use `--no-open` to start without launching the browser.

## Configuration

- `HAPPENIN_DB` — override the SQLite database path. Default: `~/.happenin/happenin.db`.
- `NO_COLOR` — disable colored help output.

## Privacy

`happenin` stores full hook payloads and transcripts locally. No data is sent over the network except for the CDN-loaded dashboard libraries (htmx, AlpineJS, htmx-ext-sse) when the dashboard is open.

## Documentation

| Doc                                                | Purpose                      |
| -------------------------------------------------- | ---------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)       | How the pieces fit together. |
| [docs/USAGE.md](docs/USAGE.md)                     | Full usage guide.            |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)       | Setup, conventions, and PRs. |
| [docs/SECURITY.md](docs/SECURITY.md)               | Reporting vulnerabilities.   |
| [docs/CODE_OF_CONDUCT.md](docs/CODE_OF_CONDUCT.md) | Community expectations.      |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common problems.             |
| [docs/CHANGELOG.md](docs/CHANGELOG.md)             | Release notes.               |

## Changelog

See [docs/CHANGELOG.md](docs/CHANGELOG.md).

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

## Development

```bash
nub install
nub run build
nub run typecheck
nub run lint
nub run test
```

## Agent skill

Install the reusable, cross-agent `happenin` skill for agents that support `SKILL.md` files:

```bash
# project-level install
npx skills add YogliB/happenin --skill happenin

# global install
npx skills add YogliB/happenin --skill happenin -g
```

Then ask the agent to record or inspect agent events. The skill covers `happenin install`, `record`, `import`, `query`, and `dashboard`, plus the field extraction and required hook responses.

See [skills/happenin/SKILL.md](skills/happenin/SKILL.md) for the full skill instructions.

## License

[MIT](LICENSE.md)
