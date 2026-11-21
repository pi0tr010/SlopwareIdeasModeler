import { autoLayout } from "../layout/autolayout";
import type { StyleSet } from "../render/style";
import { createElement, createLink, createShape } from "./factory";
import { getElementDef } from "./registry";
import type { Diagram, LinkView, ModelElement, Project, ShapeView } from "./types";

/** Moves shapes (and their nested children) and the links between them. */
export function moveViewsIn(d: Diagram, iids: string[], dx: number, dy: number): void {
  if (!dx && !dy) return;
  const moving = new Set(iids);
  // Children follow their containers (activation bars inside lifelines, shapes inside packages).
  let grew = true;
  while (grew) {
    grew = false;
    for (const v of d.views)
      if (v.kind === "entity" && v.container && moving.has(v.container) && !moving.has(v.iid)) {
        moving.add(v.iid);
        grew = true;
      }
  }
  for (const v of d.views) {
    if (v.kind === "entity" && moving.has(v.iid)) {
      v.x = Math.round(v.x + dx);
      v.y = Math.round(v.y + dy);
    } else if (v.kind === "relation") {
      const both = moving.has(v.fromIid) && moving.has(v.toIid);
      if (both || moving.has(v.iid)) v.points = v.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
      else if (v.itemType === "sequence-action" && (moving.has(v.fromIid) || moving.has(v.toIid)))
        v.points = v.points.map((pt) => ({ x: pt.x, y: pt.y + (moving.has(v.fromIid) ? dy : 0) }));
    }
  }
}

/** Removes views from a diagram; relationship elements left without any view are removed from the model too. */
export function removeViews(p: Project, d: Diagram, iids: string[], fromModel: boolean): void {
  const sel = new Set(iids);
  const removedRefs = new Set<string>();
  const removed = new Set<string>();
  for (const v of d.views) if (sel.has(v.iid) || (v.kind === "entity" && v.container && sel.has(v.container))) removed.add(v.iid);
  for (const v of d.views) if (v.kind === "relation" && (removed.has(v.fromIid) || removed.has(v.toIid))) removed.add(v.iid);
  d.views = d.views.filter((v) => {
    if (!removed.has(v.iid)) return true;
    removedRefs.add(v.ref);
    return false;
  });
  for (const ref of removedRefs) {
    const usedElsewhere = p.diagrams.some((dd) => dd.views.some((v) => v.ref === ref));
    const el = p.elements[ref];
    const isEdge = el && getElementDef(el.type).category === "edge";
    if (fromModel || (!usedElsewhere && isEdge)) removeElement(p, ref);
  }
}

/** Deletes an element, its relationships and every view of them. */
export function removeElement(p: Project, id: string): void {
  delete p.elements[id];
  for (const el of Object.values(p.elements)) if (el.from === id || el.to === id) delete p.elements[el.id];
  for (const d of p.diagrams) {
    const gone = new Set(d.views.filter((v) => !p.elements[v.ref]).map((v) => v.iid));
    d.views = d.views.filter((v) => !gone.has(v.iid) && !(v.kind === "relation" && (gone.has(v.fromIid) || gone.has(v.toIid))));
  }
}

export function findContainerAt(d: Diagram, p: Project, shape: ShapeView): string | undefined {
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  for (let i = d.views.length - 1; i >= 0; i--) {
    const v = d.views[i];
    if (v.kind !== "entity" || v.iid === shape.iid) continue;
    const el = p.elements[v.ref];
    if (!el || (el.type !== "lifeline" && !getElementDef(el.type).container)) continue;
    if (cx >= v.x && cx <= v.x + v.width && cy >= v.y && cy <= v.y + v.height) return v.iid;
  }
  return undefined;
}

/** Creates an element and its shape centred on (x, y). Activation bars snap into the lifeline under them. */
export function addNodeAt(p: Project, d: Diagram, type: string, x: number, y: number, init: Partial<ModelElement> = {}): ShapeView {
  const el = createElement(p, type, init);
  const shape = createShape(el, x, y);
  const def = getElementDef(type);
  shape.x = Math.round(x - def.width / 2);
  shape.y = Math.round(y - def.height / 2);
  const parent = findContainerAt(d, p, shape);
  if (type === "activation-bar" && parent) {
    const lifeline = d.views.find((v) => v.iid === parent) as ShapeView;
    shape.x = Math.round(lifeline.x + lifeline.width / 2 - shape.width / 2);
    shape.container = lifeline.iid;
    el.props = { ...el.props, owner: lifeline.ref };
  }
  d.views.push(shape);
  return shape;
}

/** Shows an existing model element on a diagram together with its relationships to elements already there. */
export function placeElement(p: Project, d: Diagram, elementId: string, x: number, y: number): ShapeView | undefined {
  const el = p.elements[elementId];
  if (!el || getElementDef(el.type).category !== "node") return undefined;
  const shape = createShape(el, x, y);
  shape.x = Math.round(x - shape.width / 2);
  shape.y = Math.round(y - shape.height / 2);
  d.views.push(shape);
  for (const rel of Object.values(p.elements)) {
    if (!rel.from || !rel.to || (rel.from !== elementId && rel.to !== elementId)) continue;
    if (d.views.some((v) => v.ref === rel.id)) continue;
    const a = d.views.find((v) => v.kind === "entity" && v.ref === rel.from) as ShapeView | undefined;
    const b = d.views.find((v) => v.kind === "entity" && v.ref === rel.to) as ShapeView | undefined;
    if (a && b) d.views.push(createLink(rel, a, b));
  }
  return shape;
}

export function addEdgeBetween(p: Project, d: Diagram, type: string, a: ShapeView, b: ShapeView, init: Partial<ModelElement> = {}): LinkView {
  const el = createElement(p, type, { ...init, from: a.ref, to: b.ref });
  const link = createLink(el, a, b);
  d.views.push(link);
  return link;
}

/** Runs the layered auto layout and writes the positions into the diagram. Returns false when nothing moved. */
export function applyLayout(p: Project, d: Diagram, style: StyleSet): boolean {
  const positions = autoLayout(d, p, style);
  if (!positions.size) return false;
  const moved = new Map<string, { dx: number; dy: number }>();
  for (const v of d.views) {
    const pos = v.kind === "entity" ? positions.get(v.iid) : undefined;
    if (v.kind === "entity" && pos) {
      moved.set(v.iid, { dx: pos.x - v.x, dy: pos.y - v.y });
      v.x = pos.x;
      v.y = pos.y;
    }
  }
  for (const v of d.views) {
    if (v.kind === "entity" && v.container && moved.has(v.container)) {
      const m = moved.get(v.container)!;
      v.x += m.dx;
      v.y += m.dy;
    }
    if (v.kind === "relation") v.points = [];
  }
  return true;
}
