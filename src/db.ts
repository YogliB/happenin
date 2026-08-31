import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_DB_DIR, DEFAULT_DB_NAME } from "./constants.js";
import type { EventInsert, EventRow, FilterOptionLists, FilterOptions } from "./types.js";

const eventsColumns = `
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	source TEXT NOT NULL,
	client TEXT,
	event TEXT,
	session_id TEXT,
	happened_at TEXT,
	received_at INTEGER NOT NULL,
	project_path TEXT,
	file_path TEXT,
	tool_name TEXT,
	payload TEXT NOT NULL,
	source_path TEXT
`;

const indexes = [
	"CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);",
	"CREATE INDEX IF NOT EXISTS idx_events_event ON events(event);",
	"CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);",
	"CREATE INDEX IF NOT EXISTS idx_events_happened_at ON events(happened_at);",
	"CREATE INDEX IF NOT EXISTS idx_events_received_at ON events(received_at);",
	"CREATE INDEX IF NOT EXISTS idx_events_source_path ON events(source_path);",
];

const insertEventSql = `
	INSERT INTO events (
		source,
		client,
		event,
		session_id,
		happened_at,
		received_at,
		project_path,
		file_path,
		tool_name,
		payload,
		source_path
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const selectEventSql = `
	SELECT
		id,
		source,
		client,
		event,
		session_id AS sessionId,
		happened_at AS happenedAt,
		received_at AS receivedAt,
		project_path AS projectPath,
		file_path AS filePath,
		tool_name AS toolName,
		payload,
		source_path AS sourcePath
	FROM events
