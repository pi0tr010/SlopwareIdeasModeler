import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDiagram, createElement, createLink, createShape, emptyProject } from "../model/factory";
import { getElementDef } from "../model/registry";
import { parseSimp, writeSimp } from "./simp";
import catalog from "../catalog/catalog.json";

const EXAMPLE = process.env.SIMP_EXAMPLE ?? "";

describe("simp format", () => {
  it.runIf(!!EXAMPLE && existsSync(EXAMPLE))("reads the bundled example project (SIMP_EXAMPLE)", () => {
    const p = parseSimp(readFileSync(EXAMPLE, "utf8"));
    expect(p.name).toContain("Appstorex");
    expect(p.diagrams.map((d) => d.type)).toEqual(
      expect.arrayContaining(["uml-usecase", "uml-class", "uml-sequence", "entity-relationship", "uml-statechart"]),
    );
    const category = Object.values(p.elements).find((e) => e.type === "class" && e.name === "Category")!;
    expect(category.attributes?.map((a) => a.name)).toContain("ParentCategory");
    const entity = Object.values(p.elements).find((e) => e.type === "erd-entity" && e.name === "Application")!;
    expect(entity.erdAttributes?.find((a) => a.name === "ID")?.primaryKey).toBe(true);
    const erd = p.diagrams.find((d) => d.type === "entity-relationship")!;
    expect(erd.views.filter((v) => v.kind === "relation")).toHaveLength(2);
    const seq = p.diagrams.find((d) => d.type === "uml-sequence")!;
    expect(seq.views.some((v) => v.kind === "relation" && v.itemType === "sequence-action")).toBe(true);
  });

  it.runIf(!!EXAMPLE && existsSync(EXAMPLE))("round-trips the example without losing elements or views", () => {
    const p = parseSimp(readFileSync(EXAMPLE, "utf8"));
    const again = parseSimp(writeSimp(p));
    expect(Object.keys(again.elements).sort()).toEqual(Object.keys(p.elements).sort());
    expect(again.diagrams.map((d) => d.views.length)).toEqual(p.diagrams.map((d) => d.views.length));
    const cls = Object.values(again.elements).find((e) => e.name === "Category")!;
    expect(cls.attributes).toEqual(Object.values(p.elements).find((e) => e.name === "Category")!.attributes);
  });

  it("writes and reads a new class diagram", () => {
    const p = emptyProject("Test");
    const d = createDiagram("uml-class", "Classes");
    p.diagrams.push(d);
    const a = createElement(p, "class", { name: "Order" });
    a.attributes!.push({ id: "a1", name: "id", type: "Integer", visibility: "private" });
    a.operations!.push({ id: "o1", name: "total", returnType: "Real", visibility: "public", parameters: [{ name: "tax", type: "Real" }] });
    const b = createElement(p, "class", { name: "Customer" });
    const sa = createShape(a, 0, 0);
    const sb = createShape(b, 300, 0);
    const rel = createElement(p, "relationship", { from: a.id, to: b.id });
    rel.end = { name: "buyer", multiplicity: "1", navigability: "navigable", aggregation: "association" };
    d.views.push(sa, sb, createLink(rel, sa, sb));
    const back = parseSimp(writeSimp(p));
    expect(back.elements[a.id].operations?.[0].parameters[0]).toMatchObject({ name: "tax", type: "Real" });
    expect(back.elements[rel.id].end?.name).toBe("buyer");
    expect(back.diagrams[0].views).toHaveLength(3);
  });
});

describe("registry", () => {
  it("assigns a definition to every catalog element", () => {
    const ids = Object.keys((catalog as { elements: Record<string, unknown> }).elements);
    expect(ids.length).toBeGreaterThan(900);
    for (const id of ids) expect(getElementDef(id).cidPrefix).toBeTruthy();
    const edges = ids.filter((id) => getElementDef(id).category === "edge");
    expect(edges).toEqual(expect.arrayContaining(["generalization", "include", "erd-relationship", "control-flow"]));
    expect(getElementDef("edge-connector").category).toBe("node");
    expect(getElementDef("use-case").category).toBe("node");
  });
});
