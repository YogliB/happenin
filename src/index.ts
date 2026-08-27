import { readFileSync } from "node:fs";
import process from "node:process";
import { runInstall } from "./install.js";
import { runRecord } from "./record.js";
import { runImport } from "./import.js";
import { runDashboard } from "./dashboard.js";

const HELP_PATH = new URL("../assets/help.md", import.meta.url);
const PACKAGE_PATH = new URL("../package.json", import.meta.url);

function renderHelp(text: string): string {
	const styled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
	const B = styled ? "\x1b[1m" : "";
	const D = styled ? "\x1b[2m" : "";
	const C = styled ? "\x1b[36m" : "";
	const R = styled ? "\x1b[0m" : "";

	return text
		.replace(/^# (.+)$/gm, `${B}$1${R}`)
		.replace(/^## (.+)$/gm, `${B}$1${R}`)
		.replace(/^### `(.+)`$/gm, `${B}$1${R}`)
		.replace(/^### (.+)$/gm, `${B}$1${R}`)
		.replace(/^#### (.+)$/gm, `${D}$1${R}`)
		.replace(/^- /gm, "  \u2022 ")
		.replace(/`([^`]+)`/g, `${C}$1${R}`);
}

function showHelp(): void {
	let text: string;
	try {
		// oxlint-disable-next-line security/detect-non-literal-fs-filename -- HELP_PATH is a build-time constant
		text = readFileSync(HELP_PATH, "utf8");
	} catch {
		text = "# happenin\n\nRun `happenin <command>`.\n";
	}
	process.stdout.write(`\n${renderHelp(text)}\n`);
}

function showVersion(): void {
	let version = "0.0.0";
	try {
		// oxlint-disable-next-line security/detect-non-literal-fs-filename -- PACKAGE_PATH is a build-time constant
		const raw = readFileSync(PACKAGE_PATH, "utf8");
		version = (JSON.parse(raw) as { version?: string }).version ?? version;
	} catch {}
	process.stdout.write(`${version}\n`);
}

const CLI_OFFSET = 2;

export default async function run(): Promise<void> {
	const argv = process.argv.slice(CLI_OFFSET);
	const [command, ...args] = argv;

	if (!command || command === "--help" || command === "-h") {
		showHelp();
		return;
	}

	if (command === "--version" || command === "-v") {
		showVersion();
		return;
	}

	if (command === "install") {
		await runInstall(args);
		return;
	}

	if (command === "record") {
		await runRecord(args);
		return;
	}

	if (command === "import") {
		await runImport(args);
		return;
	}

	if (command === "dashboard") {
		await runDashboard(args);
		return;
	}

	process.stderr.write(`Unknown command: ${command}\n`);
	showHelp();
	process.exitCode = 1;
}
