import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import http from "node:http";
import process from "node:process";
import { mkdtempSync, rmSync } from "node:fs";
import { EventEmitter } from "node:events";
import { execFile } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import { initDb, insertEvent } from "../src/shared/db.js";
import { dashboardHtml } from "../src/UI/dashboard/page.js";
import {
	parseQuery,
	renderSessionsContent,
	renderSessionDetailFragment,
} from "../src/UI/dashboard/fragments.js";
import {
	escapeHtml,
	escapeAttr,
	formatDuration,
	formatTimestamp,
	truncate,
} from "../src/UI/dashboard/utils.js";
import { renderHeader } from "../src/UI/dashboard/components/Header.js";
import { renderFilters } from "../src/UI/dashboard/components/Filters.js";
import { renderMetricCards } from "../src/UI/dashboard/components/MetricCards.js";
import { renderEventFrequencyChart } from "../src/UI/dashboard/components/ChartEvents.js";
import { renderToolChart } from "../src/UI/dashboard/components/ChartTools.js";
import { renderSessionsTable } from "../src/UI/dashboard/components/SessionsTable.js";
import { renderSessionDetail } from "../src/UI/dashboard/components/DetailPanel.js";
import type { EventInsert, Session } from "../src/shared/types.js";

vi.mock("node:http", () => ({ default: { createServer: vi.fn() } }));
vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

type ListenResult = { type: "error"; code: string } | { type: "listening" };

type FakeServer = http.Server & {
	requestListener?: http.RequestListener;
};

let listenResponses: Map<number, ListenResult> | undefined;

function createFakeServer(requestListener: http.RequestListener): FakeServer {
	const emitter = new EventEmitter();
	const server: Partial<FakeServer> = {
		listening: false,
		port: 0,
		requestListener,
		once: (event: string, cb: (...args: unknown[]) => void) => {
			emitter.once(event, cb);
			return server as FakeServer;
		},
		off: (event: string, cb: (...args: unknown[]) => void) => {
			emitter.off(event, cb);
			return server as FakeServer;
		},
		listen: (port: number) => {
			server.port = port;
			const result = listenResponses?.get(port) ?? { type: "listening" };
			queueMicrotask(() => {
				if (result.type === "error") {
					const err = Object.assign(new Error(result.code), {
						code: result.code,
					}) as NodeJS.ErrnoException;
					emitter.emit("error", err);
				} else {
					server.listening = true;
					emitter.emit("listening");
				}
			});
			return server as FakeServer;
		},
		close: (cb?: () => void) => {
			server.listening = false;
			if (cb) cb();
			return server as FakeServer;
		},
		address: () => ({
			port: server.port,
			family: "IPv4",
			address: "127.0.0.1",
		}),
	};
	return server as FakeServer;
}

function eventInsert(partial: Partial<EventInsert> & { payload: string }): EventInsert {
	return {
		source: "cursor",
		client: "cursor",
		event: "preToolUse",
		...partial,
		payload: partial.payload,
	};
}

function createMockRes(): {
	headersSent: boolean;
	writableEnded: boolean;
	setTimeout: ReturnType<typeof vi.fn>;
	writeHead: ReturnType<typeof vi.fn>;
	write: ReturnType<typeof vi.fn>;
	end: ReturnType<typeof vi.fn>;
	destroy: ReturnType<typeof vi.fn>;
} {
	const res: {
		headersSent: boolean;
		writableEnded: boolean;
		setTimeout: ReturnType<typeof vi.fn>;
		writeHead: ReturnType<typeof vi.fn>;
		write: ReturnType<typeof vi.fn>;
		end: ReturnType<typeof vi.fn>;
		destroy: ReturnType<typeof vi.fn>;
	} = {
		headersSent: false,
		writableEnded: false,
		setTimeout: vi.fn(),
		writeHead: vi.fn((_code: number) => {
			res.headersSent = true;
		}),
		write: vi.fn(),
		end: vi.fn(),
		destroy: vi.fn(),
	};
	return res;
}

function createMockReq(overrides: {
	method?: string;
	url?: string;
	headers?: Record<string, string | string[]>;
}): {
	method: string;
	url: string;
	headers: Record<string, string | string[]>;
	on: ReturnType<typeof vi.fn>;
} {
	let closeCb: (() => void) | undefined;
	return {
		method: overrides.method ?? "GET",
		url: overrides.url ?? "/",
		headers: overrides.headers ?? {},
		on: vi.fn((event: string, cb: () => void) => {
			if (event === "close") closeCb = cb;
			return {
				close: () => {
					if (closeCb) closeCb();
				},
			};
		}),
	};
}

