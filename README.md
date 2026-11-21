# Slopware Ideas Modeler

A one shot diagram modeler that runs in the browser and as an offline Linux desktop app. It opens and saves
`.simp` projects and writes them in the native format of the original application, so files open there
without losing data. Diagrams are drawn in the same default style. AI agents can read and
edit projects through a built-in MCP server.

All modeling happens on the user's device. The server only hosts static files.

## Status

| Area | State |
| --- | --- |
| UML (all 14 diagram types), ERD | Dedicated shapes, connectors and property editors |
| Flowchart, BPMN, DFD (Yourdon and Gane-Sarson), mind map, C4, SysML 1 and 2 | Dedicated shapes and connector notation |
| Other diagram types | Listed with all their elements; drawn with generic shapes for now |
| `.simp` | Read and write; colours and fonts stored in files are shown (not edited); unknown items are kept as raw XML for round-trip |
| Export | PNG, SVG, PDF, SQL DDL (PostgreSQL, MySQL, SQLite, SQL Server, Oracle), XMI 2.5 |
| Editor | Shared model with project tree, undo/redo, auto-layout, align and distribute, context menu, search (Ctrl+F), autosave |
| Themes | Light (diagrams in the chosen style) and dark (diagrams in a dark classic style); exports always use the light style |
| AI agents | MCP server: live editing in the open app or offline on `.simp` files |

## Run in Docker (server)

```sh
docker compose up -d --build
# open http://<server>:8094  (change the port with HOST_PORT=9000 docker compose up -d)
```

The image is a multi-stage build: Node builds the app, then `nginx:alpine` serves `dist/`.

## Development

Requires Node.js 22.

```sh
npm install
npm run dev        # http://localhost:5173
npm test
npm run build      # static files in dist/
```

Open a project from a URL (useful for testing): `http://localhost:5173/?open=/path/file.simp&diagram=0`.

## Desktop app (Linux, offline)

The desktop version is the same web app inside [Tauri 2](https://tauri.app/). On Debian/Ubuntu:

```sh
sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf build-essential
curl https://sh.rustup.rs -sSf | sh
npm install
npm run desktop:build   # AppImage and .deb in src-tauri/target/release/bundle/
```

`npm run desktop:dev` starts it with hot reload. The CI workflow (`.github/workflows/ci.yml`) also builds
the AppImage and `.deb` on every push.

## MCP server for AI agents

`mcp/server.ts` is a local [Model Context Protocol](https://modelcontextprotocol.io/) server (stdio).
Its tools cover what a user can do in the editor: list and create diagrams, add elements and
relationships, edit names, attributes, operations, ERD columns and type specific properties, move,
align and auto-layout shapes, delete, search, and export SVG, SQL, XMI and `.simp`.

It works in two modes:

- **Live**: click **Agent** in the menu bar and **Connect**. Tool calls run in the open app over
  `ws://127.0.0.1:7457`, the user sees every change and can undo it. The Agent dialog sets whether the
  user confirms each change or allows all changes for the connection (replacing the whole project is
  always confirmed).
- **File**: when no app is connected, the server keeps a project in memory. Use `open_project` and
  `save_project` with `.simp` paths.

Build and register it:

```sh
npm install
npm run build:mcp      # dist-mcp/server.mjs (dependencies are loaded from node_modules)
```

`.cursor/mcp.json` (Cursor) or the equivalent file of another MCP client:

```json
{
  "mcpServers": {
    "slopware": {
      "command": "node",
      "args": ["/absolute/path/to/SlopwareIdeasModeler/dist-mcp/server.mjs"]
    }
  }
}
```

During development `npm run mcp` runs the TypeScript source with `tsx`, and `node scripts/mcp-smoke.mjs`
checks the built server end to end.

| Variable | Default | Meaning |
| --- | --- | --- |
| `SLOPWARE_MCP_PORT` | `7457` | Port of the app bridge (WebSocket, bound to 127.0.0.1) |
| `SLOPWARE_MCP_ORIGINS` | | Extra allowed page origins, comma separated, e.g. `http://modeler.example.com:8080` when the app is served from Docker on another host. Pages on `localhost`, `127.0.0.1` and the desktop app are always allowed |
| `SLOPWARE_STYLE` | `sim12` | Diagram style for layout and export in file mode (`sim12`, `simple`, `classic`) |
| `SLOPWARE_WORKDIR` | current directory | Base for relative file paths |

## Translations

UI strings live in `src/i18n/locales/<code>.json`. To add a language, copy `en.json` to e.g. `de.json`,
translate the values, and set `"language.name"` to the language's own name. The file is picked up
automatically; no code changes are needed. Missing keys fall back to English.

Diagram and element names come from `src/catalog/catalog.json` (taken from the translations of the original application). Override
or add any of them in a locale file with keys `element.<element-id>` and `diagram.<diagram-id>`, for
example `"element.uml-class": "Klasse"`.

## Catalog

`src/catalog/catalog.json` lists every diagram type and its toolbox elements with their translated
names. It is committed, so building does not need the original application. To regenerate it from an installed copy:

```sh
npm run catalog -- "<install dir of the original application>"
```

## Project layout

```
src/agent      commands shared by the MCP server and the app, WebSocket bridge
src/catalog    diagram/element catalog and toolbox contents
src/model      data model, element registry (shapes, connector ends), factories, editing operations
src/render     SVG rendering of shapes, connectors, rich text, custom styles; geometry and routing
src/io         .simp read/write, XMI, SQL, PNG/SVG/PDF export, file access (browser and Tauri)
src/layout     auto-layout (dagre)
src/store      editor state, undo/redo, autosave
src/ui         editor UI (menu, project tree, toolbox, canvas, properties, dialogs)
mcp            MCP server (Node, stdio)
src-tauri      desktop shell
```
