import { escapeHtml, escapeAttr, commonPathPrefix } from "../utils.js";
import type { FilterOptions, FilterOptionLists } from "../../../shared/types.js";

const statuses = ["active", "completed", "failed"];
const chevronIcon = `<svg class="toggle-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
const filterIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`;

function renderSelect(
	name: string,
	values: string[],
	selected: string | undefined,
	placeholder = "all",
): string {
	const selectedValue = selected ?? "";
	const safe = escapeAttr(selectedValue);
	return `<select name="${name}" id="filter-${name}"><option value=""${selectedValue === "" ? " selected" : ""}>${placeholder}</option>${values
		.map((value) => {
			const v = escapeAttr(value);
			const s = v === safe ? " selected" : "";
			return `<option value="${v}"${s}>${escapeHtml(value)}</option>`;
		})
		.join("")}</select>`;
}

function renderDirectorySelect(
	name: string,
	directories: string[],
	selected: string | undefined,
): string {
	const prefix = commonPathPrefix(directories);
	const selectedValue = selected ?? "";
	const safe = escapeAttr(selectedValue);
	const options = directories
		.map((dir) => {
			const v = escapeAttr(dir);
			const s = v === safe ? " selected" : "";
			const label = dir.slice(prefix.length);
			return `<option value="${v}"${s}>${escapeHtml(label)}</option>`;
		})
		.join("");
	return `<select name="${name}" id="filter-${name}"><option value=""${selectedValue === "" ? " selected" : ""}>all directories</option>${options}</select>`;
}

function renderPillMultiSelect(
	name: string,
	options: { value: string; label: string }[],
	selected: string[],
	allLabel: string,
): string {
	const selectedSet = new Set(selected);
	const optionsHtml = options
		.map(({ value, label }) => {
			const v = escapeAttr(value);
			const s = selectedSet.has(value) ? " selected" : "";
			return `<option value="${v}" data-label="${escapeAttr(label)}"${s}>${escapeHtml(label)}</option>`;
		})
		.join("");
	return `<div class="ms" data-ms-all="${escapeAttr(allLabel)}">
	<select name="${name}" multiple class="ms-native" id="filter-${name}">${optionsHtml}</select>
</div>`;
}

function renderDirectoryMultiSelect(
	name: string,
	directories: string[],
	selected: string[],
): string {
	const prefix = commonPathPrefix(directories);
	return renderPillMultiSelect(
		name,
		directories.map((dir) => ({ value: dir, label: dir.slice(prefix.length) })),
		selected,
		"All directories",
	);
}

function renderPlainMultiSelect(
	name: string,
	values: string[],
	selected: string[],
	allLabel: string,
): string {
	return renderPillMultiSelect(
		name,
		values.map((value) => ({ value, label: value })),
		selected,
		allLabel,
	);
}

export function renderFilters(options: FilterOptionLists, selected: FilterOptions): string {
	const status = selected.status;
	const source = selected.source;
	const tool = selected.tool;
	const event = selected.event;
	const minDuration = selected.minDuration !== undefined ? String(selected.minDuration) : "";
	const maxDuration = selected.maxDuration !== undefined ? String(selected.maxDuration) : "";
	const mdDir = selected.mdDir;
	const selectedDirs = selected.projectPaths ?? [];
	const selectedSkills = selected.skills ?? [];
	const selectedMcpServers = selected.mcpServers ?? [];
	const isSessionsView = selected.view === "list";
	return `<div class="toolbar-row">
	<button type="button" id="filters-toggle" class="toggle-pill" aria-expanded="false" aria-controls="filter-panel" onclick="toggleFilters()">
		${chevronIcon}${filterIcon}<span>Filters</span><span class="toggle-badge" id="filters-badge" hidden></span>
	</button>
	<div class="view-tabs" role="tablist">
		<button type="button" id="tab-overview" class="view-tab" role="tab" aria-selected="${isSessionsView ? "false" : "true"}" onclick="switchView('overview')">Overview</button>
		<button type="button" id="tab-sessions" class="view-tab" role="tab" aria-selected="${isSessionsView ? "true" : "false"}" onclick="switchView('list')">Sessions<span class="toggle-badge" id="sessions-tab-count" hidden></span></button>
	</div>
</div>
<div class="filter-panel" id="filter-panel">
	<div class="field"><label id="filter-label-status" for="filter-status">Status</label>${renderSelect("status", statuses, status)}</div>
	<div class="field"><label id="filter-label-source" for="filter-source">Source</label>${renderSelect("source", options.sources, source)}</div>
	<div class="field"><label id="filter-label-tool" for="filter-tool">Tool</label>${renderSelect("tool", options.tools, tool)}</div>
	<div class="field"><label id="filter-label-event" for="filter-event">Event</label>${renderSelect("event", options.events, event)}</div>
	<div class="field field-wide"><label id="filter-label-dirs" for="filter-dirs">Directories</label>${renderDirectoryMultiSelect("dirs", options.directories, selectedDirs)}</div>
	<div class="field field-wide"><label id="filter-label-skills" for="filter-skills">Skills</label>${renderPlainMultiSelect("skills", options.skills, selectedSkills, "All skills")}</div>
	<div class="field field-wide"><label id="filter-label-mcp" for="filter-mcp">Integrations (MCP)</label>${renderPlainMultiSelect("mcp", options.mcpServers, selectedMcpServers, "All integrations")}</div>
	<div class="field"><label id="filter-label-mdDir" for="filter-mdDir">Md files directory</label>${renderDirectorySelect("mdDir", options.directories, mdDir)}</div>
	<div class="field"><label id="filter-label-minDuration" for="filter-minDuration">Min duration (m)</label><input type="number" id="filter-minDuration" name="minDuration" min="0" step="any" placeholder="min" value="${escapeHtml(minDuration)}"></div>
	<div class="field"><label id="filter-label-maxDuration" for="filter-maxDuration">Max duration (m)</label><input type="number" id="filter-maxDuration" name="maxDuration" min="0" step="any" placeholder="max" value="${escapeHtml(maxDuration)}"></div>
</div>`;
}
