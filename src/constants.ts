import type { Source } from "./types.js";

export const DEFAULT_DB_DIR = ".happenin";
export const DEFAULT_DB_NAME = "happenin.db";

export const CURSOR_HOOK_EVENTS = [
	"sessionStart",
	"sessionEnd",
	"beforeSubmitPrompt",
	"preToolUse",
	"postToolUse",
	"postToolUseFailure",
	"subagentStart",
	"subagentStop",
	"beforeShellExecution",
	"afterShellExecution",
	"beforeMCPExecution",
	"afterMCPExecution",
	"beforeReadFile",
	"afterFileEdit",
	"afterAgentResponse",
	"afterAgentThought",
	"preCompact",
	"stop",
];

export const CLAUDE_HOOK_EVENTS = [
	"SessionStart",
	"SessionEnd",
	"Setup",
	"UserPromptSubmit",
	"UserPromptExpansion",
	"PreToolUse",
	"PermissionRequest",
	"PermissionDenied",
	"PostToolUse",
	"PostToolUseFailure",
	"PostToolBatch",
	"Notification",
	"MessageDisplay",
	"SubagentStart",
	"SubagentStop",
	"TaskCreated",
	"TaskCompleted",
	"Stop",
	"StopFailure",
	"TeammateIdle",
	"InstructionsLoaded",
	"ConfigChange",
	"CwdChanged",
	"DirectoryAdded",
	"FileChanged",
	"WorktreeCreate",
	"WorktreeRemove",
	"PreCompact",
	"PostCompact",
	"Elicitation",
	"ElicitationResult",
];

const CURSOR_CONTINUE = new Set(["beforeSubmitPrompt"]);

const CURSOR_PERMISSION = new Set([
	"preToolUse",
	"beforeShellExecution",
	"beforeMCPExecution",
	"beforeReadFile",
	"subagentStart",
]);

const CLAUDE_CONTINUE = new Set(["UserPromptSubmit", "UserPromptExpansion"]);

const CLAUDE_APPROVE = new Set([
	"PreToolUse",
	"PermissionRequest",
	"SubagentStart",
	"SubagentStop",
	"TaskCreated",
	"TaskCompleted",
	"Stop",
	"WorktreeCreate",
	"WorktreeRemove",
]);

export const DEFAULT_RESPONSES = (source: Source, event: string): string | undefined => {
	if (source === "cursor") {
		if (CURSOR_CONTINUE.has(event)) {
			return JSON.stringify({ continue: true });
		}
		if (CURSOR_PERMISSION.has(event)) {
			return JSON.stringify({ permission: "allow" });
		}
		return undefined;
	}

	if (source === "claude") {
		if (CLAUDE_CONTINUE.has(event)) {
			return JSON.stringify({ continue: true });
		}
		if (CLAUDE_APPROVE.has(event)) {
			return JSON.stringify({ decision: "approve" });
		}
		return undefined;
	}

	return undefined;
};
