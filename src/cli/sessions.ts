import process from "node:process";
import { getFilteredSessions } from "../shared/db.js";
import { runWithDb } from "./query.js";
import type { Session } from "../shared/types.js";

function showHelp(): void {
	process.stdout.write(`Usage: happenin sessions [options]

Options:
  --source <source>    filter by source (cursor, claude, ...)
  --event <event>      filter by event name
  --session <id>       filter by session id (partial match)
  --q <text>           search event payloads and session ids
  --since <id>         events with id greater than <id>
  --range <range>      time range: 24h, 7d, 30d (default: 24h)
  --status <status>    filter by session status: active, completed, failed
  --tool <tool>        filter by tool name
  --minDuration <m>    minimum session duration in minutes
  --maxDuration <m>    maximum session duration in minutes
  --limit <n>          maximum sessions to return (default: 100)
  --offset <n>         skip first <n> sessions
  --format <format>    output format: json (default), jsonl, summary
  --db <path>          database path (default: HAPPENIN_DB or ~/.happenin/happenin.db)
  -h, --help           show this help
`);
}

function formatSummary(sessions: Session[]): string {
	return sessions
		.map((s) => {
			const duration = `${Math.floor(s.durationMs / 1000)}s`;
			const id = s.sessionId ?? "no-session";
			const firstAt = s.firstAt ?? "?";
			const lastAt = s.lastAt ?? "?";
			const project = s.projectPath ?? "-";
			const tools = s.tools.join(",") || "-";
			return `${id}\t${firstAt}\t${lastAt}\t${duration}\t${s.eventCount} events\tproject:${project}\ttools:${tools}\tfailures:${s.failureCount}`;
		})
		.join("\n");
}

export async function runSessions(argv: string[]): Promise<void> {
	await runWithDb(
		argv,
		showHelp,
		(db, options, format) => {
			const sessions = getFilteredSessions(db, options);
			if (format === "jsonl") {
				for (const s of sessions) {
					process.stdout.write(`${JSON.stringify(s)}\n`);
				}
				return;
			}
			if (format === "summary") {
				process.stdout.write(`${formatSummary(sessions)}\n`);
				return;
			}
			process.stdout.write(`${JSON.stringify(sessions, null, 2)}\n`);
		},
		true,
	);
}
