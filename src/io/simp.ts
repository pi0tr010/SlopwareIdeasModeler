// Reader and writer for .simp project files (sim-project version 10).
import { getElementDef } from "../model/registry";
import { newMemberId } from "../model/factory";
import { readNativeProps, writeNativeProps } from "./nativeProps";
import { templateItem } from "./simpTemplates";
import type {
  AggregationKind,
  Diagram,
  ErdAttribute,
  LineStyle,
  LinkView,
  ModelElement,
  Navigability,
  Point,
  Project,
  RoleEnd,
  ShapeView,
  UmlAttribute,
  UmlOperation,
  Visibility,
} from "../model/types";

const num = (v: string | null | undefined, d = 0) => {
  const n = parseFloat(v ?? "");
  return isFinite(n) ? n : d;
};
const bool = (v: string | null) => v === "true";
const children = (el: Element | null | undefined, tag: string) => (el ? Array.from(el.children).filter((c) => c.tagName === tag) : []);
const child = (el: Element | null | undefined, tag: string) => children(el, tag)[0];

function isInsideLayer(el: Element): boolean {
  for (let p = el.parentElement; p; p = p.parentElement) if (p.tagName === "layer") return true;
  return false;
}

// ---------------------------------------------------------------- import

export function parseSimp(xml: string): Project {
  const doc = new DOMParser().parseFromString(xml.replace(/^\uFEFF/, ""), "application/xml");
  const err = doc.getElementsByTagName("parsererror")[0];
  if (err) throw new Error("Invalid XML: " + err.textContent?.slice(0, 200));
  const root = doc.documentElement;
  if (root.tagName !== "sim-project") throw new Error("Not a .simp project (missing <sim-project>)");

  const meta = child(root, "meta");
  const project: Project = {
    name: child(meta, "name")?.textContent ?? "Project",
    authors: child(meta, "authors")?.textContent?.trim() ?? "",
    description: child(meta, "description")?.textContent ?? "",
    elements: {},
    diagrams: [],
    counters: {},
  };

  const ser = new XMLSerializer();
  for (const item of Array.from(root.getElementsByTagName("item"))) {
    if (!item.hasAttribute("cid") || isInsideLayer(item)) continue;
    const el = readElement(item);
    el.raw = ser.serializeToString(item).replace(/ xmlns="[^"]*"/, "");
    project.elements[el.id] = el;
  }

  for (const c of Array.from(root.querySelectorAll("counters > entity-ids > counter"))) {
    const typeId = c.querySelector("item-type")?.getAttribute("type-id");
    const value = num(c.querySelector("value")?.textContent);
    if (typeId) project.counters[typeId] = Math.max(project.counters[typeId] ?? 0, value);
  }

  for (const d of Array.from(root.getElementsByTagName("diagram"))) {
    if (!d.hasAttribute("type") || !d.hasAttribute("id")) continue;
    project.diagrams.push(readDiagram(d, project, ser));
  }
  project.diagrams.sort((a, b) => num(a.attrs?.["order-index"]) - num(b.attrs?.["order-index"]));
  for (const v of project.diagrams.flatMap((d) => d.views)) {
    const el = project.elements[v.ref];
    const collapsed = v.itemAttrs?.collapsed;
    if (el && VIEW_PROPS.has(el.type) && collapsed !== undefined && el.props?.collapsed === undefined) el.props = { ...el.props, collapsed };
  }
  return project;
}

/** Types whose `collapsed` prop is stored on their diagram items. */
const VIEW_PROPS = new Set(["bpmn-sub-process"]);

function readStereotypes(item: Element): string[] | undefined {
  const list = children(child(item, "stereotypes"), "stereotype").map((s) => s.getAttribute("name") ?? "").filter(Boolean);
  return list.length ? list : undefined;
}

function readRole(r: Element | undefined): RoleEnd {
  return {
    name: r?.getAttribute("name") ?? "",
    multiplicity: r?.getAttribute("multiplicity") ?? "",
    navigability: (r?.getAttribute("navigability") ?? "") as Navigability,
    aggregation: (r?.getAttribute("association-type") || "association") as AggregationKind,
  };
}

