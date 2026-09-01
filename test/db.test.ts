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
	getDbPath,
	getUserVersion,
	ensureSubagentColumns,
	getEventById,
	getImportMtime,
	trackImport,
	getLastEventId,
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
			expect(rows[0].happenedAt).toBeNull();
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
});
