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
	countEvents,
	getFilterOptions,
} from "../src/db.js";
import { recordFromRaw } from "../src/record.js";
import { runInstall } from "../src/install.js";
import { importTranscripts } from "../src/import.js";
import {
	dashboardHtml,
	groupEventsBySession,
	parseQuery,
	renderEventRow,
	renderSessionGroup,
} from "../src/dashboard.js";
import type { EventInsert, EventRow } from "../src/types.js";

function tempDir(): string {
	return mkdtempSync(path.join(tmpdir(), "happenin-"));
}

function cleanup(dir: string): void {
	rmSync(dir, { recursive: true, force: true });
}

describe("happenin", () => {
	describe("db", () => {
		it("paginates and counts events", () => {
			const db = initDb(":memory:");
			for (let i = 0; i < 3; i++) {
				insertEvent(db, {
					source: "cursor",
					client: "cursor",
					event: "preToolUse",
					sessionId: "s-1",
					payload: JSON.stringify({ i }),
				});
			}
			expect(getEvents(db, { limit: 2 }).length).toBe(2);
			expect(getEvents(db, { limit: 2, offset: 2 }).length).toBe(1);
			expect(countEvents(db, {})).toBe(3);
			expect(countEvents(db, { source: "cursor" })).toBe(3);
			expect(countEvents(db, { source: "claude" })).toBe(0);
		});

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

		it("returns distinct filter options", () => {
			const db = initDb(":memory:");
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
			insertEvent(db, {
				source: "cursor",
				client: "cursor",
				event: "preToolUse",
				sessionId: "s-1",
				payload: JSON.stringify({}),
			});
			insertEvent(db, {
				source: "cursor-transcript",
				client: "cursor",
				event: "prompt",
				sessionId: "s-3",
				payload: JSON.stringify({}),
			});

			const options = getFilterOptions(db);
			expect(options.sources).toEqual(["claude", "cursor"]);
			expect(options.events).toEqual(["PreToolUse", "preToolUse", "prompt"]);
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
			expect(html).toContain("data-theme-toggle");
			expect(html).toContain("data-filter-form");
			expect(html).toContain("happenin-theme");
			expect(html).toContain("happenin-filters");

			expect(html).toContain("🌙");
			expect(html).toContain('id="feed-pager"');
			expect(html).toContain('<select name="source">');
			expect(html).toContain('<select name="event">');
			expect(html).not.toContain('<select name="session">');
			expect(html).toContain('name="session"');
			expect(html).not.toContain(">Filter</button>");
			expect(html).toContain("input changed delay:300ms");
		});

		it("renders filter select options", () => {
			const html = dashboardHtml({
				sources: ["cursor", "claude"],
				events: ["preToolUse"],
			});
			expect(html).toContain('<option value="cursor">cursor</option>');
			expect(html).toContain('<option value="claude">claude</option>');
			expect(html).toContain('<option value="preToolUse">preToolUse</option>');
			expect(html).toContain('class="search"');
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
			expect(html).toContain("session:s-1");
		});

		it("ignores empty filter query params sent by the form", () => {
			const url = new URL("http://localhost/fragments/events?source=&event=&session=&q=&page=2");
			const options = parseQuery(url);
			expect(options.source).toBeUndefined();
			expect(options.event).toBeUndefined();
			expect(options.sessionId).toBeUndefined();
			expect(options.q).toBeUndefined();
			expect(options.page).toBe(2);
			expect(options.offset).toBe(50);
		});

		it("renders a session group and omits session from inner rows", () => {
			const rows: EventRow[] = [
				{
					id: 2,
					source: "cursor",
					client: "cursor",
					event: "preToolUse",
					sessionId: "s-1",
					happenedAt: "2024-01-01T00:00:01Z",
					receivedAt: 1700000001000,
					toolName: "Shell",
					payload: JSON.stringify({ tool: "Shell" }),
				},
				{
					id: 1,
					source: "cursor",
					client: "cursor",
					event: "sessionStart",
					sessionId: "s-1",
					happenedAt: "2024-01-01T00:00:00Z",
					receivedAt: 1700000000000,
					payload: JSON.stringify({}),
				},
			];
			const html = renderSessionGroup("s-1", rows);
			expect(html).toContain("s-1");
			expect(html).toContain("preToolUse");
			expect(html).toContain("sessionStart");
			expect(html).not.toContain("session:s-1");
			expect(html).toContain('data-session="s-1"');
			expect(html).toContain("<details");
			expect(html).toContain("<summary");
			expect(html).toMatch(/<details[^>]*\bopen\b/);
		});

		it("groups non-contiguous events by session into a single group each", () => {
			const rows: EventRow[] = [
				{
					id: 5,
					source: "cursor",
					client: "cursor",
					event: "sessionStart",
					sessionId: "s-2",
					happenedAt: "2024-01-01T00:00:04Z",
					receivedAt: 1700000004000,
					payload: JSON.stringify({}),
				},
				{
					id: 4,
					source: "cursor",
					client: "cursor",
					event: "preToolUse",
					sessionId: "s-1",
					happenedAt: "2024-01-01T00:00:03Z",
					receivedAt: 1700000003000,
					payload: JSON.stringify({ tool: "Shell" }),
				},
				{
					id: 3,
					source: "cursor",
					client: "cursor",
					event: "prompt",
					sessionId: "s-2",
					happenedAt: "2024-01-01T00:00:02Z",
					receivedAt: 1700000002000,
					payload: JSON.stringify({}),
				},
				{
					id: 2,
					source: "cursor",
					client: "cursor",
					event: "sessionStart",
					sessionId: "s-1",
					happenedAt: "2024-01-01T00:00:01Z",
					receivedAt: 1700000001000,
					payload: JSON.stringify({}),
				},
				{
					id: 1,
					source: "cursor",
					client: "cursor",
					event: "prompt",
					sessionId: "s-1",
					happenedAt: "2024-01-01T00:00:00Z",
					receivedAt: 1700000000000,
					payload: JSON.stringify({}),
				},
			];
			const groups = groupEventsBySession(rows);
			expect(groups.length).toBe(2);
			expect(groups[0].sessionId).toBe("s-2");
			expect(groups[0].rows.map((r) => r.id)).toEqual([5, 3]);
			expect(groups[1].sessionId).toBe("s-1");
			expect(groups[1].rows.map((r) => r.id)).toEqual([4, 2, 1]);
		});
	});
});
