export type Source = "cursor" | "claude" | "claude-transcript" | "cursor-transcript";

export type EventInsert = {
	source: Source;
	client?: string;
	event?: string;
	sessionId?: string;
	happenedAt?: string;
	projectPath?: string;
	filePath?: string;
	toolName?: string;
	payload: string;
	sourcePath?: string;
	subagentId?: string | null;
	subagentType?: string | null;
	transcriptPath?: string | null;
};

export type EventRow = EventInsert & {
	id: number;
	receivedAt: number;
};

export type FilterOptions = {
	since?: number;
	source?: string;
	event?: string;
	sessionId?: string;
	q?: string;
	limit?: number;
	offset?: number;
};

export type FilterOptionLists = {
	sources: string[];
	events: string[];
};

export type Session = {
	sessionId: string | null;
	firstAt: string | null;
	lastAt: string | null;
	firstReceivedAt: number;
	lastReceivedAt: number;
	durationMs: number;
	eventCount: number;
	projectPath: string | null;
	projectPaths: string[];
	tools: string[];
	failureCount: number;
};
