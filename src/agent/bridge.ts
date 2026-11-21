import { create } from "zustand";
import { SIM12, type StyleSet } from "../render/style";
import { useEditor } from "../store/store";
import { COMMANDS, describeCall, type AppUi, type CommandContext } from "./commands";
import { BRIDGE_PORT, type AppMessage, type ServerMessage } from "./protocol";

/** "each": confirm every change; "session": connecting grants consent until disconnect. */
export type ConsentPolicy = "each" | "session";
export type BridgeStatus = "off" | "connecting" | "connected";

interface LogEntry {
  time: number;
  text: string;
  ok: boolean;
}

interface Prompt {
  text: string;
  resolve: (answer: "allow" | "allowAll" | "deny") => void;
}

interface BridgeState {
  status: BridgeStatus;
  url: string;
  policy: ConsentPolicy;
  /** Set by "allow all" in a confirmation, cleared on disconnect. */
  sessionApproved: boolean;
  prompt: Prompt | null;
  log: LogEntry[];
  setUrl: (url: string) => void;
  setPolicy: (p: ConsentPolicy) => void;
  connect: () => void;
  disconnect: () => void;
}

const URL_KEY = "sim.agent.url";
const POLICY_KEY = "sim.agent.policy";
const RETRY_MS = 3000;
const LOG_LIMIT = 50;
export const DEFAULT_BRIDGE_URL = `ws://127.0.0.1:${BRIDGE_PORT}`;

let socket: WebSocket | null = null;
let wanted = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let queue: Promise<void> = Promise.resolve();
let style: StyleSet = SIM12;

/** The light diagram style used for layout and export, kept in sync by the app. */
export function setAgentStyle(s: StyleSet) {
  style = s;
}

export const useBridge = create<BridgeState>((set, get) => ({
  status: "off",
  url: localStorage.getItem(URL_KEY) ?? DEFAULT_BRIDGE_URL,
  policy: localStorage.getItem(POLICY_KEY) === "session" ? "session" : "each",
  sessionApproved: false,
  prompt: null,
  log: [],
  setUrl: (url) => {
    localStorage.setItem(URL_KEY, url);
    set({ url });
  },
  setPolicy: (policy) => {
    localStorage.setItem(POLICY_KEY, policy);
    set({ policy });
  },
  connect: () => {
    wanted = true;
    open(get().url);
  },
  disconnect: () => {
    wanted = false;
    clearTimeout(retryTimer);
    socket?.close();
    socket = null;
    get().prompt?.resolve("deny");
    set({ status: "off", sessionApproved: false, prompt: null });
  },
}));

const addLog = (text: string, ok: boolean) => useBridge.setState((s) => ({ log: [{ time: Date.now(), text, ok }, ...s.log].slice(0, LOG_LIMIT) }));

function open(url: string) {
  clearTimeout(retryTimer);
  socket?.close();
  useBridge.setState({ status: "connecting" });
  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch (e) {
    addLog(String(e), false);
    useBridge.setState({ status: "off" });
    wanted = false;
    return;
  }
  socket = ws;
  ws.onopen = () => {
    const ed = useEditor.getState();
    const hello: AppMessage = { type: "hello", app: "SlopwareIdeasModeler", fileName: ed.fileName, projectName: ed.project.name };
    ws.send(JSON.stringify(hello));
    useBridge.setState({ status: "connected" });
  };
  ws.onmessage = (ev) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (msg.type === "call") queue = queue.then(() => handleCall(ws, msg as Extract<ServerMessage, { type: "call" }>));
    else if (msg.type === "replaced") {
      wanted = false;
      addLog("Another window connected to the agent.", false);
    }
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    useBridge.getState().prompt?.resolve("deny");
    useBridge.setState({ status: wanted ? "connecting" : "off", prompt: null, sessionApproved: false });
    if (wanted) retryTimer = setTimeout(() => open(useBridge.getState().url), RETRY_MS);
  };
}

function ask(text: string): Promise<"allow" | "allowAll" | "deny"> {
  return new Promise((resolve) =>
    useBridge.setState({
      prompt: {
        text,
        resolve: (answer) => {
          useBridge.setState({ prompt: null });
          resolve(answer);
        },
      },
    }),
  );
}

const ui: AppUi = {
  openDiagram: (id) => useEditor.getState().openDiagram(id),
  selection: () => ({ diagramId: useEditor.getState().activeDiagramId, iids: useEditor.getState().selection }),
  select: (iids) => useEditor.getState().select(iids),
};

async function handleCall(ws: WebSocket, msg: Extract<ServerMessage, { type: "call" }>) {
  const reply = (r: Omit<Extract<AppMessage, { type: "result" }>, "type" | "id">) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "result", id: msg.id, ...r } satisfies AppMessage));
  };
  const text = describeCall(msg.name, msg.args);
  try {
    const cmd = COMMANDS.get(msg.name);
    if (!cmd) throw new Error(`Unknown command: ${msg.name}`);
    const b = useBridge.getState();
    // Replacing the whole project could drop unsaved work, so it is confirmed even with session consent.
    const needsConsent = cmd.replacesProject || (cmd.mutates && b.policy === "each" && !b.sessionApproved);
    if (needsConsent) {
      const answer = await ask(text);
      if (answer === "deny") throw new Error("The user rejected this change.");
      if (answer === "allowAll") useBridge.setState({ sessionApproved: true });
    }
    const ed = useEditor.getState();
    const ctx = (project: CommandContext["project"]): CommandContext => ({ project, style, ui });
    let result: unknown;
    if (cmd.replacesProject) {
      const next = structuredClone(ed.project);
      result = cmd.run(ctx(next), msg.args);
      ed.loadProject(next, typeof msg.args.fileName === "string" ? msg.args.fileName : null);
    } else if (cmd.mutates) {
      ed.commit((p) => {
        result = cmd.run(ctx(p), msg.args);
      });
    } else {
      result = cmd.run(ctx(ed.project), msg.args);
    }
    if (cmd.mutates) addLog(text, true);
    reply({ ok: true, result });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    addLog(`${text}: ${error}`, false);
    reply({ ok: false, error });
  }
}
