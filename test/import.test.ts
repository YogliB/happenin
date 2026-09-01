import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";
import { initDb, getEvents, getImportMtime } from "../src/db.js";
import { importTranscripts, runImport } from "../src/import.js";

function tempDir(): string {
	return mkdtempSync(path.join(tmpdir(), "happenin-"));
}

function cleanup(dir: string): void {
	rmSync(dir, { recursive: true, force: true });
}

describe("import", () => {
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
	});

	it("imports Claude and Cursor transcripts", async () => {
		const home = process.env.HOME as string;

		const claudeDir = path.join(home, ".claude/projects/session");
		mkdirSync(claudeDir, { recursive: true });
		writeFileSync(
			path.join(claudeDir, "session.jsonl"),
			[
				JSON.stringify({
					type: "user",
					sessionId: "session",
					timestamp: "2024-01-01T00:00:00Z",
					cwd: "/project",
				}),
				JSON.stringify({
					type: 123,
					timestamp: 1700000000000,
					message: "hello",
				}),
				"not json",
				"123",
				"",
			].join("\n"),
		);
		writeFileSync(path.join(claudeDir, "not-jsonl.txt"), "ignored");

		const cursorDir = path.join(home, ".cursor/chats/hash/session-2");
		mkdirSync(cursorDir, { recursive: true });
		writeFileSync(
			path.join(cursorDir, "prompt_history.json"),
			JSON.stringify(["first prompt", 123, "second prompt"]),
		);
		writeFileSync(
			path.join(cursorDir, "meta.json"),
			JSON.stringify({ createdAtMs: 1700000000000 }),
		);

		const db = initDb(":memory:");
		await importTranscripts(db);

		const all = getEvents(db, { limit: 100 });
		expect(all.length).toBe(5);
		expect(all.filter((r) => r.source === "claude-transcript").length).toBe(2);
		expect(all.filter((r) => r.source === "cursor-transcript" && r.event === "prompt").length).toBe(
			2,
		);
		expect(
			all.filter((r) => r.source === "cursor-transcript" && r.event === "session_meta").length,
		).toBe(1);

		db.close();
	});

	it("skips unchanged files on the second import", async () => {
		const home = process.env.HOME as string;

		const claudeDir = path.join(home, ".claude/projects/session");
		mkdirSync(claudeDir, { recursive: true });
		const jsonl = path.join(claudeDir, "session.jsonl");
		writeFileSync(jsonl, JSON.stringify({ type: "user" }));

		const db = initDb(":memory:");
		await importTranscripts(db);
		expect(getEvents(db, { limit: 10 }).length).toBe(1);

		await importTranscripts(db);
		expect(getEvents(db, { limit: 10 }).length).toBe(1);
		expect(getImportMtime(db, jsonl)).toBeDefined();

		db.close();
	});

	it("ignores store.db and symlinks while walking Claude projects", async () => {
		const home = process.env.HOME as string;

		const claudeDir = path.join(home, ".claude/projects");
		const nestedDir = path.join(claudeDir, "nested");
		mkdirSync(nestedDir, { recursive: true });
		writeFileSync(path.join(nestedDir, "valid.jsonl"), JSON.stringify({ type: "user" }));
		writeFileSync(path.join(claudeDir, "store.db"), "data");

		const linkPath = path.join(claudeDir, "link.jsonl");
		try {
			symlinkSync(path.join(nestedDir, "valid.jsonl"), linkPath);
		} catch {}

		const db = initDb(":memory:");
		await importTranscripts(db);

		const all = getEvents(db, { limit: 100 });
		expect(all.length).toBe(1);
		expect(all[0].sourcePath).toBe(path.join(nestedDir, "valid.jsonl"));

		db.close();
	});

	it("ignores invalid prompt_history.json", async () => {
		const home = process.env.HOME as string;
		const cursorDir = path.join(home, ".cursor/chats/hash/session");
		mkdirSync(cursorDir, { recursive: true });
		writeFileSync(path.join(cursorDir, "prompt_history.json"), "not json");
		writeFileSync(path.join(cursorDir, "meta.json"), JSON.stringify({}));

		const db = initDb(":memory:");
		await importTranscripts(db);

		const all = getEvents(db, { limit: 100 });
		expect(all.length).toBe(1);
		expect(all[0].event).toBe("session_meta");

		db.close();
	});

	it("skips non-array prompt_history files", async () => {
		const home = process.env.HOME as string;
		const cursorDir = path.join(home, ".cursor/chats/hash/session");
		mkdirSync(cursorDir, { recursive: true });
		writeFileSync(path.join(cursorDir, "prompt_history.json"), JSON.stringify({ prompts: ["hi"] }));
		writeFileSync(path.join(cursorDir, "meta.json"), JSON.stringify({}));

		const db = initDb(":memory:");
		await importTranscripts(db);

		const all = getEvents(db, { limit: 100 });
		expect(all.length).toBe(1);

		db.close();
	});

	it("walks Cursor chat directories and skips non-directories", async () => {
		const home = process.env.HOME as string;
		const cursorDir = path.join(home, ".cursor/chats/hash");
		const sessionDir = path.join(cursorDir, "session");
		mkdirSync(sessionDir, { recursive: true });
		writeFileSync(path.join(sessionDir, "prompt_history.json"), JSON.stringify(["prompt"]));
		writeFileSync(path.join(sessionDir, "meta.json"), JSON.stringify({}));
		writeFileSync(path.join(cursorDir, "not-a-dir"), "ignored");

		const db = initDb(":memory:");
		await importTranscripts(db);

		const all = getEvents(db, { limit: 100 });
		expect(all.length).toBe(2);

		db.close();
	});

	it("handles a missing Claude projects directory", async () => {
		const home = process.env.HOME as string;
		cleanup(home);
		writeFileSync(home, "");

		const db = initDb(":memory:");
		await importTranscripts(db);

		expect(getEvents(db, { limit: 100 }).length).toBe(0);
		db.close();

		rmSync(home, { force: true });
	});

	it("runs the full import command", async () => {
		const home = process.env.HOME as string;
		const claudeDir = path.join(home, ".claude/projects/session");
		mkdirSync(claudeDir, { recursive: true });
		writeFileSync(path.join(claudeDir, "session.jsonl"), JSON.stringify({ type: "user" }));

		await runImport();

		expect(existsSync(process.env.HAPPENIN_DB as string)).toBe(true);
		const db = initDb();
		expect(getEvents(db, { limit: 100 }).length).toBe(1);
		db.close();
	});

	it("handles unreadable and missing transcript files", async () => {
		const home = process.env.HOME as string;

		const claudeDir = path.join(home, ".claude/projects/session");
		mkdirSync(claudeDir, { recursive: true });
		writeFileSync(
			path.join(claudeDir, "session.jsonl"),
			JSON.stringify({
				type: "user",
				timestamp: true,
				cwd: 123,
				sessionId: true,
			}),
		);

		const cursorDir = path.join(home, ".cursor/chats/hash/session");
		mkdirSync(cursorDir, { recursive: true });
		mkdirSync(path.join(cursorDir, "prompt_history.json"));
		writeFileSync(path.join(cursorDir, "meta.json"), JSON.stringify({}));

		const db = initDb(":memory:");
		await importTranscripts(db);

		const all = getEvents(db, { limit: 100 });
		expect(all.length).toBe(2);
		db.close();
	});

	it("handles broken symlinks and non-directory entries in Cursor chats", async () => {
		const home = process.env.HOME as string;
		const cursorDir = path.join(home, ".cursor/chats");
		const hashDir = path.join(cursorDir, "hash");
		const sessionDir = path.join(hashDir, "session");
		mkdirSync(sessionDir, { recursive: true });
		writeFileSync(path.join(sessionDir, "prompt_history.json"), JSON.stringify(["prompt"]));
		writeFileSync(path.join(sessionDir, "meta.json"), JSON.stringify({}));

		const brokenSymlinkSession = path.join(hashDir, "other");
		mkdirSync(brokenSymlinkSession, { recursive: true });
		try {
			symlinkSync("missing", path.join(brokenSymlinkSession, "prompt_history.json"));
		} catch {}

		writeFileSync(path.join(cursorDir, "not-a-hash"), "ignored");

		const db = initDb(":memory:");
		await importTranscripts(db);

		const all = getEvents(db, { limit: 100 });
		expect(all.length).toBe(2);
		db.close();
	});
});
