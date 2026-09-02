import { escapeHtml, escapeAttr, formatDuration, formatTimestamp, truncate } from "../utils.js";
import { sessionStatus } from "../../../shared/db.js";
import type { FilterOptions, Session } from "../../../shared/types.js";

const chevronIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;

function detailLink(query: FilterOptions | undefined, sessionId: string): string {
	const params = new URLSearchParams({ session: sessionId });
	if (query?.source) params.set("source", query.source);
	if (query?.event) params.set("event", query.event);
	if (query?.q) params.set("q", query.q);
	if (query?.range) params.set("range", query.range);
	if (query?.status) params.set("status", query.status);
	if (query?.tool) params.set("tool", query.tool);
	if (query?.minDuration !== undefined) params.set("minDuration", String(query.minDuration));
	if (query?.maxDuration !== undefined) params.set("maxDuration", String(query.maxDuration));
	if (query?.limit !== undefined) params.set("limit", String(query.limit));
	if (query?.offset !== undefined) params.set("offset", String(query.offset));
	return `/fragments/detail?${params.toString()}`;
}

export function renderSessionsTable(
	sessions: Session[],
	now = Date.now(),
	activeSessionId?: string,
	query?: FilterOptions,
): string {
	if (sessions.length === 0) {
		return `<h2 class="session-list-title">Recent Sessions</h2><ul class="session-list sessions-table"><li class="empty">No sessions found.</li></ul>`;
	}

	const rows = sessions
		.map((s) => {
			const status = sessionStatus(s, now);
			const rawId = s.sessionId ?? "no session";
			const display = escapeHtml(truncate(rawId, 28));
			const start = escapeHtml(formatTimestamp(s.firstAt ?? s.firstReceivedAt));
			const duration = escapeHtml(formatDuration(s.durationMs));
			const active = activeSessionId !== undefined && rawId === activeSessionId ? " active" : "";
			const hxAttrs = s.sessionId
				? ` hx-get="${escapeAttr(detailLink(query, s.sessionId))}" hx-target="#dashboard-content" hx-swap="innerHTML"`
				: "";
			const itemClass = `session-item${active}${s.sessionId ? "" : " session-item-static"}`;
			return `<li class="${itemClass}" data-session="${escapeAttr(rawId)}"${hxAttrs}>
				<div class="session-main">
					<div class="session-row">
						<span class="session-id" title="${escapeAttr(rawId)}">${display}</span>
						<span class="status-badge status-${status}">${status}</span>
					</div>
					<div class="session-meta"><span>${duration}</span><span>${s.eventCount} events</span><span>${start}</span></div>
				</div>
				<span class="session-chevron" aria-hidden="true">${chevronIcon}</span>
			</li>`;
		})
		.join("");

	return `<h2 class="session-list-title">Recent Sessions</h2>
<ul class="session-list sessions-table">${rows}</ul>`;
}
