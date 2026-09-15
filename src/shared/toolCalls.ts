const FILE_PATH_TOOLS = new Set(["Read", "Edit", "Write", "MultiEdit", "NotebookEdit"]);

function asNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function toolCallFilePath(toolName: string | undefined, input: unknown): string | undefined {
	if (!toolName || !FILE_PATH_TOOLS.has(toolName) || typeof input !== "object" || input === null) {
		return undefined;
	}
	const record = input as Record<string, unknown>;
	return (
		asNonEmptyString(record.file_path) ??
		asNonEmptyString(record.notebook_path) ??
		asNonEmptyString(record.path)
	);
}

export function toolCallSkillName(
	toolName: string | undefined,
	input: unknown,
): string | undefined {
	if (toolName !== "Skill" || typeof input !== "object" || input === null) {
		return undefined;
	}
	return asNonEmptyString((input as Record<string, unknown>).skill);
}
