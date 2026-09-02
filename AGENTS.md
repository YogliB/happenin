# AGENTS.md

Agent-facing entry point. **Read the rules before doing any work in this repo.** For the open format, see [agents.md](https://agents.md/).

## Rules

These rules are always-on. Read them before every task:

| Rule     | File                                      | What it covers                                     |
| -------- | ----------------------------------------- | -------------------------------------------------- |
| Caveman  | [@caveman.md](.agents/rules/caveman.md)   | Terse, token-efficient responses.                  |
| Ponytail | [@ponytail.md](.agents/rules/ponytail.md) | Lazy senior dev mode: stdlib first, minimal diffs. |
| RTK      | [@rtk.md](.agents/rules/rtk.md)           | Token-optimized CLI proxy commands.                |

@.agents/rules/caveman.md
@.agents/rules/ponytail.md
@.agents/rules/rtk.md

## Docs index

| Doc                                                  | Purpose                                |
| ---------------------------------------------------- | -------------------------------------- |
| [README.md](README.md)                               | Human-facing overview, install, usage. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)         | Data flow and design choices.          |
| [docs/USAGE.md](docs/USAGE.md)                       | Full usage guide.                      |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)         | Setup, conventions, and PRs.           |
| [docs/SECURITY.md](docs/SECURITY.md)                 | Reporting vulnerabilities.             |
| [docs/CODE_OF_CONDUCT.md](docs/CODE_OF_CONDUCT.md)   | Community expectations.                |
| [docs/CHANGELOG.md](docs/CHANGELOG.md)               | Release notes.                         |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)   | Common problems.                       |
| [assets/help.md](assets/help.md)                     | CLI help text shown by `--help`.       |
| [llms.txt](llms.txt)                                 | LLM/AI index of docs and sources.      |
| [CLAUDE.md](CLAUDE.md)                               | Symlink to `AGENTS.md`.                |
| [skills/happenin/SKILL.md](skills/happenin/SKILL.md) | Cross-agent skill instructions.        |

## Condensed docs

### What happenin is

A macOS CLI that records Cursor and Claude Code agent events to a local SQLite database and serves a live browser dashboard.

`happenin` is pre-1.0. The CLI, database schema, and dashboard output may change in small ways until v1.0.0; breaking changes are noted in the changelog.

### How to work on it

Install dependencies and build:

```bash
nub install
nub run build
```

Common commands:

- `nub run build` — bundle `src/` into `dist/` with tsdown.
- `nub run typecheck` — run `tsc --noEmit`.
- `nub run lint` / `nub run lint:ci` — run oxlint; use `lint` for auto-fix.
- `nub run format` / `nub run format:ci` — run oxfmt; use `format` to apply.
- `nub run duplicates:ci` — run jscpd to detect duplicated code.
- `nub run knip:ci` — find unused dependencies and exports with knip.
- `nub run test` / `nub run test:ci` — run vitest with or without coverage.

### Conventions

- Zero runtime dependencies. Everything uses Node built-in modules and the dashboard loads small JS libraries from a CDN.
- SQLite via `node:sqlite` with WAL mode.
- Append-only hooks. Back up and merge existing configs; never overwrite.
- Fail-open responses. `record` returns the minimum required non-blocking response and no output for observer hooks.
- Keep docs short, clear, and concise. `AGENTS.md` is a condensed version of the human docs; link to the full doc when detail is needed.
- PRs must be focused, pass `build`, `typecheck`, `format:ci`, `lint:ci`, `duplicates:ci`, `knip:ci`, and `test:ci`, and use a Conventional Commit message.

### Project layout

- `src/cli/index.ts` — CLI dispatch.
- `src/cli/bin.ts` — executable entry point.
- `src/shared/db.ts` — SQLite data layer.
- `src/shared/constants.ts` — hook event lists and default responses.
- `src/shared/types.ts` — shared TypeScript types.
- `src/cli/record.ts` — hook target: parse stdin, insert event, respond.
- `src/cli/install.ts` — install Cursor / Claude Code hooks.
- `src/cli/import.ts` — import Claude and Cursor transcripts.
- `src/cli/query.ts` — filter and format events for the `query` and `sessions` commands.
- `src/cli/sessions.ts` — session summaries for the `sessions` command.
- `src/shared/view.ts` — shared event view used by `query` and `dashboard`.
- `src/UI/dashboard/index.ts` — HTTP server, SSE, and routing.
- `src/UI/dashboard/page.ts` — full-page HTML shell and client script.
- `src/UI/dashboard/fragments.ts` — HTMX fragment rendering and query parsing.
- `src/UI/dashboard/components/*.ts` — header, filters, metric cards, charts, sessions table, detail panel.
- `assets/help.md` — help text shown by `--help`.
- `dist/` — build output.
- `test/` — vitest test files.

## Documentation sync

Keep `README.md`, `AGENTS.md`, `CLAUDE.md`, `llms.txt`, rules, and `docs/` aligned when changing workflows or conventions.
