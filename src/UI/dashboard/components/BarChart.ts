import { escapeAttr, escapeHtml } from "../utils.js";

type BarRow = { label: string; count: number; href?: string };

function truncateLabel(label: string, truncate: "start" | "end", limit = 20): string {
	if (label.length <= limit) return label;
	return truncate === "start" ? `…${label.slice(-(limit - 1))}` : `${label.slice(0, limit - 1)}…`;
}

export function renderBarChart(
	title: string,
	rows: BarRow[],
	truncate: "start" | "end" = "end",
): string {
	if (rows.length === 0) {
		return `<div class="chart-panel"><h2 class="chart-title">${escapeHtml(title)}</h2><div class="chart-empty">No data</div></div>`;
	}
	const max = Math.max(...rows.map((r) => r.count));
	const bars = rows
		.map((r) => {
			const percent = max > 0 ? (r.count / max) * 100 : 0;
			const display = escapeHtml(truncateLabel(r.label, truncate));
			const inner = `<span class="tool-name" title="${escapeAttr(r.label)}">${display}</span><div class="tool-bar-bg"><div class="tool-bar" style="width: ${percent}%"></div></div><span class="tool-count">${r.count}</span>`;
			return r.href
				? `<a class="tool-row" href="${escapeAttr(r.href)}" hx-get="${escapeAttr(r.href)}" hx-target="#dashboard-content" hx-swap="innerHTML">${inner}</a>`
				: `<div class="tool-row">${inner}</div>`;
		})
		.join("");
	return `<div class="chart-panel"><h2 class="chart-title">${escapeHtml(title)}</h2><div class="tool-chart">${bars}</div></div>`;
}