function readElement(item: Element): ModelElement {
  const type = item.getAttribute("type") ?? "unknown";
  const el: ModelElement = {
    id: item.getAttribute("id") ?? "",
    cid: item.getAttribute("cid") ?? "",
    type,
    name: item.getAttribute("name") ?? "",
    visibility: item.getAttribute("visibility") ?? undefined,
  };
  if (item.getAttribute("from")) el.from = item.getAttribute("from")!;
  if (item.getAttribute("to")) el.to = item.getAttribute("to")!;
  if (bool(item.getAttribute("is-abstract"))) el.isAbstract = true;
  const st = readStereotypes(item);
  if (st) el.stereotypes = st;
  const doc = child(item, "documentation") ?? child(item, "description");
  if (doc?.textContent) el.documentation = doc.textContent;

  const attrs = child(item, "attributes");
  if (attrs) {
    const list = children(attrs, "attribute");
    if (type === "erd-entity" || type === "idef1x-entity" || list.some((a) => a.hasAttribute("primary-key"))) {
      el.erdAttributes = list.map(readErdAttribute);
    } else {
      el.attributes = list.map(readUmlAttribute);
    }
  }
  const ops = child(item, "operations");
  if (ops) el.operations = children(ops, "operation").map(readOperation);
  const lits = child(item, "enumeration-items");
  if (lits) el.literals = children(lits, "enumeration-item").map((l) => ({ id: l.getAttribute("id") ?? newMemberId(), name: l.getAttribute("name") ?? "" }));

  const relation = child(item, "relation");
  if (relation && type === "relationship") {
    el.start = readRole(child(relation, "start-role"));
    el.end = readRole(child(relation, "end-role"));
  }
  const erd = child(item, "erd-relation");
  if (erd) {
    el.erd = {
      kind: erd.getAttribute("type") === "Identifying" ? "Identifying" : "NonIdentifying",
      multiplicityFrom: erd.getAttribute("multiplicity-from") ?? "1",
      multiplicityTo: erd.getAttribute("multiplicity-to") ?? "0..*",
      pairs: Array.from(erd.querySelectorAll("attribute-pair")).map((p) => ({ from: p.getAttribute("from-attribute") ?? "", to: p.getAttribute("to-attribute") ?? "" })),
    };
  }
  const transition = child(item, "transition");
  if (transition) {
    el.guard = transition.getAttribute("guard") ?? "";
    const effect = transition.getAttribute("behaviourExpression");
    if (effect) el.props = { ...el.props, effect };
  }
  const seq = child(item, "sequence-action");
  if (seq) {
    el.props = {
      ...el.props,
      messageType: seq.getAttribute("type") ?? "call",
      message: seq.getAttribute("message") ?? "",
      async: seq.getAttribute("is-asynchronous") ?? "false",
      returnValue: seq.getAttribute("return-value") ?? "",
    };
    el.from = seq.getAttribute("from") ?? el.from;
    el.to = seq.getAttribute("to") ?? el.to;
  }
  const lifeline = child(item, "lifeline") ?? child(item, "object");
  if (lifeline) {
    el.props = { ...el.props, classifierName: lifeline.getAttribute("classifier-name") ?? "", classifierRef: lifeline.getAttribute("classifier-ref") ?? "" };
    if (type === "object") {
      el.attributes = children(child(lifeline, "attributes"), "attribute").map((a) => ({
        id: a.getAttribute("ref") ?? newMemberId(),
        name: a.getAttribute("name") ?? "",
        type: "",
        visibility: "public",
        defaultValue: a.getAttribute("value") ?? "",
      }));
    }
  }
  const comment = child(item, "comment");
  if (comment && type === "comment") el.props = { ...el.props, text: comment.textContent ?? "" };
  const fragment = child(item, "fragment");
  if (fragment) el.props = { ...el.props, operator: fragment.getAttribute("operator") ?? "alt" };
  if (item.getAttribute("owner")) el.props = { ...el.props, owner: item.getAttribute("owner")! };
  if (type === "interaction-operand") {
    const g = child(item, "interaction-operand")?.getAttribute("guard");
    if (g) el.guard = g;
  }
  const native = readNativeProps(item, type);
  if (type === "sysml-requirement") native.reqId = el.cid;
  if (Object.keys(native).length) el.props = { ...el.props, ...native };
  return el;
}

