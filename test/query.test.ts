import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";
import { initDb, insertEvent } from "../src/db.js";
import { runQuery } from "../src/query.js";
import type { EventRow } from "../src/types.js";

function tempDir(): string {
	return mkdtempSync(path.join(tmpdir(), "happenin-"));
}

function cleanup(dir: string): void {
	rmSync(dir, { recursive: true, force: true });
}

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

describe("query", () => {
	const originalDb = process.env.HAPPENIN_DB;
	const originalHome = process.env.HOME;

	beforeEach(() => {
		const dir = tempDir();
		process.env.HOME = dir;
		process.env.HAPPENIN_DB = path.join(dir, "happenin.db");
	});

	afterEach(() => {
		if (process.env.HOME && process.env.HOME.startsWith(tmpdir())) {
			cleanup(process.env.HOME);
		}
		process.env.HAPPENIN_DB = originalDb;
		process.env.HOME = originalHome;
		process.stdout.write = originalWrite;
	});

	it("queries events as json", async () => {
		const db = initDb();
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			sessionId: "s-1",
			payload: JSON.stringify({ tool: "Shell" }),
		});
		db.close();

		const { output } = await captureOutput(() => runQuery([]));
		const parsed = JSON.parse(output) as { total: number; rows: EventRow[] };
		expect(parsed.total).toBe(1);
		expect(parsed.rows.length).toBe(1);
		expect(parsed.rows[0].event).toBe("preToolUse");
		expect(parsed.rows[0].payload).toEqual({ tool: "Shell" });
	});

	it("filters by session and outputs jsonl", async () => {
		const db = initDb();
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "sessionStart",
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

		const { output } = await captureOutput(() =>
			runQuery(["--session", "s-1", "--format", "jsonl"]),
		);
		const lines = output.trim().split("\n");
		expect(lines.length).toBe(1);
		const parsed = JSON.parse(lines[0]) as EventRow;
		expect(parsed.sessionId).toBe("s-1");
	});

	it("outputs a summary", async () => {
		const db = initDb();
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			sessionId: "s-1",
			payload: JSON.stringify({}),
		});
		insertEvent(db, {
			source: "claude",
			client: "claude_code",
			event: "PreToolUse",
			sessionId: "s-2",
			payload: JSON.stringify({}),
		});
		db.close();

		const { output } = await captureOutput(() => runQuery(["--format", "summary"]));
		const parsed = JSON.parse(output) as {
			total: number;
			bySource: { source: string; count: number }[];
		};
		expect(parsed.total).toBe(2);
		expect(parsed.bySource).toContainEqual({ source: "cursor", count: 1 });
		expect(parsed.bySource).toContainEqual({ source: "claude", count: 1 });
	});

	it("supports all CLI flag styles and filters", async () => {
		const dbPath = path.join(process.env.HOME as string, "query.db");
		const db = initDb(dbPath);
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			sessionId: "s-1",
			payload: JSON.stringify({ tool: "Shell", q: "find" }),
		});
		insertEvent(db, {
			source: "claude",
			client: "claude_code",
			event: "PreToolUse",
			sessionId: "s-2",
			payload: JSON.stringify({}),
		});
		db.close();

		const { output } = await captureOutput(() =>
			runQuery([
				"--source=cursor",
				"--event=preToolUse",
				"--session=s-1",
				"--q=Shell",
				"--since=0",
				"--limit=1",
				"--offset=0",
				"--format=json",
				"--db",
				dbPath,
			]),
		);
		const parsed = JSON.parse(output) as { total: number; rows: EventRow[] };
		expect(parsed.total).toBe(1);
		expect(parsed.rows.length).toBe(1);
		expect(parsed.rows[0].source).toBe("cursor");
		expect(parsed.rows[0].sessionId).toBe("s-1");
	});

	it("supports space-separated flags and --db=", async () => {
		const dbPath = path.join(process.env.HOME as string, "query.db");
		const db = initDb(dbPath);
		insertEvent(db, {
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			sessionId: "s-1",
			payload: JSON.stringify({ tool: "Shell", q: "find" }),
		});
		db.close();

		const { output } = await captureOutput(() =>
			runQuery([
				"--source",
				"cursor",
				"--event",
				"preToolUse",
				"--q",
				"Shell",
				"--since",
				"0",
				"--limit",
				"1",
				"--offset",
				"0",
				"--format",
				"json",
				`--db=${dbPath}`,
			]),
		);
		const parsed = JSON.parse(output) as { total: number; rows: EventRow[] };
		expect(parsed.total).toBe(1);
		expect(parsed.rows[0].sessionId).toBe("s-1");
	});

	it("ignores unknown and invalid flags", async () => {
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
			runQuery([
				"--db",
				dbPath,
				"--port",
				"9999",
				"--foo=bar",
				"--since=not-a-number",
				"--limit=zero",
				"--format=invalid",
			]),
		);
		const parsed = JSON.parse(output) as { total: number; rows: EventRow[] };
		expect(parsed.total).toBe(1);
	});

	it("handles invalid offset in both styles", async () => {
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
		const { output: out1 } = await captureOutput(() =>
			runQuery(["--db", dbPath, "--offset", "not-a-number"]),
		);
		expect(JSON.parse(out1).rows.length).toBe(1);

		const { output: out2 } = await captureOutput(() =>
			runQuery(["--db", dbPath, "--offset=not-a-number"]),
		);
		expect(JSON.parse(out2).rows.length).toBe(1);
	});

	it("handles invalid next-value and --offset=", async () => {
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

		const dbPath = process.env.HAPPENIN_DB as string;
		const { output } = await captureOutput(() =>
			runQuery([
				"--db",
				dbPath,
				"--since",
				"not-a-number",
				"--limit",
				"zero",
				"--offset=0",
				"--format",
				"invalid",
			]),
		);
		const parsed = JSON.parse(output) as { total: number; rows: EventRow[] };
		expect(parsed.total).toBe(2);
	});

	it("ignores non-integer, negative, and infinite pagination values", async () => {
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
			runQuery(["--db", dbPath, "--since=-1", "--limit=-5", "--offset=1.5", "--since=Infinity"]),
		);
		const parsed = JSON.parse(output) as { total: number; rows: EventRow[] };
		expect(parsed.total).toBe(1);
		expect(parsed.rows.length).toBe(1);
		expect(parsed.rows[0].sessionId).toBe("s-1");
	});

	it("shows help and exits for -h and --help", async () => {
		const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
			throw new Error(`exit:${code}`);
		});
		const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

		for (const flag of ["-h", "--help"]) {
			try {
				await runQuery([flag]);
			} catch (err) {
				expect((err as Error).message).toBe("exit:0");
			}
		}

		expect(write).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
		exit.mockRestore();
		write.mockRestore();
	});
});
