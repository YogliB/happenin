import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import {
	initDb,
	insertEvent,
	getEvents,
	countEvents,
	getSummary,
	backfillSubagentMetadata,
	backfillDerivedFields,
	getDbPath,
	getUserVersion,
	ensureSubagentColumns,
	getEventById,
	getImportMtime,
	trackImport,
	getLastEventId,
	getSessions,
} from "../src/db.js";

function tempDir(): string {
	return mkdtempSync(path.join(tmpdir(), "happenin-"));
}

function cleanup(dir: string): void {
	rmSync(dir, { recursive: true, force: true });
}

describe("db edge cases", () => {
	const originalHome = process.env.HOME;
	const originalDb = process.env.HAPPENIN_DB;

	beforeEach(() => {
		const dir = tempDir();
		process.env.HOME = dir;
		process.env.HAPPENIN_DB = path.join(dir, "happenin.db");
	});

	afterEach(() => {
		if (process.env.HOME && process.env.HOME.startsWith(tmpdir())) {
			cleanup(process.env.HOME);
		}
		process.env.HOME = originalHome;
		process.env.HAPPENIN_DB = originalDb;
		vi.restoreAllMocks();
	});

	it("filters with since, q, and session", () => {
		const db = initDb(":memory:");
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			sessionId: "s-1",
			payload: JSON.stringify({ tool: "Shell" }),
		});
		insertEvent(db, {
			source: "claude",
			client: "claude_code",
			event: "PreToolUse",
			sessionId: "s-2",
			payload: JSON.stringify({ tool: "Read" }),
		});
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "sessionStart",
			sessionId: "s-1",
			payload: JSON.stringify({}),
		});

		expect(getEvents(db, { since: 1 }).length).toBe(2);
		expect(countEvents(db, { q: "Shell" })).toBe(1);
		expect(getSummary(db, { source: "cursor", q: "Shell" }).total).toBe(1);
		expect(getSummary(db, { sessionId: "s-1" }).bySession.length).toBe(1);
		expect(getEvents(db, { since: 0, q: "no-match" }).length).toBe(0);

		db.close();
	});

	it("throws when backfilling before the schema is migrated", () => {
		const db = new DatabaseSync(":memory:");
		db.exec(`
			CREATE TABLE events (
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
			);
		`);
		try {
			expect(() => backfillSubagentMetadata(db)).toThrow(
				"Database schema must be migrated before backfilling subagent metadata",
			);
		} finally {
			db.close();
		}
	});

	it("rolls back when backfill fails on a closed database", () => {
		const db = initDb(":memory:");
		db.close();
		expect(() => backfillSubagentMetadata(db)).toThrow();
	});

	it("closes the database and rethrows when initDb fails", () => {
		const spy = vi.spyOn(DatabaseSync.prototype, "exec").mockImplementation(() => {
			throw new Error("exec failed");
		});

		try {
			expect(() => initDb(":memory:")).toThrow("exec failed");
		} finally {
			spy.mockRestore();
		}
	});

	it("rethrows when the database directory cannot be created", () => {
		const dir = tempDir();
		const file = path.join(dir, "not-a-dir");
		writeFileSync(file, "");

		expect(() => initDb(path.join(file, "h", "happenin.db"))).toThrow();

		cleanup(dir);
	});

	it("uses HAPPENIN_DB when present", () => {
		process.env.HAPPENIN_DB = path.join(process.env.HOME as string, "custom.db");
		expect(getDbPath()).toBe(process.env.HAPPENIN_DB);
	});

	it("falls back to ~/.happenin/happenin.db", () => {
		delete process.env.HAPPENIN_DB;
		expect(getDbPath()).toBe(path.join(process.env.HOME as string, ".happenin/happenin.db"));
	});

	it("rolls back and rethrows when the backfill update fails", () => {
		const db = initDb(":memory:");
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "subagentStart",
			sessionId: "s-1",
			payload: JSON.stringify({
				parent_conversation_id: "parent-1",
				subagent_id: "sub-1",
				subagent_type: "shell",
				transcript_path: "/foo/bar.jsonl",
			}),
		});

		const originalExec = DatabaseSync.prototype.exec;
		const spy = vi.spyOn(DatabaseSync.prototype, "exec").mockImplementation(function (
			this: DatabaseSync,
			sql: string,
		) {
			if (String(sql).includes("UPDATE events")) {
				throw new Error("update failed");
			}
			return originalExec.call(this, sql);
		});

		try {
			expect(() => backfillSubagentMetadata(db)).toThrow("update failed");
		} finally {
			spy.mockRestore();
			db.close();
		}
	});

	it("rolls back and returns when the version drops after BEGIN", () => {
		const db = initDb(":memory:");
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "subagentStart",
			sessionId: "s-1",
			payload: JSON.stringify({}),
		});

		let calls = 0;
		const spy = vi.spyOn(DatabaseSync.prototype, "prepare").mockImplementation(function (
			this: DatabaseSync,
			sql: string,
		) {
			if (String(sql).trim() === "PRAGMA user_version") {
				calls += 1;
				return {
					get: () => ({ user_version: calls === 1 ? 1 : 0 }),
				} as ReturnType<DatabaseSync["prepare"]>;
			}
			return this.prepare(sql);
		});

		try {
			expect(() => backfillSubagentMetadata(db)).not.toThrow();
		} finally {
			spy.mockRestore();
			db.close();
		}
	});

	it("rolls back a race during subagent column migration", () => {
		const db = initDb(":memory:");

		let calls = 0;
		const spy = vi.spyOn(DatabaseSync.prototype, "prepare").mockImplementation(function (
			this: DatabaseSync,
			sql: string,
		) {
			if (String(sql).trim() === "PRAGMA user_version") {
				calls += 1;
				return {
					get: () => ({ user_version: calls === 1 ? 0 : 1 }),
				} as ReturnType<DatabaseSync["prepare"]>;
			}
			const original = DatabaseSync.prototype.prepare.call(this, sql);
			return original;
		});

		try {
			expect(() => ensureSubagentColumns(db)).not.toThrow();
		} finally {
			spy.mockRestore();
			db.close();
		}
	});

	it("rethrows and rolls back when adding subagent columns fails", () => {
		const db = new DatabaseSync(":memory:");
		db.exec(`
			CREATE TABLE events (
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
				payload TEXT NOT NULL
			);
		`);
		db.exec("PRAGMA user_version = 0;");

		const originalExec = DatabaseSync.prototype.exec;
		const spy = vi.spyOn(DatabaseSync.prototype, "exec").mockImplementation(function (
			this: DatabaseSync,
			sql: string,
		) {
			if (
				String(sql).includes("ALTER TABLE events ADD COLUMN") ||
				String(sql).trim() === "ROLLBACK;"
			) {
				throw new Error("alter failed");
			}
			return originalExec.call(this, sql);
		});

		try {
			expect(() => ensureSubagentColumns(db)).toThrow("alter failed");
		} finally {
			spy.mockRestore();
			db.close();
		}
	});

	it("skips existing subagent columns during migration", () => {
		const db = new DatabaseSync(":memory:");
		db.exec(`
			CREATE TABLE events (
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
			);
		`);
		db.exec("PRAGMA user_version = 0;");

		try {
			expect(() => ensureSubagentColumns(db)).not.toThrow();
			expect(getUserVersion(db)).toBe(1);
		} finally {
			db.close();
		}
	});

	it("backfills subagent metadata successfully", () => {
		const db = initDb(":memory:");
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "subagentStart",
			sessionId: "old-session",
			payload: JSON.stringify({
				parent_conversation_id: "parent-1",
				conversation_id: "conv-1",
				subagent_id: "sub-1",
				subagent_type: "shell",
				transcript_path: "/foo/bar.jsonl",
			}),
		});

		try {
			expect(() => backfillSubagentMetadata(db)).not.toThrow();
			const rows = getEvents(db, {});
			expect(rows[0].sessionId).toBe("parent-1");
			expect(rows[0].subagentId).toBe("sub-1");
			expect(rows[0].subagentType).toBe("shell");
			expect(rows[0].transcriptPath).toBe("/foo/bar.jsonl");
		} finally {
			db.close();
		}
	});

	it("handles nullish client and timestamps", () => {
		const db = initDb(":memory:");
		insertEvent(db, {
			source: "cursor",
			client: undefined,
			event: "sessionStart",
			sessionId: "s-1",
			happenedAt: undefined,
			payload: JSON.stringify({}),
		});

		try {
			const rows = getEvents(db, {});
			expect(rows[0].client).toBeNull();
			expect(rows[0].happenedAt).toBe(new Date(rows[0].receivedAt).toISOString());
		} finally {
			db.close();
		}
	});

	it("returns 0 for empty result sets", () => {
		const db = initDb(":memory:");

		try {
			expect(countEvents(db, {})).toBe(0);
			expect(getSummary(db, {}).total).toBe(0);
			expect(getLastEventId(db)).toBe(0);
			expect(getEventById(db, 1)).toBeUndefined();
			expect(getImportMtime(db, "/not/imported")).toBeUndefined();
		} finally {
			db.close();
		}
	});

	it("tracks and retrieves import mtime", () => {
		const db = initDb(":memory:");

		try {
			trackImport(db, "/foo/bar.jsonl", 12345);
			expect(getImportMtime(db, "/foo/bar.jsonl")).toBe(12345);
		} finally {
			db.close();
		}
	});

	it("handles empty session and q filters", () => {
		const db = initDb(":memory:");
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			sessionId: "s-1",
			payload: JSON.stringify({ tool: "Shell" }),
		});

		try {
			expect(getEvents(db, { sessionId: "" }).length).toBe(1);
			expect(getEvents(db, { q: "" }).length).toBe(1);
		} finally {
			db.close();
		}
	});

	it("returns 0 when countEvents row is missing", () => {
		const db = initDb(":memory:");
		const originalPrepare = DatabaseSync.prototype.prepare;
		const spy = vi.spyOn(DatabaseSync.prototype, "prepare").mockImplementation(function (
			this: DatabaseSync,
			sql: string,
		) {
			if (String(sql).includes("COUNT(*)")) {
				return { get: () => undefined } as ReturnType<DatabaseSync["prepare"]>;
			}
			return originalPrepare.call(this, sql);
		});

		try {
			expect(countEvents(db, {})).toBe(0);
		} finally {
			spy.mockRestore();
			db.close();
		}
	});

	it("falls back to 0 when user_version row is missing", () => {
		const db = initDb(":memory:");
		const originalPrepare = DatabaseSync.prototype.prepare;
		const spy = vi.spyOn(DatabaseSync.prototype, "prepare").mockImplementation(function (
			this: DatabaseSync,
			sql: string,
		) {
			if (String(sql).trim() === "PRAGMA user_version") {
				return { get: () => undefined } as ReturnType<DatabaseSync["prepare"]>;
			}
			return originalPrepare.call(this, sql);
		});

		try {
			expect(getUserVersion(db)).toBe(0);
		} finally {
			spy.mockRestore();
			db.close();
		}
	});

	it("survives a close error during initDb failure", () => {
		const originalExec = DatabaseSync.prototype.exec;
		const execSpy = vi.spyOn(DatabaseSync.prototype, "exec").mockImplementation(function (
			this: DatabaseSync,
			sql: string,
		) {
			if (String(sql).includes("CREATE TABLE")) throw new Error("create failed");
			return originalExec.call(this, sql);
		});
		const closeSpy = vi.spyOn(DatabaseSync.prototype, "close").mockImplementation(() => {
			throw new Error("close failed");
		});

		try {
			expect(() => initDb(":memory:")).toThrow("create failed");
		} finally {
			execSpy.mockRestore();
			closeSpy.mockRestore();
		}
	});

	it("preserves the busy timeout selected by initDb", () => {
		const db = initDb(":memory:", 500);
		try {
			const row = db.prepare("PRAGMA busy_timeout").get() as { timeout: number } | undefined;
			expect(row?.timeout).toBe(500);
		} finally {
			db.close();
		}
	});

	it("backfills happenedAt and project_path from workspace_roots", () => {
		const db = new DatabaseSync(":memory:");
		db.exec(`
			CREATE TABLE events (
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
			);
		`);
		const receivedAt = 1700000000000;
		db.exec(`
			INSERT INTO events (source, client, event, received_at, payload)
			VALUES (
				'cursor',
				'cursor',
				'sessionStart',
				${receivedAt},
				'${JSON.stringify({ workspace_roots: ["/foo", "/bar"] }).replace(/'/g, "''")}'
			);
		`);
		db.exec("PRAGMA user_version = 0;");

		try {
			ensureSubagentColumns(db);
			backfillDerivedFields(db);
			const rows = db.prepare("SELECT happened_at, project_path FROM events").all() as {
				happened_at: string;
				project_path: string;
			}[];
			expect(rows[0].happened_at).toBe(new Date(receivedAt).toISOString());
			expect(rows[0].project_path).toBe("/foo");
		} finally {
			db.close();
		}
	});

	it("backfills happened_at from payload timestamp keys", () => {
		const db = new DatabaseSync(":memory:");
		db.exec(`
			CREATE TABLE events (
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
			);
		`);
		const receivedAt = 1700000000000;
		db.exec(`
			INSERT INTO events (source, client, event, received_at, payload)
			VALUES (
				'cursor',
				'cursor',
				'sessionStart',
				${receivedAt},
				'${JSON.stringify({ ts: "1700000001000" }).replace(/'/g, "''")}'
			);
		`);
		db.exec("PRAGMA user_version = 0;");

		try {
			ensureSubagentColumns(db);
			backfillDerivedFields(db);
			const rows = db.prepare("SELECT happened_at FROM events").all() as {
				happened_at: string;
			}[];
			expect(rows[0].happened_at).toBe(new Date(1700000001000).toISOString());
		} finally {
			db.close();
		}
	});

	it("skips derived fields backfill when user_version is already 2", () => {
		const db = initDb(":memory:");
		db.exec("PRAGMA user_version = 2;");
		try {
			expect(() => backfillDerivedFields(db)).not.toThrow();
		} finally {
			db.close();
		}
	});

	it("rolls back a race during derived fields backfill", () => {
		const db = initDb(":memory:");

		let calls = 0;
		const spy = vi.spyOn(DatabaseSync.prototype, "prepare").mockImplementation(function (
			this: DatabaseSync,
			sql: string,
		) {
			if (String(sql).trim() === "PRAGMA user_version") {
				calls += 1;
				return {
					get: () => ({ user_version: calls === 1 ? 0 : 2 }),
				} as ReturnType<DatabaseSync["prepare"]>;
			}
			const original = DatabaseSync.prototype.prepare.call(this, sql);
			return original;
		});

		try {
			expect(() => backfillDerivedFields(db)).not.toThrow();
		} finally {
			spy.mockRestore();
			db.close();
		}
	});

	it("rethrows and rolls back when derived fields update fails", () => {
		const db = initDb(":memory:");
		db.exec("PRAGMA user_version = 0;");
		const originalExec = DatabaseSync.prototype.exec;
		const spy = vi.spyOn(DatabaseSync.prototype, "exec").mockImplementation(function (
			this: DatabaseSync,
			sql: string,
		) {
			if (String(sql).includes("UPDATE events") && String(sql).includes("happened_at")) {
				throw new Error("update failed");
			}
			return originalExec.call(this, sql);
		});

		try {
			expect(() => backfillDerivedFields(db)).toThrow("update failed");
		} finally {
			spy.mockRestore();
			db.close();
		}
	});

	it("backfills project_path from all supported payload keys", () => {
		const db = new DatabaseSync(":memory:");
		db.exec(`
			CREATE TABLE events (
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
			);
		`);

		const cases: { payload: string; expected: string }[] = [
			{ payload: JSON.stringify({ projectPath: "/projectPath" }), expected: "/projectPath" },
			{ payload: JSON.stringify({ cwd: "/cwd" }), expected: "/cwd" },
			{ payload: JSON.stringify({ project_path: "/project_path" }), expected: "/project_path" },
			{ payload: JSON.stringify({ workspaceRoot: "/workspaceRoot" }), expected: "/workspaceRoot" },
			{
				payload: JSON.stringify({ workspaceRoots: ["", "/workspaceRoots"] }),
				expected: "/workspaceRoots",
			},
			{
				payload: JSON.stringify({ workspace_roots: ["", "/workspace_roots"] }),
				expected: "/workspace_roots",
			},
			{
				payload: JSON.stringify({ workspace_root: "/workspace_root" }),
				expected: "/workspace_root",
			},
			{
				payload: JSON.stringify({ workspace_path: "/workspace_path" }),
				expected: "/workspace_path",
			},
		];

		const stmt = db.prepare(
			"INSERT INTO events (source, client, event, received_at, payload) VALUES (?, ?, ?, ?, ?)",
		);
		for (const c of cases) {
			stmt.run("cursor", "cursor", "sessionStart", 1700000000000, c.payload);
		}
		db.exec("PRAGMA user_version = 0;");

		try {
			ensureSubagentColumns(db);
			backfillDerivedFields(db);
			const rows = db.prepare("SELECT project_path FROM events ORDER BY id").all() as {
				project_path: string;
			}[];
			for (let i = 0; i < cases.length; i++) {
				expect(rows[i].project_path).toBe(cases[i].expected);
			}
		} finally {
			db.close();
		}
	});

	it("normalizes numeric happened_at strings in backfill", () => {
		const db = new DatabaseSync(":memory:");
		db.exec(`
			CREATE TABLE events (
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
			);
		`);
		db.exec(`
			INSERT INTO events (source, client, event, received_at, happened_at, payload)
			VALUES (
				'cursor',
				'cursor',
				'sessionStart',
				1700000000000,
				'1700000000000',
				'{}'
			);
		`);
		db.exec("PRAGMA user_version = 0;");

		try {
			ensureSubagentColumns(db);
			backfillDerivedFields(db);
			const rows = db.prepare("SELECT happened_at FROM events").all() as { happened_at: string }[];
			expect(rows[0].happened_at).toBe(new Date(1700000000000).toISOString());
		} finally {
			db.close();
		}
	});

	it("normalizes numeric happenedAt on insert", () => {
		const db = initDb(":memory:");
		try {
			insertEvent(db, {
				source: "cursor",
				client: "cursor",
				event: "sessionStart",
				sessionId: "s-1",
				happenedAt: "1700000000000",
				payload: JSON.stringify({}),
			});
			const rows = getEvents(db, {});
			expect(rows[0].happenedAt).toBe(new Date(1700000000000).toISOString());
		} finally {
			db.close();
		}
	});

	it("returns session summaries with filters and pagination", () => {
		const db = initDb(":memory:");
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			sessionId: "s-1",
			toolName: "Shell",
			projectPath: "/project",
			payload: JSON.stringify({}),
		});
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			sessionId: "s-1",
			toolName: "Read",
			projectPath: "/project",
			payload: JSON.stringify({}),
		});
		insertEvent(db, {
			source: "claude",
			client: "claude_code",
			event: "PreToolUse",
			sessionId: "s-2",
			toolName: "Edit",
			payload: JSON.stringify({}),
		});
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "postToolUseFailure",
			sessionId: "s-1",
			toolName: "Shell",
			payload: JSON.stringify({}),
		});

		try {
			const all = getSessions(db, {});
			expect(all.length).toBe(2);
			const s1 = all.find((s) => s.sessionId === "s-1");
			expect(s1?.eventCount).toBe(3);
			expect(s1?.tools).toContain("Shell");
			expect(s1?.tools).toContain("Read");
			expect(s1?.failureCount).toBe(1);
			expect(s1?.projectPath).toBe("/project");

			const filtered = getSessions(db, { source: "cursor" });
			expect(filtered.length).toBe(1);
			expect(filtered[0].sessionId).toBe("s-1");

			const paged = getSessions(db, { limit: 1, offset: 1 });
			expect(paged.length).toBe(1);
		} finally {
			db.close();
		}
	});
});
