# 1 - ALTERNATIVES: Distinguish Cursor main sessions from subagent sessions

## Goal

Choose how happenin can identify whether a Cursor session is a main (parent) session or a subagent (child) session.

## Options

### Option 1: Inspect and parse live hook payload fields

**Idea:** Capture a sample Cursor hook payload (e.g., from `subagentStart` or `sessionStart`) and inspect it for parent/child markers such as `parentSessionId`, `subagentSessionId`, `isSubagent`, `sessionKind`, `agentType`, or `role`. If any are present, extend `record.ts` to extract `parentSessionId` and `sessionKind`, add matching DB columns, and expose them in the dashboard.

**Snippet:**

```ts
const parentSessionId = asString(
	payload.parentSessionId ?? payload.parent_session_id ?? payload.subagentSessionId,
);
const sessionKind = asString(
	payload.sessionKind ??
		payload.agentType ??
		(payload.isSubagent === true ? "subagent" : payload.isSubagent === false ? "main" : undefined),
);
```

**Pros:**

- Real-time and automatic.
- Accurate if Cursor exposes the fields.
- Uses actual Cursor metadata.

**Cons:**

- Requires Cursor to send these fields; may not.
- Field names may change across Cursor versions.
- Needs schema migration and dashboard changes.

### Option 2: Inspect and parse Cursor `meta.json` on import

**Idea:** Capture a sample `meta.json` from a Cursor chat directory (`~/.cursor/chats/<hash>/<session>/meta.json`) and inspect it for parent/child markers. If found, parse them in `import.ts` and persist to the DB. This works for historical data without changing hooks.

**Snippet:**

```ts
const meta = JSON.parse(content);
const parentSessionId = asString(meta.parentId ?? meta.parentSessionId ?? meta.parent_id);
const sessionKind = asString(
	meta.sessionKind ??
		meta.conversationType ??
		(meta.isSubagent === true ? "subagent" : meta.isSubagent === false ? "main" : undefined),
);
```

**Pros:**

- Works on existing transcripts; can backfill.
- No hook changes.

**Cons:**

- Only applies to imported sessions, not live events.
- Fields may not exist in `meta.json`.
- Still needs schema changes if persisted beyond the raw payload.

### Option 3: Manual / rule-based session tagging in the dashboard

**Idea:** If Cursor does not expose reliable parent/child metadata, let the user annotate sessions in the UI or define saved search rules (e.g., any session whose raw payload contains `"isSubagent":true`). Store tags in a `session_tags` table keyed by `sessionId` and source, and show them in the dashboard.

**Snippet:**

```ts
function tagSession(sessionId: string, source: string, tag: string) {
	db.prepare("INSERT OR REPLACE INTO session_tags (session_id, source, tag) VALUES (?, ?, ?)").run(
		sessionId,
		source,
		tag,
	);
}
```

**Pros:**

- Works regardless of Cursor's payload shape.
- Gives the user explicit control.
- No dependency on undocumented Cursor fields.

**Cons:**

- Manual or regex-based.
- Not automatic.
- Rules may be too broad or drift.

## Review findings

### Initial review

```text
### Alternatives Review Findings

option:1: missing-context: The proposal does not verify whether Cursor actually sends parentSessionId, isSubagent, or sessionKind fields in hook payloads. Verify by inspecting actual hook payload samples or Cursor documentation before committing to this approach.

option:2: missing-context: The proposal assumes meta.json contains parent_id, isSubagent, or conversationType fields without evidence. Inspect actual meta.json files from ~/.cursor/chats/ to confirm field availability before implementation.

option:3: weak: The heuristic logic is fundamentally flawed: subagentStart/subagentStop are events that occur inside a main session, not separate sessions. A session containing subagentStart is a main session that launched a subagent, not a subagent itself. This option misinterprets the event model.

option:3: unjustified: The snippet's logic (hasSubagentStart && hasSessionStart === 'main') is arbitrary and not grounded in Cursor's actual session architecture. No evidence is provided that subagent sessions have distinct sessionIds or that they lack sessionStart events.

totals: 0 irrelevant 0 duplicate 2 weak 0 strawman 2 missing-context 1 unjustified | verdict: needs-revision
```

### Triage

- `option:1: missing-context` → **valid**. Added an explicit first step: inspect real Cursor hook payloads to confirm field names before coding.
- `option:2: missing-context` → **valid**. Added an explicit first step: inspect real `meta.json` files to confirm field availability.
- `option:3: weak` → **valid**. Replaced the flawed heuristic with manual/rule-based tagging.
- `option:3: unjustified` → **valid**. Replaced the arbitrary snippet with a simple `session_tags` insertion example.

### Re-review

```text
### Alternatives Review Findings

Lean & valid. Ship.
```

## Recommendation

**Option 1 first**: inspect a real Cursor `subagentStart`/`sessionStart` hook payload for parent/child fields. If fields exist, implement extraction in `record.ts` and the dashboard. If live payloads do not contain the data, try **Option 2** (`meta.json` import). If neither source exposes it, use **Option 3** (manual tagging) or accept the limitation.

## Data gathered

- `subagentStart` payload keys: `conversation_id`, `parent_conversation_id`, `subagent_id`, `subagent_type`, `subagent_model`, `transcript_path`, `is_background_agent`, `is_parallel_worker`.
- `parent_conversation_id` equals `conversation_id`, which equals the main `session_id`. No separate `sessionId` for a subagent appears in hook events.
- `transcript_path` points to `~/.cursor/projects/<project>/agent-transcripts/<conversation>/<conversation>.jsonl`. The file contains `{role, message}` lines, no session IDs, and is shared/overwritten for subagent runs within the same parent conversation.
- No `subagentStop` events were recorded.
- `cursor-transcript` `meta.json` and imported `meta.json` contain no parent/child metadata; subagent transcripts are not currently imported.

## Decision

**Proceed with a modified Option 1.** Extract `subagent_id`, `subagent_type`, and `transcript_path` from `subagentStart` payloads at record time. Add these fields to the `events` schema and expose them in the dashboard so a `subagentStart` is clearly visible as a subagent run inside a main session. Defer importing the separate subagent transcript files to a follow-up unless the initial implementation is small.
