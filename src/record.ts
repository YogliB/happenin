import process from "node:process";
import { initDb, insertEvent } from "./db.js";
import { DEFAULT_RESPONSES } from "./constants.js";
import type { EventInsert, Source } from "./types.js";

function asString(value: unknown): string | undefined {
	if (value === null || value === undefined) {
		return undefined;
	}
	if (typeof value === "object") {
		return undefined;
	}
	const s = String(value).trim();
	return s.length > 0 ? s : undefined;
}

function asWhen(value: unknown): string | undefined {
	if (typeof value === "number") {
		return new Date(value).toISOString();
	}
	if (typeof value === "string" && value.length > 0) {
		if (/^\d+$/.test(value)) {
			return new Date(Number(value)).toISOString();
		}
		return value;
	}
	return undefined;
}

export function recordFromRaw(argv: string[], raw: string, dbPath?: string): string | undefined {
	if (raw.length === 0) {
		return undefined;
	}

	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return undefined;
	}

	const source = argv[0];
	if (source !== "cursor" && source !== "claude") {
		return undefined;
	}

	let event: string | undefined;
	if (source === "cursor") {
		event = asString(payload.hook_event_name);
	} else {
		event = argv[1];
	}

	const sessionId = asString(payload.sessionId ?? payload.session_id);
	const happenedAt = asWhen(
		payload.happenedAt ?? payload.timestamp ?? payload.happened_at ?? payload.time,
	);
	const projectPath = asString(
		payload.projectPath ??
			payload.cwd ??
			payload.project_path ??
			payload.workspaceRoot ??
			payload.workspace_path,
	);
	const filePath = asString(payload.filePath ?? payload.file_path ?? payload.path);
	const toolName = asString(payload.toolName ?? payload.tool_name ?? payload.tool);
	const client = asString(payload.client) ?? (source === "cursor" ? "cursor" : "claude_code");

	const insert: EventInsert = {
		source: source as Source,
		client,
		event,
		sessionId,
		happenedAt,
		projectPath,
		filePath,
		toolName,
		payload: raw,
	};

	const db = initDb(dbPath);
	insertEvent(db, insert);

	return DEFAULT_RESPONSES(source as Source, event ?? "");
}

export async function runRecord(argv: string[]): Promise<void> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8"));
	}
	const raw = Buffer.concat(chunks).toString("utf8").trim();
	const response = recordFromRaw(argv, raw);
	if (response !== undefined) {
		process.stdout.write(`${response}\n`);
	}
}
