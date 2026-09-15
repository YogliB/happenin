import type { FilterOptions } from "../../shared/types.js";

export type QueryOptions = FilterOptions;

function serializeQuery(query: QueryOptions, overrides: Partial<QueryOptions> = {}): string {
	const merged: QueryOptions = { ...query, ...overrides };
	const params = new URLSearchParams();
	if (merged.source) params.set("source", merged.source);
	if (merged.event) params.set("event", merged.event);
	if (merged.sessionId) params.set("session", merged.sessionId);
	if (merged.q) params.set("q", merged.q);
	if (merged.since !== undefined) params.set("since", String(merged.since));
	if (merged.range) params.set("range", merged.range);
	if (merged.status) params.set("status", merged.status);
	if (merged.tool) params.set("tool", merged.tool);
	if (merged.skill) params.set("skill", merged.skill);
	if (merged.file) params.set("file", merged.file);
	if (merged.mdDir) params.set("mdDir", merged.mdDir);
	if (merged.view) params.set("view", merged.view);
	if (merged.minDuration !== undefined) params.set("minDuration", String(merged.minDuration));
	if (merged.maxDuration !== undefined) params.set("maxDuration", String(merged.maxDuration));
	if (merged.limit !== undefined) params.set("limit", String(merged.limit));
	if (merged.offset !== undefined) params.set("offset", String(merged.offset));
	return params.toString();
}

export function buildFragmentUrl(
	query: QueryOptions,
	overrides: Partial<QueryOptions> = {},
): string {
	return `/fragments/sessions?${serializeQuery(query, overrides)}`;
}
