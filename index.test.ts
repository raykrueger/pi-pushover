/**
 * Tests for the pi-pushover extension.
 *
 * Run with: npm test (or `node --test index.test.ts`)
 *
 * Strategy:
 * - PI_CODING_AGENT_DIR is pointed at a temp dir BEFORE importing index.ts,
 *   because CONFIG_PATH is resolved at module load time.
 * - globalThis.fetch is stubbed so no real Pushover calls are made.
 * - The default export is called with a mock ExtensionAPI that captures
 *   the registered tools; tests then call tool.execute() directly.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";

const AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-pushover-test-"));
const CONFIG_PATH = join(AGENT_DIR, "pushover.json");
process.env.PI_CODING_AGENT_DIR = AGENT_DIR;

type ToolResult = { content: Array<{ type: string; text: string }>; details: unknown };
type Tool = { name: string; execute: (id: string, params: any, signal: AbortSignal | undefined, onUpdate: () => void, ctx: unknown) => Promise<ToolResult> };

const tools: Record<string, Tool> = {};
const realFetch = globalThis.fetch;

/** Install a fetch stub; returns the list of calls made. */
function stubFetch(handler: (url: string, init: RequestInit | undefined) => Response): Array<{ url: string; init?: RequestInit }> {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return calls;
}

const jsonOk = (body: object = { status: 1 }) => new Response(JSON.stringify(body), { status: 200 });

function writeConfigFile(content: string, mode?: number) {
  writeFileSync(CONFIG_PATH, content, mode ? { mode } : undefined);
}

before(async () => {
  const mod = await import("./index.ts");
  const defaultExport = mod.default;
  defaultExport({ registerTool: (tool: Tool) => { tools[tool.name] = tool; } });
});

beforeEach(() => {
  if (existsSync(CONFIG_PATH)) rmSync(CONFIG_PATH);
});

after(() => {
  globalThis.fetch = realFetch;
  rmSync(AGENT_DIR, { recursive: true, force: true });
});

async function runNotify(message: string): Promise<string> {
  const res = await tools.pushover_notify.execute("call-1", { message }, new AbortController().signal, () => {}, undefined);
  return res.content[0].text;
}

async function runConfigure(token: string, user: string): Promise<string> {
  const res = await tools.pushover_configure.execute("call-2", { token, user }, new AbortController().signal, () => {}, undefined);
  return res.content[0].text;
}

// ---------- pushover_notify ----------

test("notify without config returns config error and makes no API call", async () => {
  const calls = stubFetch(() => jsonOk());
  const text = await runNotify("hello");
  assert.match(text, /not configured/);
  assert.match(text, /pushover_configure/);
  assert.equal(calls.length, 0);
});

test("notify with malformed config file is treated as not configured", async () => {
  writeConfigFile("this is not json");
  const calls = stubFetch(() => jsonOk());
  const text = await runNotify("hello");
  assert.match(text, /not configured/);
  assert.equal(calls.length, 0);
});

test("notify success posts credentials and message", async () => {
  writeConfigFile(JSON.stringify({ token: "tok", user: "usr" }));
  const calls = stubFetch(() => jsonOk());
  const text = await runNotify("✅ done");
  assert.match(text, /successfully/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.pushover.net/1/messages.json");
  assert.equal(calls[0].init?.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init?.body as string), { token: "tok", user: "usr", message: "✅ done" });
});

test("notify includes Pushover error message on JSON error response", async () => {
  writeConfigFile(JSON.stringify({ token: "bad", user: "usr" }));
  stubFetch(() => new Response(JSON.stringify({ status: 0, message: "invalid token" }), { status: 401 }));
  const text = await runNotify("hello");
  assert.match(text, /HTTP 401/);
  assert.match(text, /invalid token/);
});

test("notify falls back to status code on non-JSON error response", async () => {
  writeConfigFile(JSON.stringify({ token: "tok", user: "usr" }));
  stubFetch(() => new Response("boom", { status: 500 }));
  const text = await runNotify("hello");
  assert.match(text, /HTTP 500/);
  assert.doesNotMatch(text, /boom/);
});

// ---------- pushover_configure ----------

test("configure saves 0600 config and sends test push", async () => {
  const calls = stubFetch(() => jsonOk());
  const text = await runConfigure("tok", "usr");
  assert.match(text, /configured/);
  assert.match(text, /successfully/);

  assert.equal(statSync(CONFIG_PATH).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(CONFIG_PATH, "utf8")), { token: "tok", user: "usr" });

  // Test push went out with the new credentials
  const body = JSON.parse(calls[0].init?.body as string);
  assert.deepEqual(body, { token: "tok", user: "usr", message: "✅ Pushover configured" });
});

test("configure tightens permissions on pre-existing config file", async () => {
  writeConfigFile(JSON.stringify({ token: "old", user: "old" }), 0o644);
  stubFetch(() => jsonOk());
  await runConfigure("tok", "usr");
  assert.equal(statSync(CONFIG_PATH).mode & 0o777, 0o600);
});

test("configure with bad credentials reports failure but keeps saved config", async () => {
  stubFetch(() => new Response(JSON.stringify({ status: 0, message: "invalid user key" }), { status: 401 }));
  const text = await runConfigure("tok", "wrong");
  assert.match(text, /saved but test notification failed/);
  assert.match(text, /invalid user key/);
  assert.deepEqual(JSON.parse(readFileSync(CONFIG_PATH, "utf8")), { token: "tok", user: "wrong" });
});
