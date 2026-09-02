import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import process from "node:process";
import { CURSOR_HOOK_EVENTS, CLAUDE_HOOK_EVENTS } from "../shared/constants.js";

type CursorHookCommand = { command: string };
type CursorHookFile = { version?: number; hooks: Record<string, CursorHookCommand[]> };

type ClaudeCommandHook = { type: "command"; command: string };
type ClaudeMatcher = { matcher: string; hooks: ClaudeCommandHook[] };
type ClaudeHookFile = { hooks: Record<string, ClaudeMatcher[]> };

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export const formatError = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

export const homeDir = (): string => process.env.HOME || homedir();

export const resolveBin = (): string => {
	const script = process.argv[1];
	if (script && path.isAbsolute(script)) return script;
	return "happenin";
};

const ensureDir = (dir: string): void => {
	// oxlint-disable-next-line security/detect-non-literal-fs-filename -- path is a derived config directory, not user input
	mkdirSync(dir, { recursive: true });
};

const fileExists = (file: string): boolean => {
	// oxlint-disable-next-line security/detect-non-literal-fs-filename -- file is a derived config path, not user input
	return existsSync(file);
};

const readJson = (file: string): unknown => {
	// oxlint-disable-next-line security/detect-non-literal-fs-filename -- file is a derived config path, not user input
	const raw = readFileSync(file, "utf8");
	return JSON.parse(raw);
};

const writeJsonAtomic = (file: string, data: unknown): void => {
	const temp = `${file}.${Date.now()}.tmp`;
	// oxlint-disable-next-line security/detect-non-literal-fs-filename -- file is a derived config path, not user input
	ensureDir(path.dirname(file));
	// oxlint-disable-next-line security/detect-non-literal-fs-filename -- file is a derived config path, not user input
	writeFileSync(temp, JSON.stringify(data, null, 2) + "\n", "utf8");
	// oxlint-disable-next-line security/detect-non-literal-fs-filename -- file is a derived config path, not user input
	renameSync(temp, file);
};

const backupFile = (source: string, backupDir: string): string | undefined => {
	ensureDir(backupDir);
	if (!fileExists(source)) return undefined;
	const target = path.join(backupDir, `${path.basename(source)}.${Date.now()}.bak`);
	// oxlint-disable-next-line security/detect-non-literal-fs-filename -- source is a derived config path, not user input
	const raw = readFileSync(source, "utf8");
	// oxlint-disable-next-line security/detect-non-literal-fs-filename -- backup is a derived backup path, not user input
	writeFileSync(target, raw, "utf8");
	return target;
};

const readCursorConfig = (file: string): CursorHookFile => {
	if (!fileExists(file)) return { version: 1, hooks: {} };
	const data = readJson(file);
	if (!isObject(data)) throw new Error(`Invalid JSON object in ${file}`);
	const hooks = isObject(data.hooks) ? (data.hooks as Record<string, CursorHookCommand[]>) : {};
	return {
		...data,
		version: typeof data.version === "number" ? data.version : 1,
		hooks,
	} as CursorHookFile;
};

const readClaudeConfig = (file: string): ClaudeHookFile => {
	if (!fileExists(file)) return { hooks: {} };
	const data = readJson(file);
	if (!isObject(data)) throw new Error(`Invalid JSON object in ${file}`);
	const hooks = isObject(data.hooks) ? (data.hooks as Record<string, ClaudeMatcher[]>) : {};
	return { ...data, hooks } as ClaudeHookFile;
};

const appendCursorHook = (
	hooks: Record<string, CursorHookCommand[]>,
	event: string,
	bin: string,
): void => {
	// oxlint-disable-next-line security/detect-object-injection -- event comes from the hard-coded CURSOR_EVENTS list
	hooks[event] = [
		// oxlint-disable-next-line security/detect-object-injection -- event comes from the hard-coded CURSOR_EVENTS list
		...(Array.isArray(hooks[event]) ? hooks[event] : []),
		{ command: `${bin} record cursor` },
	];
};

const appendClaudeHook = (
	hooks: Record<string, ClaudeMatcher[]>,
	event: string,
	bin: string,
): void => {
	// oxlint-disable-next-line security/detect-object-injection -- event comes from the hard-coded CLAUDE_EVENTS list
	hooks[event] = [
		// oxlint-disable-next-line security/detect-object-injection -- event comes from the hard-coded CLAUDE_EVENTS list
		...(Array.isArray(hooks[event]) ? hooks[event] : []),
		{
			matcher: "",
			hooks: [{ type: "command", command: `${bin} record claude ${event}` }],
		},
	];
};

type InstallResult = { target: string; backup?: string };

const installCursor = (bin: string): InstallResult => {
	const home = homeDir();
	const target = path.join(home, ".cursor", "hooks.json");
	const backupDir = path.join(home, ".happenin", "backups", "cursor");
	const backup = backupFile(target, backupDir);
	const config = readCursorConfig(target);
	for (const event of CURSOR_HOOK_EVENTS) appendCursorHook(config.hooks, event, bin);
	writeJsonAtomic(target, config);
	return { target, backup };
};

const installClaude = (bin: string): InstallResult => {
	const home = homeDir();
	const target = path.join(home, ".claude", "settings.json");
	const backupDir = path.join(home, ".happenin", "backups", "claude");
	const backup = backupFile(target, backupDir);
	const config = readClaudeConfig(target);
	for (const event of CLAUDE_HOOK_EVENTS) appendClaudeHook(config.hooks, event, bin);
	writeJsonAtomic(target, config);
	return { target, backup };
};

export const parseTargets = (argv: string[]): { cursor: boolean; claude: boolean } => {
	let cursor = false;
	let claude = false;
	for (const arg of argv) {
		if (arg === "--cursor") cursor = true;
		if (arg === "--claude") claude = true;
	}
	if (!cursor && !claude) {
		cursor = true;
		claude = true;
	}
	return { cursor, claude };
};

async function install(opts: { cursor?: boolean; claude?: boolean } = {}): Promise<void> {
	const { cursor = true, claude = true } = opts;
	const bin = resolveBin();
	const results: InstallResult[] = [];
	if (cursor) results.push(installCursor(bin));
	if (claude) results.push(installClaude(bin));
	for (const { target, backup } of results) {
		process.stdout.write(`${target} written
`);
		if (backup) process.stdout.write(`  backup: ${backup}\n`);
	}
}

export async function runInstall(argv: string[] = []): Promise<void> {
	try {
		const { cursor, claude } = parseTargets(argv);
		await install({ cursor, claude });
	} catch (error) {
		process.stderr.write(`install failed: ${formatError(error)}\n`);
		process.exitCode = 1;
	}
}
