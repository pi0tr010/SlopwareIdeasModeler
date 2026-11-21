import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Diagram, Point, Project } from "../model/types";
import { DiagramContent, resolveDiagram, SvgDefs } from "../render/DiagramSvg";
import type { StyleSet } from "../render/style";

const MARGIN = 20;

export function diagramToSvg(diagram: Diagram, project: Project, style: StyleSet): { svg: string; width: number; height: number } {
  const resolved = resolveDiagram(diagram, project, style);
  const { x, y, width, height } = resolved.bounds;
  const w = Math.ceil(width + MARGIN * 2);
  const h = Math.ceil(height + MARGIN * 2);
  const markup = renderToStaticMarkup(
    createElement(
      "svg",
      { xmlns: "http://www.w3.org/2000/svg", width: w, height: h, viewBox: `${x - MARGIN} ${y - MARGIN} ${w} ${h}` },
      createElement(SvgDefs),
      createElement("rect", { x: x - MARGIN, y: y - MARGIN, width: w, height: h, fill: style.canvas }),
      createElement(DiagramContent, { resolved, project, style }),
    ),
  );
  return { svg: `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`, width: w, height: h };
}

export async function diagramToPng(diagram: Diagram, project: Project, style: StyleSet, scale = 2): Promise<Blob> {
  const { svg, width, height } = diagramToSvg(diagram, project, style);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG rasterisation failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function diagramToPdf(diagram: Diagram, project: Project, style: StyleSet): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const png = await diagramToPng(diagram, project, style, 2);
  const { width, height } = diagramToSvg(diagram, project, style);
  const dataUrl = await new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(png);
  });
  const doc = new jsPDF({ orientation: width > height ? "landscape" : "portrait", unit: "px", format: [width, height], hotfixes: ["px_scaling"] });
  doc.addImage(dataUrl, "PNG", 0, 0, width, height);
  return doc.output("blob");
}

/** Drawn polylines of every link, used to write border-anchored points into .simp files. */
export function collectRoutes(project: Project, style: StyleSet): Map<string, Point[]> {
  const routes = new Map<string, Point[]>();
  for (const d of project.diagrams) for (const l of resolveDiagram(d, project, style).links) routes.set(l.view.iid, l.points);
  return routes;
}
