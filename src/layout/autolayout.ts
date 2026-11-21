import dagre from "@dagrejs/dagre";
import type { Diagram, Project, ShapeView } from "../model/types";
import { effectiveSize } from "../render/geometry";
import type { StyleSet } from "../render/style";

const LEFT_TO_RIGHT = new Set(["entity-relationship", "chen-entity-relationship", "entity-relationship-idef1x", "uml-usecase", "data-flow", "mind-map"]);

/** Returns new positions for top-level shapes of the diagram (nested shapes and sequence diagrams are left alone). */
export function autoLayout(diagram: Diagram, project: Project, style: StyleSet): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (diagram.type.includes("sequence") || diagram.type === "uml-timing") return result;
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: LEFT_TO_RIGHT.has(diagram.type) ? "LR" : "TB", nodesep: 50, ranksep: 70, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  const shapes = diagram.views.filter((v): v is ShapeView => v.kind === "entity" && !v.container);
  for (const s of shapes) {
    const size = effectiveSize(s, project.elements[s.ref], style);
    g.setNode(s.iid, { width: size.width, height: size.height + (project.elements[s.ref]?.type === "actor" ? 20 : 0) });
  }
  const ids = new Set(shapes.map((s) => s.iid));
  for (const v of diagram.views) {
    if (v.kind !== "relation" || !ids.has(v.fromIid) || !ids.has(v.toIid) || v.fromIid === v.toIid) continue;
    const el = project.elements[v.ref];
    // Generalizations point upwards: parent above child.
    if (el && /generalization|realization/.test(el.type)) g.setEdge(v.toIid, v.fromIid);
    else g.setEdge(v.fromIid, v.toIid);
  }
  dagre.layout(g);
  for (const s of shapes) {
    const n = g.node(s.iid);
    if (n) result.set(s.iid, { x: Math.round(n.x - n.width / 2), y: Math.round(n.y - n.height / 2) });
  }
  return result;
}
