import { vi, describe, it, expect, beforeEach } from "vitest";
import { initDb, insertEvent } from "../src/db.js";

vi.mock("../src/db.js", async (importOriginal) => ({
	...(await importOriginal()),
	initDb: vi.fn(),
	insertEvent: vi.fn(),
}));

function busyError() {
	return Object.assign(new Error("database is locked"), {
		code: "ERR_SQLITE_ERROR",
		errcode: 5,
	});
}

describe("record fail-open", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns the default response when initDb fails with a busy error", async () => {
		initDb.mockImplementation(() => {
			throw busyError();
		});
		const { recordFromRaw } = await import("../src/record.js");
		const response = recordFromRaw(
			["cursor"],
			JSON.stringify({ hook_event_name: "preToolUse", toolName: "Shell" }),
		);
		expect(response).toBe(JSON.stringify({ permission: "allow" }));
	});

	it("returns the default response when insertEvent fails with a busy error", async () => {
		initDb.mockReturnValue({});
		insertEvent.mockImplementation(() => {
			throw busyError();
		});
		const { recordFromRaw } = await import("../src/record.js");
		const response = recordFromRaw(
			["cursor"],
			JSON.stringify({ hook_event_name: "preToolUse", toolName: "Shell" }),
		);
		expect(response).toBe(JSON.stringify({ permission: "allow" }));
	});

	it("rethrows non-busy errors", async () => {
		initDb.mockReturnValue({});
		insertEvent.mockImplementation(() => {
			throw new Error("disk full");
		});
		const { recordFromRaw } = await import("../src/record.js");
		expect(() =>
			recordFromRaw(
				["cursor"],
				JSON.stringify({ hook_event_name: "preToolUse", toolName: "Shell" }),
			),
		).toThrow("disk full");
	});
});
