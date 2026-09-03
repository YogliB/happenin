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

function renderSessionRow(
	s: Session,
	now: number,
	activeSessionId?: string,
	query?: FilterOptions,
	isChild = false,
	toggle = "",
	extra = "",
): string {
	const status = sessionStatus(s, now);
	const rawId = isChild ? (s.subagentId ?? "no subagent") : (s.sessionId ?? "no session");
	const display = escapeHtml(truncate(rawId, 28));
	const start = escapeHtml(formatTimestamp(s.firstAt ?? s.firstReceivedAt));
	const duration = escapeHtml(formatDuration(s.durationMs));
	const active =
		activeSessionId !== undefined &&
		(isChild ? s.subagentId === activeSessionId : s.sessionId === activeSessionId)
			? " active"
			: "";
	const linkId = s.sessionId ?? "";
	const hxAttrs = linkId
		? ` hx-get="${escapeAttr(detailLink(query, linkId))}" hx-target="#dashboard-content" hx-swap="innerHTML"`
		: "";
	const subagentClass = isChild ? " session-subagent" : "";
	const parentClass = !isChild && s.children?.length ? " session-parent" : "";
	const staticClass = !isChild && !s.sessionId ? " session-item-static" : "";
	const dataAttr = isChild
		? ` data-session="${escapeAttr(linkId)}" data-subagent="${escapeAttr(s.subagentId ?? "")}"`
		: ` data-session="${escapeAttr(s.sessionId ?? "")}"`;
	const badge =
		isChild && s.subagentType
			? ` <span class="subagent-type-badge">${escapeHtml(s.subagentType)}</span>`
			: "";
	return `<li class="session-item${parentClass}${subagentClass}${active}${staticClass}"${dataAttr}${hxAttrs}>
		${toggle}
		<div class="session-main">
			<div class="session-row">
				<span class="session-id" title="${escapeAttr(rawId)}">${display}${badge}</span>
				<span class="status-badge status-${status}">${status}</span>
			</div>
			<div class="session-meta"><span>${duration}</span><span>${s.eventCount} events</span><span>${start}</span></div>
		</div>
		<span class="session-chevron" aria-hidden="true">${chevronIcon}</span>
		${extra}
	</li>`;
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
			if (!s.children?.length) {
				return renderSessionRow(s, now, activeSessionId, query);
			}
			const toggle = `<button type="button" class="session-toggle" aria-label="toggle subagents" onclick="event.stopPropagation(); const li = this.closest('.session-item'); li.classList.toggle('expanded'); this.textContent = li.classList.contains('expanded') ? '▾' : '▸'">▸</button>`;
			const children = s.children
				.map((c) => renderSessionRow(c, now, activeSessionId, query, true))
				.join("");
			return renderSessionRow(
				s,
				now,
				activeSessionId,
				query,
				false,
				toggle,
				`<ul class="session-children">${children}</ul>`,
			);
		})
		.join("");

	return `<h2 class="session-list-title">Recent Sessions</h2>
<ul class="session-list sessions-table">${rows}</ul>`;
}
