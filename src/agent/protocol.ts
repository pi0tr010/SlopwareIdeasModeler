/** Messages between the MCP server (WebSocket server) and the app (client). */

export const BRIDGE_PORT = 7457;
export const PROTOCOL_VERSION = 1;

export type ServerMessage =
  | { type: "welcome"; server: string; version: string; protocol: number }
  | { type: "call"; id: number; name: string; args: Record<string, unknown> }
  /** Another app window took over the connection. */
  | { type: "replaced" };

export type AppMessage =
  | { type: "hello"; app: string; fileName: string | null; projectName: string }
  | { type: "result"; id: number; ok: boolean; result?: unknown; error?: string };
