export const dashboardStyles = `
:root {
	color-scheme: dark;
	--bg: #0d0d0f;
	--surface: #111216;
	--surface-2: #14161b;
	--surface-3: #16181d;
	--surface-4: #1c1f26;
	--surface-5: #252830;
	--border: #23262d;
	--border-2: #24282f;
	--text: #e6e6e6;
	--text-2: #9aa3b2;
	--text-3: #9ca3af;
	--text-4: #6b7280;
	--accent: #60a5fa;
	--accent-2: #c084fc;
	--success: #22c55e;
	--warning: #eab308;
	--danger: #ef4444;
}
[data-theme="light"] {
	color-scheme: light;
	--bg: #ffffff;
	--surface: #f9fafb;
	--surface-2: #f3f4f6;
	--surface-3: #ffffff;
	--surface-4: #f3f4f6;
	--surface-5: #e5e7eb;
	--border: #e5e7eb;
	--border-2: #d1d5db;
	--text: #111827;
	--text-2: #6b7280;
	--text-3: #6b7280;
	--text-4: #9ca3af;
	--accent: #2563eb;
	--accent-2: #7c3aed;
	--success: #16a34a;
	--warning: #ca8a04;
	--danger: #dc2626;
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 0; line-height: 1.5; }
.app { display: flex; flex-direction: column; height: 100%; max-width: 1400px; margin: 0 auto; padding: 1.5rem; gap: 1.25rem; }
.sticky-bar { flex: 0 0 auto; display: flex; flex-direction: column; gap: 1rem; background: var(--bg); position: sticky; top: 0; z-index: 10; }
.app-header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; padding: 0.75rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; }
.brand { font-weight: 800; font-size: 1.25rem; display: flex; align-items: center; gap: 0.5rem; color: var(--text); }
.brand-icon { color: var(--accent); }
.page-title { font-size: 1.1rem; font-weight: 600; margin: 0; color: var(--text); }
.header-controls { display: flex; gap: 0.75rem; align-items: end; }
.search-wrap { position: relative; display: flex; align-items: center; }
.search-icon { position: absolute; left: 0.6rem; color: var(--text-4); pointer-events: none; }
input.search { padding-left: 2rem; min-width: 14rem; }
.filter-bar { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: end; padding: 0.75rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; }
form { margin: 0; display: flex; flex-direction: column; gap: 1rem; }
label { display: flex; flex-direction: column; font-size: 0.75rem; gap: 0.25rem; color: var(--text-2); }
input, select, button { background: var(--surface-2); color: var(--text); border: 1px solid var(--border); border-radius: 0.4rem; padding: 0.45rem 0.7rem; font-size: 0.85rem; transition: border-color 0.15s, background 0.15s; }
input:focus, select:focus, button:focus { outline: none; border-color: var(--accent); }
select { min-width: 7.5rem; cursor: pointer; }
button { cursor: pointer; background: var(--surface-4); font-weight: 500; }
button:hover { background: var(--surface-5); }
.theme { display: inline-flex; align-items: center; justify-content: center; font-size: 1.25rem; padding: 0.35rem 0.6rem; line-height: 1; }
.dashboard-layout { flex: 1 1 auto; display: grid; grid-template-columns: 22rem 1fr; gap: 1.25rem; min-height: 0; overflow: hidden; }
.session-sidebar { display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; overflow: hidden; min-height: 0; }
.session-list-wrapper { flex: 1 1 auto; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
.session-list-title { padding: 0.75rem 1rem; margin: 0; font-size: 0.9rem; font-weight: 600; color: var(--text-2); border-bottom: 1px solid var(--border); background: var(--surface-2); position: sticky; top: 0; z-index: 2; }
.session-list { flex: 1 1 auto; list-style: none; padding: 0; margin: 0; overflow-y: auto; }
.status-badge { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.15rem 0.45rem; border-radius: 0.25rem; }
.status-active { background: rgba(34,197,94,0.15); color: var(--success); }
.status-completed { background: rgba(96,165,250,0.15); color: var(--accent); }
.status-failed { background: rgba(239,68,68,0.15); color: var(--danger); }
.session-item { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.7rem 1rem; border-bottom: 1px solid var(--border-2); cursor: pointer; transition: background 0.12s; }
.session-item:hover { background: var(--surface-3); }
.session-item.active { background: var(--surface-3); box-shadow: inset 3px 0 0 var(--accent); }
.session-item.active .session-id { color: var(--accent); }
.session-item-static { cursor: default; }
.session-item-static:hover { background: none; }
.session-item:last-child { border-bottom: none; }
.session-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.35rem; }
.session-row { display: flex; align-items: center; gap: 0.5rem; justify-content: space-between; }
.session-id { font-weight: 600; font-size: 0.85rem; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.session-meta { display: flex; gap: 0.75rem; font-size: 0.75rem; color: var(--text-3); }
.session-chevron { color: var(--text-3); background: none; border: none; padding: 0.2rem; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.session-chevron:hover { color: var(--accent); background: none; }
.session-list .empty { padding: 2rem 1rem; text-align: center; color: var(--text-4); }
.main-content { display: grid; grid-template-rows: auto 1fr; gap: 1.25rem; min-height: 0; overflow: hidden; }
.main-content:has(.session-detail-view) { grid-template-rows: 1fr; }
.main-metrics .metric-grid { grid-template-columns: repeat(4, 1fr); gap: 1rem; }
.main-metrics .metric-card { min-height: 5rem; }
.main-metrics .metric-value { font-size: 1.65rem; }
.top-charts { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; min-height: 0; }
.chart-panel { background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; padding: 1rem; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.chart-title { font-size: 0.9rem; font-weight: 600; color: var(--text-2); margin: 0 0 0.75rem; flex: 0 0 auto; }
.chart-empty { color: var(--text-4); text-align: center; padding: 4rem 0; }
.chart-max { text-align: right; color: var(--text-4); font-size: 0.7rem; margin-top: 0.25rem; flex: 0 0 auto; }
.event-chart { width: 100%; height: 100%; min-height: 0; flex: 1 1 auto; display: block; }
.event-chart polyline { fill: none; stroke: var(--accent); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.event-chart .area { fill: url(#areaGradient); stroke: none; }
.event-chart .axis { stroke: var(--border-2); stroke-width: 1; }
.event-chart text { fill: var(--text-3); font-size: 10px; }
.event-chart .y-label { font-size: 9px; fill: var(--text-4); }
.event-chart .grid { stroke: var(--surface-4); stroke-width: 1; }
.tool-chart { display: flex; flex-direction: column; gap: 0.65rem; flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.tool-row { display: grid; grid-template-columns: 8rem 1fr 2.5rem; align-items: center; gap: 0.75rem; font-size: 0.8rem; }
.tool-name { color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tool-bar-bg { background: var(--surface-4); border-radius: 0.4rem; height: 0.85rem; overflow: hidden; }
.tool-bar { background: linear-gradient(90deg, var(--accent), var(--accent-2)); height: 100%; border-radius: 0.4rem; }
.tool-count { color: var(--text-3); text-align: right; font-weight: 600; }
.detail-area { background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; padding: 1rem; }
.detail-area > .empty { color: var(--text-4); text-align: center; padding: 4rem 0; }
.session-detail-view { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 0.75rem; background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; padding: 1rem; overflow: hidden; }
.detail-header { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex: 0 0 auto; }
.detail-back { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; padding: 0.35rem 0.6rem; flex: 0 0 auto; }
.detail-title { font-size: 1rem; font-weight: 600; color: var(--text); word-break: break-all; flex: 1 1 auto; min-width: 0; margin: 0; }
.detail-count { font-size: 0.75rem; color: var(--text-3); white-space: nowrap; flex: 0 0 auto; }
.detail-truncated { flex: 0 0 auto; font-size: 0.75rem; color: var(--warning); background: color-mix(in srgb, var(--warning) 12%, transparent); border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent); border-radius: 0.4rem; padding: 0.4rem 0.6rem; }
.detail-toolbar { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; flex: 0 0 auto; }
.detail-toolbar input[type="search"] { flex: 1; min-width: 14rem; }
.detail-toolbar button { font-size: 0.8rem; padding: 0.4rem 0.65rem; }
.detail-actions { display: flex; gap: 0.5rem; flex: 0 0 auto; }
.detail-events { --timeline-x: 0.35rem; --timeline-indent: 1.4rem; --dot-x: calc(var(--timeline-x) - var(--timeline-indent)); display: flex; flex-direction: column; gap: 0.1rem; padding-left: var(--timeline-indent); flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.detail-event { position: relative; display: block; font-size: 0.82rem; min-width: 0; }
.detail-event::before { content: ""; position: absolute; left: calc(var(--dot-x) - 0.3rem); top: 0.78rem; width: 0.6rem; height: 0.6rem; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px var(--surface); z-index: 1; }
.detail-event::after { content: ""; position: absolute; left: calc(var(--dot-x) - 1px); top: 1.5rem; bottom: -0.1rem; width: 2px; background: var(--border); }
.detail-event:last-child::after { display: none; }
.detail-subagent::before { background: var(--accent-2); }
.detail-event > summary { display: flex; gap: 0.75rem; flex-wrap: wrap; padding: 0.45rem 0.6rem; cursor: pointer; list-style: none; align-items: center; border-radius: 0.4rem; transition: background 0.12s; }
.detail-event > summary:hover { background: var(--surface-2); }
.detail-event > summary::-webkit-details-marker { display: none; }
.detail-event > summary::before { content: "▸"; color: var(--text-4); transition: transform 0.15s; width: 0.8rem; flex: 0 0 auto; text-align: center; }
.detail-event[open] > summary::before { content: "▾"; }
.detail-event > summary .ts { color: var(--text-4); white-space: nowrap; flex: 0 0 auto; }
.detail-event > summary .source { color: var(--accent); font-weight: 600; }
.detail-event > summary .event { color: var(--accent-2); font-weight: 500; }
.detail-event > summary .tool { color: var(--text-3); }
.subagent-badge { font-size: 0.7rem; font-weight: 600; color: var(--accent-2); background: color-mix(in srgb, var(--accent-2) 15%, transparent); border: 1px solid color-mix(in srgb, var(--accent-2) 35%, transparent); padding: 0.1rem 0.45rem; border-radius: 0.25rem; white-space: nowrap; }
.detail-body { padding: 0.1rem 0.6rem 0.5rem 1.4rem; min-width: 0; }
.detail-event .detail-children { position: relative; margin-top: 0.25rem; padding-left: var(--timeline-indent); display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
.detail-json { position: relative; margin-top: 0.4rem; }
.detail-json .json-toggle > summary { display: inline-flex; align-items: center; gap: 0.3rem; list-style: none; cursor: pointer; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.04em; color: var(--text-3); padding: 0.25rem 0.5rem; border-radius: 0.3rem; transition: background 0.12s, color 0.12s; }
.detail-json .json-toggle > summary:hover { background: var(--surface-2); color: var(--text); }
.detail-json .json-toggle > summary::-webkit-details-marker { display: none; }
.detail-json .json-toggle > summary::before { content: "▸"; font-size: 0.6rem; }
.detail-json .json-toggle[open] > summary::before { content: "▾"; }
.json-copy { position: absolute; top: 0.2rem; right: 0.2rem; background: none; border: none; color: var(--text-3); padding: 0.3rem; display: inline-flex; align-items: center; justify-content: center; border-radius: 0.3rem; }
.json-copy:hover { color: var(--text); background: var(--surface-2); }
.detail-event pre { white-space: pre-wrap; word-break: break-word; overflow-x: auto; max-width: 100%; background: var(--bg); border: 1px solid var(--border-2); border-radius: 0.4rem; padding: 0.6rem; margin: 0.3rem 0 0; font-size: 0.75rem; line-height: 1.4; color: var(--text-2); }
.detail-attrs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.35rem 0.75rem; padding: 0.5rem 0.6rem; background: var(--surface-2); border-radius: 0.4rem; font-size: 0.78rem; }
.detail-attrs > div { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
.detail-attrs > div span:first-child { color: var(--text-4); font-size: 0.7rem; text-transform: capitalize; }
.detail-attrs > div span:last-child { color: var(--text); font-weight: 500; overflow: hidden; text-overflow: ellipsis; word-break: break-all; }
.session-json { display: none; }
.pager { display: flex; justify-content: center; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; border-top: 1px solid var(--border); background: var(--surface-2); flex: 0 0 auto; }
.pager a, .pager button { background: var(--surface-4); color: var(--text); border: 1px solid var(--border); border-radius: 0.35rem; padding: 0.4rem 0.75rem; font-size: 0.85rem; text-decoration: none; }
.pager a:hover { background: var(--surface-5); }
.pager button:disabled { opacity: 0.45; cursor: not-allowed; }
.pager-info { color: var(--text-3); font-size: 0.85rem; }
.metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
.metric-card { position: relative; overflow: hidden; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.85rem 1rem; display: flex; flex-direction: column; justify-content: center; }
.metric-sessions .metric-icon { color: var(--accent); }
.metric-events .metric-icon { color: var(--accent-2); }
.metric-duration .metric-icon { color: var(--warning); }
.metric-success .metric-icon { color: var(--success); }
.metric-icon { position: absolute; top: 0.75rem; right: 0.75rem; opacity: 0.8; }
.metric-label { font-size: 0.72rem; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
.metric-value { font-size: 1.75rem; font-weight: 800; color: var(--text); margin-top: 0.25rem; letter-spacing: -0.02em; }
.empty { color: var(--text-4); text-align: center; padding: 2rem; }
@media (max-width: 960px) { .dashboard-layout { grid-template-columns: 1fr; grid-template-rows: auto 1fr; } .session-sidebar { max-height: 24rem; } .session-list { max-height: 16rem; } .main-content { overflow-y: auto; grid-template-rows: auto auto; } .top-charts { grid-template-columns: 1fr; } .chart-panel { min-height: 16rem; } .metric-grid { grid-template-columns: repeat(2, 1fr); } .main-metrics .metric-grid { grid-template-columns: repeat(2, 1fr); } .detail-attrs { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { .app { padding: 0.75rem; } .app-header { flex-direction: column; align-items: flex-start; } .header-controls, .filter-bar { width: 100%; } input.search { min-width: 0; width: 100%; } .search-wrap { width: 100%; } .metric-grid { grid-template-columns: 1fr; } .main-metrics .metric-grid { grid-template-columns: 1fr; } .detail-attrs { grid-template-columns: 1fr; } .detail-toolbar input[type="search"] { min-width: 0; width: 100%; } }
`;
