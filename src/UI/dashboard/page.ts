import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { getFilterOptions } from "../../shared/db.js";
import { dashboardStyles } from "./styles.js";
import { parseQuery, renderSessionsContent } from "./fragments.js";
import { renderHeader } from "./components/Header.js";
import { renderFilters } from "./components/Filters.js";
import type { QueryOptions } from "./fragments.js";

const clientScript = `
(function () {
	const THEME_KEY = 'happenin-theme';
	const FILTER_KEY = 'happenin-filters';
	const DARK_MQL = window.matchMedia('(prefers-color-scheme: dark)');

	function getItem(key) {
		try {
			return localStorage.getItem(key);
		} catch {
			return null;
		}
	}

	function setItem(key, value) {
		try {
			localStorage.setItem(key, value);
		} catch {}
	}

	function removeItem(key) {
		try {
			localStorage.removeItem(key);
		} catch {}
	}

	function getSystemTheme() {
		return DARK_MQL.matches ? 'dark' : 'light';
	}

	function getSavedTheme() {
		const stored = getItem(THEME_KEY);
		return stored === 'light' || stored === 'dark' ? stored : null;
	}

	function getTheme() {
		return getSavedTheme() || getSystemTheme();
	}

	function applyTheme(theme) {
		document.documentElement.setAttribute('data-theme', theme);
	}

	function updateThemeButton(theme) {
		const button = document.querySelector('[data-theme-toggle]');
		if (!button) return;
		button.textContent = theme === 'dark' ? '☀️' : '🌙';
		button.title = getSavedTheme()
			? theme === 'dark'
				? 'Switch to light theme'
				: 'Switch to dark theme'
			: 'Following system theme — click to switch';
	}

	function initTheme() {
		const theme = getTheme();
		applyTheme(theme);
		updateThemeButton(theme);

		DARK_MQL.addEventListener('change', () => {
			if (!getSavedTheme()) {
				const next = getSystemTheme();
				applyTheme(next);
				updateThemeButton(next);
			}
		});

		const button = document.querySelector('[data-theme-toggle]');
		if (button) {
			button.addEventListener('click', () => {
				const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
				const next = current === 'dark' ? 'light' : 'dark';
				if (next === getSystemTheme()) {
					removeItem(THEME_KEY);
				} else {
					setItem(THEME_KEY, next);
				}
				applyTheme(next);
				updateThemeButton(next);
			});
		}
	}

	function loadFilters() {
		const raw = getItem(FILTER_KEY);
		if (!raw) return false;
		try {
			const values = JSON.parse(raw);
			const form = document.querySelector('[data-filter-form]');
			if (!form) return false;
			for (const [name, value] of Object.entries(values)) {
				const field = form.elements[name];
				if (field && value != null && value !== '') {
					field.value = String(value);
				}
			}
			return true;
		} catch {}
		return false;
	}

	function updateContentUrl() {
		const form = document.querySelector('[data-filter-form]');
		const content = document.getElementById('dashboard-content');
		if (!form || !content) return;
		const data = new FormData(form);
		const params = new URLSearchParams();
		for (const [key, value] of data.entries()) {
			if (value) params.set(key, String(value));
		}
		content.setAttribute('hx-get', '/fragments/sessions' + (params.size > 0 ? '?' + params.toString() : ''));
	}

	function saveFilters(form) {
		const data = new FormData(form);
		const filters = {};
		for (const [key, value] of data.entries()) {
			if (value) filters[key] = String(value);
		}
		setItem(FILTER_KEY, JSON.stringify(filters));
	}

	function initFilters() {
		const form = document.querySelector('[data-filter-form]');
		const content = document.getElementById('dashboard-content');
		if (!form || !content) return;
		const hadSaved = loadFilters();
		form.addEventListener('change', () => saveFilters(form));
		form.addEventListener('input', (event) => {
			if (event.target.classList.contains('search')) saveFilters(form);
		});
		updateContentUrl();
		if (hadSaved) {
			setTimeout(() => {
				if (typeof htmx !== 'undefined') htmx.trigger(form, 'change');
			}, 0);
		}
	}

	function filterSessionDetails(term) {
		const container = document.querySelector('.detail-events');
		if (!container) return;
		const lower = term.toLowerCase();
		for (const detail of container.querySelectorAll(':scope > .detail-event')) {
			detail.style.display = !lower || detail.textContent.toLowerCase().includes(lower) ? '' : 'none';
		}
	}

	function toggleSessionDetails(open) {
		const container = document.querySelector('.detail-events');
		if (!container) return;
		for (const detail of container.querySelectorAll('.detail-event')) {
			detail.open = open;
		}
	}

	function copySessionJson() {
		const pre = document.getElementById('session-json');
		if (!pre) return;
		navigator.clipboard.writeText(pre.textContent).catch((e) => alert('Copy failed: ' + e.message));
	}

	function copyEventJson(button) {
		const pre = button.parentElement.querySelector('pre');
		if (!pre) return;
		navigator.clipboard.writeText(pre.textContent).catch((e) => alert('Copy failed: ' + e.message));
	}

	function backToDashboard() {
		const form = document.querySelector('[data-filter-form]');
		if (form && typeof htmx !== 'undefined') htmx.trigger(form, 'change');
	}

	function syncDetailState() {
		const content = document.getElementById('dashboard-content');
		if (!content) return;
		const detail = content.querySelector('.session-detail-view');
		document.body.classList.toggle('session-detail-open', !!detail);
		const sessionId = detail ? detail.getAttribute('data-session') : null;
		for (const item of content.querySelectorAll('.session-item')) {
			item.classList.toggle('active', !!sessionId && item.dataset.session === sessionId);
		}
		const list = content.querySelector('.session-list');
		if (list) {
			list.scrollTop = sidebarScroll;
			const active = content.querySelector('.session-item.active');
			if (active) active.scrollIntoView({ block: 'nearest' });
		}
	}

	let sidebarScroll = 0;
	document.addEventListener('htmx:beforeSwap', (e) => {
		const list = document.querySelector('.session-list');
		if (list) sidebarScroll = list.scrollTop;
		const elt = e.detail.requestConfig ? e.detail.requestConfig.elt : null;
		if (elt && elt.id === 'dashboard-content' && document.body.classList.contains('session-detail-open')) {
			e.detail.shouldSwap = false;
		}
	});

	window.filterSessionDetails = filterSessionDetails;
	window.toggleSessionDetails = toggleSessionDetails;
	window.copySessionJson = copySessionJson;
	window.copyEventJson = copyEventJson;
	window.backToDashboard = backToDashboard;

	document.addEventListener('htmx:afterSettle', () => {
		updateContentUrl();
		syncDetailState();
	});

	applyTheme(getTheme());

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initTheme);
		document.addEventListener('DOMContentLoaded', initFilters);
	} else {
		initTheme();
		initFilters();
	}
})();
`;

