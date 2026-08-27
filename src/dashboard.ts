import http from "node:http";
import { execFile } from "node:child_process";
import process from "node:process";
import { getDbPath, initDb, getEvents, getLastEventId } from "./db.js";
import type { EventRow, FilterOptions } from "./types.js";
import { runImport } from "./import.js";

type Db = ReturnType<typeof initDb>;

interface SseClient {
	res: http.ServerResponse;
	lastId: number;
	timer: NodeJS.Timeout;
}

let db: Db;
const clients = new Set<SseClient>();

function escapeHtml(raw: string): string {
	return raw
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function escapeAttr(raw: string): string {
	return raw
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function tryJsonParse(text: string): unknown {
	if (!text) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

function eventView(row: EventRow): Record<string, unknown> {
	return {
		id: row.id,
		source: row.source,
		client: row.client,
		event: row.event,
		sessionId: row.sessionId,
		happenedAt: row.happenedAt,
		receivedAt: row.receivedAt,
		projectPath: row.projectPath,
		filePath: row.filePath,
		toolName: row.toolName,
		sourcePath: row.sourcePath,
		payload: tryJsonParse(row.payload ?? "") ?? row.payload,
	};
}

export function renderEventRow(row: EventRow): string {
	const view = eventView(row);
	const xData = escapeAttr(JSON.stringify({ event: view }));
	const when = row.happenedAt
		? String(row.happenedAt)
		: new Date(Number(row.receivedAt ?? 0)).toISOString();
	const meta: string[] = [];
	if (row.sessionId) meta.push(`session:${escapeHtml(String(row.sessionId))}`);
	if (row.toolName) meta.push(`tool:${escapeHtml(String(row.toolName))}`);
	if (row.filePath) meta.push(`file:${escapeHtml(String(row.filePath))}`);
	return `<div class="event-row" x-data="${xData}" @click="detail = event"><span class="id">#${escapeHtml(String(row.id))}</span> <span class="source">${escapeHtml(String(row.source ?? ""))}</span> <span class="event">${escapeHtml(String(row.event ?? ""))}</span> <span class="meta">${meta.join(" ")}</span> <span class="when">${escapeHtml(when)}</span></div>`;
}

type QueryOptions = FilterOptions & { limit: number };

function parseQuery(url: URL): QueryOptions {
	const sinceRaw = url.searchParams.get("since");
	const source = url.searchParams.get("source") ?? undefined;
	const event = url.searchParams.get("event") ?? undefined;
	const session = url.searchParams.get("session") ?? undefined;
	const q = url.searchParams.get("q") ?? undefined;
	const limitRaw = url.searchParams.get("limit");

	let since: number | undefined;
	if (sinceRaw) {
		const n = parseInt(sinceRaw, 10);
		if (!Number.isNaN(n)) since = n;
	}

	let limit = 50;
	if (limitRaw) {
		const n = parseInt(limitRaw, 10);
		if (!Number.isNaN(n) && n > 0) limit = n;
	}

	return { since, source, event, sessionId: session, q, limit };
}

function sendDashboard(res: http.ServerResponse): void {
	res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
	res.end(dashboardHtml());
}

function sendEventsFragment(req: http.IncomingMessage, res: http.ServerResponse, url: URL): void {
	const options = parseQuery(url);
	const rows = getEvents(db, options);
	const html = rows.length
		? rows.map(renderEventRow).join("")
		: `<p class="empty">No events found.</p>`;
	res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
	res.end(html);
}

function sendEventsJson(req: http.IncomingMessage, res: http.ServerResponse, url: URL): void {
	const options = parseQuery(url);
	const rows = getEvents(db, options);
	res.writeHead(200, { "Content-Type": "application/json" });
	res.end(JSON.stringify(rows));
}

function sendEventsStream(req: http.IncomingMessage, res: http.ServerResponse): void {
	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
	});
	res.setTimeout(0);
	res.write("retry: 500\n\n");

	const header = req.headers["last-event-id"];
	const headerId = Array.isArray(header) ? header[0] : header;
	const parsedId = headerId ? parseInt(headerId, 10) : Number.NaN;
	const startId = Number.isNaN(parsedId) ? (getLastEventId(db) ?? 0) : parsedId;

	const client: SseClient = {
		res,
		lastId: startId,
		timer: null as unknown as NodeJS.Timeout,
	};

	client.timer = setInterval(() => {
		try {
			const rows = getEvents(db, { since: client.lastId, limit: 50 });
			for (const row of rows) {
				res.write(`event: message\ndata: ${renderEventRow(row)}\n\n`);
				client.lastId = row.id;
			}
		} catch (error) {
			console.error("SSE poll error:", error);
			clearInterval(client.timer);
			clients.delete(client);
		}
	}, 300);

	clients.add(client);

	req.on("close", () => {
		clearInterval(client.timer);
		clients.delete(client);
	});
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
	const url = new URL(req.url ?? "/", "http://localhost");
	try {
		if (req.method === "GET") {
			if (url.pathname === "/") {
				sendDashboard(res);
				return;
			}
			if (url.pathname === "/fragments/events") {
				sendEventsFragment(req, res, url);
				return;
			}
			if (url.pathname === "/events") {
				sendEventsJson(req, res, url);
				return;
			}
			if (url.pathname === "/events/stream") {
				sendEventsStream(req, res);
				return;
			}
		}
		res.writeHead(404, { "Content-Type": "text/plain" });
		res.end("Not found");
	} catch (error) {
		console.error("Dashboard request error:", error);
		if (!res.headersSent) {
			res.writeHead(500, { "Content-Type": "text/plain" });
			res.end("Internal server error");
		}
	}
}

export function dashboardHtml(): string {
	return `<!DOCTYPE html>
<html lang="en" hx-ext="sse">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>happenin</title>
<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0d0d0f; color: #e6e6e6; margin: 0; padding: 1rem; line-height: 1.4; }
h1 { margin: 0 0 0.75rem; font-size: 1.25rem; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 22rem; gap: 1rem; }
form { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; align-items: end; }
label { display: flex; flex-direction: column; font-size: 0.75rem; gap: 0.2rem; color: #9aa3b2; }
input, button { background: #14161b; color: #e6e6e6; border: 1px solid #2d3139; border-radius: 0.35rem; padding: 0.4rem 0.6rem; font-size: 0.85rem; }
button { cursor: pointer; background: #1c1f26; }
button:hover { background: #252830; }
#feed { background: #111216; border: 1px solid #23262d; border-radius: 0.5rem; min-height: 4rem; overflow: hidden; }
#feed-items { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.5rem; }
.event-row { display: flex; gap: 0.5rem; align-items: baseline; flex-wrap: wrap; padding: 0.5rem 0.6rem; border-radius: 0.35rem; background: #16181d; border: 1px solid #24282f; cursor: pointer; }
.event-row:hover { background: #1c1f26; }
.event-row .id { color: #6b7280; font-size: 0.7rem; min-width: 2.5rem; }
.event-row .source { color: #60a5fa; font-weight: 600; }
.event-row .event { color: #c084fc; }
.event-row .meta { color: #9ca3af; font-size: 0.75rem; }
.event-row .when { color: #6b7280; font-size: 0.7rem; margin-left: auto; }
.detail { background: #111216; border: 1px solid #23262d; border-radius: 0.5rem; padding: 0.75rem; position: sticky; top: 1rem; height: fit-content; }
.detail pre { white-space: pre-wrap; overflow-x: auto; background: #0d0d0f; padding: 0.75rem; border-radius: 0.35rem; border: 1px solid #23262d; font-size: 0.8rem; line-height: 1.3; }
.detail .actions { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
.empty { color: #6b7280; padding: 1rem; text-align: center; }
@media (max-width: 720px) { .layout { grid-template-columns: 1fr; } .detail { position: static; } }
</style>
<script src="https://unpkg.com/htmx.org@2.0.10/dist/htmx.min.js"></script>
<script src="https://unpkg.com/htmx-ext-sse@2.2.4/dist/sse.js"></script>
<script defer src="https://unpkg.com/alpinejs@3.14.8/dist/cdn.min.js"></script>
</head>
<body>
<h1>happenin</h1>
<form hx-get="/fragments/events" hx-target="#feed-items" hx-swap="innerHTML" hx-trigger="submit, change">
	<label>source <input type="text" name="source" placeholder="all"></label>
	<label>event <input type="text" name="event" placeholder="all"></label>
	<label>session <input type="text" name="session" placeholder="all"></label>
	<label>q <input type="text" name="q" placeholder="search"></label>
	<label>limit <input type="number" name="limit" value="50" min="1"></label>
	<button type="submit">Filter</button>
</form>
<div class="layout" x-data="{ detail: null }">
	<div id="feed">
		<div id="feed-items"
			 hx-get="/fragments/events?limit=50"
			 hx-trigger="load"
			 hx-swap="beforeend"
			 sse-connect="/events/stream"
			 sse-swap="message"></div>
	</div>
	<aside class="detail" x-show="detail">
		<div class="actions">
			<button @click="navigator.clipboard.writeText(JSON.stringify(detail, null, 2))">Copy JSON</button>
			<button @click="detail = null">Close</button>
		</div>
		<pre x-text="JSON.stringify(detail, null, 2)"></pre>
	</aside>
</div>
<script>
	function initFeedItems() {
		const el = document.getElementById('feed-items');
		if (el && window.Alpine) Alpine.initTree(el);
	}
	document.addEventListener('htmx:afterSwap', initFeedItems);
	document.addEventListener('alpine:initialized', initFeedItems);
</script>
</body>
</html>`;
}

async function startServer(port: number, open: boolean): Promise<void> {
	const server = http.createServer((req, res) => {
		void handleRequest(req, res);
	});
	await new Promise<void>((resolve, reject) => {
		const tryPort = (p: number) => {
			function onError(err: NodeJS.ErrnoException) {
				server.off("error", onError);
				server.off("listening", onListening);
				if (err.code === "EADDRINUSE" && p < 65535) {
					tryPort(p + 1);
				} else {
					reject(err);
				}
			}
			function onListening() {
				server.off("error", onError);
				const url = `http://localhost:${p}`;
				console.log(`Dashboard: ${url}`);
				if (open && process.platform === "darwin") {
					execFile("open", [url], (err) => {
						if (err) console.error("open failed:", err.message);
					});
				}
				resolve();
			}
			server.once("error", onError);
			server.once("listening", onListening);
			server.listen(p);
		};
		tryPort(port);
	});
}

export async function runDashboard(argv: string[]): Promise<void> {
	let port = 8765;
	let open = true;
	let nextIsPort = false;
	for (const arg of argv) {
		if (nextIsPort) {
			const n = parseInt(arg, 10);
			if (Number.isNaN(n) || n < 1 || n > 65535) {
				console.error("Invalid --port");
				process.exit(1);
			}
			port = n;
			nextIsPort = false;
			continue;
		}
		if (arg === "--port") {
			nextIsPort = true;
			continue;
		}
		if (arg.startsWith("--port=")) {
			const n = parseInt(arg.slice(7), 10);
			if (Number.isNaN(n) || n < 1 || n > 65535) {
				console.error("Invalid --port");
				process.exit(1);
			}
			port = n;
		} else if (arg === "--no-open") {
			open = false;
		}
	}
	if (nextIsPort) {
		console.error("Missing value for --port");
		process.exit(1);
	}

	await runImport();
	db = initDb(getDbPath());
	await startServer(port, open);
}
