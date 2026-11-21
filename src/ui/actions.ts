import { t } from "../i18n";
import { collectRoutes, diagramToPdf, diagramToPng, diagramToSvg } from "../io/export";
import { openTextFile, saveFile } from "../io/files";
import { parseSimp, writeSimp } from "../io/simp";
import { exportXmi, importXmi } from "../io/xmi";
import { autoLayout } from "../layout/autolayout";
import { applyLayout } from "../model/ops";
import type { StyleSet } from "../render/style";
import { activeDiagram, useEditor } from "../store/store";

const s = useEditor.getState;

const baseName = () => (s().fileName ?? s().project.name ?? "project").replace(/\.(simp|xmi|xml)$/i, "").replace(/[\\/:*?"<>|]/g, "_");
const fileSafe = (name: string) => name.replace(/[\\/:*?"<>|]/g, "_") || "diagram";

function reportError(e: unknown) {
  console.error(e);
  alert(t("error.generic", { message: e instanceof Error ? e.message : String(e) }));
}

export function confirmDiscard(): boolean {
  return !s().dirty || confirm(t("confirm.discard"));
}

export function newProject() {
  if (confirmDiscard()) s().newProject();
}

export async function openProject(style: StyleSet) {
  if (!confirmDiscard()) return;
  try {
    const file = await openTextFile(["simp", "xmi", "xml"]);
    if (!file) return;
    const isXmi = /\.(xmi|xml)$/i.test(file.name) && !file.text.includes("<sim-project");
    const project = isXmi ? importXmi(file.text) : parseSimp(file.text);
    s().loadProject(project, isXmi ? null : file.name);
    if (isXmi) {
      for (const d of project.diagrams) {
        s().openDiagram(d.id);
        applyAutoLayout(style);
      }
      s().markSaved(null);
    }
  } catch (e) {
    reportError(e);
  }
}

export async function saveProject(style: StyleSet) {
  try {
    const xml = writeSimp(s().project, collectRoutes(s().project, style));
    const name = await saveFile(baseName() + ".simp", xml, "application/xml");
    if (name) s().markSaved(name);
  } catch (e) {
    reportError(e);
  }
}

export async function exportDiagram(format: "svg" | "png" | "pdf", style: StyleSet) {
  const d = activeDiagram(s());
  if (!d) return;
  try {
    const name = fileSafe(d.name);
    if (format === "svg") await saveFile(`${name}.svg`, diagramToSvg(d, s().project, style).svg, "image/svg+xml");
    if (format === "png") await saveFile(`${name}.png`, await diagramToPng(d, s().project, style), "image/png");
    if (format === "pdf") await saveFile(`${name}.pdf`, await diagramToPdf(d, s().project, style), "application/pdf");
  } catch (e) {
    reportError(e);
  }
}

export async function exportXmiFile() {
  try {
    await saveFile(baseName() + ".xmi", exportXmi(s().project), "application/xml");
  } catch (e) {
    reportError(e);
  }
}

export async function importXmiIntoProject(style: StyleSet) {
  try {
    const file = await openTextFile(["xmi", "xml"]);
    if (!file) return;
    const imported = importXmi(file.text);
    s().commit((p) => {
      Object.assign(p.elements, imported.elements);
      p.diagrams.push(...imported.diagrams);
    });
    for (const d of imported.diagrams) {
      s().openDiagram(d.id);
      applyAutoLayout(style);
    }
  } catch (e) {
    reportError(e);
  }
}

export function applyAutoLayout(style: StyleSet) {
  const d = activeDiagram(s());
  if (!d) return;
  if (!autoLayout(d, s().project, style).size) return;
  s().commit((p) => applyLayout(p, p.diagrams.find((x) => x.id === d.id)!, style));
}
