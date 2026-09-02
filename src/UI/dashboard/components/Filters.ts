import { escapeHtml, escapeAttr } from "../utils.js";
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

export function renderFilters(options: FilterOptionLists, selected: FilterOptions): string {
	const status = selected.status;
	const source = selected.source;
	const tool = selected.tool;
	const event = selected.event;
	const minDuration = selected.minDuration !== undefined ? String(selected.minDuration) : "";
	const maxDuration = selected.maxDuration !== undefined ? String(selected.maxDuration) : "";
	return `<div class="filter-bar">
	<label>status ${renderSelect("status", statuses, status)}</label>
	<label>source ${renderSelect("source", options.sources, source)}</label>
	<label>tool ${renderSelect("tool", options.tools, tool)}</label>
	<label>event ${renderSelect("event", options.events, event)}</label>
	<label>min duration (m) <input type="number" name="minDuration" min="0" step="any" placeholder="min" value="${escapeHtml(minDuration)}"></label>
	<label>max duration (m) <input type="number" name="maxDuration" min="0" step="any" placeholder="max" value="${escapeHtml(maxDuration)}"></label>
</div>`;
}
