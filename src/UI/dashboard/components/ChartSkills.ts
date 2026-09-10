import { renderBarChart } from "./BarChart.js";
import { buildFragmentUrl } from "../queryLink.js";
import type { SkillUsage } from "../../../shared/types.js";
import type { QueryOptions } from "../queryLink.js";

export function renderSkillChart(usage: SkillUsage[], query?: QueryOptions): string {
	return renderBarChart(
		"Most Used Skills",
		usage.map((u) => ({
			label: u.skill,
			count: u.count,
			href: query && buildFragmentUrl(query, { skill: u.skill, view: "list", offset: 0 }),
		})),
		{ labelLimit: 36, wideLabel: true },
	);
}
