# Architecture

## Data flow

```
┌─────────────────┐   stdin (JSON)   ┌───────────┐   INSERT   ┌─────────────┐
│ Cursor / Claude │ ────────────────▶ │  record   │ ────────▶ │   SQLite    │
│      hooks      │                   │  command  │            │  happenin   │
└─────────────────┘                   └───────────┘            │    .db      │
                                                               └─────────────┘
                                                                       ▲
                                                                       │
┌───────────┐   ┌───────────┐   hx-get/SSE       ┌─────────────┐     │
│  browser  │ ◀──│ dashboard │ ◀───────────────── │    GET      │     │
│  (htmx +  │   │  server   │                    │  /events    │ ────┘
│  Alpine)  │   │           │   ┌──────────────┐ │  /fragments │
└───────────┘   └───────────┘   │ import (run) │ └─────────────┘
                                └──────────────┘
                                       │
                                       ▼
                          ┌──────────────────────────┐
                          │ Claude JSONL, Cursor     │
                          │ prompt_history, meta     │
                          └──────────────────────────┘
```

## Components

| File                       | Responsibility                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `src/bin.ts`               | Executable entry point.                                                               |
| `src/index.ts`             | CLI dispatch: `install`, `record`, `import`, `dashboard`, `--help`, `--version`.      |
| `src/db.ts`                | SQLite data layer using `node:sqlite`.                                                |
| `src/constants.ts`         | Default DB path, hook event lists, default hook responses.                            |
| `src/types.ts`             | Shared TypeScript types.                                                              |
| `src/record.ts`            | Reads hook JSON from stdin, inserts an event, prints the non-blocking agent response. |
| `src/install.ts`           | Backs up and appends hooks to `~/.cursor/hooks.json` and `~/.claude/settings.json`.   |
| `src/import.ts`            | Imports Claude and Cursor transcript files into SQLite.                               |
| `src/dashboard.ts`         | HTTP server with `/`, `/fragments/events`, `/events`, and `/events/stream` SSE.       |
| `assets/help.md`           | Help text shown by `--help`.                                                          |
| `skills/happenin/SKILL.md` | Cross-agent skill that teaches agents how to use happenin.                            |

## Design choices

- **Zero runtime dependencies.** Everything uses Node built-in modules and the dashboard loads the small JS libraries from a CDN.
- **SQLite via `node:sqlite`.** Events are stored as-is in a local SQLite file so the dashboard can read history even when it was not running.
- **WAL mode.** SQLite `journal_mode = WAL` lets dashboard readers and hook writers coexist without blocking each other.
- **Append-only hooks.** Existing Cursor and Claude hook configs are backed up and merged with the new commands; nothing is overwritten.
- **Fail-open responses.** `record` returns the minimum response required for blocking hooks (`{"permission":"allow"}`, `{"decision":"approve"}`, or `{"continue":true}`) and no output for observer hooks.
