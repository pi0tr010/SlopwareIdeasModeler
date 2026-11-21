// UML 2.5 XMI export/import for the structural model (classes, interfaces, enumerations,
// associations, generalizations, actors, use cases). XMI carries no layout, so imported
// elements are placed on a new diagram that the caller can auto-layout.
import { createDiagram, createElement, createLink, createShape, emptyProject } from "../model/factory";
import type { AggregationKind, Diagram, ModelElement, Project, ShapeView, Visibility } from "../model/types";

const XMI_NS = "http://www.omg.org/spec/XMI/20131001";
const UML_NS = "http://www.omg.org/spec/UML/20161101";

const esc = (s: string | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const UML_KIND: Record<string, string> = {
  class: "uml:Class",
  "uml-interface-classifier": "uml:Interface",
  enumeration: "uml:Enumeration",
  "data-type": "uml:DataType",
  signal: "uml:Signal",
  actor: "uml:Actor",
  "use-case": "uml:UseCase",
  package: "uml:Package",
  component: "uml:Component",
  node: "uml:Node",
  artifact: "uml:Artifact",
};

const PRIMITIVES = new Set(["Integer", "String", "Boolean", "Real", "UnlimitedNatural"]);

function typeRef(type: string, byName: Map<string, string>): string {
  if (!type) return "";
  if (PRIMITIVES.has(type)) return `<type href="http://www.omg.org/spec/UML/20161101/PrimitiveTypes.xmi#${type}"/>`;
  const id = byName.get(type);
  return id ? `<type xmi:idref="${id}"/>` : "";
}

function multiplicity(m: string | undefined, owner: string): string {
  if (!m) return "";
  const [lo, hi] = m.includes("..") ? m.split("..") : [m, m];
  const lower = lo === "*" ? "0" : lo;
  return `<lowerValue xmi:type="uml:LiteralInteger" xmi:id="${owner}_lo" value="${esc(lower)}"/><upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="${owner}_hi" value="${esc(hi)}"/>`;
}

export function exportXmi(project: Project): string {
  const els = Object.values(project.elements);
  const byName = new Map(els.filter((e) => UML_KIND[e.type]).map((e) => [e.name, e.id]));
  const out: string[] = [];
  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(`<xmi:XMI xmlns:xmi="${XMI_NS}" xmlns:uml="${UML_NS}">`);
  out.push(`<uml:Model xmi:type="uml:Model" xmi:id="model" name="${esc(project.name)}">`);

  const generalizations = new Map<string, ModelElement[]>();
  const realizations = new Map<string, ModelElement[]>();
  for (const e of els) {
    if (e.type === "generalization" && e.from) generalizations.set(e.from, [...(generalizations.get(e.from) ?? []), e]);
    if ((e.type === "realization" || e.type === "interface-realization") && e.from) realizations.set(e.from, [...(realizations.get(e.from) ?? []), e]);
  }

  for (const e of els) {
    const kind = UML_KIND[e.type];
    if (!kind) continue;
    const abs = e.isAbstract ? ` isAbstract="true"` : "";
    out.push(`<packagedElement xmi:type="${kind}" xmi:id="${e.id}" name="${esc(e.name)}"${abs}>`);
    for (const a of e.attributes ?? [])
      out.push(
        `<ownedAttribute xmi:type="uml:Property" xmi:id="${a.id}" name="${esc(a.name)}" visibility="${a.visibility}"${a.isStatic ? ' isStatic="true"' : ""}>${typeRef(a.type, byName)}${multiplicity(a.multiplicity, a.id)}${
          a.defaultValue ? `<defaultValue xmi:type="uml:OpaqueExpression" xmi:id="${a.id}_def"><body>${esc(a.defaultValue)}</body></defaultValue>` : ""
        }</ownedAttribute>`,
      );
    for (const o of e.operations ?? []) {
      out.push(`<ownedOperation xmi:type="uml:Operation" xmi:id="${o.id}" name="${esc(o.name)}" visibility="${o.visibility}"${o.isStatic ? ' isStatic="true"' : ""}${o.isAbstract ? ' isAbstract="true"' : ""}>`);
      o.parameters.forEach((p, i) => out.push(`<ownedParameter xmi:type="uml:Parameter" xmi:id="${o.id}_p${i}" name="${esc(p.name)}" direction="${p.direction ?? "in"}">${typeRef(p.type, byName)}</ownedParameter>`));
      if (o.returnType) out.push(`<ownedParameter xmi:type="uml:Parameter" xmi:id="${o.id}_ret" direction="return">${typeRef(o.returnType, byName)}</ownedParameter>`);
      out.push(`</ownedOperation>`);
    }
    for (const l of e.literals ?? []) out.push(`<ownedLiteral xmi:type="uml:EnumerationLiteral" xmi:id="${l.id}" name="${esc(l.name)}"/>`);
    for (const g of generalizations.get(e.id) ?? []) if (g.to) out.push(`<generalization xmi:type="uml:Generalization" xmi:id="${g.id}" general="${g.to}"/>`);
    for (const r of realizations.get(e.id) ?? [])
      if (r.to) out.push(`<interfaceRealization xmi:type="uml:InterfaceRealization" xmi:id="${r.id}" client="${e.id}" supplier="${r.to}" contract="${r.to}"/>`);
    out.push(`</packagedElement>`);
  }

  for (const e of els) {
    if (e.type === "relationship" && e.from && e.to) {
      const end = (suffix: string, typeId: string, r = e.start) =>
        `<ownedEnd xmi:type="uml:Property" xmi:id="${e.id}_${suffix}" name="${esc(r?.name)}" type="${typeId}" association="${e.id}"${r?.aggregation && r.aggregation !== "association" ? ` aggregation="${r.aggregation === "composition" ? "composite" : "shared"}"` : ""}>${multiplicity(r?.multiplicity, `${e.id}_${suffix}`)}</ownedEnd>`;
      // UML puts the aggregation kind on the end typed by the part; .simp stores it on the role at the whole.
      out.push(
        `<packagedElement xmi:type="uml:Association" xmi:id="${e.id}" name="${esc(e.name)}" memberEnd="${e.id}_s ${e.id}_e">${end("s", e.to, { ...e.end!, aggregation: e.start?.aggregation ?? "association" })}${end("e", e.from, { ...e.start!, aggregation: e.end?.aggregation ?? "association" })}</packagedElement>`,
      );
    }
    if ((e.type === "dependency" || e.type === "usage") && e.from && e.to)
      out.push(`<packagedElement xmi:type="uml:${e.type === "usage" ? "Usage" : "Dependency"}" xmi:id="${e.id}" client="${e.from}" supplier="${e.to}"/>`);
    if ((e.type === "include" || e.type === "extend") && e.from && e.to)
      out.push(`<packagedElement xmi:type="uml:${e.type === "include" ? "Include" : "Extend"}" xmi:id="${e.id}" ${e.type === "include" ? `includingCase="${e.from}" addition="${e.to}"` : `extension="${e.from}" extendedCase="${e.to}"`}/>`);
  }
  out.push(`</uml:Model>`, `</xmi:XMI>`);
  return out.join("\n");
}

const KIND_TO_TYPE: Record<string, string> = Object.fromEntries(Object.entries(UML_KIND).map(([k, v]) => [v, k]));

const xmiAttr = (el: Element, name: string) => el.getAttribute(`xmi:${name}`) ?? el.getAttributeNS(XMI_NS, name) ?? el.getAttribute(name);

function readType(el: Element, names: Map<string, string>): string {
  const t = el.getAttribute("type");
  if (t) return names.get(t) ?? "";
  const child = Array.from(el.children).find((c) => c.localName === "type");
  if (!child) return "";
  const ref = xmiAttr(child, "idref");
  if (ref) return names.get(ref) ?? "";
  const href = child.getAttribute("href") ?? "";
  return href.split("#").pop() ?? "";
}

function readMultiplicity(el: Element): string {
  const lo = Array.from(el.children).find((c) => c.localName === "lowerValue")?.getAttribute("value");
  const hi = Array.from(el.children).find((c) => c.localName === "upperValue")?.getAttribute("value");
  if (lo == null && hi == null) return "";
  const l = lo ?? "0";
  const h = hi ?? "1";
  return l === h ? l : `${l}..${h}`;
}

export function importXmi(xml: string): Project {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror")[0]) throw new Error("Invalid XMI file");
  const model = Array.from(doc.getElementsByTagName("*")).find((e) => e.localName === "Model");
  const project = emptyProject(model?.getAttribute("name") ?? "Imported XMI");
  const packaged = Array.from(doc.getElementsByTagName("packagedElement"));
  const names = new Map<string, string>();
  for (const p of packaged) names.set(xmiAttr(p, "id") ?? "", p.getAttribute("name") ?? "");

  const idMap = new Map<string, string>();
  const classDiagram = createDiagram("uml-class", "Class Diagram");
  const useCaseDiagram = createDiagram("uml-usecase", "Use Case Diagram");
  const shapes = new Map<string, { view: ShapeView; diagram: Diagram }>();
  let ci = 0;
  let ui = 0;

  for (const p of packaged) {
    const type = KIND_TO_TYPE[xmiAttr(p, "type") ?? ""];
    if (!type || type === "package") continue;
    const el = createElement(project, type, { name: p.getAttribute("name") ?? "" });
    el.isAbstract = p.getAttribute("isAbstract") === "true" || undefined;
    idMap.set(xmiAttr(p, "id") ?? "", el.id);
    const kids = Array.from(p.children);
    const attrs = kids.filter((c) => c.localName === "ownedAttribute" && !c.getAttribute("association"));
    if (attrs.length)
      el.attributes = attrs.map((a) => ({
        id: xmiAttr(a, "id") ?? crypto.randomUUID(),
        name: a.getAttribute("name") ?? "",
        type: readType(a, names),
        visibility: (a.getAttribute("visibility") ?? "private") as Visibility,
        isStatic: a.getAttribute("isStatic") === "true" || undefined,
        multiplicity: readMultiplicity(a) || undefined,
      }));
    const ops = kids.filter((c) => c.localName === "ownedOperation");
    if (ops.length)
      el.operations = ops.map((o) => {
        const params = Array.from(o.children).filter((c) => c.localName === "ownedParameter");
        const ret = params.find((x) => x.getAttribute("direction") === "return");
        return {
          id: xmiAttr(o, "id") ?? crypto.randomUUID(),
          name: o.getAttribute("name") ?? "",
          visibility: (o.getAttribute("visibility") ?? "public") as Visibility,
          isStatic: o.getAttribute("isStatic") === "true" || undefined,
          isAbstract: o.getAttribute("isAbstract") === "true" || undefined,
          returnType: ret ? readType(ret, names) : "",
          parameters: params
            .filter((x) => x !== ret)
            .map((x) => ({ name: x.getAttribute("name") ?? "", type: readType(x, names), direction: (x.getAttribute("direction") ?? "in") as "in" })),
        };
      });
    const lits = kids.filter((c) => c.localName === "ownedLiteral");
    if (lits.length) el.literals = lits.map((l) => ({ id: xmiAttr(l, "id") ?? crypto.randomUUID(), name: l.getAttribute("name") ?? "" }));

    const isUseCase = type === "actor" || type === "use-case";
    const diagram = isUseCase ? useCaseDiagram : classDiagram;
    const i = isUseCase ? ui++ : ci++;
    const view = createShape(el, (i % 5) * 240, Math.floor(i / 5) * 220);
    diagram.views.push(view);
    shapes.set(el.id, { view, diagram });
  }

  const link = (type: string, from?: string | null, to?: string | null, init: Partial<ModelElement> = {}) => {
    const a = from ? idMap.get(from) : undefined;
    const b = to ? idMap.get(to) : undefined;
    if (!a || !b) return;
    const el = createElement(project, type, { from: a, to: b, ...init });
    const sa = shapes.get(a);
    const sb = shapes.get(b);
    if (sa && sb && sa.diagram === sb.diagram) sa.diagram.views.push(createLink(el, sa.view, sb.view));
  };

  for (const p of packaged) {
    const pid = xmiAttr(p, "id");
    for (const g of Array.from(p.children).filter((c) => c.localName === "generalization")) link("generalization", pid, g.getAttribute("general"));
    for (const r of Array.from(p.children).filter((c) => c.localName === "interfaceRealization")) link("interface-realization", pid, r.getAttribute("supplier") ?? r.getAttribute("contract"));
    const kind = xmiAttr(p, "type");
    if (kind === "uml:Association") {
      const ends = Array.from(p.children).filter((c) => c.localName === "ownedEnd");
      const memberEnds = (p.getAttribute("memberEnd") ?? "").split(/\s+/).filter(Boolean);
      const resolveEnd = (id: string) => Array.from(doc.getElementsByTagName("*")).find((e) => xmiAttr(e, "id") === id);
      const allEnds = ends.length >= 2 ? ends : memberEnds.map(resolveEnd).filter((e): e is Element => !!e);
      if (allEnds.length >= 2) {
        const [e1, e2] = allEnds;
        const agg = (e: Element): AggregationKind => (e.getAttribute("aggregation") === "composite" ? "composition" : e.getAttribute("aggregation") === "shared" ? "aggregation" : "association");
        // e1 is typed by the "to" end, e2 by the "from" end (see exportXmi).
        link("relationship", e2.getAttribute("type"), e1.getAttribute("type"), {
          name: p.getAttribute("name") ?? "",
          start: { name: e2.getAttribute("name") ?? "", multiplicity: readMultiplicity(e2), navigability: "", aggregation: agg(e1) },
          end: { name: e1.getAttribute("name") ?? "", multiplicity: readMultiplicity(e1), navigability: "", aggregation: agg(e2) },
        });
      }
    }
    if (kind === "uml:Dependency" || kind === "uml:Usage") link(kind === "uml:Usage" ? "usage" : "dependency", p.getAttribute("client"), p.getAttribute("supplier"));
    if (kind === "uml:Include") link("include", p.getAttribute("includingCase"), p.getAttribute("addition"));
    if (kind === "uml:Extend") link("extend", p.getAttribute("extension"), p.getAttribute("extendedCase"));
  }
  for (const uc of Array.from(doc.getElementsByTagName("*")).filter((e) => e.localName === "include" || e.localName === "extend")) {
    const owner = uc.parentElement ? xmiAttr(uc.parentElement, "id") : null;
    if (uc.localName === "include") link("include", owner, uc.getAttribute("addition"));
    else link("extend", owner, uc.getAttribute("extendedCase"));
  }

  if (classDiagram.views.length) project.diagrams.push(classDiagram);
  if (useCaseDiagram.views.length) project.diagrams.push(useCaseDiagram);
  return project;
}