function readUmlAttribute(a: Element): UmlAttribute {
  return {
    id: a.getAttribute("id") ?? a.getAttribute("uid") ?? newMemberId(),
    name: a.getAttribute("name") ?? "",
    type: a.getAttribute("type") ?? "",
    visibility: (a.getAttribute("visibility") ?? "private") as Visibility,
    isStatic: bool(a.getAttribute("static")) || undefined,
    isId: bool(a.getAttribute("is-id")) || undefined,
    defaultValue: a.getAttribute("default-value") || undefined,
    multiplicity: a.getAttribute("multiplicity") || undefined,
  };
}

function readErdAttribute(a: Element): ErdAttribute {
  return {
    id: a.getAttribute("uid") ?? a.getAttribute("id") ?? newMemberId(),
    name: a.getAttribute("name") ?? "",
    type: a.getAttribute("type") ?? "",
    size: a.getAttribute("type-size") ?? "",
    primaryKey: bool(a.getAttribute("primary-key")),
    foreignKey: bool(a.getAttribute("foreign-key")),
    nullable: bool(a.getAttribute("nullable")),
    unique: bool(a.getAttribute("unique")) || undefined,
    autoIncrement: bool(a.getAttribute("auto-increment")),
    defaultValue: a.getAttribute("default-value") ?? "",
    description: a.getAttribute("description") ?? "",
  };
}

function readOperation(o: Element): UmlOperation {
  return {
    id: o.getAttribute("id") ?? newMemberId(),
    name: o.getAttribute("name") ?? "",
    returnType: o.getAttribute("type") ?? "",
    visibility: (o.getAttribute("visibility") ?? "public") as Visibility,
    isStatic: bool(o.getAttribute("static")) || undefined,
    isAbstract: bool(o.getAttribute("abstract")) || undefined,
    parameters: children(child(o, "parameters"), "parameter").map((p) => ({
      name: p.getAttribute("name") ?? "",
      type: p.getAttribute("type") ?? "",
      direction: (p.getAttribute("direction") || undefined) as UmlOperation["parameters"][number]["direction"],
      defaultValue: p.getAttribute("default-value") || undefined,
    })),
  };
}

const LAYOUT_OWN = new Set(["ax", "ay", "awidth", "aheight", "x", "y", "width", "height", "container-layout"]);
const LINK_LAYOUT_OWN = new Set([
  "line-style",
  "lock-start-point",
  "lock-end-point",
  "lock-to-fields",
  "auto-path",
  "x1",
  "y1",
  "x2",
  "y2",
  "start-border-pos",
  "end-border-pos",
]);
const VIEW_SKIP = new Set(["layout", "relation", "sequence-action", "points"]);
const ITEM_OWN = new Set(["id", "iid", "creation-date", "order-index", "type", "container", "container-iid"]);

function itemAttrsOf(it: Element): Record<string, string> | undefined {
  const extra = Array.from(it.attributes).filter((a) => !ITEM_OWN.has(a.name));
  return extra.length ? Object.fromEntries(extra.map((a) => [a.name, a.value])) : undefined;
}

