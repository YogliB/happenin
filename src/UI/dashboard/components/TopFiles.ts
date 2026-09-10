import { renderBarChart } from "./BarChart.js";
import { buildFragmentUrl } from "../queryLink.js";
import { lastPathSegments } from "../utils.js";
import type { FileUsage } from "../../../shared/types.js";
import type { QueryOptions } from "../queryLink.js";

export function renderTopFiles(usage: FileUsage[], query?: QueryOptions): string {
	return renderBarChart(
		"Top Markdown Files",
		usage.map((u) => ({
			label: lastPathSegments(u.file, 2),
			title: u.file,
			count: u.count,
			href: query && buildFragmentUrl(query, { file: u.file, view: "list", offset: 0 }),
		})),
		{ truncate: "start", labelLimit: 40, wideLabel: true },
	);
}
