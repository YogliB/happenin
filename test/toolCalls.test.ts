import { describe, it, expect } from "vitest";
import { toolCallFilePath, toolCallSkillName } from "../src/shared/toolCalls.js";

describe("toolCallFilePath", () => {
	it("extracts file_path for file-editing tools", () => {
		expect(toolCallFilePath("Read", { file_path: "/a.ts" })).toBe("/a.ts");
		expect(toolCallFilePath("Edit", { file_path: "/b.ts" })).toBe("/b.ts");
		expect(toolCallFilePath("Write", { file_path: "/c.ts" })).toBe("/c.ts");
		expect(toolCallFilePath("MultiEdit", { file_path: "/d.ts" })).toBe("/d.ts");
	});

	it("falls back to notebook_path then path", () => {
		expect(toolCallFilePath("NotebookEdit", { notebook_path: "/n.ipynb" })).toBe("/n.ipynb");
		expect(toolCallFilePath("Read", { path: "/p.ts" })).toBe("/p.ts");
	});

	it("extracts file_path for lowercase devin file tools", () => {
		expect(toolCallFilePath("read", { file_path: "/a.ts" })).toBe("/a.ts");
		expect(toolCallFilePath("edit", { file_path: "/b.ts" })).toBe("/b.ts");
		expect(toolCallFilePath("write", { file_path: "/c.ts" })).toBe("/c.ts");
		expect(toolCallFilePath("notebook_edit", { notebook_path: "/n.ipynb" })).toBe("/n.ipynb");
	});

	it("returns undefined for non-file tools", () => {
		expect(toolCallFilePath("Bash", { file_path: "/a.ts" })).toBeUndefined();
		expect(toolCallFilePath("exec", { file_path: "/a.ts" })).toBeUndefined();
	});

	it("returns undefined for missing/invalid tool name or input", () => {
		expect(toolCallFilePath(undefined, { file_path: "/a.ts" })).toBeUndefined();
		expect(toolCallFilePath("Read", null)).toBeUndefined();
		expect(toolCallFilePath("Read", "not an object")).toBeUndefined();
		expect(toolCallFilePath("Read", {})).toBeUndefined();
		expect(toolCallFilePath("Read", { file_path: "" })).toBeUndefined();
		expect(toolCallFilePath("Read", { file_path: 123 })).toBeUndefined();
	});
});

describe("toolCallSkillName", () => {
	it("extracts the skill name for Skill tool calls", () => {
		expect(toolCallSkillName("Skill", { skill: "commit-push-pr" })).toBe("commit-push-pr");
	});

	it("extracts the skill name for lowercase devin skill calls", () => {
		expect(toolCallSkillName("skill", { skill: "sk-flow" })).toBe("sk-flow");
	});

	it("returns undefined for non-Skill tools", () => {
		expect(toolCallSkillName("Bash", { skill: "commit-push-pr" })).toBeUndefined();
		expect(toolCallSkillName("exec", { skill: "sk-flow" })).toBeUndefined();
	});

	it("returns undefined for missing/invalid input", () => {
		expect(toolCallSkillName("Skill", null)).toBeUndefined();
		expect(toolCallSkillName("Skill", "not an object")).toBeUndefined();
		expect(toolCallSkillName("Skill", {})).toBeUndefined();
		expect(toolCallSkillName("Skill", { skill: "" })).toBeUndefined();
		expect(toolCallSkillName("Skill", { skill: 123 })).toBeUndefined();
	});
});