function readDiagram(d: Element, project: Project, ser: XMLSerializer): Diagram {
  const attrs: Record<string, string> = {};
  for (const a of Array.from(d.attributes)) if (!["type", "id", "name"].includes(a.name)) attrs[a.name] = a.value;
  const diagram: Diagram = { id: d.getAttribute("id")!, type: d.getAttribute("type")!, name: d.getAttribute("name") ?? "", views: [], attrs };
  const items = children(d, "layer").flatMap((l) => children(l, "item"));
  const fullPoints = new Map<LinkView, Point[]>();
  const iidByRef = new Map<string, string>();
  for (const it of items) if (it.getAttribute("id") && it.getAttribute("iid")) iidByRef.set(it.getAttribute("id")!, it.getAttribute("iid")!);

  for (const it of items) {
    const ref = it.getAttribute("id") ?? "";
    const iid = it.getAttribute("iid") ?? "";
    const kind = it.getAttribute("type") ?? "entity";
    const layout = child(it, "layout");
    if (!project.elements[ref]) continue;
    if (kind === "sequence-action" || child(it, "relation")) {
      const rel = child(it, "relation") ?? child(it, "sequence-action");
      let fromIid = rel?.getAttribute("from-iid") ?? "";
      let toIid = rel?.getAttribute("to-iid") ?? "";
      if (!fromIid) fromIid = iidByRef.get(rel?.getAttribute("from") ?? project.elements[ref].from ?? "") ?? "";
      if (!toIid) toIid = iidByRef.get(rel?.getAttribute("to") ?? project.elements[ref].to ?? "") ?? "";
      const all: Point[] = children(child(layout, "points"), "point").map((p) => ({ x: num(p.getAttribute("x")), y: num(p.getAttribute("y")) }));
      let points: Point[];
      if (kind === "sequence-action") {
        points = [
          { x: num(layout?.getAttribute("x1")), y: num(layout?.getAttribute("y1")) },
          { x: num(layout?.getAttribute("x2")), y: num(layout?.getAttribute("y2")) },
        ];
      } else {
        points = all.slice(1, -1);
      }
      const view: LinkView = {
        kind: "relation",
        iid,
        ref,
        fromIid,
        toIid,
        points,
        lineStyle: (layout?.getAttribute("line-style") || "oblique") as LineStyle,
        itemType: kind,
      };
      if (rel?.getAttribute("from-field")) view.fromField = rel.getAttribute("from-field")!;
      if (rel?.getAttribute("to-field")) view.toField = rel.getAttribute("to-field")!;
      if (layout?.getAttribute("lock-to-fields") === "true") view.lockToFields = true;
      const extra = Array.from(layout?.attributes ?? []).filter((a) => !LINK_LAYOUT_OWN.has(a.name));
      if (extra.length && kind !== "sequence-action") view.layoutExtra = Object.fromEntries(extra.map((a) => [a.name, a.value]));
      const itemAttrs = itemAttrsOf(it);
      if (itemAttrs) view.itemAttrs = itemAttrs;
      if (fromIid && toIid) diagram.views.push(view);
      if (kind !== "sequence-action" && all.length >= 2) fullPoints.set(view, all);
    } else {
      const inner = Array.from(it.children)
        .filter((c) => !VIEW_SKIP.has(c.tagName))
        .map((c) => ser.serializeToString(c).replace(/ xmlns="[^"]*"/, ""))
        .join("");
      const view: ShapeView = {
        kind: "entity",
        iid,
        ref,
        x: num(layout?.getAttribute("x")),
        y: num(layout?.getAttribute("y")),
        width: num(layout?.getAttribute("width"), 100) || getElementDef(project.elements[ref].type).width,
        height: num(layout?.getAttribute("height"), 60) || getElementDef(project.elements[ref].type).height,
        itemType: kind,
      };
      if (it.getAttribute("container-iid")) view.container = it.getAttribute("container-iid")!;
      if (inner) view.rawInner = inner;
      const extra = Array.from(layout?.attributes ?? []).filter((a) => !LAYOUT_OWN.has(a.name));
      if (extra.length) view.layoutExtra = Object.fromEntries(extra.map((a) => [a.name, a.value]));
      const itemAttrs = itemAttrsOf(it);
      if (itemAttrs) view.itemAttrs = itemAttrs;
      diagram.views.push(view);
    }
  }

  const shapes = new Map(diagram.views.filter((v): v is ShapeView => v.kind === "entity").map((v) => [v.iid, v]));
  const relative = (p: Point, s?: ShapeView): Point | undefined => {
    if (!s || s.width <= 0 || s.height <= 0) return undefined;
    const fx = (p.x - s.x) / s.width;
    const fy = (p.y - s.y) / s.height;
    // Only keep points placed on (or very near) the shape border.
    return fx > -0.05 && fx < 1.05 && fy > -0.05 && fy < 1.05 ? { x: Math.round(fx * 1e4) / 1e4, y: Math.round(fy * 1e4) / 1e4 } : undefined;
  };
  for (const [view, all] of fullPoints) {
    if (view.lockToFields) continue;
    view.startAnchor = relative(all[0], shapes.get(view.fromIid));
    view.endAnchor = relative(all[all.length - 1], shapes.get(view.toIid));
  }
  return diagram;
}

// ---------------------------------------------------------------- export

const esc = (s: string | number | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const DATE = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** Element types whose XML we always regenerate from the model. */
const REGENERATED = new Set([
  "class",
  "data-type",
  "signal",
  "uml-interface-classifier",
  "enumeration",
  "erd-entity",
  "erd-relationship",
  "relationship",
  "actor",
  "use-case",
  "comment",
  "state",
  "general-transition",
  "transition",
  "control-flow",
  "object-flow",
  "sequence-action",
  "lifeline",
  "fragment",
  "object",
]);

/** Updates the editable parts of an element kept as raw XML (read from a file or made from its type template). */
function patchRaw(el: ModelElement, raw: string): string {
  const doc = new DOMParser().parseFromString(raw, "application/xml");
  const item = doc.documentElement;
  if (item.tagName !== "item") return raw;
  item.setAttribute("name", el.name);
  const cid = el.type === "sysml-requirement" && el.props?.reqId ? el.props.reqId : el.cid;
  if (cid) item.setAttribute("cid", cid);
  for (const end of ["from", "to"] as const) {
    if (el[end]) item.setAttribute(end, el[end]!);
  }
  const replaceChild = (tag: string, xml: string) => {
    const old = child(item, tag);
    const fresh = xml ? new DOMParser().parseFromString(xml, "application/xml").documentElement : null;
    if (old && fresh) item.replaceChild(doc.importNode(fresh, true), old);
    else if (old) item.removeChild(old);
    else if (fresh) item.insertBefore(doc.importNode(fresh, true), item.firstChild);
  };
  const stereotypes = el.stereotypes ?? [];
  replaceChild("stereotypes", stereotypes.length ? `<stereotypes>${stereotypes.map((s) => `<stereotype name="${esc(s)}" />`).join("")}</stereotypes>` : "");
  const instances = child(item, "stereotype-instances");
  if (instances) {
    for (const s of children(instances, "stereotype")) if (!stereotypes.includes(s.getAttribute("type") ?? "")) instances.removeChild(s);
    if (!instances.children.length) item.removeChild(instances);
  }
  if (child(item, "documentation") || el.documentation) replaceChild("documentation", el.documentation ? `<documentation>${esc(el.documentation)}</documentation>` : "");
  writeNativeProps(item, el.type, el.props);
  return new XMLSerializer().serializeToString(item).replace(/ xmlns="[^"]*"/, "");
}

/** Timing frame id to the lifelines nested in it on any diagram; the frame owns them in the file. */
function timingLifelines(project: Project): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const d of project.diagrams) {
    const byIid = new Map(d.views.map((v) => [v.iid, v]));
    for (const v of d.views) {
      if (v.kind !== "entity" || !v.container || project.elements[v.ref]?.type !== "timing-lifeline") continue;
      const frame = byIid.get(v.container);
      if (!frame || project.elements[frame.ref]?.type !== "timing-frame") continue;
      const list = map.get(frame.ref) ?? [];
      if (!list.includes(v.ref)) list.push(v.ref);
      map.set(frame.ref, list);
    }
  }
  return map;
}

