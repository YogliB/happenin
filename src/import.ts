import type { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import {
	getDbPath,
	initDb,
	trackImport,
	getImportMtime,
	insertEvent,
	backfillSubagentMetadata,
} from "./db.js";
import type { Source } from "./types.js";

const CLAUDE_SOURCE: Source = "claude-transcript";
const CURSOR_SOURCE: Source = "cursor-transcript";
const CLAUDE_CLIENT = "claude_code";
const CURSOR_CLIENT = "cursor";

const readDir = (dir: string) => {
	try {
		// oxlint-disable-next-line security/detect-non-literal-fs-filename -- path is from home or fs walk, not user input
		return readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
};

const readText = (file: string): string | undefined => {
	try {
		// oxlint-disable-next-line security/detect-non-literal-fs-filename -- path is from fs walk, not user input
		return readFileSync(file, "utf8");
	} catch {
		return undefined;
	}
};

const fileMtime = (file: string): number | undefined => {
	try {
		// oxlint-disable-next-line security/detect-non-literal-fs-filename -- path is from fs walk, not user input
		return Math.floor(statSync(file).mtimeMs);
	} catch {
		return undefined;
	}
};

const readImportFile = (
	db: DatabaseSync,
	filePath: string,
): { content: string; mtime: number } | undefined => {
	const mtime = fileMtime(filePath);
	if (mtime === undefined) return undefined;
	const previous = getImportMtime(db, filePath);
	if (previous === mtime) return undefined;
	const content = readText(filePath);
	if (content === undefined) return undefined;
	return { content, mtime };
};

function findJsonlFiles(dir: string): string[] {
	const paths: string[] = [];
	for (const entry of readDir(dir)) {
		if (entry.isSymbolicLink()) continue;
		const child = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			paths.push(...findJsonlFiles(child));
		} else if (entry.isFile() && entry.name.endsWith(".jsonl") && entry.name !== "store.db") {
			paths.push(child);
		}
	}
	return paths;
}

function findCursorChatDirs(dir: string): string[] {
	const paths: string[] = [];
	for (const hash of readDir(dir)) {
		if (!hash.isDirectory() || hash.isSymbolicLink()) continue;
		const hashPath = path.join(dir, hash.name);
		for (const session of readDir(hashPath)) {
			if (session.isDirectory() && !session.isSymbolicLink()) {
				paths.push(path.join(hashPath, session.name));
			}
		}
	}
	return paths;
}

async function importClaudeJsonl(db: DatabaseSync, filePath: string): Promise<void> {
	const found = readImportFile(db, filePath);
	if (found === undefined) return;
	const { content, mtime } = found;

	const sessionFallback = path.basename(filePath, ".jsonl");

	const records: { obj: Record<string, unknown>; line: string }[] = [];
	for (const line of content.split(/\r?\n/)) {
		if (line.trim().length === 0) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			continue;
		}
		if (typeof parsed === "object" && parsed !== null) {
			records.push({ obj: parsed as Record<string, unknown>, line });
		}
	}

	db.prepare("DELETE FROM events WHERE source = ? AND source_path = ?").run(
		CLAUDE_SOURCE,
		filePath,
	);

	for (const { obj, line } of records) {
		insertEvent(db, {
			source: CLAUDE_SOURCE,
			client: CLAUDE_CLIENT,
			event: typeof obj.type === "string" ? obj.type : "transcript",
			sessionId: typeof obj.sessionId === "string" ? obj.sessionId : sessionFallback,
			happenedAt:
				typeof obj.timestamp === "string"
					? obj.timestamp
					: typeof obj.timestamp === "number"
						? String(obj.timestamp)
						: undefined,
			projectPath: typeof obj.cwd === "string" ? obj.cwd : undefined,
			payload: line,
			sourcePath: filePath,
		});
	}

	trackImport(db, filePath, mtime);
}

async function importClaudeTranscripts(db: DatabaseSync): Promise<void> {
	const dir = path.resolve(homedir(), ".claude/projects");
	for (const file of findJsonlFiles(dir)) {
		await importClaudeJsonl(db, file);
	}
}

async function importCursorPromptHistory(
	db: DatabaseSync,
	filePath: string,
	sessionId: string,
): Promise<void> {
	const found = readImportFile(db, filePath);
	if (found === undefined) return;
	const { content, mtime } = found;

	let prompts: unknown[] = [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		return;
	}
	if (Array.isArray(parsed)) prompts = parsed;

	db.prepare("DELETE FROM events WHERE source = ? AND source_path = ?").run(
		CURSOR_SOURCE,
		filePath,
	);

	for (const prompt of prompts) {
		if (typeof prompt !== "string") continue;
		insertEvent(db, {
			source: CURSOR_SOURCE,
			client: CURSOR_CLIENT,
			event: "prompt",
			sessionId,
			payload: JSON.stringify({ prompt }),
			sourcePath: filePath,
		});
	}

	trackImport(db, filePath, mtime);
}

async function importCursorMeta(
	db: DatabaseSync,
	filePath: string,
	sessionId: string,
): Promise<void> {
	const found = readImportFile(db, filePath);
	if (found === undefined) return;
	const { content, mtime } = found;

	db.prepare("DELETE FROM events WHERE source = ? AND source_path = ?").run(
		CURSOR_SOURCE,
		filePath,
	);

	insertEvent(db, {
		source: CURSOR_SOURCE,
		client: CURSOR_CLIENT,
		event: "session_meta",
		sessionId,
		payload: content,
		sourcePath: filePath,
	});

	trackImport(db, filePath, mtime);
}

async function importCursorSession(db: DatabaseSync, sessionPath: string): Promise<void> {
	const sessionId = path.basename(sessionPath);
	await importCursorPromptHistory(db, path.join(sessionPath, "prompt_history.json"), sessionId);
	await importCursorMeta(db, path.join(sessionPath, "meta.json"), sessionId);
}

async function importCursorTranscripts(db: DatabaseSync): Promise<void> {
	const dir = path.resolve(homedir(), ".cursor/chats");
	for (const session of findCursorChatDirs(dir)) {
		await importCursorSession(db, session);
	}
}

export async function runImport(_argv?: string[]): Promise<void> {
	const dbPath = getDbPath();
	const db = initDb(dbPath);
	try {
		backfillSubagentMetadata(db);
		await importTranscripts(db);
	} finally {
		db.close();
	}
}

export async function importTranscripts(db: DatabaseSync): Promise<void> {
	await importClaudeTranscripts(db);
	await importCursorTranscripts(db);
}
