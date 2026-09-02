import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import {
	getEvents,
	getEventFrequency,
	getToolUsage,
	getFilteredSessions,
	countEvents,
} from "../../shared/db.js";
import { renderMetricCards } from "./components/MetricCards.js";
import { renderEventFrequencyChart } from "./components/ChartEvents.js";
import { renderToolChart } from "./components/ChartTools.js";
import { renderSessionsTable } from "./components/SessionsTable.js";
import { renderSessionDetail } from "./components/DetailPanel.js";
import type {
	EventFrequency,
	FilterOptions,
	Session,
	SessionMetrics,
	TimeRange,
	ToolUsage,
} from "../../shared/types.js";

export type QueryOptions = FilterOptions;

function parseNumber(value: string | null): number | undefined {
	if (!value) return undefined;
	const n = Number(value);
	return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function parseInteger(value: string | null): number | undefined {
	if (!value) return undefined;
	const n = Number(value);
	return Number.isInteger(n) && n >= 0 ? n : undefined;
}

function rangeToParams(range: TimeRange | undefined): { hours: number; groupBy: "hour" | "day" } {
	if (range === "7d") return { hours: 168, groupBy: "day" };
	if (range === "30d") return { hours: 720, groupBy: "day" };
	if (range === "all") return { hours: 0, groupBy: "day" };
	return { hours: 24, groupBy: "hour" };
}

export function parseQuery(url: URL): QueryOptions {
	const sinceRaw = url.searchParams.get("since");
	const source = url.searchParams.get("source") || undefined;
	const event = url.searchParams.get("event") || undefined;
	const session = url.searchParams.get("session") || undefined;
	const q = url.searchParams.get("q") || undefined;
	const status = url.searchParams.get("status") || undefined;
	const tool = url.searchParams.get("tool") || undefined;
	const minDuration = url.searchParams.get("minDuration");
	const maxDuration = url.searchParams.get("maxDuration");
	const rangeRaw = url.searchParams.get("range") || "24h";
	const range: TimeRange = ["24h", "7d", "30d", "all"].includes(rangeRaw)
		? (rangeRaw as TimeRange)
		: "24h";
	const limit = url.searchParams.get("limit");
	const offset = url.searchParams.get("offset");

	let since: number | undefined;
	if (sinceRaw) {
		const n = parseInt(sinceRaw, 10);
		if (!Number.isNaN(n)) since = n;
	}

	return {
		since,
		source,
		event,
		sessionId: session,
		q,
		status:
			status === "active" || status === "completed" || status === "failed" ? status : undefined,
		tool,
		minDuration: parseNumber(minDuration),
		maxDuration: parseNumber(maxDuration),
		range,
		limit: parseInteger(limit),
		offset: parseInteger(offset),
	};
}

function buildPagerLink(query: QueryOptions, offset: number, limit: number): string {
	const params = new URLSearchParams();
	if (query.source) params.set("source", query.source);
	if (query.event) params.set("event", query.event);
	if (query.sessionId) params.set("session", query.sessionId);
	if (query.q) params.set("q", query.q);
	if (query.since !== undefined) params.set("since", String(query.since));
	if (query.range) params.set("range", query.range);
	if (query.status) params.set("status", query.status);
	if (query.tool) params.set("tool", query.tool);
	if (query.minDuration !== undefined) params.set("minDuration", String(query.minDuration));
	if (query.maxDuration !== undefined) params.set("maxDuration", String(query.maxDuration));
	params.set("limit", String(limit));
	params.set("offset", String(offset));
	return `/fragments/sessions?${params.toString()}`;
}

function renderPager(query: QueryOptions, total: number): string {
	const limit = query.limit && query.limit > 0 ? query.limit : 25;
	const offset = query.offset ?? 0;
	if (total <= limit) return "";
	const currentPage = Math.floor(offset / limit) + 1;
	const totalPages = Math.ceil(total / limit);
	const prevOffset = offset - limit;
	const nextOffset = offset + limit;
	const prev =
		prevOffset >= 0
			? `<a href="${buildPagerLink(query, prevOffset, limit)}" hx-get="${buildPagerLink(query, prevOffset, limit)}" hx-target="#dashboard-content" hx-swap="innerHTML">Previous</a>`
			: `<button type="button" disabled>Previous</button>`;
	const next =
		nextOffset < total
			? `<a href="${buildPagerLink(query, nextOffset, limit)}" hx-get="${buildPagerLink(query, nextOffset, limit)}" hx-target="#dashboard-content" hx-swap="innerHTML">Next</a>`
			: `<button type="button" disabled>Next</button>`;
	return `<div class="pager">${prev}<span class="pager-info">Page ${currentPage} of ${totalPages}</span>${next}</div>`;
}

function renderSessionsSidebar(
	allSessions: Session[],
	query: QueryOptions,
	now: number,
	activeSessionId?: string,
): string {
	const limit = query.limit && query.limit > 0 ? query.limit : 25;
	const offset = query.offset ?? 0;
	const pageSessions = allSessions.slice(offset, offset + limit);
	return `<aside class="session-sidebar">
<div class="session-list-wrapper">
${renderSessionsTable(pageSessions, now, activeSessionId, query)}
${renderPager(query, allSessions.length)}
</div>
</aside>`;
}

export function renderSessionsContent(db: DatabaseSync, query: QueryOptions): string {
	const now = Date.now();
	const { hours, groupBy } = rangeToParams(query.range);
	const allSessions = getFilteredSessions(
		db,
		{ ...query, limit: undefined, offset: undefined },
		now,
	);
	const sessionIds = allSessions.map((s) => s.sessionId);
	let frequency: EventFrequency[] = [];
	let toolUsage: ToolUsage[] = [];
	if (sessionIds.length > 0) {
		const chartQuery: QueryOptions = { ...query, sessionIds };
		frequency = getEventFrequency(db, chartQuery, hours, groupBy, now);
		toolUsage = getToolUsage(db, chartQuery, 10, now);
	}
	const totalSessions = allSessions.length;
	const totalEvents = allSessions.reduce((sum, s) => sum + s.eventCount, 0);
	const averageDurationMs =
		totalSessions > 0 ? allSessions.reduce((sum, s) => sum + s.durationMs, 0) / totalSessions : 0;
	const successCount = allSessions.filter((s) => s.failureCount === 0).length;
	const successRate = totalSessions > 0 ? (successCount / totalSessions) * 100 : 0;
	const metrics: SessionMetrics = { totalSessions, totalEvents, averageDurationMs, successRate };

	return `${renderSessionsSidebar(allSessions, query, now)}
<div class="main-content">
<div class="main-metrics">${renderMetricCards(metrics)}</div>
<div class="top-charts">${renderEventFrequencyChart(frequency, groupBy)}${renderToolChart(toolUsage)}</div>
</div>`;
}

export function sendSessionsFragment(
	req: IncomingMessage,
	res: ServerResponse,
	url: URL,
	db: DatabaseSync,
): void {
	const query = parseQuery(url);
	const html = renderSessionsContent(db, query);
	res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
	res.end(html);
}

export function renderSessionDetailFragment(db: DatabaseSync, query: QueryOptions): string {
	const now = Date.now();
	const allSessions = getFilteredSessions(
		db,
		{ ...query, sessionId: undefined, limit: undefined, offset: undefined },
		now,
	);
	const sidebar = renderSessionsSidebar(allSessions, query, now, query.sessionId);
	if (!query.sessionId) {
		return `${sidebar}
<div class="main-content"><div class="detail-area"><div class="empty">No events.</div></div></div>`;
	}
	const rows = getEvents(db, {
		...query,
		range: undefined,
		sessionId: query.sessionId,
		sessionIdExact: true,
		limit: 1000,
		offset: 0,
	});
	const total = countEvents(db, {
		...query,
		range: undefined,
		sessionId: query.sessionId,
		sessionIdExact: true,
	});
	return `${sidebar}
<div class="main-content">${renderSessionDetail(query.sessionId, rows, total)}</div>`;
}

export function sendSessionDetailFragment(
	req: IncomingMessage,
	res: ServerResponse,
	url: URL,
	db: DatabaseSync,
): void {
	const query = parseQuery(url);
	const html = renderSessionDetailFragment(db, query);
	res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
	res.end(html);
}

export function sendEventsJson(
	req: IncomingMessage,
	res: ServerResponse,
	url: URL,
	db: DatabaseSync,
): void {
	const query = parseQuery(url);
	const rows = getEvents(db, query);
	res.writeHead(200, { "Content-Type": "application/json" });
	res.end(JSON.stringify(rows));
}
