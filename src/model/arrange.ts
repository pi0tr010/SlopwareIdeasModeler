import type { Diagram, ShapeView } from "./types";

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type DistributeAxis = "horizontal" | "vertical";
export type ZOrder = "front" | "back";

const shapesOf = (d: Diagram, iids: string[]) => d.views.filter((v): v is ShapeView => v.kind === "entity" && iids.includes(v.iid));

/** Aligns shapes to the outermost edge (or the common centre) of the group. */
export function alignShapes(d: Diagram, iids: string[], mode: AlignMode): void {
  const shapes = shapesOf(d, iids);
  if (shapes.length < 2) return;
  const minX = Math.min(...shapes.map((s) => s.x));
  const maxX = Math.max(...shapes.map((s) => s.x + s.width));
  const minY = Math.min(...shapes.map((s) => s.y));
  const maxY = Math.max(...shapes.map((s) => s.y + s.height));
  for (const s of shapes) {
    if (mode === "left") s.x = minX;
    else if (mode === "right") s.x = maxX - s.width;
    else if (mode === "center") s.x = Math.round((minX + maxX) / 2 - s.width / 2);
    else if (mode === "top") s.y = minY;
    else if (mode === "bottom") s.y = maxY - s.height;
    else s.y = Math.round((minY + maxY) / 2 - s.height / 2);
  }
}

/** Spaces shapes so the gaps between them are equal, keeping the first and last in place. */
export function distributeShapes(d: Diagram, iids: string[], axis: DistributeAxis): void {
  const shapes = shapesOf(d, iids);
  if (shapes.length < 3) return;
  const h = axis === "horizontal";
  shapes.sort((a, b) => (h ? a.x - b.x : a.y - b.y));
  const start = h ? shapes[0].x : shapes[0].y;
  const last = shapes[shapes.length - 1];
  const end = h ? last.x + last.width : last.y + last.height;
  const total = shapes.reduce((sum, s) => sum + (h ? s.width : s.height), 0);
  const gap = (end - start - total) / (shapes.length - 1);
  let pos = start;
  for (const s of shapes) {
    if (h) s.x = Math.round(pos);
    else s.y = Math.round(pos);
    pos += (h ? s.width : s.height) + gap;
  }
}

/** Views later in the list are drawn on top. */
export function reorderViews(d: Diagram, iids: string[], order: ZOrder): void {
  const picked = d.views.filter((v) => iids.includes(v.iid));
  const rest = d.views.filter((v) => !iids.includes(v.iid));
  d.views = order === "front" ? [...rest, ...picked] : [...picked, ...rest];
}
