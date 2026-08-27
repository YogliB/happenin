# AGENTS.md

Agent-facing entry point for this repo. For the open format, see [agents.md](https://agents.md/).

## Quick links

| Topic                | Where to look                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Agent rules          | [@caveman.md](.agents/rules/caveman.md), [@ponytail.md](.agents/rules/ponytail.md), [@rtk.md](.agents/rules/rtk.md) |
| User-facing CLI docs | [README.md](../README.md)                                                                                           |
| Architecture         | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                                                                        |
| CLI help text        | [assets/help.md](assets/help.md)                                                                                    |
| License              | [LICENSE.md](../LICENSE.md)                                                                                         |

## Setup

Install dependencies and build:

```bash
nub install
nub run build
```

## Common commands

- `nub run build` — bundle `src/` into `dist/` with tsdown.
- `nub run typecheck` — run `tsc --noEmit`.
- `nub run lint` / `nub run lint:ci` — run oxlint; use `lint` for auto-fix.
- `nub run format` / `nub run format:ci` — run oxfmt; use `format` to apply.
- `nub run test` / `nub run test:ci` — run vitest with or without coverage.

## Project layout

- `src/index.ts` — CLI dispatch.
- `src/bin.ts` — executable entry point.
- `src/db.ts` — SQLite data layer.
- `src/constants.ts` — hook event lists and default responses.
- `src/types.ts` — shared TypeScript types.
- `src/record.ts` — hook target: parse stdin, insert event, respond.
- `src/install.ts` — install Cursor / Claude Code hooks.
- `src/import.ts` — import Claude and Cursor transcripts.
- `src/dashboard.ts` — HTTP server and dashboard HTML.
- `assets/help.md` — help text shown by `--help`.
- `dist/` — build output.
- `test/` — vitest test files.

## Lint and format

CI and the pre-commit hook run `oxlint` and `oxfmt`. `nub run format` fixes most issues. A custom `oxlint-repo-guidelines/no-more-docs` rule blocks new Markdown or `docs/` files that are not in the allow-list. Add to [scripts/oxlint-repo-guidelines.js](../scripts/oxlint-repo-guidelines.js) and update this file if a new doc is needed.

## Documentation

Keep docs short, clear, and concise. `AGENTS.md` is a condensed version of the human docs in `docs/` and `README.md`; link to the full doc when detail is needed.

## Pull requests

Keep changes focused. Run `nub run build`, `nub run typecheck`, `nub run format:ci`, `nub run lint:ci`, and `nub run test:ci` before opening a PR. Squash to a single commit and write a Conventional Commit message.