function withLifelines(xml: string, lifelines: string[] | undefined): string {
  if (!lifelines) return xml;
  const refs = `<lifelines>${lifelines.map((id) => `<lifeline ref="${esc(id)}" />`).join("")}</lifelines>`;
  return xml.replace(/<lifelines\s*\/>|<lifelines>[\s\S]*?<\/lifelines>/, refs);
}

function writeElement(el: ModelElement, now: string): string {
  if (!REGENERATED.has(el.type)) return patchRaw(el, el.raw ?? templateItem(el.type, el.id, el.cid, now));
  const a: string[] = [
    `id="${esc(el.id)}"`,
    `cid="${esc(el.cid)}"`,
    `type="${esc(el.type)}"`,
    `name="${esc(el.name)}"`,
    `style-class=""`,
    `visibility="${esc(el.visibility ?? "package")}"`,
  ];
  if (el.isAbstract) a.push(`is-abstract="true"`);
  if (el.props?.owner) a.push(`owner="${esc(el.props.owner)}"`);
  a.push(`creation-date="${now}"`);
  if (el.from && el.type !== "sequence-action") a.push(`from="${esc(el.from)}"`);
  if (el.to && el.type !== "sequence-action") a.push(`to="${esc(el.to)}"`);
  const body: string[] = [];
  if (el.stereotypes?.length) body.push(`<stereotypes>${el.stereotypes.map((s) => `<stereotype name="${esc(s)}" />`).join("")}</stereotypes>`);
  body.push(`<style class="default" />`);
  if (el.documentation) body.push(`<documentation>${esc(el.documentation)}</documentation>`);

  switch (el.type) {
    case "use-case":
      body.push(`<use-case><stakeholders /></use-case>`);
      break;
    case "comment":
      body.push(`<comment>${esc(el.props?.text ?? "")}</comment>`);
      break;
    case "state":
      body.push(`<state-invariant /><actions />`);
      break;
    case "general-transition":
    case "transition":
    case "control-flow":
    case "object-flow":
      body.push(`<transition guard="${esc(el.guard)}" behaviourExpression="${esc(el.props?.effect)}" />`);
      break;
    case "relationship": {
      const role = (tag: string, r?: RoleEnd) =>
        `<${tag} id="" name="${esc(r?.name)}" multiplicity="${esc(r?.multiplicity)}" navigability="${esc(r?.navigability)}" association-type="${esc(r?.aggregation ?? "association")}" visibility="private" />`;
      body.push(`<relation from="${esc(el.from)}" to="${esc(el.to)}">${role("start-role", el.start)}${role("end-role", el.end)}</relation>`);
      break;
    }
    case "erd-relationship":
      body.push(
        `<erd-relation type="${el.erd?.kind ?? "NonIdentifying"}" multiplicity-from="${esc(el.erd?.multiplicityFrom)}" multiplicity-to="${esc(el.erd?.multiplicityTo)}"><attribute-pairs>${(el.erd?.pairs ?? [])
          .map((p) => `<attribute-pair from-attribute="${esc(p.from)}" to-attribute="${esc(p.to)}" />`)
          .join("")}</attribute-pairs></erd-relation>`,
      );
      break;
    case "erd-entity":
      body.push(`<entity description="" />`);
      body.push(
        `<attributes>${(el.erdAttributes ?? [])
          .map(
            (x, i) =>
              `<attribute uid="${esc(x.id)}" cid="ELEM${String(i + 1).padStart(3, "0")}" name="${esc(x.name)}" type="${esc(x.type)}" type-id="${esc(x.type)}" type-size="${esc(x.size)}" foreign-key="${x.foreignKey}" primary-key="${x.primaryKey}" nullable="${x.nullable}" description="${esc(x.description)}" default-value="${esc(x.defaultValue)}" auto-increment="${x.autoIncrement}"><style class="default" /></attribute>`,
          )
          .join("")}</attributes><indexes />`,
      );
      break;
    case "sequence-action":
      body.push(
        `<sequence-action type="${esc(el.props?.messageType ?? "call")}" message="${esc(el.props?.message)}" is-asynchronous="${el.props?.async === "true"}" from="${esc(el.from)}" to="${esc(el.to)}" return-value="${esc(el.props?.returnValue)}" assign-to-variable=""><parameters /></sequence-action>`,
      );
      break;
    case "lifeline":
      body.push(`<lifeline classifier-name="${esc(el.props?.classifierName)}" classifier-ref="${esc(el.props?.classifierRef)}" is-active="false" is-multi-object="false" />`);
      break;
    case "object":
      body.push(
        `<object classifier-name="${esc(el.props?.classifierName)}" classifier-ref="${esc(el.props?.classifierRef)}"><attributes>${(el.attributes ?? [])
          .map((x) => `<attribute ref="${esc(x.id)}" name="${esc(x.name)}" value="${esc(x.defaultValue)}" />`)
          .join("")}</attributes></object>`,
      );
      break;
    case "fragment":
      body.push(`<fragment operator="${esc(el.props?.operator ?? "alt")}"><operands /></fragment>`);
      break;
    case "enumeration":
      body.push(`<enumeration-items>${(el.literals ?? []).map((l) => `<enumeration-item id="${esc(l.id)}" name="${esc(l.name)}"><style class="default" /></enumeration-item>`).join("")}</enumeration-items>`);
      if (el.operations?.length) body.push(operationsXml(el.operations));
      break;
    case "class":
    case "data-type":
    case "signal":
    case "uml-interface-classifier":
      body.push(
        `<attributes>${(el.attributes ?? [])
          .map(
            (x) =>
              `<attribute id="${esc(x.id)}" name="${esc(x.name)}" type="${esc(x.type)}" type-id="${esc(umlTypeId(x.type))}" visibility="${esc(x.visibility)}"${x.isStatic ? ' static="true"' : ""}${x.isId ? ' is-id="true"' : ""}${x.defaultValue ? ` default-value="${esc(x.defaultValue)}"` : ""}${x.multiplicity ? ` multiplicity="${esc(x.multiplicity)}"` : ""}><style class="default" /></attribute>`,
          )
          .join("")}</attributes>`,
      );
      body.push(operationsXml(el.operations ?? []));
      break;
  }
  return `<item ${a.join(" ")}>${body.join("")}</item>`;
}