async function closeServer(server: http.Server): Promise<void> {
	return new Promise((resolve) => {
		server.close(() => resolve());
	});
}

describe("dashboard", () => {
	let dashboard: typeof import("../src/UI/dashboard/index.js");
	let homeDir: string;
	let originalHome: string | undefined;

	beforeAll(async () => {
		vi.mocked(http.createServer).mockImplementation((requestListener: http.RequestListener) =>
			createFakeServer(requestListener),
		);
		dashboard = await import("../src/UI/dashboard/index.js");
	});

	beforeEach(() => {
		listenResponses = undefined;
		homeDir = mkdtempSync(path.join(tmpdir(), "happenin-dashboard-"));
		originalHome = process.env.HOME;
		process.env.HOME = homeDir;
		const d = initDb(":memory:");
		dashboard.setDb(d);
		vi.mocked(execFile).mockImplementation(
			(cmd: string, args: string[], cb?: (err: Error | null) => void) => {
				if (cb) cb(null);
			},
		);
	});

	afterEach(async () => {
		try {
			dashboard.db.close();
		} catch {}
		const server = dashboard.getDashboardServer();
		if (server) {
			await closeServer(server);
		}
		if (originalHome !== undefined) {
			process.env.HOME = originalHome;
		} else {
			delete process.env.HOME;
		}
		rmSync(homeDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it("serves the dashboard html", () => {
		insertEvent(dashboard.db, eventInsert({ payload: JSON.stringify({}) }));
		const req = createMockReq({ url: "/" });
		const res = createMockRes();
		dashboard.handleRequest(req, res as unknown as http.ServerResponse);
		expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "text/html; charset=utf-8" });
		const html = res.end.mock.calls[0]?.[0] as string;
		expect(html).toContain("Session Overview Analytics");
		expect(html).toContain("dashboard-content");
	});

	it("serves the sessions fragment", () => {
		for (let i = 0; i < 5; i++) {
			insertEvent(
				dashboard.db,
				eventInsert({ sessionId: `s-${i % 2}`, payload: JSON.stringify({ i }) }),
			);
		}
		const req = createMockReq({ url: "/fragments/sessions" });
		const res = createMockRes();
		dashboard.handleRequest(req, res as unknown as http.ServerResponse);
		expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "text/html; charset=utf-8" });
		const html = res.end.mock.calls[0]?.[0] as string;
		expect(html).toContain("metric-grid");
		expect(html).toContain("sessions-table");
	});

	it("falls back to the default time range for invalid range values", () => {
		insertEvent(dashboard.db, eventInsert({ payload: JSON.stringify({}) }));
		const req = createMockReq({ url: "/fragments/sessions?range=999d" });
		const res = createMockRes();
		dashboard.handleRequest(req, res as unknown as http.ServerResponse);
		expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "text/html; charset=utf-8" });
	});

	it("serves the session detail fragment", () => {
		insertEvent(dashboard.db, eventInsert({ sessionId: "s-1", payload: JSON.stringify({}) }));
		const req = createMockReq({ url: "/fragments/detail?session=s-1" });
		const res = createMockRes();
		dashboard.handleRequest(req, res as unknown as http.ServerResponse);
		expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "text/html; charset=utf-8" });
		const html = res.end.mock.calls[0]?.[0] as string;
		expect(html).toContain("Session Details - s-1");
	});

	it("serves events as json", () => {
		insertEvent(dashboard.db, eventInsert({ payload: JSON.stringify({ tool: "Shell" }) }));
		const req = createMockReq({ url: "/events" });
		const res = createMockRes();
		dashboard.handleRequest(req, res as unknown as http.ServerResponse);
		expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "application/json" });
		const json = JSON.parse(res.end.mock.calls[0]?.[0] as string);
		expect(json.length).toBe(1);
	});

	it("returns 404 for unknown paths and non-GET methods", () => {
		for (const { method, url } of [
			{ method: "GET", url: "/foo" },
			{ method: "POST", url: "/" },
		]) {
			const req = createMockReq({ method, url });
			const res = createMockRes();
			dashboard.handleRequest(req, res as unknown as http.ServerResponse);
			expect(res.writeHead).toHaveBeenCalledWith(404, { "Content-Type": "text/plain" });
			expect(res.end).toHaveBeenCalledWith("Not found");
		}
	});

	it("handles errors before headers are sent", () => {
		const db2 = initDb(":memory:");
		db2.close();
		dashboard.setDb(db2);

		const req = createMockReq({ url: "/fragments/sessions" });
		const res = createMockRes();
		dashboard.handleRequest(req, res as unknown as http.ServerResponse);
		expect(res.writeHead).toHaveBeenCalledWith(500, { "Content-Type": "text/plain" });
		expect(res.end).toHaveBeenCalledWith("Internal server error");
	});

	it("does not write a 500 when headers are already sent", () => {
		insertEvent(dashboard.db, eventInsert({ payload: JSON.stringify({}) }));
		const res = createMockRes();
		res.end = vi.fn(() => {
			throw new Error("end failed");
		});
		dashboard.handleRequest(createMockReq({ url: "/" }), res as unknown as http.ServerResponse);
		expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "text/html; charset=utf-8" });
		expect(res.end).toHaveBeenCalled();
		expect(res.destroy).toHaveBeenCalled();
	});

	it("does not destroy an already-ended response", () => {
		insertEvent(dashboard.db, eventInsert({ payload: JSON.stringify({}) }));
		const res = createMockRes();
		res.end = vi.fn(() => {
			res.writableEnded = true;
			throw new Error("end failed");
		});
		dashboard.handleRequest(createMockReq({ url: "/" }), res as unknown as http.ServerResponse);
		expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "text/html; charset=utf-8" });
		expect(res.destroy).not.toHaveBeenCalled();
	});

	it("sends an event stream and pings on new events", () => {
		insertEvent(dashboard.db, eventInsert({ payload: JSON.stringify({}) }));
		vi.useFakeTimers();

		const req = createMockReq({
			url: "/events/stream",
			headers: { "last-event-id": "0" },
		});
		const res = createMockRes();
		dashboard.handleRequest(req, res as unknown as http.ServerResponse);

		expect(res.writeHead).toHaveBeenCalledWith(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		});
		expect(res.write).toHaveBeenCalledWith("retry: 500\n\n");

		insertEvent(dashboard.db, eventInsert({ payload: JSON.stringify({}) }));
		vi.advanceTimersByTime(300);

		expect(res.write).toHaveBeenCalledWith("event: message\ndata: ping\n\n");

		const close = req.on.mock.calls.find(([event]) => event === "close")?.[1] as () => void;
		if (close) close();

		vi.useRealTimers();
	});

	it("sends an event stream directly with header variants", () => {
		insertEvent(dashboard.db, eventInsert({ payload: JSON.stringify({}) }));
		for (const header of ["5", ["5"], "not-a-number", "0", ""]) {
			const res = createMockRes();
			dashboard.sendEventsStream(
				createMockReq({
					url: "/events/stream",
					headers: { "last-event-id": header },
				}) as unknown as http.IncomingMessage,
				res as unknown as http.ServerResponse,
			);
			expect(res.write).toHaveBeenCalledWith("retry: 500\n\n");
		}
	});

	it("stops the event stream on errors", () => {
		insertEvent(dashboard.db, eventInsert({ payload: JSON.stringify({}) }));
		vi.useFakeTimers();

		const res = createMockRes();
		dashboard.sendEventsStream(
			createMockReq({ url: "/events/stream" }) as unknown as http.IncomingMessage,
			res as unknown as http.ServerResponse,
		);

		dashboard.db.close();
		vi.advanceTimersByTime(300);

		expect(res.write).toHaveBeenCalledWith("retry: 500\n\n");
		vi.useRealTimers();
	});

	it("uses last event id as zero when the database is empty", () => {
		const db = initDb(":memory:");
		dashboard.setDb(db);
		vi.useFakeTimers();

		const res = createMockRes();
		dashboard.sendEventsStream(
			createMockReq({ url: "/events/stream" }) as unknown as http.IncomingMessage,
			res as unknown as http.ServerResponse,
		);
		vi.advanceTimersByTime(300);

		expect(res.write).toHaveBeenCalledWith("retry: 500\n\n");
		expect(res.write).not.toHaveBeenCalledWith("event: message\ndata: ping\n\n");

		vi.useRealTimers();
	});

	it("handles requests with an undefined url", () => {
		insertEvent(dashboard.db, eventInsert({ payload: JSON.stringify({}) }));
		const res = createMockRes();
		dashboard.handleRequest(
			{
				method: "GET",
				url: undefined,
				headers: {},
				on: vi.fn(),
			} as unknown as http.IncomingMessage,
			res as unknown as http.ServerResponse,
		);
		expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "text/html; charset=utf-8" });
	});

	it("starts the server and routes requests through the listener", async () => {
		listenResponses = new Map([[1234, { type: "listening" }]]);
		await dashboard.startServer(1234, false);
		const server = dashboard.getDashboardServer() as FakeServer;
		expect(server.listening).toBe(true);

		const req = createMockReq({ url: "/" });
		const res = createMockRes();
		server.requestListener!(
			req as unknown as http.IncomingMessage,
			res as unknown as http.ServerResponse,
		);
		expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "text/html; charset=utf-8" });

		await closeServer(server);
	});

	it("retries on EADDRINUSE", async () => {
		listenResponses = new Map([
			[1234, { type: "error", code: "EADDRINUSE" }],
			[1235, { type: "listening" }],
		]);
		await dashboard.startServer(1234, false);
		const server = dashboard.getDashboardServer();
		expect(server?.address()).toEqual({ port: 1235, family: "IPv4", address: "127.0.0.1" });
	});

	it("rejects on a non-EADDRINUSE error", async () => {
		listenResponses = new Map([[65535, { type: "error", code: "EACCES" }]]);
		await expect(dashboard.startServer(65535, false)).rejects.toThrow("EACCES");
	});

	it("opens the browser on darwin and reports open failures", async () => {
		const originalPlatform = process.platform;
		Object.defineProperty(process, "platform", { value: "darwin", configurable: true });

		const openSpy = vi.fn((cmd: string, args: string[], cb?: (err: Error | null) => void) => {
			if (cb) cb(new Error("open failed"));
		});
		vi.mocked(execFile).mockImplementation(openSpy as any);

		listenResponses = new Map([[1234, { type: "listening" }]]);
		await dashboard.startServer(1234, true);
		const server = dashboard.getDashboardServer();

		expect(openSpy).toHaveBeenCalledWith(
			"open",
			[expect.stringContaining(`:${1234}`)],
			expect.any(Function),
		);
		if (server) await closeServer(server);

		Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
	});

	it("runs the dashboard with --no-open and a custom port", async () => {
		process.env.HOME = process.env.HOME ?? "/tmp";
		listenResponses = new Map([[1234, { type: "listening" }]]);
		await dashboard.runDashboard(["--no-open", "--port", "1234"]);
		const server = dashboard.getDashboardServer();
		expect(server?.address()).toEqual({ port: 1234, family: "IPv4", address: "127.0.0.1" });
	});

	it("runs the dashboard with --port=<value> and default port", async () => {
		listenResponses = new Map([
			[1234, { type: "listening" }],
			[8765, { type: "listening" }],
		]);
		await dashboard.runDashboard(["--no-open", "--port=1234"]);
		const server = dashboard.getDashboardServer();
		expect(server?.listening).toBe(true);

		await dashboard.runDashboard(["--no-open"]);
		const defaultServer = dashboard.getDashboardServer();
		expect(defaultServer?.address()).toEqual({ port: 8765, family: "IPv4", address: "127.0.0.1" });
	});

	it("runs the dashboard with --silent and opens the browser by default", async () => {
		const originalPlatform = process.platform;
		Object.defineProperty(process, "platform", { value: "darwin", configurable: true });

		listenResponses = new Map([
			[1234, { type: "listening" }],
			[1235, { type: "listening" }],
		]);
		await dashboard.runDashboard(["--silent", "--port", "1234"]);
		const server = dashboard.getDashboardServer();
		expect(server?.listening).toBe(true);

		await dashboard.runDashboard(["--port", "1235"]);
		expect(execFile).toHaveBeenCalledWith(
			"open",
			[expect.stringContaining("http://localhost")],
			expect.any(Function),
		);

		Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
	});

	it("ignores unknown runDashboard arguments", async () => {
		listenResponses = new Map([[1234, { type: "listening" }]]);
		await dashboard.runDashboard(["--unknown", "--no-open", "--port", "1234"]);
		expect(dashboard.getDashboardServer()?.listening).toBe(true);
	});

	it("rejects invalid --port=65536", async () => {
		const exit = vi.spyOn(process, "exit").mockImplementation((code?: number) => {
			throw new Error(`exit:${code}`);
		});

		await expect(dashboard.runDashboard(["--port=65536"])).rejects.toThrow("exit:1");

		exit.mockRestore();
	});

	it("rejects invalid --port", async () => {
		const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
			throw new Error(`exit:${code}`);
		});

		await expect(dashboard.runDashboard(["--port", "abc"])).rejects.toThrow("exit:1");
		await expect(dashboard.runDashboard(["--port"])).rejects.toThrow("exit:1");
		await expect(dashboard.runDashboard(["--port=0"])).rejects.toThrow("exit:1");

		exit.mockRestore();
	});
});

