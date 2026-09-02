import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			all: true,
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/shared/types.ts"],
			reporter: ["text", "lcov", "json"],
			thresholds: {
				perFile: true,
				"100": true,
			},
		},
	},
});