const UML_TYPES = new Set(["Integer", "String", "Boolean", "Real", "UnlimitedNatural", "DateTime", "Date", "Time", "Float", "Double", "Byte", "Char", "Long", "Short", "Decimal"]);
const umlTypeId = (t: string) => (UML_TYPES.has(t) ? `Uml.${t}` : t);

function operationsXml(ops: UmlOperation[]): string {
  return `<operations>${ops
    .map(
      (o) =>
        `<operation id="${esc(o.id)}" name="${esc(o.name)}" type="${esc(o.returnType)}" type-id="${esc(umlTypeId(o.returnType))}" visibility="${esc(o.visibility)}" abstract="${!!o.isAbstract}" virtual="false" static="${!!o.isStatic}"><parameters>${o.parameters
          .map((p) => `<parameter name="${esc(p.name)}" type="${esc(p.type)}" type-id="${esc(umlTypeId(p.type))}" direction="${esc(p.direction ?? "in")}" default-value="${esc(p.defaultValue)}" />`)
          .join("")}</parameters><source-codes /></operation>`,
    )
    .join("")}</operations>`;
}

function fullPoints(view: LinkView, resolved?: Point[]): Point[] {
  return resolved && resolved.length >= 2 ? resolved : view.points;
}

/**
 * Serialises the project. `routes` maps link iids to their drawn polyline so that the file
 * contains end points on shape borders, like files saved by the original application.
 */
