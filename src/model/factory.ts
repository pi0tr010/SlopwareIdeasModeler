import catalog from "../catalog/catalog.json";
import { readNativeProps } from "../io/nativeProps";
import { templateItem, templateView } from "../io/simpTemplates";
import { getElementDef } from "./registry";
import type { Diagram, LinkView, ModelElement, Project, ShapeView } from "./types";

const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");

export const newElementId = () => "di" + (1 + Math.floor(Math.random() * 9)) + digits(17);
export const newIid = () => hex(32);
export const newMemberId = () => "a" + hex(36);
export const newDiagramId = () => "p" + hex(32) + "_" + digits(9);

const enNames = (catalog as { elements: Record<string, { name: { en: string } }> }).elements;

/** English element type name; language independent so files and exports look the same everywhere. */
export const englishTypeName = (type: string): string => enNames[type]?.name.en ?? type;

export function emptyProject(name = "New Project"): Project {
  return { name, authors: "", description: "", elements: {}, diagrams: [], counters: {} };
}

const typeDefaults = new Map<string, Pick<ModelElement, "stereotypes" | "props">>();

/** Stereotypes and properties a new element of `type` gets in the original application. */
function defaultsOf(type: string): Pick<ModelElement, "stereotypes" | "props"> {
  let d = typeDefaults.get(type);
  if (!d) {
    d = {};
    const item = new DOMParser().parseFromString(templateItem(type, "x", "", ""), "application/xml").documentElement;
    const stereotypes = Array.from(item.querySelectorAll(":scope > stereotypes > stereotype"))
      .map((s) => s.getAttribute("name") ?? "")
      .filter(Boolean);
    if (stereotypes.length) d.stereotypes = stereotypes;
    const props = readNativeProps(item, type);
    if (Object.keys(props).length) d.props = props;
    typeDefaults.set(type, d);
  }
  return d;
}

function nextCounter(project: Project, key: string): number {
  const n = (project.counters[key] ?? 0) + 1;
  project.counters[key] = n;
  return n;
}

/** Mutates the project: registers a new model element and returns it. */
export function createElement(project: Project, type: string, init: Partial<ModelElement> = {}): ModelElement {
  const def = getElementDef(type);
  const n = nextCounter(project, type);
  const baseName = (enNames[type]?.name.en ?? type).replace(/[^A-Za-z0-9]/g, "");
  const defaults = defaultsOf(type);
  const el: ModelElement = {
    id: newElementId(),
    cid: def.cidPrefix + String(n).padStart(3, "0"),
    type,
    name: def.category === "edge" ? "" : `${baseName}${n}`,
    visibility: "package",
    ...(defaults.stereotypes ? { stereotypes: [...defaults.stereotypes] } : {}),
    ...init,
  };
  if (defaults.props) el.props = { ...defaults.props, ...el.props };
  if (type === "sysml-requirement") el.props = { ...el.props, reqId: el.cid };
  if (type === "class" || type === "uml-interface-classifier" || type === "data-type" || type === "signal") {
    el.attributes ??= [];
    el.operations ??= [];
  }
  if (type === "uml-interface-classifier") el.attributes = [];
  if (type === "enumeration") el.literals ??= [];
  if (type === "erd-entity") el.erdAttributes ??= [];
  if (type === "relationship") {
    el.start ??= { name: "", multiplicity: "", navigability: "", aggregation: "association" };
    el.end ??= { name: "", multiplicity: "", navigability: "", aggregation: "association" };
  }
  if (type === "erd-relationship") el.erd ??= { kind: "NonIdentifying", multiplicityFrom: "1", multiplicityTo: "0..*", pairs: [] };
  if (type === "sequence-action") el.props = { messageType: "call", message: "", async: "false", ...el.props };
  if (type === "comment") el.props = { text: "", ...el.props };
  if (type === "fragment") el.props = { operator: "alt", ...el.props };
  project.elements[el.id] = el;
  return el;
}

export function cloneElement(project: Project, source: ModelElement): ModelElement {
  const def = getElementDef(source.type);
  const copy: ModelElement = structuredClone(source);
  copy.id = newElementId();
  copy.cid = def.cidPrefix + String(nextCounter(project, source.type)).padStart(3, "0");
  copy.attributes = copy.attributes?.map((a) => ({ ...a, id: newMemberId() }));
  copy.operations = copy.operations?.map((o) => ({ ...o, id: newMemberId() }));
  copy.literals = copy.literals?.map((l) => ({ ...l, id: newMemberId() }));
  copy.erdAttributes = copy.erdAttributes?.map((a) => ({ ...a, id: newMemberId() }));
  delete copy.raw;
  project.elements[copy.id] = copy;
  return copy;
}

const withoutEmpty = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** Link layout attributes taken from the type template; the rest is computed when saving. */
const LINK_TEMPLATE_LAYOUT = ["name-position", "start-role-position", "end-role-position", "start-multiplicity-position", "end-multiplicity-position"];
const pick = (o: Record<string, string>, keys: string[]) => {
  const out = Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
  return Object.keys(out).length ? out : undefined;
};

export function createShape(el: ModelElement, x: number, y: number): ShapeView {
  const def = getElementDef(el.type);
  const iid = newIid();
  const t = templateView(el.type, el.id, iid);
  return withoutEmpty({
    kind: "entity",
    iid,
    ref: el.id,
    x: Math.round(x),
    y: Math.round(y),
    width: def.width,
    height: def.height,
    itemType: t.itemType ?? (el.type === "lifeline" ? "lifeline" : "entity"),
    itemAttrs: t.itemAttrs,
    layoutExtra: t.layoutExtra,
    rawInner: t.rawInner,
  });
}

export function createLink(el: ModelElement, from: ShapeView, to: ShapeView): LinkView {
  const iid = newIid();
  const t = templateView(el.type, el.id, iid);
  const view: LinkView = withoutEmpty({
    kind: "relation",
    iid,
    ref: el.id,
    fromIid: from.iid,
    toIid: to.iid,
    points: [],
    lineStyle: el.type === "erd-relationship" ? "rounded-rectangular" : "oblique",
    itemType: el.type === "sequence-action" ? el.type : (t.itemType ?? "relation"),
    itemAttrs: t.itemAttrs,
    layoutExtra: t.layoutExtra && el.type !== "sequence-action" ? pick(t.layoutExtra, LINK_TEMPLATE_LAYOUT) : undefined,
  });
  if (el.type === "sequence-action") {
    const y = Math.round(Math.max(from.y, to.y) + 15);
    view.points = [
      { x: from.x + from.width, y },
      { x: to.x, y },
    ];
  }
  return view;
}

export function createDiagram(type: string, name: string): Diagram {
  return { id: newDiagramId(), type, name, views: [] };
}
