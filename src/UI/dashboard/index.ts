import http from "node:http";
import { execFile } from "node:child_process";
import process from "node:process";
import { getDbPath, initDb, getLastEventId } from "../../shared/db.js";
import { sendDashboard } from "./page.js";
import { sendSessionsFragment, sendSessionDetailFragment, sendEventsJson } from "./fragments.js";
import { runImport } from "../../cli/import.js";

type Db = ReturnType<typeof initDb>;

interface SseClient {
	res: http.ServerResponse;
	lastId: number;
	timer: NodeJS.Timeout;
}

export let db: Db;
export function setDb(database: Db): void {
	db = database;
}
let dashboardServer: http.Server | undefined;
export const getDashboardServer = (): http.Server | undefined => dashboardServer;
const clients = new Set<SseClient>();

export function sendEventsStream(req: http.IncomingMessage, res: http.ServerResponse): void {
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
	const startId = Number.isNaN(parsedId) ? getLastEventId(db) : parsedId;

	const client: SseClient = {
		res,
		lastId: startId,
		timer: null as unknown as NodeJS.Timeout,
	};

	client.timer = setInterval(() => {
		try {
			const lastId = getLastEventId(db);
			if (lastId > client.lastId) {
				res.write("event: message\ndata: ping\n\n");
				client.lastId = lastId;
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

export function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
	const url = new URL(req.url ?? "/", "http://localhost");
	try {
		if (req.method === "GET") {
			if (url.pathname === "/") {
				sendDashboard(req, res, url, db);
				return;
			}
			if (url.pathname === "/fragments/sessions") {
				sendSessionsFragment(req, res, url, db);
				return;
			}
			if (url.pathname === "/fragments/detail") {
				sendSessionDetailFragment(req, res, url, db);
				return;
			}
			if (url.pathname === "/events") {
				sendEventsJson(req, res, url, db);
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
		} else if (!res.writableEnded) {
			res.destroy?.();
		}
	}
}

export async function startServer(port: number, open: boolean, silent = false): Promise<void> {
	const server = http.createServer((req, res) => {
		void handleRequest(req, res);
	});
	dashboardServer = server;
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
				if (!silent) console.log(`Dashboard: ${url}`);
				if (open && process.platform === "darwin") {
					execFile("open", [url], (err) => {
						if (err) console.error("open failed:", err.message);
					});
				}
				resolve();
			}
			server.once("error", onError);
			server.once("listening", onListening);
			server.listen(p, "127.0.0.1");
		};
		tryPort(port);
	});
}

export async function runDashboard(argv: string[]): Promise<void> {
	let port = 8765;
	let open = true;
	let silent = false;
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
		} else if (arg === "--silent") {
			silent = true;
			open = false;
		}
	}
	if (nextIsPort) {
		console.error("Missing value for --port");
		process.exit(1);
	}

	await runImport();
	db = initDb(getDbPath());
	await startServer(port, open, silent);
}
