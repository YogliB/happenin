import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import process from "node:process";

const originalArgv = process.argv;
const originalEnv = { ...process.env };

describe("bin", () => {
	it("runs the CLI from bin.ts", async () => {
		const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		process.argv = ["node", "/some/path/bin.js", "--version"];
		vi.resetModules();
		await import("../src/cli/bin.js");
		expect(write).toHaveBeenCalledWith(expect.stringMatching(/^\d+\.\d+\.\d+\n$/));
		write.mockRestore();
	});
});

describe("index", () => {
	let write: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		process.argv = originalArgv;
	});

	afterEach(() => {
		write.mockRestore();
		process.argv = originalArgv;
		process.env = { ...originalEnv };
	});

	it("shows help when no command is given", async () => {
		process.argv = ["node", "happenin"];
		vi.resetModules();
		const { default: run } = await import("../src/cli/index.js");
		await run();
		expect(write).toHaveBeenCalled();
	});

	it("shows help for --help and -h", async () => {
		for (const flag of ["--help", "-h"]) {
			process.argv = ["node", "happenin", flag];
			vi.resetModules();
			const { default: run } = await import("../src/cli/index.js");
			await run();
			expect(write).toHaveBeenCalled();
		}
	});

	it("shows version for --version and -v", async () => {
		for (const flag of ["--version", "-v"]) {
			process.argv = ["node", "happenin", flag];
			vi.resetModules();
			const { default: run } = await import("../src/cli/index.js");
			await run();
			expect(write).toHaveBeenCalledWith(expect.stringMatching(/^\d+\.\d+\.\d+\n$/));
		}
	});

	it("dispatches install, record, import, dashboard, query, and sessions", async () => {
		const runInstall = vi.fn();
		const runRecord = vi.fn();
		const runImport = vi.fn();
		const runDashboard = vi.fn();
		const runQuery = vi.fn();
		const runSessions = vi.fn();

		vi.doMock("../src/cli/install.js", () => ({ runInstall }));
		vi.doMock("../src/cli/record.js", () => ({ runRecord }));
		vi.doMock("../src/cli/import.js", () => ({ runImport }));
		vi.doMock("../src/UI/dashboard/index.js", () => ({ runDashboard }));
		vi.doMock("../src/cli/query.js", () => ({ runQuery }));
		vi.doMock("../src/cli/sessions.js", () => ({ runSessions }));

		for (const [command, fn] of [
			["install", runInstall],
			["record", runRecord],
			["import", runImport],
			["dashboard", runDashboard],
			["query", runQuery],
			["sessions", runSessions],
		] as const) {
			process.argv = ["node", "happenin", command];
			vi.resetModules();
			const { default: run } = await import("../src/cli/index.js");
			await run();
			expect(fn).toHaveBeenCalledWith([]);
		}

		vi.doUnmock("../src/cli/install.js");
		vi.doUnmock("../src/cli/record.js");
		vi.doUnmock("../src/cli/import.js");
		vi.doUnmock("../src/UI/dashboard/index.js");
		vi.doUnmock("../src/cli/query.js");
		vi.doUnmock("../src/cli/sessions.js");
	});

	it("reports unknown commands and exits with code 1", async () => {
		const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		const previous = process.exitCode;
		process.argv = ["node", "happenin", "nope"];
		vi.resetModules();
		const { default: run } = await import("../src/cli/index.js");
		await run();
		expect(err).toHaveBeenCalledWith("Unknown command: nope\n");
		expect(process.exitCode).toBe(1);
		process.exitCode = previous;
		err.mockRestore();
	});

	it("renders help with ANSI when TTY and no NO_COLOR", async () => {
		const originalIsTTY = process.stdout.isTTY;
		Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
		delete process.env.NO_COLOR;
		process.argv = ["node", "happenin", "--help"];
		vi.resetModules();
		const { default: run } = await import("../src/cli/index.js");
		await run();
		const output = write.mock.calls[0]?.[0] as string;
		expect(output).toContain("\u001b[1m");
		Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
	});

	it("renders help without ANSI when not a TTY", async () => {
		const originalIsTTY = process.stdout.isTTY;
		Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
		delete process.env.NO_COLOR;
		process.argv = ["node", "happenin", "--help"];
		vi.resetModules();
		const { default: run } = await import("../src/cli/index.js");
		await run();
		const output = write.mock.calls[0]?.[0] as string;
		expect(output).not.toContain("\u001b[1m");
		Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
	});

	it("renders help without ANSI when NO_COLOR is set", async () => {
		const originalIsTTY = process.stdout.isTTY;
		Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
		process.env.NO_COLOR = "1";
		process.argv = ["node", "happenin", "--help"];
		vi.resetModules();
		const { default: run } = await import("../src/cli/index.js");
		await run();
		const output = write.mock.calls[0]?.[0] as string;
		expect(output).not.toContain("\u001b[1m");
		Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
	});

	it("falls back to a minimal help when help file is missing", async () => {
		vi.doMock("node:fs", async (importOriginal) => {
			const actual = await importOriginal();
			return {
				...actual,
				readFileSync: vi.fn((filePath: string | URL, encoding: string) => {
					if (String(filePath).includes("help.md")) {
						throw new Error("missing");
					}
					return (actual as { readFileSync: typeof import("node:fs").readFileSync }).readFileSync(
						filePath,
						encoding,
					);
				}),
			};
		});

		process.argv = ["node", "happenin"];
		vi.resetModules();
		const { default: run } = await import("../src/cli/index.js");
		await run();
		const output = write.mock.calls[0]?.[0] as string;
		expect(output).toContain("Run happenin <command>");
		vi.doUnmock("node:fs");
	});

	it("falls back to a default version when package file is missing", async () => {
		vi.doMock("node:fs", async (importOriginal) => {
			const actual = await importOriginal();
			return {
				...actual,
				readFileSync: vi.fn((filePath: string | URL, encoding: string) => {
					if (String(filePath).includes("package.json")) {
						throw new Error("missing");
					}
					return (actual as { readFileSync: typeof import("node:fs").readFileSync }).readFileSync(
						filePath,
						encoding,
					);
				}),
			};
		});

		process.argv = ["node", "happenin", "--version"];
		vi.resetModules();
		const { default: run } = await import("../src/cli/index.js");
		await run();
		expect(write).toHaveBeenCalledWith("0.0.0\n");
		vi.doUnmock("node:fs");
	});

	it("falls back to 0.0.0 when package json has no version", async () => {
		vi.doMock("node:fs", async (importOriginal) => {
			const actual = await importOriginal();
			return {
				...actual,
				readFileSync: vi.fn((filePath: string | URL, _encoding: string) => {
					if (String(filePath).includes("package.json")) {
						return JSON.stringify({});
					}
					return (actual as { readFileSync: typeof import("node:fs").readFileSync }).readFileSync(
						filePath,
						"utf8",
					);
				}),
			};
		});

		process.argv = ["node", "happenin", "--version"];
		vi.resetModules();
		const { default: run } = await import("../src/cli/index.js");
		await run();
		expect(write).toHaveBeenCalledWith("0.0.0\n");
		vi.doUnmock("node:fs");
	});

	it("falls back when package root cannot be found", async () => {
		vi.doMock("node:fs", async (importOriginal) => {
			const actual = await importOriginal();
			return {
				...actual,
				existsSync: vi.fn(() => false),
				readFileSync: vi.fn(() => {
					throw new Error("missing");
				}),
			};
		});

		process.argv = ["node", "happenin", "--version"];
		vi.resetModules();
		const { default: run } = await import("../src/cli/index.js");
		await run();
		expect(write).toHaveBeenCalledWith("0.0.0\n");
		vi.doUnmock("node:fs");
	});
});
