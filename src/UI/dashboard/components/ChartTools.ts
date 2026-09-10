import { renderBarChart } from "./BarChart.js";
import { buildFragmentUrl } from "../queryLink.js";
import type { ToolUsage } from "../../../shared/types.js";
import type { QueryOptions } from "../queryLink.js";

export function renderToolChart(usage: ToolUsage[], query?: QueryOptions): string {
	return renderBarChart(
		"Most Used Tools",
		usage.map((u) => ({
			label: u.tool,
			count: u.count,
			href: query && buildFragmentUrl(query, { tool: u.tool, view: "list", offset: 0 }),
		})),
		{ labelLimit: 36, wideLabel: true },
	);
}
