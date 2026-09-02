import type { EventRow } from "./types.js";

function tryJsonParse(text: string): unknown {
	if (!text) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

export function eventView(row: EventRow): Record<string, unknown> {
	return {
		id: row.id,
		source: row.source,
		client: row.client,
		event: row.event,
		sessionId: row.sessionId,
		happenedAt: row.happenedAt,
		receivedAt: row.receivedAt,
		projectPath: row.projectPath,
		filePath: row.filePath,
		toolName: row.toolName,
		sourcePath: row.sourcePath,
		subagentId: row.subagentId,
		subagentType: row.subagentType,
		transcriptPath: row.transcriptPath,
		payload: tryJsonParse(row.payload ?? "") ?? row.payload,
	};
}
