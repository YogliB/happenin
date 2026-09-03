import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_DB_DIR, DEFAULT_DB_NAME } from "./constants.js";
import type {
	EventInsert,
	EventRow,
	FilterOptionLists,
	FilterOptions,
	Session,
	SessionStatus,
	TimeRange,
	ToolUsage,
	EventFrequency,
} from "./types.js";

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
	"CREATE INDEX IF NOT EXISTS idx_events_subagent_id ON events(subagent_id);",
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
		db.exec(`
			UPDATE events
			SET subagent_id = (
				SELECT s.subagent_id
				FROM events s
				WHERE s.event = 'subagentStart'
					AND s.subagent_id IS NOT NULL
					AND json_extract(events.payload, '$.tool_use_id') = s.subagent_id
				LIMIT 1
			)
			WHERE
				event != 'subagentStart'
				AND subagent_id IS NULL
				AND json_valid(payload) = 1
				AND json_extract(payload, '$.tool_use_id') IS NOT NULL
				AND EXISTS (
					SELECT 1 FROM events s
					WHERE s.event = 'subagentStart'
						AND s.subagent_id = json_extract(events.payload, '$.tool_use_id')
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

function parseWhen(value: unknown): string | undefined {
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

const timeExpr =
	"COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', happened_at), strftime('%Y-%m-%dT%H:%M:%fZ', received_at / 1000.0, 'unixepoch'))";

function rangeToMs(range: TimeRange): number {
	const hours = range === "7d" ? 168 : range === "30d" ? 720 : 24;
	return hours * 60 * 60 * 1000;
}

function buildWhereClause(
	options: FilterOptions,
	now = Date.now(),
): {
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
	if (options.tool !== undefined && options.tool !== "") {
		conditions.push("tool_name = ?");
		params.push(options.tool);
	}
	if (options.sessionId !== undefined && options.sessionId !== "") {
		if (options.sessionIdExact) {
			conditions.push("session_id = ?");
			params.push(options.sessionId);
		} else {
			conditions.push("session_id LIKE ?");
			params.push(`%${options.sessionId}%`);
		}
	}
	if (options.sessionIds !== undefined && options.sessionIds.length > 0) {
		const nonNullIds = options.sessionIds.filter((id): id is string => id !== null);
		const nullSelected = options.sessionIds.some((id) => id === null);
		const sessionClauses: string[] = [];
		if (nonNullIds.length > 0) {
			const placeholders = nonNullIds.map(() => "?").join(",");
			sessionClauses.push(`session_id IN (${placeholders})`);
			for (const id of nonNullIds) params.push(id);
		}
		if (nullSelected) {
			sessionClauses.push("session_id IS NULL");
		}
		conditions.push(
			sessionClauses.length === 1 ? sessionClauses[0] : `(${sessionClauses.join(" OR ")})`,
		);
	}
	if (options.q !== undefined && options.q !== "") {
		conditions.push("(payload LIKE ? OR session_id LIKE ?)");
		params.push(`%${options.q}%`);
		params.push(`%${options.q}%`);
	}
	if (options.range !== undefined && options.range !== "all") {
		conditions.push(`${timeExpr} >= ?`);
		params.push(new Date(now - rangeToMs(options.range)).toISOString());
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

type SessionAggregateRow = {
	sessionId: string | null;
	subagentId?: string | null;
	subagentType?: string | null;
	eventCount: number;
	firstReceivedAt: number | bigint;
	lastReceivedAt: number | bigint;
	firstAt: string | null;
	lastAt: string | null;
	projectPaths: string | null;
	toolNames: string | null;
	failureCount: number | bigint;
};

function toSession(row: SessionAggregateRow): Session {
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
		subagentId: row.subagentId,
		subagentType: row.subagentType,
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
}

export const getSessions = (
	db: DatabaseSync,
	options: FilterOptions,
	now = Date.now(),
): Session[] => {
	const { clause, params } = buildWhereClause(options, now);
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
		ORDER BY lastReceivedAt DESC, sessionId
		LIMIT ?${offset > 0 ? " OFFSET ?" : ""}
	`;
	params.push(limit);
	if (offset > 0) {
		params.push(offset);
	}

	const stmt = db.prepare(sql);
	const rows = stmt.all(...params) as SessionAggregateRow[];
	return rows.map(toSession);
};