export function dashboardHtml(db: DatabaseSync, query: QueryOptions): string {
	const filterOptions = getFilterOptions(db);
	const content = renderSessionsContent(db, query);
	const header = renderHeader(query);
	const filters = renderFilters(filterOptions, query);

	return `<!DOCTYPE html>
<html lang="en" hx-ext="sse">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Session Overview Analytics - happenin</title>
<script>${clientScript}</script>
<style>${dashboardStyles}</style>
<script src="https://unpkg.com/htmx.org@2.0.10/dist/htmx.min.js" integrity="sha256-cepnGFv6jJjDnTFxfG/OXYUjcPzf0SnbRUN3TTFFwN4=" crossorigin="anonymous"></script>
<script src="https://unpkg.com/htmx-ext-sse@2.2.4/dist/sse.js" integrity="sha256-O1mSpUFhm6vvxMFpUFr0dN9cMDnaUeWblsz5JB7NYdI=" crossorigin="anonymous"></script>
</head>
<body>
<div class="app">
<div class="sticky-bar">
<form data-filter-form hx-get="/fragments/sessions" hx-target="#dashboard-content" hx-swap="innerHTML" hx-trigger="change, input changed delay:300ms from:.search">
${header}${filters}
</form>
</div>
<div id="dashboard-content" class="dashboard-layout" sse-connect="/events/stream" hx-get="/fragments/sessions" hx-target="#dashboard-content" hx-swap="innerHTML" hx-trigger="sse:message">
${content}
</div>
</div>
</body>
</html>`;
}

export function sendDashboard(
	req: IncomingMessage,
	res: ServerResponse,
	url: URL,
	db: DatabaseSync,
): void {
	const query = parseQuery(url);
	res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
	res.end(dashboardHtml(db, query));
}
