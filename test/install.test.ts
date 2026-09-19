import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { CURSOR_HOOK_EVENTS, CLAUDE_HOOK_EVENTS } from "../src/shared/constants.js";
import process from "node:process";
import { runInstall, parseTargets, resolveBin, formatError, homeDir } from "../src/cli/install.js";

function tempDir(): string {
	return mkdtempSync(path.join(tmpdir(), "happenin-"));
}

function cleanup(dir: string): void {
	rmSync(dir, { recursive: true, force: true });
}

describe("install", () => {
	const originalHome = process.env.HOME;
	const originalArgv1 = process.argv[1];
	const originalPlatform = process.platform;

	beforeEach(() => {
		process.env.HOME = tempDir();
	});

	afterEach(() => {
		if (process.env.HOME && process.env.HOME.startsWith(tmpdir())) {
			cleanup(process.env.HOME);
		}
		process.env.HOME = originalHome;
		process.argv[1] = originalArgv1;
		Object.defineProperty(process, "platform", {
			value: originalPlatform,
			configurable: true,
		});
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

	it("resolveBin uses an absolute argv[1] on posix", () => {
		Object.defineProperty(process, "platform", { value: "linux", configurable: true });
		process.argv[1] = "/usr/local/bin/happenin";
		expect(resolveBin()).toBe("/usr/local/bin/happenin");
	});

	it("resolveBin falls back to the npm shim for an absolute argv[1] on win32", () => {
		Object.defineProperty(process, "platform", { value: "win32", configurable: true });
		process.argv[1] = "/home/x/.npm/lib/node_modules/happenin/dist/bin.js";
		expect(resolveBin()).toBe("happenin");
	});

	it("resolveBin returns an npx command inside an npx cache", () => {
		process.argv[1] = path.join(tmpdir(), "_npx", "abc123", "node_modules", ".bin", "happenin");
		expect(resolveBin()).toBe("npx -y happenin");
	});

	it("formatError extracts messages from Error and strings", () => {
		expect(formatError(new Error("boom"))).toBe("boom");
		expect(formatError("plain string")).toBe("plain string");
		expect(formatError(123)).toBe("123");
	});

	it("defaults to plugin setup without changing user config", async () => {
		const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		await runInstall([]);
		const home = process.env.HOME as string;
		expect(existsSync(path.join(home, ".cursor/hooks.json"))).toBe(false);
		expect(existsSync(path.join(home, ".claude/settings.json"))).toBe(false);
		expect(output).toHaveBeenCalledWith(
			expect.stringContaining("no user config files were changed"),
		);
		output.mockRestore();
	});

	it("shows setup for a selected plugin only", async () => {
		const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		await runInstall(["--cursor"]);
		expect(output).toHaveBeenCalledWith(expect.stringContaining("Cursor: open Customize"));
		expect(output).not.toHaveBeenCalledWith(expect.stringContaining("Claude Code: run"));
		output.mockClear();
		await runInstall(["--claude"]);
		expect(output).toHaveBeenCalledWith(expect.stringContaining("Claude Code: run"));
		expect(output).not.toHaveBeenCalledWith(expect.stringContaining("Cursor: open Customize"));
		output.mockRestore();
	});

	it("packages every supported event in both plugin hook files", () => {
		const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
		const cursor = JSON.parse(
			readFileSync(path.join(root, "plugins/cursor/hooks/hooks.json"), "utf8"),
		);
		const claude = JSON.parse(
			readFileSync(path.join(root, "plugins/claude/hooks/hooks.json"), "utf8"),
		);
		expect(Object.keys(cursor.hooks).sort()).toEqual([...CURSOR_HOOK_EVENTS].sort());
		expect(Object.keys(claude.hooks).sort()).toEqual([...CLAUDE_HOOK_EVENTS].sort());
		for (const entries of Object.values(cursor.hooks) as Array<Array<{ command: string }>>) {
			expect(entries[0].command).toBe("npx -y happenin record cursor");
		}
		for (const [event, entries] of Object.entries(claude.hooks) as Array<
			[string, Array<{ hooks: Array<{ command: string }> }>]
		>) {
			expect(entries[0].hooks[0].command).toBe(`npx -y happenin record claude ${event}`);
		}
	});

	it("installs only Cursor", async () => {
		await runInstall(["--legacy", "--cursor"]);
		expect(existsSync(path.join(process.env.HOME as string, ".cursor/hooks.json"))).toBe(true);
		expect(existsSync(path.join(process.env.HOME as string, ".claude/settings.json"))).toBe(false);
	});

	it("installs only Claude", async () => {
		await runInstall(["--legacy", "--claude"]);
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

		await runInstall(["--legacy"]);

		const cursor = JSON.parse(readFileSync(path.join(home, ".cursor/hooks.json"), "utf8"));
		expect(cursor.version).toBe(1);
		expect(cursor.hooks.beforeSubmitPrompt.length).toBe(2);

		const claude = JSON.parse(readFileSync(path.join(home, ".claude/settings.json"), "utf8"));
		expect(claude.hooks.UserPromptSubmit.length).toBeGreaterThan(0);
		expect(
			claude.hooks.UserPromptSubmit[claude.hooks.UserPromptSubmit.length - 1].hooks[0].command,
		).toMatch(/ record claude UserPromptSubmit$/);
	});

	it("replaces previous happenin hooks instead of duplicating them", async () => {
		process.argv[1] = "happenin";
		await runInstall(["--legacy"]);
		await runInstall(["--legacy"]);

		const home = process.env.HOME as string;
		const cursor = JSON.parse(readFileSync(path.join(home, ".cursor/hooks.json"), "utf8"));
		expect(cursor.hooks.beforeSubmitPrompt.length).toBe(1);
		expect(cursor.hooks.beforeSubmitPrompt[0].command).toMatch(/happenin record cursor$/);

		const claude = JSON.parse(readFileSync(path.join(home, ".claude/settings.json"), "utf8"));
		expect(claude.hooks.UserPromptSubmit.length).toBe(1);
		expect(claude.hooks.UserPromptSubmit[0].hooks[0].command).toMatch(
			/ record claude UserPromptSubmit$/,
		);
	});

	it("keeps user hooks and odd entries while replacing happenin hooks", async () => {
		process.argv[1] = "happenin";
		const home = process.env.HOME as string;
		mkdirSync(path.join(home, ".cursor"), { recursive: true });
		writeFileSync(
			path.join(home, ".cursor/hooks.json"),
			JSON.stringify({
				version: 1,
				hooks: {
					beforeSubmitPrompt: [
						{ command: "happenin record cursor" },
						{ command: "user-hook" },
						{ command: 123 },
						"not-an-object",
					],
				},
			}),
		);
		mkdirSync(path.join(home, ".claude"), { recursive: true });
		writeFileSync(
			path.join(home, ".claude/settings.json"),
			JSON.stringify({
				hooks: {
					UserPromptSubmit: [
						"not-an-object",
						{ matcher: "no-hooks-array" },
						{
							matcher: "",
							hooks: [
								{ type: "command", command: "npx -y happenin record claude UserPromptSubmit" },
								{ type: "command", command: "user-hook" },
								{ type: "command", command: 123 },
								"not-an-object",
							],
						},
					],
				},
			}),
		);

		await runInstall(["--legacy"]);

		const cursor = JSON.parse(readFileSync(path.join(home, ".cursor/hooks.json"), "utf8"));
		expect(cursor.hooks.beforeSubmitPrompt).toEqual([
			{ command: "user-hook" },
			{ command: 123 },
			"not-an-object",
			{ command: "happenin record cursor" },
		]);

		const claude = JSON.parse(readFileSync(path.join(home, ".claude/settings.json"), "utf8"));
		expect(claude.hooks.UserPromptSubmit).toEqual([
			"not-an-object",
			{ matcher: "no-hooks-array" },
			{
				matcher: "",
				hooks: [
					{ type: "command", command: "user-hook" },
					{ type: "command", command: 123 },
					"not-an-object",
				],
			},
			{
				matcher: "",
				hooks: [{ type: "command", command: "happenin record claude UserPromptSubmit" }],
			},
		]);
	});

	it("rejects invalid JSON with a formatted error", async () => {
		const home = process.env.HOME as string;
		mkdirSync(path.join(home, ".cursor"), { recursive: true });
		writeFileSync(path.join(home, ".cursor/hooks.json"), "not json");

		const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		const previousExitCode = process.exitCode;
		await runInstall(["--legacy"]);
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
		await runInstall(["--legacy"]);
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
		await runInstall(["--legacy"]);
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
		await runInstall(["--legacy"]);
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

		await runInstall(["--legacy"]);

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
