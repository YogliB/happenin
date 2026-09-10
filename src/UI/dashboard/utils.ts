export function escapeHtml(raw: string): string {
	return raw
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function escapeAttr(raw: string): string {
	return raw
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function truncate(value: string, limit = 24): string {
	return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

export function commonPathPrefix(paths: string[]): string {
	if (paths.length === 0) return "";
	let prefix = paths[0];
	for (const path of paths.slice(1)) {
		let i = 0;
		while (i < prefix.length && i < path.length && prefix.charAt(i) === path.charAt(i)) i++;
		prefix = prefix.slice(0, i);
		if (prefix === "") return "";
	}
	const lastSlash = prefix.lastIndexOf("/");
	return lastSlash > 0 ? prefix.slice(0, lastSlash + 1) : "";
}

export function lastPathSegments(path: string, count: number): string {
	const segments = path.split("/").filter((segment) => segment.length > 0);
	return segments.slice(-count).join("/");
}

export function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.round(ms / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes > 0) return `${minutes}m ${seconds}s`;
	return `${seconds}s`;
}

export function formatTimestamp(value: string | number | null | undefined): string {
	if (value === null || value === undefined || value === "") return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString();
}
