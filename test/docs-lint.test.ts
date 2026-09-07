import { describe, it, expect } from "vitest";
import { hasNonMermaidDiagram } from "../scripts/oxlint-repo-guidelines.js";

describe("hasNonMermaidDiagram", () => {
	it("flags unicode box-drawing diagrams", () => {
		expect(hasNonMermaidDiagram("text\n┌───┐\n│ A │\n└───┘\n")).toBe(true);
	});

	it("flags ASCII diagrams inside plain fences", () => {
		const doc = "Intro\n```\n+---+   +---+\n| A |-->| B |\n+---+   +---+\n```\n";
		expect(hasNonMermaidDiagram(doc)).toBe(true);
		expect(hasNonMermaidDiagram("```\nA ==> B\n```\n")).toBe(true);
		expect(hasNonMermaidDiagram("```\nA <-- B\n```\n")).toBe(true);
	});

	it("allows mermaid fences", () => {
		const doc = "```mermaid\nflowchart LR\n    A --> B\n```\n";
		expect(hasNonMermaidDiagram(doc)).toBe(false);
		const spaced = "``` mermaid\nflowchart LR\n    A --> B\n```\n";
		expect(hasNonMermaidDiagram(spaced)).toBe(false);
	});

	it("flags ASCII diagrams inside indented fences", () => {
		const doc = "- item\n  ```\n  +---+  +---+\n  | A |-->| B |\n  +---+  +---+\n  ```\n";
		expect(hasNonMermaidDiagram(doc)).toBe(true);
	});

	it("ignores prose punctuation and tables", () => {
		const doc = "| a | b |\n| --- | --- |\nRun `a--b` fast, then c -> d.\n";
		expect(hasNonMermaidDiagram(doc)).toBe(false);
		expect(hasNonMermaidDiagram("plain prose, no diagrams\n")).toBe(false);
	});
});
