import process from "node:process";

export const formatError = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

export const parseTargets = (
	argv: string[],
): { cursor: boolean; claude: boolean; devin: boolean } => {
	let cursor = false;
	let claude = false;
	let devin = false;
	for (const arg of argv) {
		if (arg === "--cursor") cursor = true;
		if (arg === "--claude") claude = true;
		if (arg === "--devin") devin = true;
	}
	if (!cursor && !claude && !devin) {
		cursor = true;
		claude = true;
		devin = true;
	}
	return { cursor, claude, devin };
};

const PLUGIN_SETUP = {
	cursor:
		"Cursor: open Customize, import https://github.com/YogliB/happenin as a marketplace, then install happenin.",
	claude:
		"Claude Code: run /plugin marketplace add YogliB/happenin, then /plugin install happenin@happenin.",
	devin:
		"Devin: run devin plugins install YogliB/happenin#plugins/devin (requires devin auth login).",
};

const showPluginSetup = (opts: { cursor: boolean; claude: boolean; devin: boolean }): void => {
	process.stdout.write(
		"happenin hooks are packaged as plugins; no user config files were changed.\n",
	);
	if (opts.cursor) process.stdout.write(`${PLUGIN_SETUP.cursor}\n`);
	if (opts.claude) process.stdout.write(`${PLUGIN_SETUP.claude}\n`);
	if (opts.devin) process.stdout.write(`${PLUGIN_SETUP.devin}\n`);
	process.stdout.write(
		"Already installed hooks with an older happenin? See the migration guide in README.md.\n",
	);
};

export async function runInstall(argv: string[] = []): Promise<void> {
	try {
		showPluginSetup(parseTargets(argv));
	} catch (error) {
		process.stderr.write(`install failed: ${formatError(error)}\n`);
		process.exitCode = 1;
	}
}
