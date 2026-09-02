import { escapeHtml, escapeAttr } from "../utils.js";
import type { FilterOptions } from "../../../shared/types.js";

const ranges = [
	{ value: "24h", label: "Last 24h" },
	{ value: "7d", label: "Last 7 days" },
	{ value: "30d", label: "Last 30 days" },
	{ value: "all", label: "All time" },
];

const searchIcon = `<svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>`;
const logoIcon = `<svg class="brand-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 7v10"/><path d="M16 7v10"/><path d="M8 12h8"/></svg>`;

export function renderHeader(selected: FilterOptions): string {
	const q = escapeHtml(selected.q ?? "");
	const range = selected.range ?? "24h";
	return `<header class="app-header">
	<div class="brand">${logoIcon} happenin</div>
	<h1 class="page-title">Session Overview Analytics</h1>
	<div class="header-controls">
		<div class="search-wrap">
			${searchIcon}
			<input type="text" name="q" class="search" placeholder="session or payload" value="${q}" autocomplete="off">
		</div>
		<label>range <select name="range">${ranges.map((r) => `<option value="${escapeAttr(r.value)}"${r.value === range ? " selected" : ""}>${escapeHtml(r.label)}</option>`).join("")}</select></label>
		<button type="button" class="theme" data-theme-toggle title="Toggle light/dark theme" aria-label="toggle theme">🌙</button>
	</div>
</header>`;
}
