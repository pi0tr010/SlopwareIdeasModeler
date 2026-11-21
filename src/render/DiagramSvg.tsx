import { getElementDef } from "../model/registry";
import type { Diagram, LinkView, ModelElement, Point, Project, ShapeView } from "../model/types";
import { EdgeView } from "./edges";
import { effectiveSize, routeLink } from "./geometry";
import { ShapeNode } from "./shapes";
import type { StyleSet } from "./style";

export interface ResolvedShape {
  view: ShapeView;
  el: ModelElement;
  /** View with the size that is actually drawn. */
  box: ShapeView;
}

export interface ResolvedLink {
  view: LinkView;
  el: ModelElement;
  points: Point[];
}

export interface ResolvedDiagram {
  type: string;
  shapes: ResolvedShape[];
  links: ResolvedLink[];
  bounds: { x: number; y: number; width: number; height: number };
}

function depth(view: ShapeView, byIid: Map<string, ShapeView>): number {
  let d = 0;
  let cur = view.container ? byIid.get(view.container) : undefined;
  while (cur && d < 20) {
    d++;
    cur = cur.container ? byIid.get(cur.container) : undefined;
  }
  return d;
}

export function resolveDiagram(diagram: Diagram, project: Project, style: StyleSet): ResolvedDiagram {
  const byIid = new Map<string, ShapeView>();
  for (const v of diagram.views) if (v.kind === "entity") byIid.set(v.iid, v);

  const shapes: ResolvedShape[] = [];
  const boxes = new Map<string, ShapeView>();
  for (const v of diagram.views) {
    if (v.kind !== "entity") continue;
    const el = project.elements[v.ref];
    if (!el) continue;
    const size = effectiveSize(v, el, style);
    const box = size.width === v.width && size.height === v.height ? v : { ...v, ...size };
    boxes.set(v.iid, box);
    shapes.push({ view: v, el, box });
  }
  const order = (s: ResolvedShape) => {
    const def = getElementDef(s.el.type);
    return (def.container ? 0 : 100) + depth(s.view, byIid) * 10 + (def.shape === "lifeline" ? -50 : 0);
  };
  shapes.sort((a, b) => order(a) - order(b) || (a.box.width * a.box.height > b.box.width * b.box.height && getElementDef(a.el.type).container ? -1 : 0));

  const links: ResolvedLink[] = [];
  for (const v of diagram.views) {
    if (v.kind !== "relation") continue;
    const el = project.elements[v.ref];
    const a = boxes.get(v.fromIid);
    const b = boxes.get(v.toIid);
    if (!el || !a || !b) continue;
    links.push({ view: v, el, points: routeLink(v, a, b, project.elements[a.ref], project.elements[b.ref], style) });
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of shapes) {
    minX = Math.min(minX, s.box.x);
    minY = Math.min(minY, s.box.y);
    maxX = Math.max(maxX, s.box.x + s.box.width);
    maxY = Math.max(maxY, s.box.y + s.box.height + (getElementDef(s.el.type).shape === "actor" ? 20 : 0));
  }
  for (const l of links)
    for (const p of l.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  if (!isFinite(minX)) {
    minX = minY = 0;
    maxX = maxY = 100;
  }
  return { type: diagram.type, shapes, links, bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
}

export function SvgDefs() {
  return (
    <defs>
      <filter id="sim-shadow" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="2" dy="2" stdDeviation="3" floodColor="#555555" floodOpacity="0.23" />
      </filter>
    </defs>
  );
}

/** Pure drawing of a resolved diagram; used by the editor canvas and by exports. */
export function DiagramContent({ resolved, project, style }: { resolved: ResolvedDiagram; project: Project; style: StyleSet }) {
  return (
    <>
      {resolved.shapes.map((s) =>
        s.view.itemType === "lifeline" && s.el.type !== "lifeline" ? (
          <ShapeNode key={s.view.iid} shape={s.box} el={{ id: s.el.id, cid: "", type: "lifeline", name: "" }} style={style} classifier={s.el} />
        ) : (
          <ShapeNode key={s.view.iid} shape={s.box} el={s.el} style={style} classifier={classifierOf(s.el, project)} diagramType={resolved.type} />
        ),
      )}
      {resolved.links.map((l) => (
        <EdgeView key={l.view.iid} el={l.el} points={l.points} lineStyle={l.view.lineStyle} style={style} />
      ))}
    </>
  );
}

function classifierOf(el: ModelElement, project: Project): ModelElement | undefined {
  const ref = el.props?.classifierRef;
  return ref ? project.elements[ref] : undefined;
}