export const getToolUsage = (
	db: DatabaseSync,
	options: FilterOptions = {},
	limit = 10,
	now = Date.now(),
): ToolUsage[] => {
	const { clause, params } = buildWhereClause(options, now);
	const toolCondition = "tool_name IS NOT NULL AND tool_name <> ''";
	const where = clause ? `${clause} AND ${toolCondition}` : `WHERE ${toolCondition}`;
	const sql = `SELECT tool_name AS tool, COUNT(*) AS count FROM events ${where} GROUP BY tool_name ORDER BY count DESC, tool_name ASC LIMIT ?`;
	const stmt = db.prepare(sql);
	return stmt.all(...params, limit) as ToolUsage[];
};

function bucketExpr(groupBy: "hour" | "day"): string {
	if (groupBy === "day") {
		return `strftime('%Y-%m-%dT00:00:00.000Z', ${timeExpr})`;
	}
	return `strftime('%Y-%m-%dT%H:00:00.000Z', ${timeExpr})`;
}

function snapToRangeStart(groupBy: "hour" | "day", now = Date.now()): Date {
	const date = new Date(now);
	if (groupBy === "day") {
		date.setUTCHours(0, 0, 0, 0);
	} else {
		date.setUTCMinutes(0, 0, 0);
		date.setUTCMilliseconds(0);
	}
	return date;
}

function bucketStepMs(groupBy: "hour" | "day"): number {
	return groupBy === "day" ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
}

export const getEventFrequency = (
	db: DatabaseSync,
	options: FilterOptions = {},
	hours = 24,
	groupBy: "hour" | "day" = "hour",
	now = Date.now(),
): EventFrequency[] => {
	if (hours <= 0) {
		const expr = bucketExpr(groupBy);
		const { clause, params } = buildWhereClause({ ...options, range: undefined }, now);
		const sql = `SELECT ${expr} AS bucket, COUNT(*) AS count FROM events ${clause} GROUP BY bucket ORDER BY bucket`;
		return db.prepare(sql).all(...params) as EventFrequency[];
	}
	const stepMs = bucketStepMs(groupBy);
	const start = snapToRangeStart(groupBy, now);
	const target = snapToRangeStart(groupBy, now - hours * 60 * 60 * 1000);
	const bucketCount = Math.max(1, Math.ceil((start.getTime() - target.getTime()) / stepMs) + 1);
	const cutoff = target.toISOString();

	const expr = bucketExpr(groupBy);
	const { clause, params } = buildWhereClause({ ...options, range: undefined }, now);
	const timeCondition = `${expr} >= ?`;
	const where = clause ? `${clause} AND ${timeCondition}` : `WHERE ${timeCondition}`;
	const sql = `SELECT ${expr} AS bucket, COUNT(*) AS count FROM events ${where} GROUP BY bucket ORDER BY bucket`;
	const stmt = db.prepare(sql);
	const rows = stmt.all(...params, cutoff) as EventFrequency[];

	const result: EventFrequency[] = [];
	const seen = new Map<string, number>();
	for (const row of rows) {
		seen.set(row.bucket, row.count);
	}
	for (let i = 0; i < bucketCount; i++) {
		const bucket =
			groupBy === "day"
				? `${target.toISOString().slice(0, 10)}T00:00:00.000Z`
				: target.toISOString();
		result.push({ bucket, count: seen.get(bucket) ?? 0 });
		target.setTime(target.getTime() + stepMs);
	}
	return result;
};

export const getLastEventId = (db: DatabaseSync): number => {
	const stmt = db.prepare("SELECT id FROM events ORDER BY id DESC LIMIT 1");
	const row = stmt.get() as { id: number | bigint } | undefined;
	return row ? Number(row.id) : 0;
};

export const sessionStatus = (session: Session, now: number): SessionStatus => {
	if (session.failureCount > 0) return "failed";
	const lastAtMs = session.lastAt ? Date.parse(session.lastAt) : NaN;
	const lastActivity = Number.isNaN(lastAtMs)
		? session.lastReceivedAt
		: Math.min(lastAtMs, session.lastReceivedAt);
	if (now - lastActivity <= 5 * 60 * 1000) return "active";
	return "completed";
};

