import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";
import { recordFromRaw, runRecord, isBusyError } from "../src/cli/record.js";
import { initDb, getEvents } from "../src/shared/db.js";

function tempDir(): string {
	return mkdtempSync(path.join(tmpdir(), "happenin-"));
}

function cleanup(dir: string): void {
	rmSync(dir, { recursive: true, force: true });
}

const originalHome = process.env.HOME;
const originalDb = process.env.HAPPENIN_DB;
const originalStdin = process.stdin;

function setStdin(stream: NodeJS.ReadableStream): void {
	Object.defineProperty(process, "stdin", { get: () => stream, configurable: true });
}

function restoreStdin(): void {
	Object.defineProperty(process, "stdin", { get: () => originalStdin, configurable: true });
}

describe("record", () => {
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
		restoreStdin();
		vi.restoreAllMocks();
	});

	it("isBusyError handles busy, non-busy, and invalid errors", () => {
		expect(isBusyError({ code: "ERR_SQLITE_ERROR", errcode: 5 })).toBe(true);
		expect(isBusyError({ code: "ERR_SQLITE_ERROR", errcode: 6 })).toBe(true);
		expect(isBusyError({ code: "ERR_SQLITE_ERROR", errcode: 262 })).toBe(true);
		expect(isBusyError({ code: "ERR_SQLITE_ERROR", errcode: 1 })).toBe(false);
		expect(isBusyError({ code: "OTHER", errcode: 5 })).toBe(false);
		expect(isBusyError("string error")).toBe(false);
		expect(isBusyError(null)).toBe(false);
		expect(isBusyError(undefined)).toBe(false);
	});

	it("handles object fields and numeric string timestamps", () => {
		const payload = JSON.stringify({
			hook_event_name: "preToolUse",
			toolName: { nested: 1 },
			timestamp: "1700000000000",
			sessionId: "s-1",
		});
		const response = recordFromRaw(["cursor"], payload);
		expect(response).toBe(JSON.stringify({ permission: "allow" }));

		const db = initDb();
		const rows = getEvents(db, { limit: 10 });
		expect(rows.length).toBe(1);
		expect(rows[0].toolName).toBeNull();
		expect(rows[0].happenedAt).toBe(new Date(1700000000000).toISOString());
		expect(rows[0].sessionId).toBe("s-1");
		db.close();
	});

	it("passes through non-numeric string timestamps", () => {
		const payload = JSON.stringify({
			hook_event_name: "preToolUse",
			toolName: "Shell",
			timestamp: "2024-01-01T00:00:00Z",
			sessionId: "s-2",
		});
		const response = recordFromRaw(["cursor"], payload);
		expect(response).toBe(JSON.stringify({ permission: "allow" }));

		const db = initDb();
		const rows = getEvents(db, { limit: 10 });
		expect(rows[0].happenedAt).toBe("2024-01-01T00:00:00Z");
		db.close();
	});

	it("falls back to later timestamp keys when earlier ones are empty or invalid", () => {
		const payload = JSON.stringify({
			hook_event_name: "preToolUse",
			sessionId: "s-6",
			happenedAt: { invalid: true },
			timestamp: "",
			time: "not-a-date",
			ts: "1700000000000",
		});
		const response = recordFromRaw(["cursor"], payload);
		expect(response).toBe(JSON.stringify({ permission: "allow" }));

		const db = initDb();
		const rows = getEvents(db, { sessionId: "s-6", limit: 10 });
		expect(rows[0].happenedAt).toBe(new Date(1700000000000).toISOString());
		db.close();
	});

	it("falls back to receivedAt when all timestamps are out of range", () => {
		const payload = JSON.stringify({
			hook_event_name: "preToolUse",
			sessionId: "s-7",
			ts: 1e100,
			createdAt: "8640000000000001",
		});
		const response = recordFromRaw(["cursor"], payload);
		expect(response).toBe(JSON.stringify({ permission: "allow" }));

		const db = initDb();
		const rows = getEvents(db, { sessionId: "s-7", limit: 10 });
		expect(rows[0].happenedAt).toBe(new Date(rows[0].receivedAt).toISOString());
		db.close();
	});

	it("falls back to receivedAt when a numeric timestamp is not finite", () => {
		const payload = '{"hook_event_name":"preToolUse","sessionId":"s-8","ts":1e309}';
		const response = recordFromRaw(["cursor"], payload);
		expect(response).toBe(JSON.stringify({ permission: "allow" }));

		const db = initDb();
		const rows = getEvents(db, { sessionId: "s-8", limit: 10 });
		expect(rows[0].happenedAt).toBe(new Date(rows[0].receivedAt).toISOString());
		db.close();
	});

	it("falls back to receivedAt when a numeric string timestamp is not finite", () => {
		const big = `1${"0".repeat(309)}`;
		const payload = JSON.stringify({
			hook_event_name: "preToolUse",
			sessionId: "s-9",
			ts: big,
		});
		const response = recordFromRaw(["cursor"], payload);
		expect(response).toBe(JSON.stringify({ permission: "allow" }));

		const db = initDb();
		const rows = getEvents(db, { sessionId: "s-9", limit: 10 });
		expect(rows[0].happenedAt).toBe(new Date(rows[0].receivedAt).toISOString());
		db.close();
	});

	it("records a claude event with no default response", () => {
		const response = recordFromRaw(
			["claude", "SessionStart"],
			JSON.stringify({ sessionId: "s-3" }),
		);
		expect(response).toBeUndefined();
	});

	it("records a claude event with an undefined event name", () => {
		const response = recordFromRaw(["claude"], JSON.stringify({ sessionId: "s-3a" }));
		expect(response).toBeUndefined();
	});

	it("handles empty string fields", () => {
		const response = recordFromRaw(
			["cursor"],
			JSON.stringify({
				hook_event_name: "preToolUse",
				toolName: "",
				sessionId: "",
			}),
		);
		expect(response).toBe(JSON.stringify({ permission: "allow" }));

		const db = initDb();
		const rows = getEvents(db, { limit: 10 });
		expect(rows[0].toolName).toBeNull();
		expect(rows[0].sessionId).toBeNull();
		db.close();
	});

	it("falls back through subagent session fields", () => {
		const payload = JSON.stringify({
			hook_event_name: "subagentStart",
			conversation_id: "conv-1",
			subagent_id: "sub-1",
			subagent_type: "shell",
			transcript_path: "/foo/bar/sub-1.jsonl",
		});
		const response = recordFromRaw(["cursor"], payload);
		expect(response).toBe(JSON.stringify({ permission: "allow" }));

		const db = initDb();
		const rows = getEvents(db, { event: "subagentStart", limit: 10 });
		expect(rows.length).toBe(1);
		expect(rows[0].sessionId).toBe("conv-1");
		db.close();
	});

	it("falls back through all subagent session fields", () => {
		for (const key of ["parent_conversation_id", "session_id", undefined]) {
			const db = initDb();
			const payload: Record<string, unknown> = { hook_event_name: "subagentStart" };
			if (key === "parent_conversation_id") {
				payload.parent_conversation_id = "parent-1";
			} else if (key === "session_id") {
				payload.session_id = "sess-id";
			}

			recordFromRaw(["cursor"], JSON.stringify(payload));

			const rows = getEvents(db, { event: "subagentStart", limit: 10 });
			expect(rows[0].sessionId).toBe(
				key === undefined ? null : key === "parent_conversation_id" ? "parent-1" : "sess-id",
			);
			db.close();
		}
	});

	it("falls back to sessionId and session_id for subagent session", () => {
		const payload = JSON.stringify({
			hook_event_name: "subagentStart",
			sessionId: "sess-1",
			subagent_id: "sub-2",
		});
		const response = recordFromRaw(["cursor"], payload);
		expect(response).toBe(JSON.stringify({ permission: "allow" }));

		const db = initDb();
		const rows = getEvents(db, { event: "subagentStart", limit: 10 });
		expect(rows[0].sessionId).toBe("sess-1");
		db.close();
	});

	it("tags child events with the subagent id via tool_use_id", () => {
		recordFromRaw(
			["cursor"],
			JSON.stringify({
				hook_event_name: "subagentStart",
				conversation_id: "conv-1",
				subagent_id: "toolu-1",
				subagent_type: "shell",
			}),
		);
		const matched = recordFromRaw(
			["cursor"],
			JSON.stringify({
				hook_event_name: "preToolUse",
				session_id: "conv-1",
				tool_use_id: "toolu-1",
			}),
		);
		const unmatched = recordFromRaw(
			["cursor"],
			JSON.stringify({
				hook_event_name: "preToolUse",
				session_id: "conv-1",
				tool_use_id: "toolu-other",
			}),
		);
		expect(matched).toBe(JSON.stringify({ permission: "allow" }));
		expect(unmatched).toBe(JSON.stringify({ permission: "allow" }));

		const db = initDb();
		const rows = getEvents(db, { event: "preToolUse", limit: 10 });
		expect(rows.length).toBe(2);
		expect(rows.find((row) => row.toolName === null && row.subagentId === "toolu-1")).toBeTruthy();
		expect(rows.find((row) => row.subagentId === null)).toBeTruthy();
		db.close();
	});

	it("extracts project path from workspace_roots and falls back timestamps", () => {
		const payload = JSON.stringify({
			hook_event_name: "preToolUse",
			sessionId: "s-5",
			workspace_roots: ["", "   ", "/project"],
		});
		recordFromRaw(["cursor"], payload);

		const db = initDb();
		const rows = getEvents(db, { sessionId: "s-5", limit: 10 });
		expect(rows.length).toBe(1);
		expect(rows[0].projectPath).toBe("/project");
		expect(rows[0].happenedAt).toBe(new Date(rows[0].receivedAt).toISOString());
		db.close();
	});

	it("extracts project path from a string workspaceRoot", () => {
		const payload = JSON.stringify({
			hook_event_name: "preToolUse",
			sessionId: "s-5b",
			workspaceRoot: "/single",
		});
		recordFromRaw(["cursor"], payload);

		const db = initDb();
		const rows = getEvents(db, { sessionId: "s-5b", limit: 10 });
		expect(rows[0].projectPath).toBe("/single");
		db.close();
	});

	it("records from stdin via runRecord", async () => {
		const payload = JSON.stringify({
			hook_event_name: "beforeSubmitPrompt",
			prompt: "hello",
			sessionId: "s-4",
		});
		const stream = Readable.from([Buffer.from(payload)]);
		setStdin(stream);

		const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		await runRecord(["cursor"]);

		expect(write).toHaveBeenCalledWith(`${JSON.stringify({ continue: true })}\n`);
		write.mockRestore();

		const db = initDb();
		const rows = getEvents(db, { event: "beforeSubmitPrompt", limit: 10 });
		expect(rows.length).toBe(1);
		expect(rows[0].sessionId).toBe("s-4");
		db.close();
	});

	it("runRecord handles string chunks", async () => {
		const payload = JSON.stringify({
			hook_event_name: "beforeSubmitPrompt",
			prompt: "hello",
		});
		const stream = Readable.from([payload]);
		setStdin(stream);

		const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		await runRecord(["cursor"]);

		expect(write).toHaveBeenCalledWith(`${JSON.stringify({ continue: true })}\n`);
		write.mockRestore();
	});

	it("runRecord does not write when there is no default response", async () => {
		const payload = JSON.stringify({ hook_event_name: "sessionStart", sessionId: "s-5" });
		const stream = Readable.from([Buffer.from(payload)]);
		setStdin(stream);

		const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		await runRecord(["cursor"]);

		expect(write).not.toHaveBeenCalled();
		write.mockRestore();
	});
});