`;

export const getDbPath = (): string => {
	if (process.env.HAPPENIN_DB) {
		return process.env.HAPPENIN_DB;
	}
	return path.join(homedir(), DEFAULT_DB_DIR, DEFAULT_DB_NAME);
};

export const initDb = (dbPath?: string): DatabaseSync => {
	const resolvedPath = dbPath ?? getDbPath();
	// oxlint-disable-next-line security/detect-non-literal-fs-filename -- database path is from home or HAPPENIN_DB
	mkdirSync(path.dirname(resolvedPath), { recursive: true });

	const db = new DatabaseSync(resolvedPath);
	db.exec("PRAGMA journal_mode = WAL;");
	db.exec(`CREATE TABLE IF NOT EXISTS events (${eventsColumns});`);
	db.exec(`
		CREATE TABLE IF NOT EXISTS imports (
			path TEXT PRIMARY KEY,
			mtime INTEGER NOT NULL,
			imported_at INTEGER NOT NULL
		);
	`);
	for (const indexSql of indexes) {
		db.exec(indexSql);
	}
	return db;
};

export const insertEvent = (db: DatabaseSync, event: EventInsert): void => {
	const stmt = db.prepare(insertEventSql);
	stmt.run(
		event.source,
		event.client ?? null,
		event.event ?? null,
		event.sessionId ?? null,
		event.happenedAt ?? null,
		Date.now(),
		event.projectPath ?? null,
		event.filePath ?? null,
		event.toolName ?? null,
		event.payload,
		event.sourcePath ?? null,
	);
};

function buildWhereClause(options: FilterOptions): {
	clause: string;
	params: (string | number | null)[];
} {
	const conditions: string[] = [];
	const params: (string | number | null)[] = [];

	if (options.since !== undefined) {
		conditions.push("id > ?");
		params.push(options.since);
	}
	if (options.source !== undefined) {
		conditions.push("source = ?");
		params.push(options.source);
	}
	if (options.event !== undefined) {
		conditions.push("event = ?");
		params.push(options.event);
	}
	if (options.sessionId !== undefined && options.sessionId !== "") {
		conditions.push("session_id LIKE ?");
		params.push(`%${options.sessionId}%`);
	}
	if (options.q !== undefined && options.q !== "") {
		conditions.push("payload LIKE ?");
		params.push(`%${options.q}%`);
	}

	const clause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
	return { clause, params };
}

export const getEvents = (db: DatabaseSync, options: FilterOptions): EventRow[] => {
	const { clause, params } = buildWhereClause(options);
	const limit = options.limit ?? 100;
	const offset = options.offset ?? 0;
	const sql = `${selectEventSql} ${clause} ORDER BY id DESC LIMIT ?${offset > 0 ? " OFFSET ?" : ""}`;
	params.push(limit);
	if (offset > 0) {
		params.push(offset);
	}

	const stmt = db.prepare(sql);
	return stmt.all(...params) as unknown as EventRow[];
};

export const countEvents = (db: DatabaseSync, options: FilterOptions): number => {
	const { clause, params } = buildWhereClause(options);
	const sql = `SELECT COUNT(*) AS count FROM events ${clause}`;
	const stmt = db.prepare(sql);
	const row = stmt.get(...params) as { count: number | bigint } | undefined;
	return row ? Number(row.count) : 0;
};

type Summary = {
	total: number;
	bySource: { source: string; count: number }[];
	byEvent: { event: string; count: number }[];
	bySession: {
		sessionId: string | null;
		count: number;
		firstAt: string | null;
		lastAt: string | null;
	}[];
};

export const getSummary = (db: DatabaseSync, options: FilterOptions): Summary => {
	const { clause, params } = buildWhereClause(options);
	const total = countEvents(db, options);

	const bySource = db
		.prepare(
			`SELECT source, COUNT(*) AS count FROM events ${clause} GROUP BY source ORDER BY count DESC`,
		)
		.all(...params) as { source: string; count: number }[];

	const byEvent = db
		.prepare(
			`SELECT event, COUNT(*) AS count FROM events ${clause} GROUP BY event ORDER BY count DESC`,
		)
		.all(...params) as { event: string; count: number }[];

	const bySession = db
		.prepare(
			`SELECT session_id AS sessionId, COUNT(*) AS count, MIN(happened_at) AS firstAt, MAX(happened_at) AS lastAt FROM events ${clause} GROUP BY session_id ORDER BY count DESC`,
		)
		.all(...params) as {
		sessionId: string | null;
		count: number;
		firstAt: string | null;
		lastAt: string | null;
	}[];

	return { total, bySource, byEvent, bySession };
};

export const getLastEventId = (db: DatabaseSync): number => {
	const stmt = db.prepare("SELECT id FROM events ORDER BY id DESC LIMIT 1");
	const row = stmt.get() as { id: number | bigint } | undefined;
	return row ? Number(row.id) : 0;
};

export const getFilterOptions = (db: DatabaseSync): FilterOptionLists => {
	const eventRows = db
		.prepare(
			"SELECT DISTINCT event FROM events WHERE event IS NOT NULL AND event <> '' ORDER BY event",
		)
		.all() as { event: string }[];

	return {
		sources: ["claude", "cursor"],
		events: eventRows.map((row) => row.event),
	};
};

export const getEventById = (db: DatabaseSync, id: number): EventRow | undefined => {
	const stmt = db.prepare(`${selectEventSql} WHERE id = ?`);
	return stmt.get(id) as unknown as EventRow | undefined;
};

export const trackImport = (db: DatabaseSync, filePath: string, mtime: number): void => {
	const stmt = db.prepare(`
		INSERT INTO imports (path, mtime, imported_at)
		VALUES (?, ?, ?)
		ON CONFLICT(path) DO UPDATE SET
			mtime = excluded.mtime,
			imported_at = excluded.imported_at
	`);
	stmt.run(filePath, mtime, Date.now());
};

export const getImportMtime = (db: DatabaseSync, filePath: string): number | undefined => {
	const stmt = db.prepare("SELECT mtime FROM imports WHERE path = ?");
	const row = stmt.get(filePath) as { mtime: number | bigint } | undefined;
	return row ? Number(row.mtime) : undefined;
};
