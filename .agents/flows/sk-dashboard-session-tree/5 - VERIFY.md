# Verify: Dashboard session tree

## Commands run

```bash
nub run typecheck
nub run build
nub run test:ci
nub run lint:ci
nub run format:ci
nub run duplicates:ci
nub run knip:ci
```

## Results

| Check      | Result                       |
| ---------- | ---------------------------- |
| typecheck  | ✅                           |
| build      | ✅                           |
| test:ci    | ✅ 204 passed, 100% coverage |
| lint:ci    | ✅                           |
| format:ci  | ✅                           |
| duplicates | ✅ 0 clones                  |
| knip       | ✅                           |

## Manual end-to-end verification

Created a fresh `HAPPENIN_DB`, recorded a parent session plus two subagents, and started the dashboard:

```bash
HAPPENIN_DB=/tmp/verifyhome/happenin.db HOME=/tmp/verifyhome node dist/bin.js record cursor <<'EOF'
{"hook_event_name":"sessionStart","sessionId":"parent-session","projectPath":"/tmp/verify"}
EOF
HAPPENIN_DB=/tmp/verifyhome/happenin.db HOME=/tmp/verifyhome node dist/bin.js record cursor <<'EOF'
{"hook_event_name":"subagentStart","parent_conversation_id":"parent-session","subagent_id":"sub-shell","subagent_type":"shell","projectPath":"/tmp/verify"}
EOF
HAPPENIN_DB=/tmp/verifyhome/happenin.db HOME=/tmp/verifyhome node dist/bin.js record cursor <<'EOF'
{"hook_event_name":"subagentStart","parent_conversation_id":"parent-session","subagent_id":"sub-edit","subagent_type":"edit","projectPath":"/tmp/verify"}
EOF
HAPPENIN_DB=/tmp/verifyhome/happenin.db HOME=/tmp/verifyhome node dist/bin.js dashboard --no-open --port 8766
```

Curl of `/fragments/sessions?range=all` returned:

- `<li class="session-item session-parent" data-session="parent-session" …>`
- `<button type="button" class="session-toggle" …>▸</button>`
- `<ul class="session-children">` containing:
  - `data-subagent="sub-edit"` with `<span class="subagent-type-badge">edit</span>`
  - `data-subagent="sub-shell"` with `<span class="subagent-type-badge">shell</span>`

The session tree renders as intended.
