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
