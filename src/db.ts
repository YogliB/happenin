import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_DB_DIR, DEFAULT_DB_NAME } from "./constants.js";
import type { EventInsert, EventRow, FilterOptionLists, FilterOptions, Session } from "./types.js";

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
	source_path TEXT,
	subagent_id TEXT,
	subagent_type TEXT,
	transcript_path TEXT
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
		source_path,
		subagent_id,
		subagent_type,
		transcript_path
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
		source_path AS sourcePath,
		subagent_id AS subagentId,
		subagent_type AS subagentType,
		transcript_path AS transcriptPath
	FROM events
`;

export function getUserVersion(db: DatabaseSync): number {
	const row = db.prepare("PRAGMA user_version").get() as { user_version: number } | undefined;
	return Number(row?.user_version ?? 0);
}

export function ensureSubagentColumns(db: DatabaseSync): void {
	let version = getUserVersion(db);
	if (version >= 1) return;

	db.exec("BEGIN IMMEDIATE;");
	version = getUserVersion(db);
	if (version >= 1) {
		db.exec("ROLLBACK;");
		return;
	}

	try {
		const columns = db.prepare("PRAGMA table_info(events)").all() as { name: string }[];
		const names = new Set(columns.map((col) => col.name));
		const addColumn = (col: string): void => {
			if (!names.has(col)) {
				db.exec(`ALTER TABLE events ADD COLUMN ${col} TEXT;`);
			}
		};
		addColumn("subagent_id");
		addColumn("subagent_type");
		addColumn("transcript_path");
		db.exec("PRAGMA user_version = 1;");
		db.exec("COMMIT;");
	} catch (err) {
		try {
			db.exec("ROLLBACK;");
		} catch {}
		throw err;
	}
}

export const backfillDerivedFields = (db: DatabaseSync): void => {
	let version = getUserVersion(db);
	if (version >= 2) return;

	db.exec("BEGIN IMMEDIATE;");
	version = getUserVersion(db);
	if (version >= 2) {
		db.exec("ROLLBACK;");
		return;
	}

	try {
		const missing = db
			.prepare(
				"SELECT id, payload FROM events WHERE happened_at IS NULL AND json_valid(payload) = 1",
			)
			.all() as { id: number; payload: string }[];
		const updateHappenedAt = db.prepare("UPDATE events SET happened_at = ? WHERE id = ?");
		for (const row of missing) {
			const payload = JSON.parse(row.payload);
			const happenedAt = firstHappenedAtPayload(payload);
			if (happenedAt !== undefined) {
				updateHappenedAt.run(happenedAt, row.id);
			}
		}

		db.exec(`
			UPDATE events
			SET happened_at = strftime('%Y-%m-%dT%H:%M:%fZ', received_at / 1000.0, 'unixepoch')
			WHERE happened_at IS NULL;
		`);
		db.exec(`
			UPDATE events
			SET happened_at = strftime('%Y-%m-%dT%H:%M:%fZ', happened_at / 1000.0, 'unixepoch')
			WHERE happened_at NOT GLOB '*[^0-9]*' AND length(happened_at) > 0;
		`);
		db.exec(`
			UPDATE events
			SET project_path = COALESCE(
				NULLIF(trim(json_extract(payload, '$.projectPath')), ''),
				NULLIF(trim(json_extract(payload, '$.cwd')), ''),
				NULLIF(trim(json_extract(payload, '$.project_path')), ''),
				(SELECT trim(value) FROM json_each(payload, '$.workspaceRoot') WHERE typeof(value) = 'text' AND trim(value) <> '' LIMIT 1),
				(SELECT trim(value) FROM json_each(payload, '$.workspaceRoots') WHERE typeof(value) = 'text' AND trim(value) <> '' LIMIT 1),
				(SELECT trim(value) FROM json_each(payload, '$.workspace_roots') WHERE typeof(value) = 'text' AND trim(value) <> '' LIMIT 1),
				(SELECT trim(value) FROM json_each(payload, '$.workspace_root') WHERE typeof(value) = 'text' AND trim(value) <> '' LIMIT 1),
				NULLIF(trim(json_extract(payload, '$.workspace_path')), '')
			)
			WHERE
				project_path IS NULL
				AND json_valid(payload) = 1;
		`);
		db.exec("PRAGMA user_version = 2;");
		db.exec("COMMIT;");
	} catch (err) {
		try {
			db.exec("ROLLBACK;");
		} catch {}
		throw err;
	}
};

export const backfillSubagentMetadata = (db: DatabaseSync): void => {
	let version = getUserVersion(db);
	if (version < 1) {
		throw new Error("Database schema must be migrated before backfilling subagent metadata");
	}

	db.exec("BEGIN IMMEDIATE;");
	version = getUserVersion(db);
	if (version < 1) {
		db.exec("ROLLBACK;");
		return;
	}

	try {
		db.exec(`
			UPDATE events
			SET
				subagent_id = NULLIF(trim(json_extract(payload, '$.subagent_id')), ''),
				subagent_type = NULLIF(trim(json_extract(payload, '$.subagent_type')), ''),
				transcript_path = NULLIF(trim(json_extract(payload, '$.transcript_path')), ''),
				session_id = COALESCE(
					NULLIF(trim(json_extract(payload, '$.parent_conversation_id')), ''),
					NULLIF(trim(json_extract(payload, '$.conversation_id')), ''),
					NULLIF(trim(session_id), '')
				)
			WHERE
				source = 'cursor'
				AND event = 'subagentStart'
				AND json_valid(payload) = 1
				AND (
					subagent_id IS NULL
					OR subagent_type IS NULL
					OR transcript_path IS NULL
				);
		`);
		db.exec("COMMIT;");
	} catch (err) {
		try {
			db.exec("ROLLBACK;");
		} catch {}
		throw err;
	}
};

export const getDbPath = (): string => {
	if (process.env.HAPPENIN_DB) {
		return process.env.HAPPENIN_DB;
	}
	return path.join(homedir(), DEFAULT_DB_DIR, DEFAULT_DB_NAME);
};

export const initDb = (dbPath?: string, busyTimeout = 5000): DatabaseSync => {
	const resolvedPath = dbPath ?? getDbPath();
	// oxlint-disable-next-line security/detect-non-literal-fs-filename -- database path is from home or HAPPENIN_DB
	mkdirSync(path.dirname(resolvedPath), { recursive: true });

	const db = new DatabaseSync(resolvedPath);
	try {
		db.exec(`PRAGMA busy_timeout = ${busyTimeout};`);
		db.exec("PRAGMA journal_mode = WAL;");
		db.exec(`CREATE TABLE IF NOT EXISTS events (${eventsColumns});`);
		db.exec(`
			CREATE TABLE IF NOT EXISTS imports (
				path TEXT PRIMARY KEY,
				mtime INTEGER NOT NULL,
				imported_at INTEGER NOT NULL
			);
		`);
		ensureSubagentColumns(db);
		backfillDerivedFields(db);
		for (const indexSql of indexes) {
			db.exec(indexSql);
		}
		return db;
	} catch (err) {
		try {
			db.close();
		} catch {}
		throw err;
	}
};

const timestampKeys = [
	"happenedAt",
	"timestamp",
	"happened_at",
	"time",
	"ts",
	"createdAt",
	"created_at",
];

export function parseWhen(value: unknown): string | undefined {
	if (value === null || value === undefined) return undefined;

	if (typeof value === "number") {
		if (!Number.isFinite(value)) return undefined;
		try {
			return new Date(value).toISOString();
		} catch {
			return undefined;
		}
	}

	if (typeof value === "string") {
		const s = value.trim();
		if (s.length === 0) return undefined;

		if (/^\d+$/.test(s)) {
			const n = Number(s);
			if (!Number.isFinite(n)) return undefined;
			try {
				return new Date(n).toISOString();
			} catch {
				return undefined;
			}
		}

		if (Number.isNaN(Date.parse(s))) return undefined;
		return s;
	}

	return undefined;
}

export function firstHappenedAtPayload(payload: unknown): string | undefined {
	if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
		return undefined;
	}
	const record = payload as Record<string, unknown>;
	for (const key of timestampKeys) {
		const value = parseWhen(Reflect.get(record, key));
		if (value !== undefined) return value;
	}
	return undefined;
}

export const insertEvent = (db: DatabaseSync, event: EventInsert): void => {
	const stmt = db.prepare(insertEventSql);
	const receivedAt = Date.now();
	const happenedAt = parseWhen(event.happenedAt) ?? new Date(receivedAt).toISOString();
	stmt.run(
		event.source,
		event.client ?? null,
		event.event ?? null,
		event.sessionId ?? null,
		happenedAt,
		receivedAt,
		event.projectPath ?? null,
		event.filePath ?? null,
		event.toolName ?? null,
		event.payload,
		event.sourcePath ?? null,
		event.subagentId ?? null,
		event.subagentType ?? null,
		event.transcriptPath ?? null,
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

export const getSessions = (db: DatabaseSync, options: FilterOptions): Session[] => {
	const { clause, params } = buildWhereClause(options);
	const limit = options.limit ?? 100;
	const offset = options.offset ?? 0;
	const sql = `
		SELECT
			session_id AS sessionId,
			COUNT(*) AS eventCount,
			MIN(received_at) AS firstReceivedAt,
			MAX(received_at) AS lastReceivedAt,
			MIN(happened_at) AS firstAt,
			MAX(happened_at) AS lastAt,
			COALESCE(json_group_array(DISTINCT project_path ORDER BY project_path) FILTER (WHERE project_path IS NOT NULL AND project_path <> ''), '[]') AS projectPaths,
			COALESCE(json_group_array(DISTINCT tool_name ORDER BY tool_name) FILTER (WHERE tool_name IS NOT NULL AND tool_name <> ''), '[]') AS toolNames,
			SUM(CASE WHEN event LIKE '%Failure%' THEN 1 ELSE 0 END) AS failureCount
		FROM events
		${clause}
		GROUP BY session_id
		ORDER BY lastReceivedAt DESC
		LIMIT ?${offset > 0 ? " OFFSET ?" : ""}
	`;
	params.push(limit);
	if (offset > 0) {
		params.push(offset);
	}

	const stmt = db.prepare(sql);
	const rows = stmt.all(...params) as {
		sessionId: string | null;
		eventCount: number;
		firstReceivedAt: number | bigint;
		lastReceivedAt: number | bigint;
		firstAt: string | null;
		lastAt: string | null;
		projectPaths: string | null;
		toolNames: string | null;
		failureCount: number | bigint;
	}[];
	return rows.map((row) => {
		const firstReceivedAt = Number(row.firstReceivedAt);
		const lastReceivedAt = Number(row.lastReceivedAt);
		const projectPaths = JSON.parse(row.projectPaths as string) as string[];
		const tools = JSON.parse(row.toolNames as string) as string[];
		const firstAtMs = row.firstAt ? Date.parse(row.firstAt) : NaN;
		const lastAtMs = row.lastAt ? Date.parse(row.lastAt) : NaN;
		const durationMs =
			!Number.isNaN(firstAtMs) && !Number.isNaN(lastAtMs) && lastAtMs >= firstAtMs
				? lastAtMs - firstAtMs
				: lastReceivedAt - firstReceivedAt;
		return {
			sessionId: row.sessionId,
			firstAt: row.firstAt,
			lastAt: row.lastAt,
			firstReceivedAt,
			lastReceivedAt,
			durationMs,
			eventCount: Number(row.eventCount),
			projectPath: projectPaths[0] ?? null,
			projectPaths,
			tools,
			failureCount: Number(row.failureCount),
		};
	});
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
