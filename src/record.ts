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

function firstString(value: unknown): string | undefined {
	const s = asString(value);
	if (s !== undefined) return s;
	if (Array.isArray(value)) {
		for (const item of value) {
			const itemString = asString(item);
			if (itemString !== undefined) return itemString;
		}
	}
	return undefined;
}

export function isBusyError(err: unknown): boolean {
	if (typeof err !== "object" || err === null) return false;
	const e = err as { code?: string; errcode?: number };
	const code = e.errcode ?? 0;
	return e.code === "ERR_SQLITE_ERROR" && ((code & 0xff) === 5 || (code & 0xff) === 6);
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

	const shouldExtractSubagent = source === "cursor" && event === "subagentStart";

	const sessionId = shouldExtractSubagent
		? (asString(payload.parent_conversation_id) ??
			asString(payload.conversation_id) ??
			asString(payload.sessionId) ??
			asString(payload.session_id))
		: (asString(payload.sessionId) ?? asString(payload.session_id));
	const happenedAt = asWhen(
		payload.happenedAt ??
			payload.timestamp ??
			payload.happened_at ??
			payload.time ??
			payload.ts ??
			payload.createdAt ??
			payload.created_at,
	);
	const projectPath =
		asString(payload.projectPath) ??
		asString(payload.cwd) ??
		asString(payload.project_path) ??
		firstString(payload.workspaceRoot) ??
		firstString(payload.workspaceRoots) ??
		firstString(payload.workspace_roots) ??
		firstString(payload.workspace_root) ??
		asString(payload.workspace_path);
	const filePath = asString(payload.filePath ?? payload.file_path ?? payload.path);
	const toolName = asString(payload.toolName ?? payload.tool_name ?? payload.tool);
	const client = asString(payload.client) ?? (source === "cursor" ? "cursor" : "claude_code");

	const subagentId = shouldExtractSubagent ? asString(payload.subagent_id) : undefined;
	const subagentType = shouldExtractSubagent ? asString(payload.subagent_type) : undefined;
	const transcriptPath = shouldExtractSubagent ? asString(payload.transcript_path) : undefined;

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
		subagentId,
		subagentType,
		transcriptPath,
	};

	const response = DEFAULT_RESPONSES(source as Source, event ?? "");
	let db: ReturnType<typeof initDb> | undefined;
	try {
		db = initDb(dbPath, 500);
		insertEvent(db, insert);
	} catch (err) {
		if (isBusyError(err)) {
			console.warn("happenin: dropping event due to database lock", err);
		} else {
			throw err;
		}
	} finally {
		try {
			db?.close();
		} catch {}
	}

	return response;
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
