---
name: happenin
description: Use the happenin CLI to capture, query, and dashboard Cursor and Claude Code agent events from the local machine.
allowed-tools:
  - exec
  - read
  - grep
---

# Using happenin

`happenin` is a local macOS CLI that captures Cursor and Claude Code hook events into a SQLite database and serves a real-time dashboard. All data stays on the user's machine.

This is a cross-agent skill. Any agent that supports `SKILL.md` files can load it.

## Install

If `happenin` is not installed, install the CLI first:

```bash
npm install -g happenin
```

Or run from source:

```bash
nub install
nub run build
```

If this skill is not installed, add it from the repository:

```bash
npx skills add YogliB/happenin --skill happenin
```

For a global install, add the `-g` flag. You can also copy `skills/happenin/SKILL.md` from this repository into your agent's skills directory.

## `happenin install [--cursor] [--claude]`

Backs up and appends `happenin record` hooks to the agent's configuration files:

- `~/.cursor/hooks.json`
- `~/.claude/settings.json`

Backups are written to `~/.happenin/backups/`. By default both Cursor and Claude hooks are installed; use `--cursor` or `--claude` to target one.

## `happenin record <source> [event]`

The hook target. It reads a JSON payload from stdin, writes it to `~/.happenin/happenin.db`, and prints the required response the agent expects.

- `<source>` — `cursor` or `claude`.
- `[event]` — only required for Claude; Cursor payloads include `hook_event_name`.

Record an event directly by piping JSON to stdin:

```bash
echo '{"hook_event_name":"sessionStart","sessionId":"abc123","projectPath":"/path/to/project"}' | happenin record cursor

echo '{"sessionId":"abc123","projectPath":"/path/to/project"}' | happenin record claude SessionStart
```

### Field extraction

`record` extracts common fields from the raw payload before storing it:

| Stored field     | Payload keys searched (first match wins)                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `event`          | `hook_event_name` (Cursor only); otherwise the second CLI argument                              |
| `sessionId`      | `sessionId`, `session_id`; for `subagentStart` also `parent_conversation_id`, `conversation_id` |
| `happenedAt`     | `happenedAt`, `timestamp`, `happened_at`, `time`                                                |
| `projectPath`    | `projectPath`, `cwd`, `project_path`, `workspaceRoot`, `workspace_path`                         |
| `filePath`       | `filePath`, `file_path`, `path`                                                                 |
| `toolName`       | `toolName`, `tool_name`, `tool`                                                                 |
| `client`         | `client`; defaults to `cursor` or `claude_code`                                                 |
| `subagentId`     | `subagent_id` (Cursor `subagentStart` only)                                                     |
| `subagentType`   | `subagent_type` (Cursor `subagentStart` only)                                                   |
| `transcriptPath` | `transcript_path` (Cursor `subagentStart` only)                                                 |

For Cursor `subagentStart` payloads, `parent_conversation_id` and `conversation_id` are used as `sessionId` fallbacks so the subagent event groups with the main Cursor session. `conversation_id` and `parent_conversation_id` are not used as `sessionId` fallbacks for any other event.

The entire raw JSON is always stored in the `payload` column, so any field not extracted is still available.

### Required responses for blocking hooks

If the event is a blocking hook, `record` prints a JSON response to stdout so the agent can continue:

- **Cursor**
  - `beforeSubmitPrompt` → `{"continue":true}`
  - `preToolUse`, `beforeShellExecution`, `beforeMCPExecution`, `beforeReadFile`, `subagentStart` → `{"permission":"allow"}`
- **Claude**
  - `UserPromptSubmit`, `UserPromptExpansion` → `{"continue":true}`
  - `PreToolUse`, `PermissionRequest`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `Stop`, `WorktreeCreate`, `WorktreeRemove` → `{"decision":"approve"}`

Observer hooks produce no stdout output.

`record` is fail-open: if the database is locked by a concurrent operation (for example, the one-time backfill after an upgrade), it still prints the expected response for a blocking hook, but the event is not written to the database.

## `happenin import`

Imports existing transcripts:

- Claude Code JSONL from `~/.claude/projects/<project>/<session>.jsonl`
- Cursor `prompt_history.json` and `meta.json` from `~/.cursor/chats/<hash>/<session>/`

`store.db` is skipped because it is encrypted.

After upgrading, run `happenin import` or `happenin dashboard` once to migrate the database schema and backfill existing Cursor `subagentStart` rows with `subagentId`, `subagentType`, `transcriptPath`, and the correct `sessionId`.

## `happenin query [options]`

Query captured events and print them as JSON, JSONL, or a summary.

```bash
happenin query --source cursor --event sessionStart --limit 10
happenin query --q "subagent" --format jsonl
happenin query --session abc123 --format summary
```

- `--source <source>` — filter by `cursor` or `claude`.
- `--event <event>` — filter by event name.
- `--session <id>` — filter by session id (partial match).
- `--q <text>` — search event payloads.
- `--since <id>` — events with an id greater than `<id>`.
- `--limit <n>` — maximum rows (default `100`).
- `--offset <n>` — skip the first `<n>` rows.
- `--format <json|jsonl|summary>` — output format (default `json`).
- `--db <path>` — database path.

## `happenin dashboard [--port <port>] [--no-open] [--silent]`

Starts the local HTTP dashboard. Default port is `8765`.

```bash
happenin dashboard
happenin dashboard --port 9000 --no-open
```

Use `--no-open` or `--silent` to start without launching the browser.

## Environment variables

- `HAPPENIN_DB` — override the SQLite database path. Default: `~/.happenin/happenin.db`.
- `NO_COLOR` — disable colored help output.

## When to use

- To start recording events from an existing agent setup, run `happenin install` and restart the agent.
- To record a one-off event manually, pipe JSON to `happenin record <source> [event]`.
- To backfill existing agent transcripts, run `happenin import`.
- To inspect events, run `happenin query` or start `happenin dashboard`.
