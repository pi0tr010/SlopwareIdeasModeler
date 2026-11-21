import { describe, expect, it } from "vitest";
import { parseSimp, writeSimp } from "../io/simp";
import { alignShapes, distributeShapes } from "../model/arrange";
import { emptyProject } from "../model/factory";
import type { Project, ShapeView } from "../model/types";
import { SIM12 } from "../render/style";
import { COMMANDS, CommandError, getCommand } from "./commands";

function session() {
  const ctx = { project: emptyProject() as Project, style: SIM12 };
  const run = (name: string, args: Record<string, unknown> = {}) => getCommand(name).run(ctx, args) as any;
  return { ctx, run };
}

describe("agent commands", () => {
  it("builds a class diagram the way a user would", () => {
    const { ctx, run } = session();
    const { diagramId } = run("create_diagram", { type: "uml-class", name: "Shop" });
    const order = run("add_element", { diagramId, type: "class", name: "Order", attributes: [{ name: "total", type: "decimal" }] });
    const item = run("add_element", { diagramId, type: "class", name: "Item" });
    const rel = run("add_relation", { diagramId, type: "relationship", from: order.elementId, to: item.iid, end: { multiplicity: "1..*", aggregation: "composition" } });

    const d = run("get_diagram", { diagramId });
    expect(d.shapes.map((s: { name: string }) => s.name)).toEqual(["Order", "Item"]);
    expect(d.links[0]).toMatchObject({ from: order.elementId, to: item.elementId });
    expect(ctx.project.elements[rel.elementId].end).toMatchObject({ multiplicity: "1..*", aggregation: "composition" });
    expect(ctx.project.elements[order.elementId].attributes?.[0]).toMatchObject({ name: "total", type: "decimal", visibility: "private" });

    const [a, b] = d.shapes as { x: number; width: number; y: number }[];
    expect(b.x).toBeGreaterThan(a.x + a.width);
    expect(run("auto_layout", { diagramId }).moved).toBe(true);
  });

  it("rejects unknown types and wrong categories with helpful errors", () => {
    const { run } = session();
    const { diagramId } = run("create_diagram", { type: "uml-class", name: "D" });
    expect(() => run("add_element", { diagramId, type: "nope" })).toThrow(CommandError);
    expect(() => run("add_element", { diagramId, type: "generalization" })).toThrow(/add_relation/);
    expect(() => run("create_diagram", { type: "nope", name: "x" })).toThrow(/get_catalog/);
  });

  it("deletes elements with their relationships and views", () => {
    const { ctx, run } = session();
    const { diagramId } = run("create_diagram", { type: "uml-class", name: "D" });
    const a = run("add_element", { diagramId, type: "class" });
    const b = run("add_element", { diagramId, type: "class" });
    run("add_relation", { diagramId, type: "generalization", from: a.elementId, to: b.elementId });
    run("delete_element", { elementId: a.elementId });
    expect(Object.keys(ctx.project.elements)).toEqual([b.elementId]);
    expect(ctx.project.diagrams[0].views).toHaveLength(1);
  });

  it("stores props in the native .simp format and keeps them through a round-trip", () => {
    const { ctx, run } = session();
    const c4 = run("create_diagram", { type: "c4-container-diagram", name: "C4" }).diagramId;
    run("add_element", { diagramId: c4, type: "c4-container", name: "API", props: { technology: "Node.js", description: "Serves the shop" } });
    run("add_element", { diagramId: c4, type: "c4-person", name: "Partner", props: { external: true } });
    const bpmn = run("create_diagram", { type: "bpmn-collaboration", name: "Flow" }).diagramId;
    run("add_element", { diagramId: bpmn, type: "bpmn-event", name: "Done", props: { eventType: "End" } });
    run("add_element", { diagramId: bpmn, type: "bpmn-gateway", name: "Split", props: { gatewayType: "Parallel" } });
    const erd = run("create_diagram", { type: "entity-relationship", name: "Db" }).diagramId;
    run("add_element", { diagramId: erd, type: "erd-entity", name: "Customer", erdAttributes: [{ name: "id", type: "int", primaryKey: true }] });
    expect(() => run("add_element", { diagramId: c4, type: "c4-container", props: { colour: "red" } })).toThrow(/Known keys: technology, description/);

    const xml = writeSimp(ctx.project);
    expect(xml).toContain('<container technology="Node.js"><description>Serves the shop</description></container>');
    expect(xml).toContain('<person location="External">');
    expect(xml).toMatch(/<event [^>]*timming-type="End"/);
    expect(xml).toMatch(/<gateway [^>]*type="Parallel"/);
    expect(Object.values(ctx.project.elements).filter((e) => e.type === "c4-container")).toHaveLength(1);
    expect(xml).not.toContain("slopware-props");

    const again = parseSimp(xml);
    const byName = (n: string) => Object.values(again.elements).find((e) => e.name === n)!;
    expect(byName("API").props).toMatchObject({ technology: "Node.js", description: "Serves the shop" });
    expect(byName("Partner").props).toMatchObject({ external: "true" });
    expect(byName("Done").props).toMatchObject({ eventType: "End" });
    const view = again.diagrams[0].views.find((v) => v.ref === byName("API").id) as ShapeView;
    expect(view.itemAttrs).toMatchObject({ collapsed: "true" });
    expect(getCommand("export_sql").run({ project: again, style: SIM12 }, { dialect: "postgresql" })).toMatch(/CREATE TABLE "Customer"/);
  });

  it("uses the diagram item type of the original for new shapes", () => {
    const { ctx, run } = session();
    const ui = run("create_diagram", { type: "user-interface", name: "Screen" }).diagramId;
    const button = run("add_element", { diagramId: ui, type: "ui-button", name: "OK" });
    const view = ctx.project.diagrams[0].views.find((v) => v.iid === button.iid)!;
    expect(view.itemType).toBe("ui-button");
    expect(writeSimp(ctx.project)).toMatch(/type="ui-button"><layout [^>]*\/><\/item>/);
  });

  it("exposes every command with an object schema", () => {
    for (const c of COMMANDS.values()) {
      expect(c.input.type).toBe("object");
      expect(c.description.length).toBeGreaterThan(10);
    }
  });
});

describe("arrange", () => {
  const shape = (iid: string, x: number, y: number, width = 100, height = 50): ShapeView => ({ kind: "entity", iid, ref: iid, x, y, width, height });

  it("aligns to the outermost edge and centres", () => {
    const d = { id: "d", type: "uml-class", name: "d", views: [shape("a", 10, 0), shape("b", 50, 100, 200)] };
    alignShapes(d, ["a", "b"], "right");
    expect((d.views as ShapeView[]).map((v) => v.x + v.width)).toEqual([250, 250]);
    alignShapes(d, ["a", "b"], "middle");
    expect((d.views as ShapeView[]).map((v) => v.y + v.height / 2)).toEqual([75, 75]);
  });

  it("distributes with equal gaps keeping the ends", () => {
    const d = { id: "d", type: "uml-class", name: "d", views: [shape("a", 0, 0), shape("b", 130, 0), shape("c", 500, 0)] };
    distributeShapes(d, ["a", "b", "c"], "horizontal");
    expect((d.views as ShapeView[]).map((v) => v.x)).toEqual([0, 250, 500]);
  });
});
