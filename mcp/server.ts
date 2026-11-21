#!/usr/bin/env node
/**
 * MCP server for SlopwareIdeasModeler.
 *
 * Agents talk to it over stdio. When the app is connected (Agent button in the menu bar), every tool call is
 * forwarded over a local WebSocket and runs in the editor, so the user sees changes live and can undo them.
 * Otherwise the tools work on a project held in memory and opened from / saved to .simp files on disk.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import jsdom from "jsdom";
import { WebSocketServer, type WebSocket } from "ws";
import { COMMANDS, CommandError, getCommand, type CommandDef } from "../src/agent/commands";
import { BRIDGE_PORT, PROTOCOL_VERSION, type AppMessage, type ServerMessage } from "../src/agent/protocol";
import { emptyProject } from "../src/model/factory";
import type { Project } from "../src/model/types";
import { STYLE_SETS } from "../src/render/style";

const VERSION = "0.1.0";
const APP_CALL_TIMEOUT_MS = 5 * 60_000;

// The .simp parser and writer use the browser XML DOM.
const { window } = new jsdom.JSDOM("");
Object.assign(globalThis, { DOMParser: window.DOMParser, XMLSerializer: window.XMLSerializer });

const log = (...args: unknown[]) => console.error("[slopware-mcp]", ...args);
const style = STYLE_SETS.find((s) => s.id === process.env.SLOPWARE_STYLE) ?? STYLE_SETS[0];
const workDir = process.env.SLOPWARE_WORKDIR ?? process.cwd();
const resolvePath = (p: string) => path.resolve(workDir, p);

// ---------- file backend ----------

const file: { project: Project; path: string | null; dirty: boolean } = { project: emptyProject(), path: null, dirty: false };

function runLocal(cmd: CommandDef, args: Record<string, unknown>): unknown {
  // Work on a copy so a failing command leaves the project untouched, like the app's undoable commit.
  const draft = structuredClone(file.project);
  const result = cmd.run({ project: draft, style }, args);
  if (cmd.mutates) {
    file.project = draft;
    file.dirty = true;
  }
  return result;
}

// ---------- app bridge ----------

const port = Number(process.env.SLOPWARE_MCP_PORT ?? BRIDGE_PORT);
const extraOrigins = (process.env.SLOPWARE_MCP_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  if (extraOrigins.includes("*") || extraOrigins.includes(origin)) return true;
  try {
    const u = new URL(origin);
    return ["localhost", "127.0.0.1", "[::1]", "tauri.localhost"].includes(u.hostname);
  } catch {
    return false;
  }
}

let app: WebSocket | null = null;
let appInfo: { fileName: string | null; projectName: string } | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

const send = (ws: WebSocket, msg: ServerMessage) => ws.send(JSON.stringify(msg));

function failPending(reason: string) {
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error(reason));
    pending.delete(id);
  }
}

let bridgeListening = false;
const wss = new WebSocketServer({ host: "127.0.0.1", port, verifyClient: ({ origin }: { origin?: string }) => originAllowed(origin) });
wss.on("listening", () => {
  bridgeListening = true;
  log(`app bridge listening on ws://127.0.0.1:${port}`);
});
wss.on("error", (e) => log(`app bridge unavailable (${e.message}); only file mode works`));
wss.on("connection", (ws, req) => {
  if (app) {
    send(app, { type: "replaced" });
    app.close();
  }
  app = ws;
  appInfo = null;
  log(`app connected from ${req.headers.origin}`);
  send(ws, { type: "welcome", server: "slopware-mcp", version: VERSION, protocol: PROTOCOL_VERSION });
  ws.on("message", (data) => {
    let msg: AppMessage;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (msg.type === "hello") appInfo = { fileName: msg.fileName, projectName: msg.projectName };
    else if (msg.type === "result") {
      const p = pending.get(msg.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new CommandError(msg.error ?? "Failed in the app"));
    }
  });
  ws.on("close", () => {
    if (app !== ws) return;
    app = null;
    appInfo = null;
    failPending("The app disconnected before answering.");
    log("app disconnected");
  });
});

function callApp(name: string, args: Record<string, unknown>): Promise<unknown> {
  const ws = app!;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("The app did not answer in time (the user may not have confirmed the change)."));
    }, APP_CALL_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    send(ws, { type: "call", id, name, args });
  });
}

const live = () => app !== null && app.readyState === app.OPEN;

async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  return live() ? callApp(name, args) : runLocal(getCommand(name), args);
}

// ---------- server-only tools ----------

interface ServerTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(args: Record<string, any>): Promise<unknown>;
}

const pathProp = (description: string) => ({ type: "string", description });

const serverTools: ServerTool[] = [
  {
    name: "status",
    description:
      "Shows whether tools run live in the SlopwareIdeasModeler app (user sees changes, may need to confirm them) or on a project file loaded by this server.",
    inputSchema: { type: "object", properties: {} },
    run: async () => ({
      mode: live() ? "live" : "file",
      app: live() ? { connected: true, ...appInfo } : { connected: false, bridge: bridgeListening ? `ws://127.0.0.1:${port}` : "not listening" },
      file: { path: file.path, dirty: file.dirty, diagrams: file.project.diagrams.length },
      workDir,
    }),
  },
  {
    name: "open_project",
    description: "Opens a .simp (or .xmi) file. In live mode it replaces the project in the app (the user is asked first); otherwise it is loaded into this server.",
    inputSchema: { type: "object", properties: { path: pathProp("File path, absolute or relative to the server working directory.") }, required: ["path"] },
    run: async ({ path: p }) => {
      const full = resolvePath(String(p));
      const xml = await readFile(full, "utf8");
      const isXmi = /\.(xmi|xml)$/i.test(full) && !xml.includes("<sim-project");
      const result = await call(isXmi ? "load_xmi" : "load_simp", { xml, fileName: path.basename(full) });
      if (!live()) {
        file.path = isXmi ? null : full;
        file.dirty = false;
      }
      return { opened: full, ...(result as object) };
    },
  },
  {
    name: "save_project",
    description: "Writes the project to a .simp file. path is required in live mode and for a new project.",
    inputSchema: { type: "object", properties: { path: pathProp("Target .simp path.") } },
    run: async ({ path: p }) => {
      const target = p ? resolvePath(String(p)) : live() ? null : file.path;
      if (!target) throw new CommandError("Give a path to save to.");
      const xml = String(await call("export_simp", {}));
      await writeFile(target, xml, "utf8");
      if (!live()) {
        file.path = target;
        file.dirty = false;
      }
      return { saved: target, bytes: Buffer.byteLength(xml) };
    },
  },
];

// ---------- MCP wiring ----------

function toolList() {
  const fromCommands = [...COMMANDS.values()]
    .filter((c) => !c.internal)
    .map((c) => {
      const schema = structuredClone(c.input) as { properties: Record<string, unknown> };
      if (c.textOutput) schema.properties.path = pathProp(`Optional file to write the ${c.textOutput.toUpperCase()} to instead of returning it.`);
      return { name: c.name, description: c.description, inputSchema: schema };
    });
  return [...serverTools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })), ...fromCommands];
}

async function runTool(name: string, args: Record<string, any>): Promise<unknown> {
  const own = serverTools.find((t) => t.name === name);
  if (own) return own.run(args);
  const cmd = getCommand(name);
  const { path: outPath, ...rest } = args;
  const result = await call(name, cmd.textOutput ? rest : args);
  if (cmd.textOutput && outPath) {
    const target = resolvePath(String(outPath));
    await writeFile(target, String(result), "utf8");
    return { written: target, bytes: Buffer.byteLength(String(result)) };
  }
  return result;
}

const server = new Server(
  { name: "slopware-ideas-modeler", version: VERSION },
  {
    capabilities: { tools: {} },
    instructions:
      "Edits diagrams of .simp projects. Typical flow: status, get_catalog, create_diagram, get_diagram_toolbox, add_element, add_relation, auto_layout, then save_project (file mode) or let the user save (live mode). Ids returned by one call are used by the next.",
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolList() }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  try {
    const result = await runTool(req.params.name, (req.params.arguments ?? {}) as Record<string, any>);
    return { content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] };
  }
});

void server.connect(new StdioServerTransport()).then(() => {
  log(`ready (style ${style.id}, working directory ${workDir})`);
});
