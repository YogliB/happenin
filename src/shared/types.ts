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

export type SessionStatus = "active" | "completed" | "failed";

export type TimeRange = "24h" | "7d" | "30d" | "all";

export type FilterOptions = {
	since?: number;
	source?: string;
	event?: string;
	sessionId?: string;
	sessionIdExact?: boolean;
	sessionIds?: (string | null)[];
	q?: string;
	limit?: number;
	offset?: number;
	status?: SessionStatus;
	tool?: string;
	minDuration?: number;
	maxDuration?: number;
	range?: TimeRange;
};

export type FilterOptionLists = {
	sources: string[];
	events: string[];
	tools: string[];
};

export type SessionMetrics = {
	totalSessions: number;
	totalEvents: number;
	averageDurationMs: number;
	successRate: number;
};

export type ToolUsage = {
	tool: string;
	count: number;
};

export type EventFrequency = {
	bucket: string;
	count: number;
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
