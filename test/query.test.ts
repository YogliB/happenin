import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
});
