import { formatDuration } from "../utils.js";
import type { SessionMetrics } from "../../../shared/types.js";

const trendIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 18 9 12 13 16 21 6"/><circle cx="21" cy="6" r="2"/></svg>`;
const boltIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;
const clockIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
const shieldIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 12 15 16 10"/></svg>`;

export function renderMetricCards(metrics: SessionMetrics): string {
	const success = metrics.totalSessions === 0 ? "-" : `${Math.round(metrics.successRate)}%`;
	return `<div class="metric-grid">
	<div class="metric-card metric-sessions">
		<div class="metric-icon">${trendIcon}</div>
		<div class="metric-label">Total Sessions</div>
		<div class="metric-value">${metrics.totalSessions.toLocaleString()}</div>
	</div>
	<div class="metric-card metric-events">
		<div class="metric-icon">${boltIcon}</div>
		<div class="metric-label">Total Events</div>
		<div class="metric-value">${metrics.totalEvents.toLocaleString()}</div>
	</div>
	<div class="metric-card metric-duration">
		<div class="metric-icon">${clockIcon}</div>
		<div class="metric-label">Average Duration</div>
		<div class="metric-value">${formatDuration(metrics.averageDurationMs)}</div>
	</div>
	<div class="metric-card metric-success">
		<div class="metric-icon">${shieldIcon}</div>
		<div class="metric-label">Success Rate</div>
		<div class="metric-value">${success}</div>
	</div>
</div>`;
}
