// End-to-end check of the MCP server in file mode: node scripts/mcp-smoke.mjs [server.mjs] [outDir]
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverPath = process.argv[2] ?? "dist-mcp/server.mjs";
const outDir = process.argv[3] ?? (await mkdtemp(path.join(tmpdir(), "slopware-mcp-")));

// A free port keeps the smoke test independent from a running app bridge.
const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath], env: { ...process.env, SLOPWARE_MCP_PORT: "17457" }, stderr: "inherit" });
const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(transport);

async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content[0]?.text ?? "";
  if (res.isError) throw new Error(`${name}: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const { tools } = await client.listTools();
console.log(`tools: ${tools.length}`);

const status = await call("status");
console.log("mode:", status.mode);

const { diagramId } = await call("create_diagram", { type: "uml-class", name: "Shop" });
const order = await call("add_element", {
  diagramId,
  type: "class",
  name: "Order",
  attributes: [{ name: "id", type: "int" }, { name: "total", type: "decimal" }],
  operations: [{ name: "pay", returnType: "bool", parameters: [{ name: "amount", type: "decimal" }] }],
});
const item = await call("add_element", { diagramId, type: "class", name: "OrderItem", attributes: [{ name: "qty", type: "int" }] });
const base = await call("add_element", { diagramId, type: "class", name: "Entity", isAbstract: true });
await call("add_relation", { diagramId, type: "relationship", from: order.elementId, to: item.elementId, end: { multiplicity: "1..*", aggregation: "composition" } });
await call("add_relation", { diagramId, type: "generalization", from: order.elementId, to: base.elementId });
await call("auto_layout", { diagramId });
const diagram = await call("get_diagram", { diagramId });
console.log(`class diagram: ${diagram.shapes.length} shapes, ${diagram.links.length} links`);

const erd = await call("create_diagram", { type: "entity-relationship", name: "Db" });
const customer = await call("add_element", {
  diagramId: erd.diagramId,
  type: "erd-entity",
  name: "Customer",
  erdAttributes: [{ name: "id", type: "int", primaryKey: true, autoIncrement: true }, { name: "email", type: "varchar", size: "200", unique: true }],
});
const invoice = await call("add_element", { diagramId: erd.diagramId, type: "erd-entity", name: "Invoice", erdAttributes: [{ name: "id", type: "int", primaryKey: true }] });
await call("add_relation", { diagramId: erd.diagramId, type: "erd-relationship", from: customer.elementId, to: invoice.elementId });
const sql = await call("export_sql", { dialect: "postgresql" });
console.log(sql.split("\n").filter((l) => l.startsWith("CREATE")).join("\n"));

const svgFile = path.join(outDir, "shop.svg");
await call("export_svg", { diagramId, path: svgFile });
const simpFile = path.join(outDir, "agent.simp");
await call("save_project", { path: simpFile });

await call("new_project");
const reopened = await call("open_project", { path: simpFile });
console.log(`reopened: ${reopened.diagrams} diagrams, ${reopened.elements} elements`);
const found = await call("find_elements", { query: "total" });
console.log("find 'total':", found.map((f) => f.name).join(", "));

const bad = await client.callTool({ name: "add_element", arguments: { diagramId, type: "nonsense" } });
console.log("error reported:", bad.isError === true);

await client.close();
console.log(`files in ${outDir}`);
