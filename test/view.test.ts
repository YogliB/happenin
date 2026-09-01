import { describe, it, expect } from "vitest";
import { eventView } from "../src/view.js";
import type { EventRow } from "../src/types.js";

describe("view", () => {
	it("parses a valid JSON payload", () => {
		const row: EventRow = {
			id: 1,
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			receivedAt: 1700000000000,
			payload: '{"tool":"Shell"}',
		};
		const view = eventView(row);
		expect(view.payload).toEqual({ tool: "Shell" });
	});

	it("returns the raw payload for invalid JSON", () => {
		const row: EventRow = {
			id: 2,
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			receivedAt: 1700000000000,
			payload: "not-json",
		};
		const view = eventView(row);
		expect(view.payload).toBe("not-json");
	});

	it("returns the raw payload for empty or missing payload", () => {
		const row: EventRow = {
			id: 3,
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			receivedAt: 1700000000000,
			payload: "",
		};
		const view = eventView(row);
		expect(view.payload).toBe("");
	});

	it("handles a nullish payload", () => {
		const row = {
			id: 4,
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			receivedAt: 1700000000000,
			payload: undefined,
		} as unknown as EventRow;
		const view = eventView(row);
		expect(view.payload).toBeUndefined();
	});

	it("exposes all event fields", () => {
		const row: EventRow = {
			id: 4,
			source: "claude",
			client: "claude_code",
			event: "PreToolUse",
			sessionId: "s-1",
			happenedAt: "2024-01-01T00:00:00Z",
			receivedAt: 1700000000000,
			projectPath: "/project",
			filePath: "foo.ts",
			toolName: "read",
			sourcePath: "/path",
			subagentId: "sub-1",
			subagentType: "shell",
			transcriptPath: "/t.jsonl",
			payload: JSON.stringify({}),
		};
		const view = eventView(row);
		expect(view.id).toBe(4);
		expect(view.source).toBe("claude");
		expect(view.client).toBe("claude_code");
		expect(view.event).toBe("PreToolUse");
		expect(view.sessionId).toBe("s-1");
		expect(view.happenedAt).toBe("2024-01-01T00:00:00Z");
		expect(view.receivedAt).toBe(1700000000000);
		expect(view.projectPath).toBe("/project");
		expect(view.filePath).toBe("foo.ts");
		expect(view.toolName).toBe("read");
		expect(view.sourcePath).toBe("/path");
		expect(view.subagentId).toBe("sub-1");
		expect(view.subagentType).toBe("shell");
		expect(view.transcriptPath).toBe("/t.jsonl");
	});
});
