import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { getFilterOptions } from "../../shared/db.js";
import { dashboardStyles } from "./styles.js";
import { parseQuery, renderSessionsContent, renderSessionDetailFragment } from "./fragments.js";
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
				if (!field) continue;
				if (Array.isArray(value)) {
					if (field.multiple && field.options) {
						for (const option of field.options) {
							option.selected = value.includes(option.value);
						}
					}
				} else if (value != null && value !== '') {
					field.value = String(value);
				}
			}
			return true;
		} catch {}
		return false;
	}

	function buildMultiSelect(wrapper) {
		const select = wrapper.querySelector('select.ms-native');
		if (!select) return;
		const allLabel = wrapper.getAttribute('data-ms-all') || 'All';
		const noun = allLabel.replace(/^All /i, '').toLowerCase();

		const pills = document.createElement('div');
		pills.className = 'ms-pills';
		const searchWrap = document.createElement('div');
		searchWrap.className = 'ms-search-wrap';
		const input = document.createElement('input');
		input.type = 'text';
		input.className = 'ms-search';
		input.id = select.id + '-search';
		input.placeholder = 'Search ' + noun + '...';
		input.autocomplete = 'off';
		const label = wrapper.parentElement?.querySelector('label[for="' + select.id + '"]');
		if (label) {
			input.setAttribute('aria-labelledby', label.id);
			label.addEventListener('click', (event) => {
				event.preventDefault();
				input.focus();
			});
		}
		const dropdown = document.createElement('div');
		dropdown.className = 'ms-dropdown';
		dropdown.hidden = true;
		searchWrap.appendChild(input);
		searchWrap.appendChild(dropdown);
		wrapper.insertBefore(pills, select);
		wrapper.insertBefore(searchWrap, select);
		wrapper.classList.add('enhanced');

		function optionsList() {
			return Array.from(select.options);
		}

		function renderPills() {
			pills.innerHTML = '';
			const selected = optionsList().filter((o) => o.selected);
			if (selected.length === 0) {
				const span = document.createElement('span');
				span.className = 'ms-pill ms-pill--all';
				span.textContent = allLabel;
				pills.appendChild(span);
				return;
			}
			for (const opt of selected) {
				const label = opt.dataset.label || opt.textContent;
				const pill = document.createElement('span');
				pill.className = 'ms-pill';
				const text = document.createElement('span');
				text.textContent = label;
				text.title = label;
				const remove = document.createElement('button');
				remove.type = 'button';
				remove.setAttribute('aria-label', 'Remove ' + label);
				remove.textContent = String.fromCharCode(215);
				remove.addEventListener('click', (e) => {
					e.stopPropagation();
					opt.selected = false;
					select.dispatchEvent(new Event('change', { bubbles: true }));
					renderPills();
					renderDropdown();
				});
				pill.appendChild(text);
				pill.appendChild(remove);
				pills.appendChild(pill);
			}
		}

		function renderDropdown() {
			const term = input.value.trim().toLowerCase();
			const unselected = optionsList().filter((o) => !o.selected);
			const matches = term
				? unselected.filter((o) => (o.dataset.label || o.textContent).toLowerCase().includes(term))
				: unselected;
			dropdown.innerHTML = '';
			if (matches.length === 0) {
				const empty = document.createElement('div');
				empty.className = 'ms-empty';
				empty.textContent = unselected.length === 0 ? 'All options selected' : 'No matches';
				dropdown.appendChild(empty);
				return;
			}
			for (const opt of matches.slice(0, 50)) {
				const item = document.createElement('div');
				item.className = 'ms-option';
				item.textContent = opt.dataset.label || opt.textContent;
				item.addEventListener('mousedown', (e) => {
					e.preventDefault();
					opt.selected = true;
					select.dispatchEvent(new Event('change', { bubbles: true }));
					input.value = '';
					renderPills();
					renderDropdown();
				});
				dropdown.appendChild(item);
			}
		}

		input.addEventListener('focus', () => {
			renderDropdown();
			dropdown.hidden = false;
		});
		input.addEventListener('input', () => {
			renderDropdown();
			dropdown.hidden = false;
		});
		input.addEventListener('blur', () => {
			setTimeout(() => {
				dropdown.hidden = true;
			}, 150);
		});
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				dropdown.hidden = true;
				input.blur();
			}
			if (e.key === 'Enter') {
				e.preventDefault();
				const first = dropdown.querySelector('.ms-option');
				if (first) first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
			}
		});

		select.msRefresh = () => {
			renderPills();
			renderDropdown();
		};
		renderPills();
		renderDropdown();
	}

	function initMultiSelects() {
		for (const wrapper of document.querySelectorAll('.ms')) {
			buildMultiSelect(wrapper);
		}
	}

	function refreshMultiSelects() {
		for (const select of document.querySelectorAll('select.ms-native')) {
			if (select.msRefresh) select.msRefresh();
		}
	}

	function getViewField() {
		const form = document.querySelector('[data-filter-form]');
		return form ? form.elements['view'] : null;
	}

	function getActiveView() {
		const field = getViewField();
		return field && field.value === 'list' ? 'list' : 'overview';
	}

	function updateViewTabs() {
		const view = getActiveView();
		const overviewTab = document.getElementById('tab-overview');
		const sessionsTab = document.getElementById('tab-sessions');
		if (overviewTab) overviewTab.setAttribute('aria-selected', String(view === 'overview'));
		if (sessionsTab) sessionsTab.setAttribute('aria-selected', String(view === 'list'));
	}

	function requestSessionsFragment() {
		const form = document.querySelector('[data-filter-form]');
		const content = document.getElementById('dashboard-content');
		if (!form || !content || typeof htmx === 'undefined') return;
		const params = new URLSearchParams();
		for (const [key, value] of collectFormEntries(form)) {
			params.append(key, value);
		}
		const url = '/fragments/sessions' + (params.size > 0 ? '?' + params.toString() : '');
		content.setAttribute('hx-get', url);
		htmx.ajax('GET', url, { target: content, swap: 'innerHTML' });
	}

	function switchView(view) {
		const form = document.querySelector('[data-filter-form]');
		const field = getViewField();
		if (field) field.value = view === 'list' ? 'list' : '';
		updateViewTabs();
		if (form) {
			saveFilters(form);
			updateFiltersBadge();
		}
		requestSessionsFragment();
	}

	function syncViewCounts() {
		const content = document.getElementById('dashboard-content');
		const badge = document.getElementById('sessions-tab-count');
		if (!content || !badge) return;
		const countEl =
			content.querySelector('.metric-sessions .metric-value') ||
			content.querySelector('.session-collapse-count');
		if (countEl) {
			badge.textContent = countEl.textContent;
			badge.hidden = false;
		} else {
			badge.hidden = true;
		}
	}

	function countActiveFilters() {
		const panel = document.getElementById('filter-panel');
		if (!panel) return 0;
		let count = 0;
		for (const el of panel.querySelectorAll('select, input')) {
			if (el.multiple) count += el.selectedOptions.length;
			else if (el.value) count += 1;
		}
		return count;
	}

	function updateFiltersBadge() {
		const badge = document.getElementById('filters-badge');
		if (!badge) return;
		const count = countActiveFilters();
		badge.textContent = String(count);
		badge.hidden = count === 0;
	}

	const FILTERS_OPEN_KEY = 'happenin-filters-open';

	function toggleFilters() {
		const btn = document.getElementById('filters-toggle');
		const panel = document.getElementById('filter-panel');
		if (!btn || !panel) return;
		const next = btn.getAttribute('aria-expanded') !== 'true';
		btn.setAttribute('aria-expanded', String(next));
		panel.classList.toggle('open', next);
		setItem(FILTERS_OPEN_KEY, next ? '1' : '');
	}

	function initFilterPanel() {
		const btn = document.getElementById('filters-toggle');
		const panel = document.getElementById('filter-panel');
		if (!btn || !panel) return;
		const open = getItem(FILTERS_OPEN_KEY) === '1';
		btn.setAttribute('aria-expanded', String(open));
		panel.classList.toggle('open', open);
		updateFiltersBadge();
	}

	function collectFormEntries(form) {
		const data = new FormData(form);
		const entries = [];
		for (const [key, value] of data.entries()) {
			if (value) entries.push([key, String(value)]);
		}
		return entries;
	}

	function updateContentUrl() {
		const form = document.querySelector('[data-filter-form]');
		const content = document.getElementById('dashboard-content');
		if (!form || !content) return;
		const params = new URLSearchParams();
		for (const [key, value] of collectFormEntries(form)) {
			params.append(key, value);
		}
		content.setAttribute('hx-get', '/fragments/sessions' + (params.size > 0 ? '?' + params.toString() : ''));
	}

	function saveFilters(form) {
		const filters = {};
		for (const [key, value] of collectFormEntries(form)) {
			if (key in filters) {
				filters[key] = Array.isArray(filters[key]) ? [...filters[key], value] : [filters[key], value];
			} else {
				filters[key] = value;
			}
		}
		setItem(FILTER_KEY, JSON.stringify(filters));
	}

	function initFilters() {
		const form = document.querySelector('[data-filter-form]');
		const content = document.getElementById('dashboard-content');
		if (!form || !content) return;
		initMultiSelects();
		const hadSaved = window.location.search ? false : loadFilters();
		refreshMultiSelects();
		form.addEventListener('change', () => {
			saveFilters(form);
			updateFiltersBadge();
			updateViewTabs();
			refreshMultiSelects();
		});
		form.addEventListener('input', (event) => {
			if (event.target.classList.contains('search')) saveFilters(form);
		});
		updateContentUrl();
		initFilterPanel();
		if (hadSaved) {
			setTimeout(() => {
				requestSessionsFragment();
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
		requestSessionsFragment();
	}

	function syncDetailState() {
		const content = document.getElementById('dashboard-content');
		if (!content) return;
		const detail = content.querySelector('.session-detail-view');
		document.body.classList.toggle('session-detail-open', !!detail);
	}

	function syncSessionsListState() {
		const content = document.getElementById('dashboard-content');
		if (!content) return;
		const isList = !!content.querySelector('.sessions-list-view');
		document.body.classList.toggle('sessions-list-open', isList);
	}

	document.addEventListener('htmx:beforeSwap', (e) => {
		const elt = e.detail.requestConfig ? e.detail.requestConfig.elt : null;
		const blocked =
			document.body.classList.contains('session-detail-open') ||
			document.body.classList.contains('sessions-list-open');
		if (elt && elt.id === 'dashboard-content' && blocked) {
			e.detail.shouldSwap = false;
		}
	});

	window.filterSessionDetails = filterSessionDetails;
	window.toggleSessionDetails = toggleSessionDetails;
	window.copySessionJson = copySessionJson;
	window.copyEventJson = copyEventJson;
	window.backToDashboard = backToDashboard;
	window.switchView = switchView;
	window.toggleFilters = toggleFilters;

	document.addEventListener('htmx:afterSettle', () => {
		updateContentUrl();
		syncDetailState();
		syncSessionsListState();
		updateViewTabs();
		syncViewCounts();
	});

	function initHistoryState() {
		syncDetailState();
		syncSessionsListState();
		updateViewTabs();
		syncViewCounts();
	}

	applyTheme(getTheme());

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initTheme);
		document.addEventListener('DOMContentLoaded', initFilters);
		document.addEventListener('DOMContentLoaded', initHistoryState);
	} else {
		initTheme();
		initFilters();
		initHistoryState();
	}
})();
`;

export function dashboardHtml(db: DatabaseSync, query: QueryOptions): string {
	const filterOptions = getFilterOptions(db);
	const content = query.sessionId
		? renderSessionDetailFragment(db, query)
		: renderSessionsContent(db, query);
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
<input type="hidden" name="view" value="${query.view === "list" ? "list" : ""}">
${header}${filters}
</form>
</div>
<div id="dashboard-content" class="dashboard-content-area" sse-connect="/events/stream" hx-get="/fragments/sessions" hx-target="#dashboard-content" hx-swap="innerHTML" hx-trigger="sse:message">
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
