import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { initDb, getEvents, getSummary, countEvents } from "./db.js";
import { eventView } from "./view.js";
import type { FilterOptions } from "./types.js";

type Format = "json" | "jsonl" | "summary";

const FORMATS: Format[] = ["json", "jsonl", "summary"];

function parseInteger(value: string): number | undefined {
	const n = Number(value);
	if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return undefined;
	return n;
}

function parsePositiveInteger(value: string): number | undefined {
	const n = parseInteger(value);
	return n === undefined || n === 0 ? undefined : n;
}

function showHelp(): void {
	process.stdout.write(`Usage: happenin query [options]

Options:
  --source <source>    filter by source (cursor, claude, ...)
  --event <event>      filter by event name
  --session <id>       filter by session id (partial match)
  --q <text>           search event payloads
  --since <id>         events with id greater than <id>
  --limit <n>          maximum rows to return (default: 100)
  --offset <n>         skip first <n> rows
  --format <format>    output format: json (default), jsonl, summary
  --db <path>          database path (default: HAPPENIN_DB or ~/.happenin/happenin.db)
  -h, --help           show this help
`);
}

function parseFilterArgs(argv: string[]): {
	options: FilterOptions;
	format: Format;
	dbPath?: string;
	help: boolean;
} {
	const options: FilterOptions = {};
	let format: Format = "json";
	let dbPath: string | undefined;
	let help = false;
	let nextIs: string | undefined;

	for (const arg of argv) {
		if (nextIs) {
			switch (nextIs) {
				case "source":
					options.source = arg;
					break;
				case "event":
					options.event = arg;
					break;
				case "session":
					options.sessionId = arg;
					break;
				case "q":
					options.q = arg;
					break;
				case "since": {
					const n = parseInteger(arg);
					if (n !== undefined) options.since = n;
					break;
				}
				case "limit": {
					const n = parsePositiveInteger(arg);
					if (n !== undefined) options.limit = n;
					break;
				}
				case "offset": {
					const n = parseInteger(arg);
					if (n !== undefined) options.offset = n;
					break;
				}
				case "format":
					if (FORMATS.includes(arg as Format)) {
						format = arg as Format;
					}
					break;
				case "db":
					dbPath = arg;
					break;
			}
			nextIs = undefined;
			continue;
		}

		if (arg === "-h" || arg === "--help") {
			help = true;
			continue;
		}

		if (
			arg === "--source" ||
			arg === "--event" ||
			arg === "--session" ||
			arg === "--q" ||
			arg === "--since" ||
			arg === "--limit" ||
			arg === "--offset" ||
			arg === "--format" ||
			arg === "--db"
		) {
			nextIs = arg.slice(2);
			continue;
		}

		if (arg.startsWith("--")) {
			const eq = arg.indexOf("=");
			if (eq !== -1) {
				const key = arg.slice(2, eq);
				const value = arg.slice(eq + 1);
				switch (key) {
					case "source":
						options.source = value;
						break;
					case "event":
						options.event = value;
						break;
					case "session":
						options.sessionId = value;
						break;
					case "q":
						options.q = value;
						break;
					case "since": {
						const n = parseInteger(value);
						if (n !== undefined) options.since = n;
						break;
					}
					case "limit": {
						const n = parsePositiveInteger(value);
						if (n !== undefined) options.limit = n;
						break;
					}
					case "offset": {
						const n = parseInteger(value);
						if (n !== undefined) options.offset = n;
						break;
					}
					case "format":
						if (FORMATS.includes(value as Format)) {
							format = value as Format;
						}
						break;
					case "db":
						dbPath = value;
						break;
				}
			}
		}
	}

	return { options, format, dbPath, help };
}

export async function runWithDb(
	argv: string[],
	printHelp: () => void,
	run: (db: DatabaseSync, options: FilterOptions, format: Format) => void | Promise<void>,
): Promise<void> {
	const { options, format, dbPath, help } = parseFilterArgs(argv);
	if (help) {
		printHelp();
		return;
	}
	const db = initDb(dbPath);
	try {
		await run(db, options, format);
	} finally {
		db.close();
	}
}

export async function runQuery(argv: string[]): Promise<void> {
	await runWithDb(argv, showHelp, (db, options, format) => {
		if (format === "summary") {
			const summary = getSummary(db, options);
			process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
			return;
		}

		const total = countEvents(db, options);
		const rows = getEvents(db, options);
		const output = { total, rows: rows.map(eventView) };

		if (format === "jsonl") {
			for (const row of output.rows) {
				process.stdout.write(`${JSON.stringify(row)}\n`);
			}
		} else {
			process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
		}
	});
}
