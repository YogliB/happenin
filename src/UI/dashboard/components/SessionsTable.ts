import { escapeHtml, escapeAttr, formatDuration, formatTimestamp, truncate } from "../utils.js";
import { sessionStatus } from "../../../shared/db.js";
import type { Session } from "../../../shared/types.js";

const chevronIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;

export function renderSessionsTable(
	sessions: Session[],
	now = Date.now(),
	activeSessionId?: string,
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
			const sessionQuery = encodeURIComponent(rawId);
			const active = activeSessionId !== undefined && rawId === activeSessionId ? " active" : "";
			return `<li class="session-item${active}" data-session="${escapeAttr(rawId)}" hx-get="/fragments/detail?session=${sessionQuery}" hx-target="#dashboard-content" hx-swap="innerHTML">
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
