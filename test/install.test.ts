import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CURSOR_HOOK_EVENTS, CLAUDE_HOOK_EVENTS } from "../src/shared/constants.js";
import process from "node:process";
import { runInstall, parseTargets, formatError } from "../src/cli/install.js";
import { homeDir } from "../src/shared/homeDir.js";

describe("install", () => {
	it("parseTargets defaults to both, and respects flags", () => {
		expect(parseTargets([])).toEqual({ cursor: true, claude: true });
		expect(parseTargets(["--cursor"])).toEqual({ cursor: true, claude: false });
		expect(parseTargets(["--claude"])).toEqual({ cursor: false, claude: true });
		expect(parseTargets(["--cursor", "--claude"])).toEqual({ cursor: true, claude: true });
	});

	it("formatError extracts messages from Error and strings", () => {
		expect(formatError(new Error("boom"))).toBe("boom");
		expect(formatError("plain string")).toBe("plain string");
		expect(formatError(123)).toBe("123");
	});

	it("prints the plugin setup without touching user config", async () => {
		const originalHome = process.env.HOME;
		const home = mkdtempSync(path.join(tmpdir(), "happenin-"));
		process.env.HOME = home;
		const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		try {
			await runInstall([]);
			expect(output).toHaveBeenCalledWith(
				expect.stringContaining("no user config files were changed"),
			);
			expect(existsSync(path.join(home, ".cursor"))).toBe(false);
			expect(existsSync(path.join(home, ".claude"))).toBe(false);
		} finally {
			output.mockRestore();
			process.env.HOME = originalHome;
			rmSync(home, { recursive: true, force: true });
		}
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

	it("reports a formatted error when the setup output fails", async () => {
		const output = vi.spyOn(process.stdout, "write").mockImplementation(() => {
			throw new Error("stdout closed");
		});
		const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		const previousExitCode = process.exitCode;
		await runInstall([]);
		expect(err).toHaveBeenCalledWith(expect.stringContaining("install failed: stdout closed"));
		expect(process.exitCode).toBe(1);
		process.exitCode = previousExitCode;
		err.mockRestore();
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

	it("homeDir falls back to os.homedir when HOME is unset", () => {
		const home = process.env.HOME as string;
		delete process.env.HOME;
		const result = homeDir();
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
		process.env.HOME = home;
	});
});
