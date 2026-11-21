// Builds src/catalog/catalog.json from the data files of the installed original application
// (diagram list, element list, translations).
// Usage: node scripts/generate-catalog.mjs <install dir>  (or set SIMP_APP_DIR)
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const simDir = process.argv[2] ?? process.env.SIMP_APP_DIR;
if (!simDir) {
  console.error("Usage: node scripts/generate-catalog.mjs <install dir>  (or set SIMP_APP_DIR)");
  process.exit(1);
}
const data = join(simDir, "Data");
if (!existsSync(data)) {
  console.error(`Data folder not found in ${data}`);
  process.exit(1);
}

const decode = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decode(m[1]) : undefined;
};

function readResx(file) {
  const map = new Map();
  if (!existsSync(file)) return map;
  const xml = readFileSync(file, "utf8");
  for (const m of xml.matchAll(/<data\s+name="([^"]+)"[^>]*>\s*<value>([\s\S]*?)<\/value>/g)) {
    map.set(decode(m[1]), decode(m[2]));
  }
  return map;
}

const languages = readdirSync(join(data, "Languages")).filter((l) =>
  existsSync(join(data, "Languages", l, "Language.resx")),
);
const resx = Object.fromEntries(languages.map((l) => [l, readResx(join(data, "Languages", l, "Language.resx"))]));

const lowerIndex = {};
for (const [lang, map] of Object.entries(resx)) {
  const idx = new Map();
  for (const [k, v] of map) idx.set(k.toLowerCase(), v);
  lowerIndex[lang] = idx;
}
const lookup = (lang, keys) => {
  for (const k of keys) {
    const v = lowerIndex[lang]?.get(k.toLowerCase());
    if (v && v.trim()) return v.replace(/&/g, "").trim();
  }
  return undefined;
};
const pascal = (id) => id.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
const compact = (s) => s.replace(/[^A-Za-z0-9]/g, "");

function translations(en, keys) {
  const out = { en };
  for (const lang of languages) {
    if (lang === "en") continue;
    const v = lookup(lang, keys);
    if (v) out[lang === "cz" ? "cs" : lang] = v;
  }
  return out;
}

// Diagrams
const diagramsXml = readFileSync(join(data, "Lists", "Diagrams.xml"), "utf8");
const groups = [];
for (const g of diagramsXml.matchAll(/<group\s+name="([^"]+)"\s*>([\s\S]*?)<\/group>/g)) {
  const groupId = g[1];
  const diagrams = [];
  for (const d of g[2].matchAll(/<diagram\s[^>]*>/g)) {
    const id = attr(d[0], "id");
    const name = attr(d[0], "name");
    const keys = [
      `Global.DiagramNames.${pascal(id)}Diagram`,
      `Global.DiagramNames.${pascal(id)}`,
      `Global.DiagramNames.${compact(name)}`,
      `MainForm.Toolbox.${compact(name)}`,
      `MainForm.ProjectTabPanel.${compact(name)}.tooltip`,
    ];
    diagrams.push({ id, name: translations(name, keys), elements: [] });
  }
  groups.push({
    id: groupId,
    name: translations(groupId, [`Global.DiagramNames.${groupId}`, `Global.DiagramGroups.${groupId}`]),
    diagrams,
  });
}
const diagramById = new Map(groups.flatMap((g) => g.diagrams).map((d) => [d.id, d]));

// Elements
const elementsXml = readFileSync(join(data, "Lists", "Elements.xml"), "utf8");
const elements = {};
for (const e of elementsXml.matchAll(/<element\s([^>]*)>([\s\S]*?)<\/element>/g)) {
  const head = `<element ${e[1]}>`;
  const id = attr(head, "id");
  const name = attr(head, "name");
  elements[id] = {
    name: translations(name, [`MainForm.Toolbox.${name}`, `MainForm.Toolbox.${compact(name)}`, `MainForm.Toolbox.${pascal(id)}`]),
  };
  for (const d of e[2].matchAll(/<diagram\s+name="([^"]+)"/g)) {
    const diagram = diagramById.get(d[1]);
    if (diagram && !diagram.elements.includes(id)) diagram.elements.push(id);
  }
}

const out = { source: "data files of the original application", languages: ["en", ...languages.filter((l) => l !== "en").map((l) => (l === "cz" ? "cs" : l))], groups, elements };
writeFileSync(join(root, "src", "catalog", "catalog.json"), JSON.stringify(out, null, 1) + "\n");

const total = Object.keys(elements).length;
const plCount = Object.values(elements).filter((e) => e.name.pl).length;
const dCount = diagramById.size;
const dPl = [...diagramById.values()].filter((d) => d.name.pl).length;
console.log(`diagrams: ${dCount} (pl ${dPl}), elements: ${total} (pl ${plCount}), languages: ${out.languages.join(",")}`);
