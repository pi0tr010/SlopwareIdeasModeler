// Packs the MCP server into one executable (Node single-executable application).
// Usage: node scripts/build-mcp-binary.mjs <output path>
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const out = process.argv[2];
if (!out) {
  console.error("Usage: node scripts/build-mcp-binary.mjs <output path>");
  process.exit(1);
}

const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
run("npx", ["esbuild", "mcp/server.ts", "--bundle", "--platform=node", "--format=cjs", "--target=node20", "--outfile=dist-mcp/server.cjs"]);

const bundled = readFileSync("dist-mcp/server.cjs", "utf8").replaceAll('require.resolve("./xhr-sync-worker.js")', '""');
writeFileSync("dist-mcp/server.cjs", bundled);
writeFileSync(
  "dist-mcp/sea-config.json",
  JSON.stringify({ main: "dist-mcp/server.cjs", output: "dist-mcp/sea-prep.blob", disableExperimentalSEAWarning: true }, null, 2),
);
run(process.execPath, ["--experimental-sea-config", "dist-mcp/sea-config.json"]);

mkdirSync(dirname(out), { recursive: true });
copyFileSync(process.execPath, out);
run("npx", ["--yes", "postject", out, "NODE_SEA_BLOB", "dist-mcp/sea-prep.blob", "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2", "--overwrite"]);
console.log("wrote", out);
