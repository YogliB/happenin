import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";
import { initDb, insertEvent } from "../src/shared/db.js";
import { runSessions } from "../src/cli/sessions.js";

function tempDir(): string {
	return mkdtempSync(path.join(tmpdir(), "happenin-"));
}

function cleanup(dir: string): void {
	rmSync(dir, { recursive: true, force: true });
}

const originalDb = process.env.HAPPENIN_DB;
const originalHome = process.env.HOME;
const originalWrite = process.stdout.write;

function captureOutput<T>(fn: () => Promise<T>): Promise<{ result: T; output: string }> {
	const chunks: string[] = [];
	process.stdout.write = (chunk: string | Uint8Array): boolean => {
		chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
		return true;
	};
	return fn()
		.then((result) => ({ result, output: chunks.join("") }))
		.finally(() => {
			process.stdout.write = originalWrite;
		});
}

describe("sessions", () => {
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
		process.stdout.write = originalWrite;
		vi.restoreAllMocks();
	});

	it("lists sessions as json", async () => {
		const db = initDb();
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
		db.close();

		const { output } = await captureOutput(() => runSessions([]));
		const parsed = JSON.parse(output) as { sessionId: string; eventCount: number }[];
		expect(parsed.length).toBe(1);
		expect(parsed[0].sessionId).toBe("s-1");
		expect(parsed[0].eventCount).toBe(2);
		expect(parsed[0].tools).toContain("Shell");
		expect(parsed[0].tools).toContain("Read");
	});

	it("outputs sessions as jsonl", async () => {
		const db = initDb();
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			sessionId: "s-1",
			toolName: "Shell",
			projectPath: "/project",
			payload: JSON.stringify({}),
		});
		db.close();

		const { output } = await captureOutput(() => runSessions(["--format", "jsonl"]));
		const lines = output.trim().split("\n");
		expect(lines.length).toBe(1);
		const parsed = JSON.parse(lines[0]) as { sessionId: string };
		expect(parsed.sessionId).toBe("s-1");
	});

	it("outputs sessions as summary", async () => {
		const db = initDb();
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			sessionId: "s-1",
			toolName: "Shell",
			projectPath: "/project",
			payload: JSON.stringify({}),
		});
		db.close();

		const { output } = await captureOutput(() => runSessions(["--format", "summary"]));
		expect(output).toContain("s-1");
		expect(output).toContain("project:/project");
		expect(output).toContain("tools:Shell");
	});

	it("filters sessions by session id", async () => {
		const db = initDb();
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			sessionId: "s-1",
			payload: JSON.stringify({}),
		});
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			sessionId: "s-2",
			payload: JSON.stringify({}),
		});
		db.close();

		const { output } = await captureOutput(() => runSessions(["--session", "s-1"]));
		const parsed = JSON.parse(output) as { sessionId: string }[];
		expect(parsed.length).toBe(1);
		expect(parsed[0].sessionId).toBe("s-1");
	});

	it("outputs summary with null fields", async () => {
		const db = initDb();
		db.prepare("INSERT INTO events (source, received_at, payload) VALUES (?, ?, ?)").run(
			"cursor",
			1700000000000,
			JSON.stringify({}),
		);
		db.close();

		const { output } = await captureOutput(() =>
			runSessions(["--format", "summary", "--range", "all"]),
		);
		expect(output).toContain("no-session");
		expect(output).toContain("project:-");
		expect(output).toContain("tools:-");
	});

	it("calculates duration from happenedAt when available", async () => {
		const db = initDb();
		const t1 = 1700000000000;
		const t2 = t1 + 60 * 60 * 1000;
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			sessionId: "s-1",
			happenedAt: new Date(t1).toISOString(),
			payload: JSON.stringify({}),
		});
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			sessionId: "s-1",
			happenedAt: new Date(t2).toISOString(),
			payload: JSON.stringify({}),
		});
		db.close();

		const { output } = await captureOutput(() => runSessions(["--range", "all"]));
		const parsed = JSON.parse(output) as { durationMs: number }[];
		expect(parsed[0].durationMs).toBe(60 * 60 * 1000);
	});

	it("handles project paths and tool names containing pipe characters", async () => {
		const db = initDb();
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			sessionId: "s-1",
			toolName: "Read|Write",
			projectPath: "/a|b",
			payload: JSON.stringify({}),
		});
		db.close();

		const { output } = await captureOutput(() => runSessions([]));
		const parsed = JSON.parse(output) as { projectPaths: string[]; tools: string[] }[];
		expect(parsed[0].projectPaths).toEqual(["/a|b"]);
		expect(parsed[0].tools).toEqual(["Read|Write"]);
	});

	it("picks the alphabetically first project path as primary", async () => {
		const db = initDb();
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			sessionId: "s-1",
			projectPath: "/zzz",
			payload: JSON.stringify({}),
		});
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			sessionId: "s-1",
			projectPath: "/aaa",
			payload: JSON.stringify({}),
		});
		db.close();

		const { output } = await captureOutput(() => runSessions([]));
		const parsed = JSON.parse(output) as { projectPath: string; projectPaths: string[] }[];
		expect(parsed[0].projectPath).toBe("/aaa");
		expect(parsed[0].projectPaths).toEqual(["/aaa", "/zzz"]);
	});

	it("filters sessions by status, tool, duration, and range", async () => {
		const now = Date.now();
		const db = initDb();
		const sql =
			"INSERT INTO events (source, received_at, happened_at, session_id, tool_name, event, payload) VALUES (?, ?, ?, ?, ?, ?, ?)";
		const stmt = db.prepare(sql);
		stmt.run(
			"cursor",
			now,
			new Date(now).toISOString(),
			"s-active",
			"Shell",
			"preToolUse",
			JSON.stringify({}),
		);
		stmt.run(
			"cursor",
			now - 10 * 60 * 1000,
			new Date(now).toISOString(),
			"s-completed",
			"Read",
			"preToolUse",
			JSON.stringify({}),
		);
		stmt.run(
			"cursor",
			now - 10 * 60 * 1000,
			new Date(now).toISOString(),
			"s-failed",
			"Shell",
			"toolFailure",
			JSON.stringify({}),
		);
		db.close();

		const dbPath = process.env.HAPPENIN_DB as string;

		const { output: out1 } = await captureOutput(() =>
			runSessions(["--db", dbPath, "--status=completed", "--tool", "Read", "--range", "24h"]),
		);
		const completed = JSON.parse(out1) as { sessionId: string }[];
		expect(completed.length).toBe(1);
		expect(completed[0].sessionId).toBe("s-completed");

		const { output: out2 } = await captureOutput(() =>
			runSessions(["--db", dbPath, "--status", "failed", "--tool=Shell"]),
		);
		const failed = JSON.parse(out2) as { sessionId: string }[];
		expect(failed.length).toBe(1);
		expect(failed[0].sessionId).toBe("s-failed");

		const { output: out3 } = await captureOutput(() =>
			runSessions([
				"--db",
				dbPath,
				"--status",
				"active",
				"--minDuration",
				"0",
				"--maxDuration",
				"1",
			]),
		);
		const active = JSON.parse(out3) as { sessionId: string }[];
		expect(active.length).toBe(1);
		expect(active[0].sessionId).toBe("s-active");
	});

	it("applies limit and offset to sessions", async () => {
		const now = Date.now();
		const db = initDb();
		const stmt = db.prepare(
			"INSERT INTO events (source, received_at, happened_at, session_id, tool_name, event, payload) VALUES (?, ?, ?, ?, ?, ?, ?)",
		);
		for (let i = 0; i < 3; i++) {
			stmt.run(
				"cursor",
				now + (2 - i) * 1000,
				new Date(now).toISOString(),
				`s-${i}`,
				null,
				"preToolUse",
				JSON.stringify({}),
			);
		}
		db.close();

		const dbPath = process.env.HAPPENIN_DB as string;
		const { output: out1 } = await captureOutput(() =>
			runSessions(["--db", dbPath, "--limit", "1"]),
		);
		const limited = JSON.parse(out1) as { sessionId: string }[];
		expect(limited.length).toBe(1);
		expect(limited[0].sessionId).toBe("s-0");

		const { output: out2 } = await captureOutput(() =>
			runSessions(["--db", dbPath, "--limit=1", "--offset=1"]),
		);
		const offset = JSON.parse(out2) as { sessionId: string }[];
		expect(offset.length).toBe(1);
		expect(offset[0].sessionId).toBe("s-1");
	});

	it("ignores invalid session filter values", async () => {
		const db = initDb();
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			sessionId: "s-1",
			payload: JSON.stringify({}),
		});
		db.close();

		const dbPath = process.env.HAPPENIN_DB as string;
		const { output } = await captureOutput(() =>
			runSessions([
				"--db",
				dbPath,
				"--status=bad",
				"--range=bad",
				"--minDuration=bad",
				"--maxDuration=-1",
			]),
		);
		const parsed = JSON.parse(output) as { sessionId: string }[];
		expect(parsed.length).toBe(1);
		expect(parsed[0].sessionId).toBe("s-1");
	});

	it("shows help and exits for -h and --help", async () => {
		const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		for (const flag of ["-h", "--help"]) {
			await runSessions([flag]);
		}
		expect(write).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
		write.mockRestore();
	});
});
