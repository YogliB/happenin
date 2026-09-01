import { vi, describe, it, expect, beforeEach } from "vitest";
import { initDb, insertEvent } from "../src/db.js";

vi.mock("../src/db.js", async (importOriginal) => ({
	...(await importOriginal()),
	initDb: vi.fn(),
	insertEvent: vi.fn(),
}));

function busyError(errcode: number) {
	return Object.assign(new Error("database is locked"), {
		code: "ERR_SQLITE_ERROR",
		errcode,
	});
}

describe("record fail-open", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns the default response when initDb fails with a busy error", async () => {
		initDb.mockImplementation(() => {
			throw busyError(5);
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
			throw busyError(5);
		});
		const { recordFromRaw } = await import("../src/record.js");
		const response = recordFromRaw(
			["cursor"],
			JSON.stringify({ hook_event_name: "preToolUse", toolName: "Shell" }),
		);
		expect(response).toBe(JSON.stringify({ permission: "allow" }));
	});

	it("returns the default response for a locked error (errcode 6)", async () => {
		initDb.mockReturnValue({});
		insertEvent.mockImplementation(() => {
			throw busyError(6);
		});
		const { recordFromRaw } = await import("../src/record.js");
		const response = recordFromRaw(
			["cursor"],
			JSON.stringify({ hook_event_name: "preToolUse", toolName: "Shell" }),
		);
		expect(response).toBe(JSON.stringify({ permission: "allow" }));
	});

	it("returns the default response for an extended locked error (errcode 262)", async () => {
		initDb.mockReturnValue({});
		insertEvent.mockImplementation(() => {
			throw busyError(262);
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
