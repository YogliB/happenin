import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import http from "node:http";
import process from "node:process";
import { mkdtempSync, rmSync } from "node:fs";
import { EventEmitter } from "node:events";
import { execFile } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import * as dbModule from "../src/db.js";
import { initDb, insertEvent, getEvents } from "../src/db.js";
import type { EventInsert, EventRow } from "../src/types.js";

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
		payload: partial.payload,
		...partial,
	};
}

function createMockRes(): {
	headersSent: boolean;
	setTimeout: ReturnType<typeof vi.fn>;
	writeHead: ReturnType<typeof vi.fn>;
	write: ReturnType<typeof vi.fn>;
	end: ReturnType<typeof vi.fn>;
} {
	const res: {
		headersSent: boolean;
		setTimeout: ReturnType<typeof vi.fn>;
		writeHead: ReturnType<typeof vi.fn>;
		write: ReturnType<typeof vi.fn>;
		end: ReturnType<typeof vi.fn>;
	} = {
		headersSent: false,
		setTimeout: vi.fn(),
		writeHead: vi.fn((_code: number) => {
			res.headersSent = true;
		}),
		write: vi.fn(),
		end: vi.fn(),
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
	let dashboard: typeof import("../src/dashboard.js");
	let homeDir: string;
	let originalHome: string | undefined;

	beforeAll(async () => {
		vi.mocked(http.createServer).mockImplementation((requestListener: http.RequestListener) =>
			createFakeServer(requestListener),
		);
		dashboard = await import("../src/dashboard.js");
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
		expect(res.end).toHaveBeenCalledWith(expect.stringContaining("happenin"));
	});

	it("serves the events fragment with paging", () => {
		for (let i = 0; i < 60; i++) {
			insertEvent(
				dashboard.db,
				eventInsert({ sessionId: `s-${i % 3}`, payload: JSON.stringify({ i }) }),
			);
		}
		const req = createMockReq({ url: "/fragments/events?page=2" });
		const res = createMockRes();
		dashboard.handleRequest(req, res as unknown as http.ServerResponse);
		expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "text/html; charset=utf-8" });
		const html = res.end.mock.calls[0]?.[0] as string;
		expect(html).toContain("feed-pager");
		expect(html).toContain('page-number"');
		expect(html).toContain(">2<");
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

		const req = createMockReq({ url: "/fragments/events" });
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
		for (const header of ["5", ["5"], "not-a-number"]) {
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

	it("covers render event row and session group branches", () => {
		insertEvent(dashboard.db, {
			source: "cursor",
			client: "cursor",
			event: "preToolUse",
			sessionId: "s-1",
			happenedAt: null as unknown as undefined,
			projectPath: "/project",
			filePath: "/file.txt",
			toolName: "Shell",
			subagentId: "sub-1",
			subagentType: "a".repeat(40),
			transcriptPath: "/transcript.jsonl",
			payload: JSON.stringify({}),
		});
		insertEvent(dashboard.db, {
			source: "cursor",
			client: "cursor",
			event: "sessionStart",
			sessionId: undefined as unknown as string,
			payload: JSON.stringify({}),
		});

		const [withMeta] = getEvents(dashboard.db, { event: "preToolUse", limit: 10 });
		const [noSession] = getEvents(dashboard.db, { event: "sessionStart", limit: 10 });
		const rowHtml = dashboard.renderEventRow(withMeta);
		expect(rowHtml).toContain("Shell");
		expect(rowHtml).toContain("/file.txt");
		expect(rowHtml).toContain("sub-1");
		expect(rowHtml).toContain("subagent");
		expect(rowHtml).toContain("transcript");

		const groupHtml = dashboard.renderSessionGroup(noSession.sessionId, [noSession]);
		expect(groupHtml).toContain("no session");

		const group = dashboard.groupEventsBySession([withMeta, noSession]);
		expect(group.length).toBe(2);
	});

	it("renders the feed fragment with all query filters and pager branches", () => {
		for (let i = 0; i < 60; i++) {
			insertEvent(
				dashboard.db,
				eventInsert({ sessionId: `s-${i % 3}`, payload: JSON.stringify({ i }) }),
			);
		}

		for (const url of [
			"/fragments/events?source=cursor&event=preToolUse&session=s-1&q=0&since=0&page=2",
			"/fragments/events?page=1",
			"/fragments/events?page=0",
			"/fragments/events?page=not-a-number&since=not-a-number",
			"/fragments/events?since=5",
		]) {
			const req = createMockReq({ url });
			const res = createMockRes();
			dashboard.handleRequest(req, res as unknown as http.ServerResponse);
			expect(res.writeHead).toHaveBeenCalledWith(200, {
				"Content-Type": "text/html; charset=utf-8",
			});
		}
	});

	it("returns an empty fragment when no events match", () => {
		const req = createMockReq({ url: "/fragments/events" });
		const res = createMockRes();
		dashboard.handleRequest(req, res as unknown as http.ServerResponse);
		const html = res.end.mock.calls[0]?.[0] as string;
		expect(html).toContain("No events found");
	});

	it("sends a no-op stream ping when no new events arrive", () => {
		insertEvent(dashboard.db, eventInsert({ payload: JSON.stringify({}) }));
		vi.useFakeTimers();

		const res = createMockRes();
		dashboard.sendEventsStream(
			createMockReq({ url: "/events/stream" }) as unknown as http.IncomingMessage,
			res as unknown as http.ServerResponse,
		);

		vi.advanceTimersByTime(300);

		expect(res.write).toHaveBeenCalledWith("retry: 500\n\n");
		expect(res.write).toHaveBeenCalledTimes(1);
		vi.useRealTimers();
	});

	it("handles undefined request url and missing event fields", () => {
		insertEvent(dashboard.db, eventInsert({ payload: JSON.stringify({}) }));

		const req = createMockReq({ url: undefined });
		(req as { url: undefined }).url = undefined;
		const res = createMockRes();
		dashboard.handleRequest(
			req as unknown as http.IncomingMessage,
			res as unknown as http.ServerResponse,
		);
		expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "text/html; charset=utf-8" });

		const fakeRow = {
			id: 1,
			source: undefined as unknown as string,
			client: "cursor",
			event: undefined as unknown as string,
			sessionId: null,
			happenedAt: null,
			receivedAt: undefined as unknown as number,
			projectPath: null,
			filePath: null,
			toolName: null,
			sourcePath: null,
			subagentId: null,
			subagentType: null,
			transcriptPath: null,
			payload: {},
		};
		const html = dashboard.renderEventRow(fakeRow as EventRow);
		expect(html).toContain('<span class="source"></span>');
		expect(html).toContain('<span class="event"></span>');
	});

	it("falls back to 0 when lastEventId is missing in the stream", () => {
		const spy = vi
			.spyOn(dbModule, "getLastEventId")
			.mockReturnValue(undefined as unknown as number);
		const res = createMockRes();
		dashboard.sendEventsStream(
			createMockReq({ url: "/events/stream" }) as unknown as http.IncomingMessage,
			res as unknown as http.ServerResponse,
		);
		expect(res.write).toHaveBeenCalledWith("retry: 500\n\n");
		spy.mockRestore();
	});

	it("ignores unknown runDashboard arguments", async () => {
		listenResponses = new Map([[1234, { type: "listening" }]]);
		await dashboard.runDashboard(["--unknown", "--no-open", "--port", "1234"]);
		expect(dashboard.getDashboardServer()?.listening).toBe(true);
	});

	it("rejects invalid --port=65536", async () => {
		const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
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