function matchesSessionFilters(session: Session, options: FilterOptions, now: number): boolean {
	if (options.status !== undefined) {
		const status = sessionStatus(session, now);
		if (status !== options.status) return false;
	}
	if (options.minDuration !== undefined && session.durationMs < options.minDuration * 60 * 1000) {
		return false;
	}
	if (options.maxDuration !== undefined && session.durationMs > options.maxDuration * 60 * 1000) {
		return false;
	}
	return true;
}

export const getSubagentsBySession = (
	db: DatabaseSync,
	parentSessionIds: (string | null)[],
): Session[] => {
	const ids = [...new Set(parentSessionIds.filter((id): id is string => id !== null))];
	if (ids.length === 0) return [];

	const placeholders = ids.map(() => "?").join(",");
	const sql = `
    SELECT
      session_id AS sessionId,
      subagent_id AS subagentId,
      MAX(subagent_type) AS subagentType,
      COUNT(*) AS eventCount,
      MIN(received_at) AS firstReceivedAt,
      MAX(received_at) AS lastReceivedAt,
      MIN(happened_at) AS firstAt,
      MAX(happened_at) AS lastAt,
      COALESCE(json_group_array(DISTINCT project_path ORDER BY project_path) FILTER (WHERE project_path IS NOT NULL AND project_path <> ''), '[]') AS projectPaths,
      COALESCE(json_group_array(DISTINCT tool_name ORDER BY tool_name) FILTER (WHERE tool_name IS NOT NULL AND tool_name <> ''), '[]') AS toolNames,
      SUM(CASE WHEN event LIKE '%Failure%' THEN 1 ELSE 0 END) AS failureCount
    FROM events
    WHERE subagent_id IS NOT NULL AND subagent_id <> '' AND session_id IN (${placeholders})
    GROUP BY session_id, subagent_id
    ORDER BY lastReceivedAt DESC, subagent_id
  `;
	const stmt = db.prepare(sql);
	const rows = stmt.all(...ids) as SessionAggregateRow[];
	return rows.map(toSession);
};

export const getFilteredSessions = (
	db: DatabaseSync,
	options: FilterOptions = {},
	now = Date.now(),
): Session[] => {
	const sessions = getSessions(db, { ...options, limit: Number.MAX_SAFE_INTEGER, offset: 0 }, now);
	const filtered = sessions.filter((session) => matchesSessionFilters(session, options, now));
	const subagents = getSubagentsBySession(
		db,
		filtered.map((s) => s.sessionId),
	);
	const byParent = new Map<string | null, Session[]>();
	for (const sub of subagents) {
		const list = byParent.get(sub.sessionId) ?? [];
		list.push(sub);
		byParent.set(sub.sessionId, list);
	}
	const withChildren = filtered.map((s) => ({ ...s, children: byParent.get(s.sessionId) }));
	const offset = options.offset ?? 0;
	const limit = options.limit;
	if (offset === 0 && limit === undefined) return withChildren;
	if (limit === undefined) return withChildren.slice(offset);
	return withChildren.slice(offset, offset + limit);
};

export const getFilterOptions = (db: DatabaseSync): FilterOptionLists => {
	const sourceRows = db
		.prepare(
			"SELECT DISTINCT source FROM events WHERE source IS NOT NULL AND source <> '' ORDER BY source",
		)
		.all() as { source: string }[];
	const eventRows = db
		.prepare(
			"SELECT DISTINCT event FROM events WHERE event IS NOT NULL AND event <> '' ORDER BY event",
		)
		.all() as { event: string }[];
	const toolRows = db
		.prepare(
			"SELECT DISTINCT tool_name AS tool FROM events WHERE tool_name IS NOT NULL AND tool_name <> '' ORDER BY tool_name",
		)
		.all() as { tool: string }[];

	return {
		sources: sourceRows.map((row) => row.source),
		events: eventRows.map((row) => row.event),
		tools: toolRows.map((row) => row.tool),
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