export function writeSimp(project: Project, routes: Map<string, Point[]> = new Map()): string {
  const now = DATE();
  const out: string[] = [];
  out.push(`<?xml version="1.0" encoding="utf-8" standalone="yes"?>`);
  out.push(`<sim-project version="10" multi-file="no">`);
  out.push(`<meta><name>${esc(project.name)}</name><authors>${esc(project.authors)}</authors><description>${esc(project.description)}</description></meta>`);
  out.push(`<counters models="1" />`);
  out.push(`<alias-groups /><management><persons /><tasks /><requirements /><issues /><to-dos /></management><glossary />`);
  out.push(`<types><type-sets><type-set file="UmlTypes.xml" /></type-sets><custom-types /></types><filters /><macros />`);
  out.push(`<items>`);
  const lifelines = timingLifelines(project);
  for (const el of Object.values(project.elements)) out.push(withLifelines(writeElement(el, now), lifelines.get(el.id)));
  out.push(`</items>`);
  out.push(`<models><model id="model_${Date.now()}" name="${esc(project.name)}" namespace="" order-index="1" expanded="true">`);
  out.push(`<meta><authors><author>${esc(project.authors)}</author></authors><description /><creation-date>${now}</creation-date><change-date>${now}</change-date><revision-count>0</revision-count><version /></meta><abstract-items /><sub-models />`);
  project.diagrams.forEach((d, index) => out.push(writeDiagram(d, project, index, now, routes)));
  out.push(`</model></models><documents /><document-templates />`);
  out.push(`</sim-project>`);
  return out.join("\n");
}

const DEFAULT_DIAGRAM_ATTRS: Record<string, string> = {
  "show-id": "false",
  "show-name": "true",
  "show-parent-name": "false",
  "show-stereotypes": "true",
  "show-tagged-values": "false",
  "show-template-parameters": "true",
  "show-fields": "true",
  "show-empty-compartments": "true",
  "show-special-indicators": "false",
  "show-attributes": "true",
  "show-attribute-visibility": "true",
  "show-operations": "true",
  "show-operation-parameters": "true",
  "show-operation-visibility": "true",
  "show-nullability": "true",
  "show-sequence-number": "false",
  "show-extension-points": "false",
  "show-relationship-texts": "true",
  "show-description": "false",
  "show-field-description": "false",
  "auto-routed-paths": "false",
};

