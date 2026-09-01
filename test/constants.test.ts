import { describe, it, expect } from "vitest";
import { DEFAULT_RESPONSES } from "../src/constants.js";
import type { Source } from "../src/types.js";

describe("DEFAULT_RESPONSES", () => {
	it("returns continue for cursor beforeSubmitPrompt", () => {
		expect(DEFAULT_RESPONSES("cursor" as Source, "beforeSubmitPrompt")).toBe(
			JSON.stringify({ continue: true }),
		);
	});

	it("returns permission for cursor permission events", () => {
		for (const event of [
			"preToolUse",
			"beforeShellExecution",
			"beforeMCPExecution",
			"beforeReadFile",
			"subagentStart",
		]) {
			expect(DEFAULT_RESPONSES("cursor" as Source, event)).toBe(
				JSON.stringify({ permission: "allow" }),
			);
		}
	});

	it("returns undefined for unknown cursor events", () => {
		expect(DEFAULT_RESPONSES("cursor" as Source, "sessionStart")).toBeUndefined();
		expect(DEFAULT_RESPONSES("cursor" as Source, "unknown")).toBeUndefined();
	});

	it("returns continue for claude UserPromptSubmit and UserPromptExpansion", () => {
		expect(DEFAULT_RESPONSES("claude" as Source, "UserPromptSubmit")).toBe(
			JSON.stringify({ continue: true }),
		);
		expect(DEFAULT_RESPONSES("claude" as Source, "UserPromptExpansion")).toBe(
			JSON.stringify({ continue: true }),
		);
	});

	it("returns approve for claude approve events", () => {
		for (const event of [
			"PreToolUse",
			"PermissionRequest",
			"SubagentStart",
			"SubagentStop",
			"TaskCreated",
			"TaskCompleted",
			"Stop",
			"WorktreeCreate",
			"WorktreeRemove",
		]) {
			expect(DEFAULT_RESPONSES("claude" as Source, event)).toBe(
				JSON.stringify({ decision: "approve" }),
			);
		}
	});

	it("returns undefined for unknown claude events", () => {
		expect(DEFAULT_RESPONSES("claude" as Source, "SessionStart")).toBeUndefined();
		expect(DEFAULT_RESPONSES("claude" as Source, "unknown")).toBeUndefined();
	});

	it("returns undefined for transcript and unknown sources", () => {
		expect(DEFAULT_RESPONSES("claude-transcript" as Source, "PreToolUse")).toBeUndefined();
		expect(DEFAULT_RESPONSES("cursor-transcript" as Source, "preToolUse")).toBeUndefined();
		expect(DEFAULT_RESPONSES("unknown" as Source, "event")).toBeUndefined();
	});
});
