import { escapeHtml, escapeAttr, commonPathPrefix } from "../utils.js";
import type { FilterOptions, FilterOptionLists } from "../../../shared/types.js";

const statuses = ["active", "completed", "failed"];

function renderSelect(
	name: string,
	values: string[],
	selected: string | undefined,
	placeholder = "all",
): string {
	const selectedValue = selected ?? "";
	const safe = escapeAttr(selectedValue);
	return `<select name="${name}"><option value=""${selectedValue === "" ? " selected" : ""}>${placeholder}</option>${values
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
	return `<select name="${name}"><option value=""${selectedValue === "" ? " selected" : ""}>all directories</option>${options}</select>`;
}

function renderMultiSelect(
	name: string,
	options: { value: string; label: string }[],
	selected: string[],
): string {
	const selectedSet = new Set(selected);
	const optionsHtml = options
		.map(({ value, label }) => {
			const v = escapeAttr(value);
			const s = selectedSet.has(value) ? " selected" : "";
			return `<option value="${v}"${s}>${escapeHtml(label)}</option>`;
		})
		.join("");
	const size = Math.max(1, Math.min(options.length, 6));
	return `<select name="${name}" multiple size="${size}">${optionsHtml}</select>`;
}

function renderDirectoryMultiSelect(
	name: string,
	directories: string[],
	selected: string[],
): string {
	const prefix = commonPathPrefix(directories);
	return renderMultiSelect(
		name,
		directories.map((dir) => ({ value: dir, label: dir.slice(prefix.length) })),
		selected,
	);
}

function renderPlainMultiSelect(name: string, values: string[], selected: string[]): string {
	return renderMultiSelect(
		name,
		values.map((value) => ({ value, label: value })),
		selected,
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
	return `<div class="filter-bar">
	<label>status ${renderSelect("status", statuses, status)}</label>
	<label>source ${renderSelect("source", options.sources, source)}</label>
	<label>tool ${renderSelect("tool", options.tools, tool)}</label>
	<label>event ${renderSelect("event", options.events, event)}</label>
	<label>directories ${renderDirectoryMultiSelect("dirs", options.directories, selectedDirs)}</label>
	<label>skills ${renderPlainMultiSelect("skills", options.skills, selectedSkills)}</label>
	<label>integrations (MCP) ${renderPlainMultiSelect("mcp", options.mcpServers, selectedMcpServers)}</label>
	<label>md files directory ${renderDirectorySelect("mdDir", options.directories, mdDir)}</label>
	<label>min duration (m) <input type="number" name="minDuration" min="0" step="any" placeholder="min" value="${escapeHtml(minDuration)}"></label>
	<label>max duration (m) <input type="number" name="maxDuration" min="0" step="any" placeholder="max" value="${escapeHtml(maxDuration)}"></label>
</div>`;
}
