import { escapeHtml, escapeAttr, formatTimestamp, truncate } from "../utils.js";
import { eventView } from "../../../shared/view.js";
import type { EventRow } from "../../../shared/types.js";

const backIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`;
const copyIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

type EventGroup = {
	subagentId: string | null;
	parent: EventRow;
	children: EventRow[];
	maxId: number;
};

function groupEvents(events: EventRow[]): EventGroup[] {
	const bySubagent = new Map<string | null, EventRow[]>();
	for (const e of events) {
		const key = e.subagentId ?? null;
		if (!bySubagent.has(key)) bySubagent.set(key, []);
		bySubagent.get(key)!.push(e);
	}

	const groups: EventGroup[] = [];
	for (const [subagentId, list] of bySubagent) {
		const sorted = list.toSorted((a, b) => b.id - a.id);
		const startIndex = sorted.findIndex((e) => e.event === "subagentStart");
		const parent = startIndex >= 0 ? sorted.at(startIndex)! : sorted.at(0)!;
		const children = sorted.filter((e) => e !== parent);
		groups.push({
			subagentId,
			parent,
			children,
			maxId: sorted.at(0)!.id,
		});
	}

	return groups.toSorted((a, b) => b.maxId - a.maxId);
}

function eventSummary(e: EventRow): string {
	const ts = escapeHtml(formatTimestamp(e.happenedAt ?? e.receivedAt));
	const source = escapeHtml(e.source ?? "");
	const event = escapeHtml(e.event ?? "");
	const tool = escapeHtml(e.toolName ?? "");
	return `<span class="ts">${ts}</span><span class="source">${source}</span><span class="event">${event}</span><span class="tool">${tool}</span>`;
}

function eventAttrs(e: EventRow): string {
	const ts = escapeHtml(formatTimestamp(e.happenedAt ?? e.receivedAt));
	const source = escapeHtml(e.source ?? "");
	const client = escapeHtml(e.client ?? "");
	const event = escapeHtml(e.event ?? "");
	const tool = escapeHtml(e.toolName ?? "");
	const subagentId = escapeHtml(e.subagentId ?? "");
	const subagentType = escapeHtml(e.subagentType ?? "");
	const project = escapeHtml(e.projectPath ?? "");
	const file = escapeHtml(e.filePath ?? "");
	const subagentCell = subagentId
		? `<div><span>Subagent</span><span>${subagentType || "-"} (${subagentId})</span></div>`
		: "";
	const fileCell = file ? `<div><span>File</span><span>${file}</span></div>` : "";
	return `<div class="detail-attrs">
	<div><span>Time</span><span>${ts}</span></div>
	<div><span>Source</span><span>${source}</span></div>
	<div><span>Client</span><span>${client || "-"}</span></div>
	<div><span>Event</span><span>${event}</span></div>
	<div><span>Tool</span><span>${tool || "-"}</span></div>
	<div><span>Project</span><span>${project || "-"}</span></div>
	${subagentCell}
	${fileCell}
</div>`;
}

function renderEventJson(e: EventRow): string {
	const json = escapeHtml(JSON.stringify(eventView(e), null, 2));
	return `<div class="detail-json">
	<details class="json-toggle">
		<summary>JSON</summary>
		<pre>${json}</pre>
	</details>
	<button type="button" class="json-copy" onclick="copyEventJson(this)" title="Copy JSON" aria-label="Copy JSON">${copyIcon}</button>
</div>`;
}

function renderEvent(e: EventRow): string {
	return `<details class="detail-event" data-event-id="${e.id}" open>
	<summary>${eventSummary(e)}</summary>
	<div class="detail-body">${eventAttrs(e)}
	${renderEventJson(e)}
</div>
</details>`;
}

function renderSubagentGroup(group: EventGroup, subagentId: string): string {
	const parent = group.parent;
	const children = group.children.map(renderEvent).join("");
	const label = escapeHtml(parent.subagentType || "subagent");
	const id = ` · ${escapeHtml(truncate(subagentId, 18))}`;
	const badge = `<span class="subagent-badge">${label}${id} · ${group.children.length}</span>`;
	return `<details class="detail-event detail-subagent" data-event-id="${parent.id}" open>
	<summary>${eventSummary(parent)}${badge}</summary>
	<div class="detail-body">
	${eventAttrs(parent)}
	${renderEventJson(parent)}
	<div class="detail-children">${children}</div>
</div>
</details>`;
}

function renderEventTree(events: EventRow[]): string {
	const groups = groupEvents(events);
	return groups
		.map((g) =>
			g.subagentId
				? renderSubagentGroup(g, g.subagentId)
				: [g.parent, ...g.children].map(renderEvent).join(""),
		)
		.join("");
}

export function renderSessionDetail(
	sessionId: string | null | undefined,
	events: EventRow[],
	totalEvents?: number,
): string {
	if (!sessionId)
		return `<div class="detail-header"><h2 class="detail-title">Session Details</h2></div><div class="empty">No events.</div>`;
	if (events.length === 0)
		return `<div class="detail-header"><h2 class="detail-title">Session Details - ${escapeHtml(sessionId)}</h2></div><div class="empty">No events for this session.</div>`;

	const eventRows = renderEventTree(events);
	const json = JSON.stringify(events, null, 2);
	const truncated =
		totalEvents !== undefined && totalEvents > events.length
			? `<div class="detail-truncated">Showing the ${events.length} most recent of ${totalEvents} events — older events are hidden and the JSON copy is partial.</div>`
			: "";
	return `<section class="session-detail-view" data-session="${escapeAttr(sessionId)}">
	<div class="detail-header">
		<button type="button" class="detail-back" onclick="backToDashboard()" aria-label="back to dashboard">${backIcon}<span>Back</span></button>
		<h2 class="detail-title">Session Details - ${escapeHtml(sessionId)}</h2>
		<span class="detail-count">${totalEvents ?? events.length} events</span>
	</div>
	${truncated}
	<div class="detail-toolbar">
		<input type="search" class="detail-search" placeholder="Search attributes..." oninput="filterSessionDetails(this.value)">
		<button type="button" onclick="toggleSessionDetails(false)">Collapse All</button>
		<button type="button" onclick="toggleSessionDetails(true)">Expand All</button>
	</div>
	<div class="detail-events">${eventRows}</div>
	<div class="detail-actions">
		<button type="button" onclick="copySessionJson()">Copy JSON</button>
	</div>
	<pre id="session-json" class="session-json">${escapeHtml(json)}</pre>
</section>`;
}