describe("dashboard page and fragments", () => {
	it("renders the dashboard page", () => {
		const db = initDb(":memory:");
		insertEvent(db, eventInsert({ payload: JSON.stringify({}) }));
		const html = dashboardHtml(db, { range: "24h" });
		expect(html).toContain("Session Overview Analytics");
		expect(html).toContain("dashboard-content");
		expect(html).toContain("session-detail");
		expect(html).toContain("metric-grid");
		db.close();
	});

	it("parses all query parameters", () => {
		const url = new URL(
			"http://localhost/?q=test&range=7d&status=failed&source=cursor&tool=Shell&minDuration=1&maxDuration=10&session=s-1&since=5&event=preToolUse&limit=10&offset=5",
		);
		const query = parseQuery(url);
		expect(query.q).toBe("test");
		expect(query.range).toBe("7d");
		expect(query.status).toBe("failed");
		expect(query.source).toBe("cursor");
		expect(query.tool).toBe("Shell");
		expect(query.minDuration).toBe(1);
		expect(query.maxDuration).toBe(10);
		expect(query.sessionId).toBe("s-1");
		expect(query.since).toBe(5);
		expect(query.event).toBe("preToolUse");
		expect(query.limit).toBe(10);
		expect(query.offset).toBe(5);
	});

	it("renders sessions and events content", () => {
		const db = initDb(":memory:");
		insertEvent(db, eventInsert({ sessionId: "s-1", payload: JSON.stringify({}) }));
		const sessionsHtml = renderSessionsContent(db, {});
		expect(sessionsHtml).toContain("metric-grid");
		expect(sessionsHtml).toContain("sessions-table");

		const eventsHtml = renderSessionDetailFragment(db, { sessionId: "s-1" });
		expect(eventsHtml).toContain("Session Details - s-1");

		const emptyEvents = renderSessionDetailFragment(db, {});
		expect(emptyEvents).toContain("No events");

		const html30d = renderSessionsContent(db, { range: "30d" });
		expect(html30d).toContain("metric-grid");

		const html7d = renderSessionsContent(db, { range: "7d" });
		expect(html7d).toContain("metric-grid");

		const htmlAll = renderSessionsContent(db, { range: "all" });
		expect(htmlAll).toContain("metric-grid");
		expect(htmlAll).toContain("sessions-table");
		db.close();
	});

	it("fans out subagents in session details", () => {
		const db = initDb(":memory:");
		insertEvent(
			db,
			eventInsert({
				sessionId: "s-1",
				event: "subagentStart",
				subagentId: "sa-1",
				subagentType: "transcript",
				payload: JSON.stringify({}),
			}),
		);
		insertEvent(
			db,
			eventInsert({
				sessionId: "s-1",
				event: "preToolUse",
				subagentId: "sa-1",
				toolName: "Grep",
				payload: JSON.stringify({}),
			}),
		);
		insertEvent(
			db,
			eventInsert({
				sessionId: "s-1",
				event: "preToolUse",
				toolName: "Shell",
				filePath: "/some/path",
				payload: JSON.stringify({}),
			}),
		);
		insertEvent(
			db,
			eventInsert({
				sessionId: "s-1",
				event: "preToolUse",
				subagentId: "sa-2",
				toolName: "Read",
				payload: JSON.stringify({}),
			}),
		);
		insertEvent(
			db,
			eventInsert({
				sessionId: "s-1",
				event: "preToolUse",
				subagentId: "sa-2",
				toolName: "Write",
				payload: JSON.stringify({}),
			}),
		);
		const html = renderSessionDetailFragment(db, { sessionId: "s-1" });
		expect(html).toContain("detail-subagent");
		expect(html).toContain("transcript");
		expect(html).toContain("sa-1");
		expect(html).toContain("sa-2");
		expect(html).toContain("Grep");
		expect(html).toContain("Shell");
		expect(html).toContain("Read");
		expect(html).toContain("Write");
		expect(html).toContain("/some/path");
		db.close();
	});

	it("paginates the sessions table", () => {
		const db = initDb(":memory:");
		for (let i = 0; i < 12; i++) {
			insertEvent(
				db,
				eventInsert({
					sessionId: `s-${i}`,
					toolName: "Shell",
					payload: JSON.stringify({ note: "findme" }),
				}),
			);
		}
		const first = renderSessionsContent(db, {
			q: "findme",
			source: "cursor",
			event: "preToolUse",
			sessionId: "s-",
			since: 0,
			range: "24h",
			status: "active",
			tool: "Shell",
			minDuration: 0,
			maxDuration: 10,
			limit: 5,
			offset: 0,
		});
		expect(first).toContain('class="pager"');
		expect(first).toContain("Page 1 of 3");
		expect(first).toContain("Previous</button>");
		expect(first).toContain('offset=5"');
		expect(first).toContain("limit=5");
		expect(first).toContain("q=findme");
		expect(first).toContain("status=active");

		const middle = renderSessionsContent(db, {
			limit: 5,
			offset: 5,
		});
		expect(middle).toContain("Page 2 of 3");
		expect(middle).toContain('offset=0"');
		expect(middle).toContain('offset=10"');

		const last = renderSessionsContent(db, {
			limit: 5,
			offset: 10,
		});
		expect(last).toContain("Page 3 of 3");
		expect(last).toContain("Next</button>");

		const noPager = renderSessionsContent(db, { limit: 100 });
		expect(noPager).not.toContain('class="pager"');
		db.close();
	});

	it("parses invalid and default query parameters", () => {
		const url = new URL(
			"http://localhost/?range=30d&status=bad&since=abc&minDuration=xyz&maxDuration=&limit=abc&offset=-1",
		);
		const query = parseQuery(url);
		expect(query.range).toBe("30d");
		expect(query.status).toBeUndefined();
		expect(query.since).toBeUndefined();
		expect(query.minDuration).toBeUndefined();
		expect(query.maxDuration).toBeUndefined();
		expect(query.limit).toBeUndefined();
		expect(query.offset).toBeUndefined();
	});
});

