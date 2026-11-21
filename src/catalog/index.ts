import raw from "./catalog.json";
import { getElementDef } from "../model/registry";

export type Names = Record<string, string>;

export interface DiagramTypeDef {
  id: string;
  name: Names;
  elements: string[];
  group: string;
}

export interface DiagramGroup {
  id: string;
  name: Names;
  diagrams: DiagramTypeDef[];
}

interface RawCatalog {
  groups: { id: string; name: Names; diagrams: { id: string; name: Names; elements: string[] }[] }[];
}

export const diagramGroups: DiagramGroup[] = (raw as RawCatalog).groups.map((g) => ({
  ...g,
  diagrams: g.diagrams.map((d) => ({ ...d, group: g.id })),
}));

const byId = new Map(diagramGroups.flatMap((g) => g.diagrams).map((d) => [d.id, d]));

export const getDiagramType = (id: string): DiagramTypeDef | undefined => byId.get(id);

/** Elements every diagram offers in the .simp format besides its own notation. */
const COMMON = ["comment", "comment-connector", "text"];

export function toolboxFor(diagramType: string): { nodes: string[]; edges: string[] } {
  const def = byId.get(diagramType);
  const all = [...(def?.elements ?? []), ...COMMON.filter((c) => !(def?.elements ?? []).includes(c))];
  return {
    nodes: all.filter((t) => getElementDef(t).category === "node"),
    edges: all.filter((t) => getElementDef(t).category === "edge"),
  };
}

const QUICK_CONNECT: Record<string, string> = {
  "uml-class": "relationship",
  "uml-object": "relationship",
  "uml-usecase": "relationship",
  "uml-activity": "control-flow",
  "uml-statechart": "general-transition",
  "uml-sequence": "sequence-action",
  "uml-component": "relationship",
  "uml-deployment": "relationship",
  "uml-package": "dependency",
  "uml-communication": "communication-path",
  "uml-interaction-overview": "general-transition",
  "uml-composite-structure": "connector",
  "uml-profile": "dependency",
  "entity-relationship": "erd-relationship",
  "chen-entity-relationship": "erd-chen-participation",
  "entity-relationship-idef1x": "idef1x-relationship",
};

/** Connector created when dragging from a shape's quick-connect handle. */
export function defaultConnector(diagramType: string): string | undefined {
  return QUICK_CONNECT[diagramType] ?? toolboxFor(diagramType).edges[0];
}
