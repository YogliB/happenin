import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";
import { runInstall, parseTargets, resolveBin, formatError, homeDir } from "../src/install.js";

function tempDir(): string {
	return mkdtempSync(path.join(tmpdir(), "happenin-"));
}

function cleanup(dir: string): void {
	rmSync(dir, { recursive: true, force: true });
}

describe("install", () => {
	const originalHome = process.env.HOME;
	const originalArgv1 = process.argv[1];

	beforeEach(() => {
		process.env.HOME = tempDir();
	});

	afterEach(() => {
		if (process.env.HOME && process.env.HOME.startsWith(tmpdir())) {
			cleanup(process.env.HOME);
		}
		process.env.HOME = originalHome;
		process.argv[1] = originalArgv1;
	});

	it("parseTargets defaults to both, and respects flags", () => {
		expect(parseTargets([])).toEqual({ cursor: true, claude: true });
		expect(parseTargets(["--cursor"])).toEqual({ cursor: true, claude: false });
		expect(parseTargets(["--claude"])).toEqual({ cursor: false, claude: true });
		expect(parseTargets(["--cursor", "--claude"])).toEqual({ cursor: true, claude: true });
	});

	it("resolveBin falls back to happenin when argv[1] is not absolute", () => {
		process.argv[1] = "happenin";
		expect(resolveBin()).toBe("happenin");
	});

	it("resolveBin uses an absolute argv[1]", () => {
		process.argv[1] = "/usr/local/bin/happenin";
		expect(resolveBin()).toBe("/usr/local/bin/happenin");
	});

	it("formatError extracts messages from Error and strings", () => {
		expect(formatError(new Error("boom"))).toBe("boom");
		expect(formatError("plain string")).toBe("plain string");
		expect(formatError(123)).toBe("123");
	});

	it("installs only Cursor", async () => {
		await runInstall(["--cursor"]);
		expect(existsSync(path.join(process.env.HOME as string, ".cursor/hooks.json"))).toBe(true);
		expect(existsSync(path.join(process.env.HOME as string, ".claude/settings.json"))).toBe(false);
	});

	it("installs only Claude", async () => {
		await runInstall(["--claude"]);
		expect(existsSync(path.join(process.env.HOME as string, ".claude/settings.json"))).toBe(true);
		expect(existsSync(path.join(process.env.HOME as string, ".cursor/hooks.json"))).toBe(false);
	});

	it("handles existing configs without version or malformed hooks", async () => {
		const home = process.env.HOME as string;
		mkdirSync(path.join(home, ".cursor"), { recursive: true });
		writeFileSync(
			path.join(home, ".cursor/hooks.json"),
			JSON.stringify({ hooks: { beforeSubmitPrompt: [{ command: "existing" }] } }),
		);
		mkdirSync(path.join(home, ".claude"), { recursive: true });
		writeFileSync(
			path.join(home, ".claude/settings.json"),
			JSON.stringify({ hooks: { UserPromptSubmit: "bad" } }),
		);

		await runInstall([]);

		const cursor = JSON.parse(readFileSync(path.join(home, ".cursor/hooks.json"), "utf8"));
		expect(cursor.version).toBe(1);
		expect(cursor.hooks.beforeSubmitPrompt.length).toBe(2);

		const claude = JSON.parse(readFileSync(path.join(home, ".claude/settings.json"), "utf8"));
		expect(claude.hooks.UserPromptSubmit.length).toBeGreaterThan(0);
		expect(
			claude.hooks.UserPromptSubmit[claude.hooks.UserPromptSubmit.length - 1].hooks[0].command,
		).toMatch(/ record claude UserPromptSubmit$/);
	});

	it("rejects invalid JSON with a formatted error", async () => {
		const home = process.env.HOME as string;
		mkdirSync(path.join(home, ".cursor"), { recursive: true });
		writeFileSync(path.join(home, ".cursor/hooks.json"), "not json");

		const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		const previousExitCode = process.exitCode;
		await runInstall([]);
		expect(err).toHaveBeenCalledWith(expect.stringContaining("install failed:"));
		expect(process.exitCode).toBe(1);
		process.exitCode = previousExitCode;
		err.mockRestore();
	});

	it("rejects non-object JSON with a formatted error", async () => {
		const home = process.env.HOME as string;
		mkdirSync(path.join(home, ".cursor"), { recursive: true });
		writeFileSync(path.join(home, ".cursor/hooks.json"), JSON.stringify([1, 2, 3]));

		const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		const previousExitCode = process.exitCode;
		await runInstall([]);
		expect(err).toHaveBeenCalledWith(expect.stringContaining("install failed:"));
		expect(process.exitCode).toBe(1);
		process.exitCode = previousExitCode;
		err.mockRestore();
	});

	it("reports failures when the home directory cannot be created", async () => {
		const home = process.env.HOME as string;
		cleanup(home);
		writeFileSync(home, "");

		const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		const previousExitCode = process.exitCode;
		await runInstall([]);
		expect(err).toHaveBeenCalledWith(expect.stringContaining("install failed:"));
		expect(process.exitCode).toBe(1);
		process.exitCode = previousExitCode;
		err.mockRestore();

		rmSync(home, { force: true });
	});

	it("rejects a non-object Claude config", async () => {
		const home = process.env.HOME as string;
		mkdirSync(path.join(home, ".claude"), { recursive: true });
		writeFileSync(path.join(home, ".claude/settings.json"), JSON.stringify([1, 2, 3]));

		const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		const previousExitCode = process.exitCode;
		await runInstall([]);
		expect(err).toHaveBeenCalledWith(expect.stringContaining("install failed:"));
		expect(process.exitCode).toBe(1);
		process.exitCode = previousExitCode;
		err.mockRestore();
	});

	it("treats non-object hooks as empty", async () => {
		const home = process.env.HOME as string;
		mkdirSync(path.join(home, ".cursor"), { recursive: true });
		writeFileSync(path.join(home, ".cursor/hooks.json"), JSON.stringify({ hooks: "bad" }));
		mkdirSync(path.join(home, ".claude"), { recursive: true });
		writeFileSync(path.join(home, ".claude/settings.json"), JSON.stringify({ hooks: 123 }));

		await runInstall([]);

		const cursor = JSON.parse(readFileSync(path.join(home, ".cursor/hooks.json"), "utf8"));
		expect(cursor.hooks.beforeSubmitPrompt.length).toBeGreaterThan(0);

		const claude = JSON.parse(readFileSync(path.join(home, ".claude/settings.json"), "utf8"));
		expect(claude.hooks.UserPromptSubmit.length).toBeGreaterThan(0);
	});

	it("homeDir falls back to os.homedir when HOME is unset", () => {
		const home = process.env.HOME as string;
		delete process.env.HOME;
		const result = homeDir();
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
		process.env.HOME = home;
	});
});
