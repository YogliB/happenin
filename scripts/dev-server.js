#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const tsdownPkgPath = require.resolve("tsdown/package.json");
const tsdownPkg = require(tsdownPkgPath);
const tsdownBin = resolve(dirname(tsdownPkgPath), tsdownPkg.bin.tsdown);

const args = process.argv.slice(2);

const builder = spawn("node", [tsdownBin, "--config", "tsdown.config.ts", "--watch"], {
	stdio: "inherit",
});

let runner = null;

function shutdown() {
	clearInterval(startRunnerInterval);
	builder.kill("SIGTERM");
	if (runner) runner.kill("SIGTERM");
}

function startRunner() {
	if (runner || !existsSync("dist/bin.js")) return;

	runner = spawn("node", ["--watch", "dist/bin.js", ...args], {
		stdio: "inherit",
	});

	runner.on("exit", (code) => {
		if (!runner.killed) process.exitCode = code ?? 1;
		shutdown();
	});
}

const startRunnerInterval = setInterval(startRunner, 200);

builder.on("exit", (code) => {
	process.exitCode = process.exitCode ?? code ?? 1;
	shutdown();
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
