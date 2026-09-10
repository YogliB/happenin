import { renderBarChart } from "./BarChart.js";
import type { FileUsage } from "../../../shared/types.js";

export function renderTopFiles(usage: FileUsage[]): string {
	return renderBarChart(
		"Top Markdown Files",
		usage.map((u) => ({ label: u.file, count: u.count })),
		"start",
	);
}
