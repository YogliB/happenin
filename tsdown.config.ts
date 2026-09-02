import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		bin: "src/cli/bin.ts",
	},
	format: ["esm"],
	platform: "node",
	target: "node24",
	minify: true,
	outDir: "dist",
	outExtensions: () => ({
		js: ".js",
	}),
});
