import { escapeAttr, escapeHtml } from "../utils.js";
import type { ToolUsage } from "../../../shared/types.js";

export function renderToolChart(usage: ToolUsage[]): string {
	if (usage.length === 0) {
		return `<div class="chart-panel"><h2 class="chart-title">Most Used Tools</h2><div class="chart-empty">No data</div></div>`;
	}
	const max = Math.max(...usage.map((u) => u.count));
	const rows = usage
		.map((u) => {
			const percent = max > 0 ? (u.count / max) * 100 : 0;
			const raw = u.tool;
			const title = raw.length > 20 ? ` title="${escapeAttr(raw)}"` : "";
			const display = escapeHtml(raw.length > 20 ? `${raw.slice(0, 19)}…` : raw);
			return `<div class="tool-row"><span class="tool-name"${title}>${display}</span><div class="tool-bar-bg"><div class="tool-bar" style="width: ${percent}%"></div></div><span class="tool-count">${u.count}</span></div>`;
		})
		.join("");
	return `<div class="chart-panel"><h2 class="chart-title">Most Used Tools</h2><div class="tool-chart">${rows}</div></div>`;
}
