import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";
import {
	initDb,
	insertEvent,
	getEvents,
	getLastEventId,
	getEventById,
	trackImport,
	getImportMtime,
} from "../src/db.js";
import { recordFromRaw } from "../src/record.js";
import { runInstall } from "../src/install.js";
import { importTranscripts } from "../src/import.js";
import { dashboardHtml, renderEventRow } from "../src/dashboard.js";
import type { EventInsert, EventRow } from "../src/types.js";

function tempDir(): string {
	return mkdtempSync(path.join(tmpdir(), "happenin-"));
}

function cleanup(dir: string): void {
	rmSync(dir, { recursive: true, force: true });
}

describe("happenin", () => {
	describe("db", () => {
		it("creates an in-memory database and returns an inserted event", () => {
			const db = initDb(":memory:");
			const insert: EventInsert = {
				source: "cursor",
				client: "cursor",
				event: "preToolUse",
				sessionId: "s-1",
				payload: JSON.stringify({ tool: "Shell" }),
			};
			insertEvent(db, insert);
			const rows = getEvents(db, { limit: 10 });
			expect(rows.length).toBe(1);
			expect(rows[0].source).toBe("cursor");
			expect(rows[0].event).toBe("preToolUse");
			expect(rows[0].payload).toBe(insert.payload);
			expect(getLastEventId(db)).toBeGreaterThan(0);
			expect(getEventById(db, rows[0].id)?.sessionId).toBe("s-1");
			expect(getEvents(db, { event: "preToolUse", limit: 10 }).length).toBe(1);
		});

		it("tracks import mtimes", () => {
			const db = initDb(":memory:");
			trackImport(db, "/tmp/foo.jsonl", 12345);
			expect(getImportMtime(db, "/tmp/foo.jsonl")).toBe(12345);
			expect(getImportMtime(db, "/tmp/missing.jsonl")).toBeUndefined();
		});
	});

	describe("record", () => {
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
		});

		it("records a Cursor preToolUse event and returns permission", () => {
			const payload = JSON.stringify({
				hook_event_name: "preToolUse",
				toolName: "Shell",
				sessionId: "s-1",
				timestamp: 1700000000000,
			});
			const response = recordFromRaw(["cursor"], payload);
			expect(response).toBe(JSON.stringify({ permission: "allow" }));
			const db = initDb();
			const rows = getEvents(db, { limit: 10 });
			expect(rows.length).toBe(1);
			expect(rows[0].event).toBe("preToolUse");
			expect(rows[0].toolName).toBe("Shell");
		});

		it("records a Cursor beforeSubmitPrompt event and returns continue", () => {
			const payload = JSON.stringify({ hook_event_name: "beforeSubmitPrompt", prompt: "hello" });
			const response = recordFromRaw(["cursor"], payload);
			expect(response).toBe(JSON.stringify({ continue: true }));
		});

		it("records a Claude PreToolUse event and returns approve", () => {
			const payload = JSON.stringify({
				tool_name: "read_file",
				sessionId: "s-2",
				timestamp: "2024-01-01T00:00:00Z",
			});
			const response = recordFromRaw(["claude", "PreToolUse"], payload);
			expect(response).toBe(JSON.stringify({ decision: "approve" }));
			const db = initDb();
			const rows = getEvents(db, { event: "PreToolUse", limit: 10 });
			expect(rows.length).toBe(1);
			expect(rows[0].sessionId).toBe("s-2");
		});

		it("records a Claude UserPromptSubmit event and returns continue", () => {
			const payload = JSON.stringify({ prompt: "what is 2+2?" });
			const response = recordFromRaw(["claude", "UserPromptSubmit"], payload);
			expect(response).toBe(JSON.stringify({ continue: true }));
		});

		it("is fail-open for unknown or invalid input", () => {
			expect(recordFromRaw(["cursor"], "")).toBeUndefined();
			expect(recordFromRaw(["cursor"], "not-json")).toBeUndefined();
			expect(recordFromRaw(["unknown"], "{}")).toBeUndefined();
		});
	});

	describe("install", () => {
		const originalHome = process.env.HOME;

		beforeEach(() => {
			process.env.HOME = tempDir();
		});

		afterEach(() => {
			if (process.env.HOME && process.env.HOME.startsWith(tmpdir())) {
				cleanup(process.env.HOME);
			}
			process.env.HOME = originalHome;
		});

		it("writes Cursor and Claude hook configs", async () => {
			await runInstall([]);
			const home = process.env.HOME as string;
			const cursor = JSON.parse(readFileSync(path.join(home, ".cursor/hooks.json"), "utf8"));
			const claude = JSON.parse(readFileSync(path.join(home, ".claude/settings.json"), "utf8"));

			expect(cursor.version).toBe(1);
			expect(cursor.hooks.beforeSubmitPrompt.length).toBeGreaterThan(0);
			expect(cursor.hooks.beforeSubmitPrompt[0].command).toMatch(/ record cursor$/);

			expect(claude.hooks.UserPromptSubmit.length).toBeGreaterThan(0);
			expect(claude.hooks.UserPromptSubmit[0].hooks[0].command).toMatch(
				/ record claude UserPromptSubmit$/,
			);

			expect(existsSync(path.join(home, ".happenin/backups/cursor"))).toBe(true);
			expect(existsSync(path.join(home, ".happenin/backups/claude"))).toBe(true);
		});

		it("appends to existing hooks without overwriting", async () => {
			const home = process.env.HOME as string;
			mkdirSync(path.join(home, ".cursor"), { recursive: true });
			writeFileSync(
				path.join(home, ".cursor/hooks.json"),
				JSON.stringify({ version: 1, hooks: { beforeSubmitPrompt: [{ command: "existing" }] } }),
			);
			mkdirSync(path.join(home, ".claude"), { recursive: true });
			writeFileSync(
				path.join(home, ".claude/settings.json"),
				JSON.stringify({
					hooks: {
						UserPromptSubmit: [{ matcher: "", hooks: [{ type: "command", command: "existing" }] }],
					},
				}),
			);

			await runInstall([]);

			const cursor = JSON.parse(readFileSync(path.join(home, ".cursor/hooks.json"), "utf8"));
			const claude = JSON.parse(readFileSync(path.join(home, ".claude/settings.json"), "utf8"));

			expect(cursor.hooks.beforeSubmitPrompt.length).toBe(2);
			expect(cursor.hooks.beforeSubmitPrompt[0].command).toBe("existing");
			expect(claude.hooks.UserPromptSubmit.length).toBe(2);
		});
	});

	describe("import", () => {
		const originalHome = process.env.HOME;

		beforeEach(() => {
			process.env.HOME = tempDir();
		});

		afterEach(() => {
			if (process.env.HOME && process.env.HOME.startsWith(tmpdir())) {
				cleanup(process.env.HOME);
			}
			process.env.HOME = originalHome;
		});

		it("imports Claude JSONL and Cursor transcripts", async () => {
			const home = process.env.HOME as string;

			const claudeDir = path.join(home, ".claude/projects/foo");
			mkdirSync(claudeDir, { recursive: true });
			writeFileSync(
				path.join(claudeDir, "session-1.jsonl"),
				[
					JSON.stringify({
						type: "user",
						sessionId: "session-1",
						timestamp: "2024-01-01T00:00:00Z",
						message: "hello",
					}),
					JSON.stringify({
						type: "assistant",
						sessionId: "session-1",
						timestamp: "2024-01-01T00:00:01Z",
						message: "hi",
					}),
				].join("\n"),
			);

			const cursorDir = path.join(home, ".cursor/chats/hash/session-2");
			mkdirSync(cursorDir, { recursive: true });
			writeFileSync(
				path.join(cursorDir, "prompt_history.json"),
				JSON.stringify(["first prompt", "second prompt"]),
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
			expect(
				all.filter((r) => r.source === "cursor-transcript" && r.event === "prompt").length,
			).toBe(2);
			expect(
				all.filter((r) => r.source === "cursor-transcript" && r.event === "session_meta").length,
			).toBe(1);
		});
	});

	describe("dashboard", () => {
		it("renders dashboard html with the required libraries", () => {
			const html = dashboardHtml();
			expect(html).toContain("htmx.org@2.0.10");
			expect(html).toContain("htmx-ext-sse@2.2.4");
			expect(html).toContain("alpinejs@3.14.8");
			expect(html).toContain('sse-connect="/events/stream"');
		});

		it("renders an event row with escaped fields", () => {
			const row: EventRow = {
				id: 1,
				source: "cursor",
				client: "cursor",
				event: "preToolUse",
				sessionId: "s-1",
				happenedAt: "2024-01-01T00:00:00Z",
				receivedAt: 1700000000000,
				toolName: "Shell<>&",
				filePath: "foo/bar.ts",
				projectPath: "/project",
				payload: JSON.stringify({ tool: "Shell" }),
			};
			const html = renderEventRow(row);
			expect(html).toContain("preToolUse");
			expect(html).toContain("Shell&lt;&gt;&amp;");
			expect(html).toContain("foo/bar.ts");
		});
	});
});
