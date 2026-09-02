import { escapeHtml } from "../utils.js";
import type { EventFrequency } from "../../../shared/types.js";

function xLabel(bucket: string, groupBy: "hour" | "day"): string {
	if (groupBy === "day") return bucket.slice(5, 10);
	return bucket.slice(11, 16);
}

export function renderEventFrequencyChart(
	data: EventFrequency[],
	groupBy: "hour" | "day" = "hour",
): string {
	if (data.length === 0) {
		return `<div class="chart-panel"><h2 class="chart-title">Event Frequency Over Time</h2><div class="chart-empty">No data</div></div>`;
	}

	const width = 640;
	const height = 260;
	const pad = 44;
	const chartHeight = height - pad * 2;
	const chartWidth = width - pad * 2;
	const max = Math.max(0, ...data.map((d) => d.count));
	const xStep = data.length > 1 ? chartWidth / (data.length - 1) : 0;
	const yScale = max > 0 ? chartHeight / max : 1;

	const points = data.map((d, i) => {
		const x = pad + i * xStep;
		const y = height - pad - d.count * yScale;
		return { x, y, count: d.count, label: xLabel(d.bucket, groupBy) };
	});

	const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
	const areaPath = `M ${points[0].x} ${height - pad} ${points.map((p) => `L ${p.x} ${p.y}`).join(" ")} L ${points[points.length - 1].x} ${height - pad} Z`;
	const xAxis = `<line class="axis" x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"/>`;
	const yAxis = `<line class="axis" x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}"/>`;

	const step = data.length <= 12 ? 1 : Math.ceil(data.length / 8);
	const labels = points
		.filter((_, i) => i % step === 0)
		.map(
			(p) =>
				`<text x="${p.x}" y="${height - 12}" text-anchor="middle">${escapeHtml(p.label)}</text>`,
		)
		.join("");

	const yTicks = [0, 0.5, 1]
		.map((r) => {
			const value = max > 0 ? Math.round(max * r) : 0;
			const y = height - pad - chartHeight * r;
			return `<text x="${pad - 8}" y="${y + 4}" text-anchor="end" class="y-label">${value}</text>`;
		})
		.join("");

	const gridLines = [0.25, 0.5, 0.75]
		.map((r) => {
			const y = height - pad - chartHeight * r;
			return `<line class="grid" x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}"/>`;
		})
		.join("");

	const defs = `<defs><linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity="0.5"/><stop offset="100%" stop-color="var(--accent-2)" stop-opacity="0.05"/></linearGradient></defs>`;
	const title = `<h2 class="chart-title">Event Frequency Over Time</h2>`;
	const svg = `<svg class="event-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">${defs}${gridLines}${yAxis}${xAxis}${yTicks}<path class="area" fill="url(#areaGradient)" d="${areaPath}"/><polyline points="${polyline}"/>${labels}</svg>`;
	const maxLabel = `<div class="chart-max">max ${max.toLocaleString()}</div>`;
	return `<div class="chart-panel">${title}${svg}${maxLabel}</div>`;
}
