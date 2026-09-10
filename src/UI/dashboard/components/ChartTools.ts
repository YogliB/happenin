import { renderBarChart } from "./BarChart.js";
import type { ToolUsage } from "../../../shared/types.js";

export function renderToolChart(usage: ToolUsage[]): string {
	return renderBarChart(
		"Most Used Tools",
		usage.map((u) => ({ label: u.tool, count: u.count })),
	);
}
