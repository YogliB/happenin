import { renderBarChart } from "./BarChart.js";
import type { SkillUsage } from "../../../shared/types.js";

export function renderSkillChart(usage: SkillUsage[]): string {
	return renderBarChart(
		"Most Used Skills",
		usage.map((u) => ({ label: u.skill, count: u.count })),
	);
}