function writeDiagram(d: Diagram, project: Project, index: number, now: string, routes: Map<string, Point[]>): string {
  const attrs = { ...DEFAULT_DIAGRAM_ATTRS, ...d.attrs, "order-index": String(index + 1) };
  const attrText = Object.entries(attrs)
    .map(([k, v]) => `${k}="${esc(v)}"`)
    .join(" ");
  const views = d.views.filter((v) => project.elements[v.ref]);
  const shapeByIid = new Map(views.filter((v): v is ShapeView => v.kind === "entity").map((v) => [v.iid, v]));
  const items = views.map((v, i) => {
    const el = project.elements[v.ref];
    const itemAttrs = { ...v.itemAttrs };
    if (VIEW_PROPS.has(el.type) && el.props?.collapsed !== undefined) itemAttrs.collapsed = el.props.collapsed;
    const extraAttrs = Object.entries(itemAttrs)
      .map(([k, val]) => ` ${k}="${esc(val)}"`)
      .join("");
    const common = `id="${esc(v.ref)}" iid="${esc(v.iid)}"${extraAttrs} creation-date="${now}" order-index="${i}"`;
    if (v.kind === "entity") {
      const container = v.container ? shapeByIid.get(v.container) : undefined;
      const cAttr = container ? ` container="${esc(container.ref)}" container-iid="${esc(container.iid)}"` : "";
      const box = { ax: v.x, ay: v.y, awidth: v.width, aheight: v.height, x: v.x, y: v.y, width: v.width, height: v.height };
      const layoutAttrs = { ...v.layoutExtra, ...(v.itemType === "lifeline" ? { "container-layout": "simple" } : {}), ...box };
      const layout = `<layout${Object.entries(layoutAttrs)
        .map(([k, val]) => ` ${k}="${esc(val)}"`)
        .join("")} />`;
      return `<item ${common}${cAttr} type="${esc(v.itemType ?? "entity")}">${layout}${v.rawInner ?? ""}</item>`;
    }
    const pts = fullPoints(v, routes.get(v.iid));
    const from = shapeByIid.get(v.fromIid);
    const to = shapeByIid.get(v.toIid);
    if (v.itemType === "sequence-action") {
      const [p1, p2] = [pts[0], pts[pts.length - 1]];
      const x = Math.min(p1.x, p2.x);
      return `<item ${common} type="sequence-action"><layout x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" ax="${x}" ay="${p1.y - 15}" awidth="${Math.abs(p2.x - p1.x)}" aheight="20" x="${x}" y="${p1.y - 15}" width="${Math.abs(p2.x - p1.x)}" height="20" message-x="0" message-y="-10" /><sequence-action from="${esc(from?.ref)}" to="${esc(to?.ref)}" show-sequence-number="false" /></item>`;
    }
    const first = pts[0] ?? { x: 0, y: 0 };
    const last = pts[pts.length - 1] ?? first;
    const layoutAttrs: Record<string, string> = {
      "start-role-position": "25,15",
      "end-role-position": "25,-15",
      "start-multiplicity-position": "25,-15",
      "end-multiplicity-position": "25,15",
      ...v.layoutExtra,
      "line-style": v.lineStyle,
      "lock-start-point": String(!!v.startAnchor),
      "lock-end-point": String(!!v.endAnchor),
      "lock-to-fields": String(!!v.lockToFields),
      "auto-path": "",
      x1: String(round(first.x)),
      y1: String(round(first.y)),
      x2: String(round(last.x)),
      y2: String(round(last.y)),
    };
    layoutAttrs["name-position"] ??= "0,0";
    const layoutText = Object.entries(layoutAttrs)
      .map(([k, val]) => `${k}="${esc(val)}"`)
      .join(" ");
    return `<item ${common} type="${esc(v.itemType ?? "relation")}"><layout ${layoutText}><points>${pts
      .map((p) => `<point x="${round(p.x)}" y="${round(p.y)}" />`)
      .join("")}</points></layout><relation from="${esc(from?.ref)}" from-iid="${esc(v.fromIid)}"${v.fromField ? ` from-field="${esc(v.fromField)}"` : ""} to="${esc(to?.ref)}" to-iid="${esc(v.toIid)}"${v.toField ? ` to-field="${esc(v.toField)}"` : ""} /></item>`;
  });
  return `<diagram type="${esc(d.type)}" id="${esc(d.id)}" name="${esc(d.name)}" ${attrText}><style><background-color index="1" color="#FFFFFFFF" /><background-color index="2" color="#FFFFFFFF" /><background-type type="solid" /></style><meta><authors><author>${esc(project.authors)}</author></authors><description /><creation-date>${now}</creation-date><change-date>${now}</change-date><revision-count>0</revision-count><version /></meta><abstract-items /><layer name="Default" visible="true" enabled="true" locked="false">${items.join("")}</layer></diagram>`;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
