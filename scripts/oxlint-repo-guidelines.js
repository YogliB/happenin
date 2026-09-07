import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ignoredDocDirs = new Set(["node_modules", ".git", "dist", "coverage", ".devin", ".agents"]);
const allowedDocs = new Set([
	"AGENTS.md",
	"CLAUDE.md",
	"assets/help.md",
	"LICENSE.md",
	"README.md",
	"docs/ARCHITECTURE.md",
	"docs/CHANGELOG.md",
	"docs/CODE_OF_CONDUCT.md",
	"docs/CONTRIBUTING.md",
	"docs/SECURITY.md",
	"docs/TROUBLESHOOTING.md",
	"docs/USAGE.md",
	"docs/dashboard.gif",
	".github/pull_request_template.md",
	"skills/happenin/SKILL.md",
	"llms.txt",
]);
const docsAnchorFile = path.resolve("src/cli/index.ts");
const boxDrawingChars = /[\u2500-\u257F]/;
const asciiDiagramPattern = /\+[-=]{2,}\+|--+>|<--+|==+>|<==+/;
const fenceStart = /^```(\S*)/;
let docViolations;
let diagramViolations;

export function hasNonMermaidDiagram(content) {
	let inFence = false;
	let fenceIsMermaid = false;
	for (const line of content.split("\n")) {
		const fence = line.match(fenceStart);
		if (fence) {
			if (inFence) {
				inFence = false;
				fenceIsMermaid = false;
			} else {
				inFence = true;
				fenceIsMermaid = fence[1] === "mermaid";
			}
			continue;
		}
		if (boxDrawingChars.test(line)) {
			return true;
		}
		if (inFence && !fenceIsMermaid && asciiDiagramPattern.test(line)) {
			return true;
		}
	}
	return false;
}

function* walkDocs(dir, prefix = "") {
	// eslint-disable-next-line security/detect-non-literal-fs-filename
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const filePath = prefix ? `${prefix}/${entry.name}` : entry.name;

		if (entry.isDirectory()) {
			if (!ignoredDocDirs.has(entry.name)) {
				yield* walkDocs(`${dir}/${entry.name}`, filePath);
			}
		} else {
			yield filePath;
		}
	}
}

function getDocViolations() {
	if (docViolations) {
		return docViolations;
	}

	const violations = [];
	for (const file of walkDocs(".")) {
		if (allowedDocs.has(file)) continue;
		if (file.endsWith(".md") || file.startsWith("docs/")) {
			violations.push(file);
		}
	}

	docViolations = violations;
	return violations;
}

function getDiagramViolations() {
	if (diagramViolations) {
		return diagramViolations;
	}

	const violations = [];
	for (const file of allowedDocs) {
		if (!/\.(md|txt)$/.test(file) || !existsSync(file)) continue;
		if (hasNonMermaidDiagram(readFileSync(file, "utf8"))) {
			violations.push(file);
		}
	}

	diagramViolations = violations;
	return violations;
}

const plugin = {
	meta: {
		name: "oxlint-repo-guidelines",
	},
	rules: {
		"no-more-docs": {
			create(context) {
				const filename = path.resolve(context.physicalFilename ?? context.filename ?? "");
				if (filename !== docsAnchorFile) {
					return {};
				}

				return {
					Program(node) {
						const violations = getDocViolations();
						if (violations.length > 0) {
							context.report({
								message: `New docs/markdown files are not allowed: ${violations.join(", ")}`,
								node,
							});
						}
						const ascii = getDiagramViolations();
						if (ascii.length > 0) {
							context.report({
								message: `ASCII diagrams are not allowed in docs; use mermaid: ${ascii.join(", ")}`,
								node,
							});
						}
					},
				};
			},
		},
	},
};

export default plugin;
