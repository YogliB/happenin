import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		bin: "src/cli/bin.ts",
	},
	format: ["esm"],
	platform: "node",
	target: "node22",
	minify: true,
	outDir: "dist",
	outExtensions: () => ({
		js: ".js",
	}),
});
