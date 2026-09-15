import { escapeHtml } from "../utils.js";
import type { ContextBreakdown, ContextBucketKey } from "../../../shared/types.js";

type BucketConfig = { key: ContextBucketKey; label: string; color: string };

const BUCKETS: BucketConfig[] = [
	{ key: "actualValue", label: "Actual value", color: "var(--success)" },
	{ key: "mdFiles", label: "Markdown files", color: "var(--accent-2)" },
	{ key: "mcpServers", label: "MCP servers", color: "var(--accent)" },
	{ key: "bloatware", label: "Bloatware", color: "var(--warning)" },
];

export function formatBytes(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}MB`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}KB`;
	return `${value}B`;
}

export function formatTokens(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
	return `${value}`;
}

function renderBar(
	title: string,
	values: Record<ContextBucketKey, number>,
	format: (value: number) => string,
	emptyMessage: string,
): string {
	// oxlint-disable-next-line security/detect-object-injection -- key comes from the hard-coded BUCKETS list
	const total = BUCKETS.reduce((sum, { key }) => sum + values[key], 0);
	if (total === 0) {
		return `<div class="context-bar-block">
	<h3 class="context-bar-title">${escapeHtml(title)}</h3>
	<div class="chart-empty">${escapeHtml(emptyMessage)}</div>
</div>`;
	}

	const segments = BUCKETS.filter(({ key }) => {
		// oxlint-disable-next-line security/detect-object-injection -- key comes from the hard-coded BUCKETS list
		return values[key] > 0;
	})
		.map(({ key, label, color }) => {
			// oxlint-disable-next-line security/detect-object-injection -- key comes from the hard-coded BUCKETS list
			const value = values[key];
			const percent = (value / total) * 100;
			const segmentTitle = `${label}: ${format(value)} (${percent.toFixed(1)}%)`;
			return `<div class="context-segment" style="width: ${percent}%; background: ${color}" title="${escapeHtml(segmentTitle)}"></div>`;
		})
		.join("");

	const legend = BUCKETS.map(({ key, label, color }) => {
		// oxlint-disable-next-line security/detect-object-injection -- key comes from the hard-coded BUCKETS list
		const value = values[key];
		const percent = (value / total) * 100;
		return `<div class="context-legend-row">
	<span class="context-legend-dot" style="background: ${color}"></span>
	<span class="context-legend-label">${escapeHtml(label)}</span>
	<span class="context-legend-value">${escapeHtml(format(value))} · ${percent.toFixed(1)}%</span>
</div>`;
	}).join("");

	return `<div class="context-bar-block">
	<h3 class="context-bar-title">${escapeHtml(title)}</h3>
	<div class="context-bar">${segments}</div>
	<div class="context-legend">${legend}</div>
</div>`;
}

export function renderContextBreakdown(breakdown: ContextBreakdown): string {
	const bytesBar = renderBar(
		"By payload size (all sources)",
		breakdown.bytes,
		formatBytes,
		"No data",
	);
	const tokensBar = renderBar(
		"By tokens (imported Claude sessions)",
		breakdown.tokens,
		formatTokens,
		"Run `happenin import` to see token-based numbers",
	);

	return `<div class="chart-panel context-breakdown">
	<h2 class="chart-title">Context Breakdown</h2>
	<div class="context-bars">${bytesBar}${tokensBar}</div>
</div>`;
}
