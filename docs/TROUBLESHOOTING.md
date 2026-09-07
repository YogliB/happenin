# Troubleshooting

## Problem: `nub run build` fails

The build uses `tsdown` to bundle `src/` into `dist/bin.js`.

### Solution

- Make sure you are using Node 24 or later for development (`cat .node-version`). Node `>= 22.13` is enough to _run_ happenin, but the build toolchain requires Node 24.
- Run `nub install` first to install dev dependencies.
- If the error is TypeScript-related, run `nub run typecheck` for detailed diagnostics.

## Problem: `happenin install` does not change Cursor or Claude Code behavior

The `install` command backs up and appends hooks, but the agent may cache its config.

### Solution

- Verify `~/.cursor/hooks.json` or `~/.claude/settings.json` contains the `happenin record` entries.
- Restart Cursor or Claude Code completely.
- Check `~/.happenin/backups/` for the original config files.

## Problem: Events do not appear in the dashboard

The dashboard reads from `~/.happenin/happenin.db`. If hooks are not firing, no rows are written.

### Solution

- Run `happenin record cursor <event>` manually with a small JSON payload on stdin to confirm the database is writable.
- Check that `HAPPENIN_DB` points to the file you expect.
- Look for SQLite `SQLITE_BUSY` or `SQLITE_LOCKED` warnings in the terminal.

## Problem: Dashboard port is already in use

`happenin dashboard` defaults to port `8765`.

### Solution

- Use `--port <port>` to bind to a different port.
- Find and stop the existing process on port `8765`.

## Problem: Query returns no results

### Solution

- Verify the database path with `HAPPENIN_DB` or `--db`.
- Run `happenin import` first if you are looking for historical transcripts.
- Use `happenin query --format summary` to see counts by source and event.