describe("dashboard components", () => {
	it("escapes and formats helpers", () => {
		expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
		expect(escapeAttr('a"b')).toBe("a&quot;b");
		expect(truncate("hello world", 8)).toBe("hello w…");
		expect(formatDuration(125000)).toBe("2m 5s");
		expect(formatDuration(5000)).toBe("5s");
		expect(formatTimestamp("invalid")).toBe("-");
		expect(formatTimestamp(null)).toBe("-");
		const ts = new Date("2024-09-01T12:00:00.000Z").toISOString();
		expect(formatTimestamp(ts)).toContain("2024");
	});

	it("renders header with selected values", () => {
		const html = renderHeader({ q: "test", range: "7d" });
		expect(html).toContain("happenin");
		expect(html).toContain("Session Overview Analytics");
		expect(html).toContain('value="test"');
		expect(html).toContain('value="7d" selected');
	});

	it("renders filters with selected values", () => {
		const html = renderFilters(
			{ sources: ["claude", "cursor"], events: [], tools: ["Shell", "Edit"] },
			{ status: "active", source: "cursor", tool: "Shell", minDuration: 5, maxDuration: 30 },
		);
		expect(html).toContain('name="status"');
		expect(html).toContain('name="source"');
		expect(html).toContain('name="tool"');
		expect(html).toContain('value="5"');
		expect(html).toContain('value="30"');
	});

	it("renders filters with no selection", () => {
		const html = renderFilters({ sources: [], events: [], tools: [] }, {});
		expect(html).toContain('<option value="" selected>all</option>');
	});

	it("renders metric cards", () => {
		const full = renderMetricCards({
			totalSessions: 10,
			totalEvents: 100,
			averageDurationMs: 125000,
			successRate: 85.5,
		});
		expect(full).toContain("10");
		expect(full).toContain("100");
		expect(full).toContain("2m 5s");
		expect(full).toContain("86%");

		const empty = renderMetricCards({
			totalSessions: 0,
			totalEvents: 0,
			averageDurationMs: 0,
			successRate: 0,
		});
		expect(empty).toContain("-");
	});

	it("renders event frequency chart", () => {
		const empty = renderEventFrequencyChart([], "hour");
		expect(empty).toContain("No data");

		const hourly = renderEventFrequencyChart(
			[
				{ bucket: "2024-09-01T10:00:00.000Z", count: 1 },
				{ bucket: "2024-09-01T11:00:00.000Z", count: 3 },
			],
			"hour",
		);
		expect(hourly).toContain("svg");
		expect(hourly).toContain("polyline");
		expect(hourly).toContain("10:00");

		const daily = renderEventFrequencyChart(
			Array.from({ length: 30 }, (_, i) => ({
				bucket: `2024-08-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
				count: i,
			})),
			"day",
		);
		expect(daily).toContain("svg");
		expect(daily).toContain("08-01");
	});

	it("renders tool chart", () => {
		const empty = renderToolChart([]);
		expect(empty).toContain("No data");

		const single = renderToolChart([{ tool: "Shell", count: 5 }]);
		expect(single).toContain("Shell");
		expect(single).toContain('style="width: 100%"');

		const multi = renderToolChart([
			{ tool: "Shell", count: 10 },
			{ tool: "Edit", count: 5 },
			{ tool: "a".repeat(30), count: 1 },
		]);
		expect(multi).toContain("Edit");
		expect(multi).toContain('style="width: 50%"');
		expect(multi).toContain("title=");
	});

	it("renders sessions table", () => {
		const now = Date.now();
		const base: Session = {
			sessionId: "s-1",
			firstAt: new Date(now - 10000).toISOString(),
			lastAt: new Date(now).toISOString(),
			firstReceivedAt: now - 10000,
			lastReceivedAt: now,
			durationMs: 10000,
			eventCount: 2,
			projectPath: null,
			projectPaths: [],
			tools: ["Shell"],
			failureCount: 0,
		};
		const completed: Session = {
			...base,
			lastAt: new Date(now - 10 * 60 * 1000).toISOString(),
			lastReceivedAt: now - 10 * 60 * 1000,
		};
		const failed: Session = { ...base, failureCount: 1 };

		const activeHtml = renderSessionsTable([base], now);
		expect(activeHtml).toContain("s-1");
		expect(activeHtml).toContain("status-active");
		expect(activeHtml).toContain('hx-get="/fragments/detail?session=s-1"');

		const completedHtml = renderSessionsTable([completed], now);
		expect(completedHtml).toContain("status-completed");

		const failedHtml = renderSessionsTable([failed], now);
		expect(failedHtml).toContain("status-failed");

		const empty = renderSessionsTable([]);
		expect(empty).toContain("No sessions found");

		const special: Session = { ...base, sessionId: "a&b?c#d" };
		const specialHtml = renderSessionsTable([special], now);
		expect(specialHtml).toContain('hx-get="/fragments/detail?session=a%26b%3Fc%23d"');
		expect(specialHtml).toContain('title="a&amp;b?c#d"');

		const withQuery = renderSessionsTable([base], now, "s-1", {
			source: "cursor",
			event: "preToolUse",
			q: "needle",
			range: "7d",
			status: "active",
			tool: "Shell",
			minDuration: 1,
			maxDuration: 5,
			limit: 25,
			offset: 10,
		});
		expect(withQuery).toContain(
			'hx-get="/fragments/detail?session=s-1&amp;source=cursor&amp;event=preToolUse&amp;q=needle&amp;range=7d&amp;status=active&amp;tool=Shell&amp;minDuration=1&amp;maxDuration=5&amp;limit=25&amp;offset=10"',
		);

		const noSession: Session = { ...base, sessionId: null };
		const noSessionHtml = renderSessionsTable([noSession], now);
		expect(noSessionHtml).toContain("session-item-static");
		expect(noSessionHtml).not.toContain("hx-get=");
	});

	it("renders session detail", () => {
		const empty = renderSessionDetail(null, []);
		expect(empty).toContain("No events");

		const emptyWithSession = renderSessionDetail("s-1", []);
		expect(emptyWithSession).toContain("No events");

		const nullWithEvents = renderSessionDetail(undefined, [
			{
				id: 1,
				source: "cursor",
				client: "cursor",
				event: "preToolUse",
				sessionId: "s-1",
				happenedAt: new Date().toISOString(),
				receivedAt: Date.now(),
				projectPath: null,
				filePath: null,
				toolName: "Shell",
				payload: JSON.stringify({}),
				sourcePath: null,
				subagentId: null,
				subagentType: null,
				transcriptPath: null,
			},
		]);
		expect(nullWithEvents).toContain("No events");

		const detail = renderSessionDetail("s-1", [
			{
				id: 1,
				source: "cursor",
				client: "cursor",
				event: "preToolUse",
				sessionId: "s-1",
				happenedAt: new Date().toISOString(),
				receivedAt: Date.now(),
				projectPath: null,
				filePath: null,
				toolName: "Shell",
				payload: JSON.stringify({}),
				sourcePath: null,
				subagentId: null,
				subagentType: null,
				transcriptPath: null,
			},
		]);
		expect(detail).toContain("Session Details - s-1");
		expect(detail).toContain("Copy JSON");
		expect(detail).toContain("cursor");
		expect(detail).toContain("Shell");
		expect(detail).not.toContain("detail-truncated");

		const fromReceived = renderSessionDetail("s-1", [
			{
				id: 2,
				source: undefined,
				client: undefined,
				event: undefined,
				sessionId: "s-1",
				happenedAt: undefined,
				receivedAt: Date.now(),
				projectPath: undefined,
				filePath: undefined,
				toolName: undefined,
				payload: JSON.stringify({}),
				sourcePath: undefined,
				subagentId: undefined,
				subagentType: undefined,
				transcriptPath: undefined,
			},
		]);
		expect(fromReceived).toContain("Session Details - s-1");

		const truncated = renderSessionDetail(
			"s-1",
			[
				{
					id: 1,
					source: "cursor",
					client: "cursor",
					event: "preToolUse",
					sessionId: "s-1",
					happenedAt: new Date().toISOString(),
					receivedAt: Date.now(),
					projectPath: null,
					filePath: null,
					toolName: "Shell",
					payload: JSON.stringify({}),
					sourcePath: null,
					subagentId: null,
					subagentType: null,
					transcriptPath: null,
				},
			],
			5,
		);
		expect(truncated).toContain("detail-truncated");
		expect(truncated).toContain("most recent of 5 events");
	});

	it("renders sessions table from received_at", () => {
		const now = Date.now();
		const s: Session = {
			sessionId: "s-1",
			firstAt: null,
			lastAt: null,
			firstReceivedAt: now,
			lastReceivedAt: now,
			durationMs: 0,
			eventCount: 1,
			projectPath: null,
			projectPaths: [],
			tools: [],
			failureCount: 0,
		};
		const html = renderSessionsTable([s], now);
		expect(html).toContain("s-1");
		expect(html).toContain("status-active");
	});

	it("renders session tree with subagents", () => {
		const now = Date.now();
		const base: Session = {
			sessionId: "s-1",
			firstAt: new Date(now - 60_000).toISOString(),
			lastAt: new Date(now).toISOString(),
			firstReceivedAt: now - 60_000,
			lastReceivedAt: now,
			durationMs: 60_000,
			eventCount: 3,
			projectPath: "/p",
			projectPaths: ["/p"],
			tools: ["Shell"],
			failureCount: 0,
			children: [
				{
					sessionId: "s-1",
					subagentId: "sub-1",
					subagentType: "shell",
					firstAt: new Date(now - 30_000).toISOString(),
					lastAt: new Date(now - 10_000).toISOString(),
					firstReceivedAt: now - 30_000,
					lastReceivedAt: now - 10_000,
					durationMs: 20_000,
					eventCount: 2,
					projectPath: "/p",
					projectPaths: ["/p"],
					tools: ["Shell"],
					failureCount: 0,
				},
				{
					sessionId: "s-1",
					subagentId: "sub-2",
					subagentType: null,
					firstAt: null,
					lastAt: null,
					firstReceivedAt: now - 5_000,
					lastReceivedAt: now - 2_000,
					durationMs: 3_000,
					eventCount: 1,
					projectPath: null,
					projectPaths: [],
					tools: [],
					failureCount: 0,
				},
				{
					sessionId: "s-1",
					subagentId: null,
					subagentType: null,
					firstAt: null,
					lastAt: null,
					firstReceivedAt: now,
					lastReceivedAt: now,
					durationMs: 0,
					eventCount: 1,
					projectPath: null,
					projectPaths: [],
					tools: [],
					failureCount: 0,
				},
			],
		};

		const html = renderSessionsTable([base], now, "sub-1");
		expect(html).toContain("session-parent");
		expect(html).toContain("session-toggle");
		expect(html).toContain("session-children");
		expect(html).toContain("sub-1");
		expect(html).toContain("sub-2");
		expect(html).toContain("session-subagent");
		expect(html).toContain("subagent-type-badge");
		expect(html).toContain("active");
		expect(html).toContain("no subagent");
	});

	it("renders event frequency chart with zero counts and many buckets", () => {
		const empty = renderEventFrequencyChart(
			[
				{ bucket: "2024-09-01T00:00:00.000Z", count: 0 },
				{ bucket: "2024-09-02T00:00:00.000Z", count: 0 },
			],
			"day",
		);
		expect(empty).toContain("svg");

		const single = renderEventFrequencyChart(
			[{ bucket: "2024-09-01T10:00:00.000Z", count: 1 }],
			"hour",
		);
		expect(single).toContain("svg");
		expect(single).toContain("10:00");

		const hourly = renderEventFrequencyChart(
			Array.from({ length: 24 }, (_, i) => ({
				bucket: `2024-09-01T${String(i).padStart(2, "0")}:00:00.000Z`,
				count: i === 12 ? 5 : 0,
			})),
			"hour",
		);
		expect(hourly).toContain("polyline");
		expect(hourly).toContain("12:00");
	});

	it("renders tool chart with zero counts", () => {
		const html = renderToolChart([
			{ tool: "Shell", count: 0 },
			{ tool: "Edit", count: 0 },
		]);
		expect(html).toContain("Shell");
		expect(html).toContain('style="width: 0%"');
	});
});
