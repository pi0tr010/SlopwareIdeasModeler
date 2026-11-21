import { diagramGroups, getDiagramType, toolboxFor } from "../catalog";
import { collectRoutes, diagramToSvg } from "../io/export";
import { parseSimp, writeSimp } from "../io/simp";
import { generateDdl, SQL_DIALECTS, type SqlDialect } from "../io/sql";
import { exportXmi, importXmi } from "../io/xmi";
import { alignShapes, distributeShapes, reorderViews, type AlignMode, type DistributeAxis, type ZOrder } from "../model/arrange";
import { createDiagram, emptyProject, englishTypeName, newMemberId } from "../model/factory";
import { PROP_FIELDS } from "../model/fields";
import { addEdgeBetween, addNodeAt, applyLayout, moveViewsIn, placeElement, removeElement, removeViews } from "../model/ops";
import { getElementDef, isKnownType } from "../model/registry";
import type { Diagram, DiagramView, ErdAttribute, LineStyle, LinkView, ModelElement, Project, ShapeView, UmlAttribute, UmlOperation } from "../model/types";
import type { StyleSet } from "../render/style";

/** Hooks into the running editor; absent when the MCP server works on a file. */
export interface AppUi {
  openDiagram(id: string): void;
  selection(): { diagramId: string | null; iids: string[] };
  select(iids: string[]): void;
}

export interface CommandContext {
  project: Project;
  /** Light style used for layout, measuring and export. */
  style: StyleSet;
  ui?: AppUi;
}

type JsonSchema = Record<string, unknown>;

export interface CommandDef {
  name: string;
  description: string;
  input: JsonSchema;
  /** Changes the project, so the app asks the user before running it (depending on the consent setting). */
  mutates: boolean;
  /** Replaces the whole project instead of editing it in place. */
  replacesProject?: boolean;
  /** Returns a text document the MCP server can also write to a file. */
  textOutput?: string;
  /** Not listed as an MCP tool; used by the server itself. */
  internal?: boolean;
  run(ctx: CommandContext, args: Record<string, any>): unknown;
}

export class CommandError extends Error {}

const enName = englishTypeName;

// ---------- schema helpers ----------

const str = (description: string, extra: JsonSchema = {}): JsonSchema => ({ type: "string", description, ...extra });
const num = (description: string): JsonSchema => ({ type: "number", description });
const bool = (description: string): JsonSchema => ({ type: "boolean", description });
const strList = (description: string): JsonSchema => ({ type: "array", items: { type: "string" }, description });
const obj = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({ type: "object", properties, required, additionalProperties: false });
const anyObj = (description: string): JsonSchema => ({ type: "object", description, additionalProperties: true });
const anyList = (description: string): JsonSchema => ({ type: "array", items: { type: "object", additionalProperties: true }, description });

const DIAGRAM_ID = str("Diagram id (see list_diagrams).");

const MEMBER_FIELDS = {
  attributes: anyList("UML attributes: {name, type, visibility: public|private|protected|package, isStatic?, defaultValue?, multiplicity?}. Replaces the whole list."),
  operations: anyList("UML operations: {name, returnType, visibility, isStatic?, isAbstract?, parameters: [{name, type, direction?, defaultValue?}]}. Replaces the whole list."),
  literals: strList("Enumeration literal names. Replaces the whole list."),
  erdAttributes: anyList(
    "ERD columns: {name, type, size?, primaryKey?, foreignKey?, nullable?, unique?, autoIncrement?, defaultValue?, description?}. Replaces the whole list.",
  ),
};

const ELEMENT_FIELDS = {
  name: str("Element name."),
  stereotypes: strList("User stereotypes without guillemets."),
  documentation: str("Documentation text."),
  visibility: str("public, private, protected or package."),
  isAbstract: bool("Abstract classifier or operation owner."),
  props: anyObj("Type specific values as strings, merged into existing ones (see get_diagram_toolbox for known keys)."),
  ...MEMBER_FIELDS,
};

const RELATION_FIELDS = {
  name: str("Relationship name."),
  stereotypes: strList("User stereotypes."),
  documentation: str("Documentation text."),
  guard: str("Guard condition (transitions and control flows)."),
  props: anyObj("Type specific values, e.g. sequence-action {message, messageType: call|reply|create|destroy|send, async: 'true'|'false'}."),
  start: anyObj("Source end of a UML association: {name, multiplicity, navigability: ''|navigable|non-navigable, aggregation: association|aggregation|composition}."),
  end: anyObj("Target end of a UML association, same shape as start."),
  erd: anyObj("ERD relationship: {kind: Identifying|NonIdentifying, multiplicityFrom, multiplicityTo}."),
};

// ---------- lookups ----------

function diagramOf(p: Project, id: unknown): Diagram {
  const d = p.diagrams.find((x) => x.id === id) ?? p.diagrams.find((x) => x.name === id);
  if (!d) throw new CommandError(`Diagram not found: ${String(id)}. Call list_diagrams for valid ids.`);
  return d;
}

function elementOf(p: Project, id: unknown): ModelElement {
  const el = p.elements[String(id)] ?? Object.values(p.elements).find((e) => e.cid === id);
  if (!el) throw new CommandError(`Element not found: ${String(id)}.`);
  return el;
}

/** Accepts a view iid or an element id (the first shape of that element on the diagram). */
function shapeOf(d: Diagram, ref: unknown): ShapeView {
  const s = d.views.find((v): v is ShapeView => v.kind === "entity" && (v.iid === ref || v.ref === ref));
  if (!s) throw new CommandError(`No shape for ${String(ref)} on diagram "${d.name}". Use add_element or place_element first.`);
  return s;
}

function viewOf(d: Diagram, ref: unknown): DiagramView {
  const v = d.views.find((x) => x.iid === ref || x.ref === ref);
  if (!v) throw new CommandError(`No view ${String(ref)} on diagram "${d.name}".`);
  return v;
}

const iidsOf = (d: Diagram, refs: unknown): string[] => (Array.isArray(refs) ? refs : []).map((r) => viewOf(d, r).iid);

function checkType(type: unknown, category: "node" | "edge"): string {
  const t = String(type ?? "");
  if (!isKnownType(t)) throw new CommandError(`Unknown element type "${t}". Call get_diagram_toolbox for valid types.`);
  if (getElementDef(t).category !== category) throw new CommandError(`"${t}" is ${category === "node" ? "a connector, use add_relation" : "not a connector, use add_element"}.`);
  return t;
}

// ---------- summaries ----------

function elementSummary(el: ModelElement) {
  const { raw: _raw, ...rest } = el;
  return { ...rest, typeName: enName(el.type) };
}

function diagramSummary(p: Project, d: Diagram) {
  const shapes = d.views.filter((v): v is ShapeView => v.kind === "entity");
  const links = d.views.filter((v): v is LinkView => v.kind === "relation");
  return {
    id: d.id,
    name: d.name,
    type: d.type,
    typeName: getDiagramType(d.type)?.name.en ?? d.type,
    shapes: shapes.map((s) => {
      const el = p.elements[s.ref];
      return { iid: s.iid, elementId: s.ref, type: el?.type, name: el?.name, x: s.x, y: s.y, width: s.width, height: s.height, container: s.container };
    }),
    links: links.map((l) => {
      const el = p.elements[l.ref];
      return { iid: l.iid, elementId: l.ref, type: el?.type, name: el?.name || el?.props?.message || "", from: el?.from, to: el?.to, fromIid: l.fromIid, toIid: l.toIid, lineStyle: l.lineStyle };
    }),
  };
}

// ---------- element patching ----------

const VIS = new Set(["public", "private", "protected", "package"]);
const vis = (v: unknown, fallback: UmlAttribute["visibility"]) => (VIS.has(String(v)) ? (String(v) as UmlAttribute["visibility"]) : fallback);
const s = (v: unknown, fallback = "") => (v === undefined || v === null ? fallback : String(v));

function normAttribute(a: any): UmlAttribute {
  return { id: a.id ?? newMemberId(), name: s(a.name), type: s(a.type), visibility: vis(a.visibility, "private"), isStatic: !!a.isStatic, defaultValue: a.defaultValue, multiplicity: a.multiplicity };
}

function normOperation(o: any): UmlOperation {
  return {
    id: o.id ?? newMemberId(),
    name: s(o.name),
    returnType: s(o.returnType),
    visibility: vis(o.visibility, "public"),
    isStatic: !!o.isStatic,
    isAbstract: !!o.isAbstract,
    parameters: (Array.isArray(o.parameters) ? o.parameters : []).map((p: any) => ({ name: s(p.name), type: s(p.type), direction: p.direction, defaultValue: p.defaultValue })),
  };
}

function normErd(a: any): ErdAttribute {
  return {
    id: a.id ?? newMemberId(),
    name: s(a.name),
    type: s(a.type, "int"),
    size: s(a.size),
    primaryKey: !!a.primaryKey,
    foreignKey: !!a.foreignKey,
    nullable: a.nullable === undefined ? !a.primaryKey : !!a.nullable,
    unique: !!a.unique,
    autoIncrement: !!a.autoIncrement,
    defaultValue: s(a.defaultValue),
    description: s(a.description),
  };
}

/** Props stored natively for every type that has them (transition effect, object classifier, owner). */
const ALWAYS_PROPS = ["effect", "classifierName", "classifierRef", "owner"];

function checkProps(type: string, props: unknown): void {
  if (!props || typeof props !== "object") return;
  const known = new Set([...(PROP_FIELDS[type] ?? []).map((f) => f.key), ...ALWAYS_PROPS]);
  const unknown = Object.keys(props).filter((k) => !known.has(k));
  if (unknown.length) throw new CommandError(`Unknown props for ${type}: ${unknown.join(", ")}. Known keys: ${[...known].join(", ")}.`);
}

function patchElement(el: ModelElement, a: Record<string, any>): void {
  if (a.name !== undefined) el.name = String(a.name);
  if (a.stereotypes !== undefined) el.stereotypes = (a.stereotypes as unknown[]).map(String).filter(Boolean);
  if (a.documentation !== undefined) el.documentation = String(a.documentation);
  if (a.visibility !== undefined) el.visibility = String(a.visibility);
  if (a.isAbstract !== undefined) el.isAbstract = !!a.isAbstract;
  if (a.guard !== undefined) el.guard = String(a.guard);
  if (a.props) {
    checkProps(el.type, a.props);
    el.props = { ...el.props, ...Object.fromEntries(Object.entries(a.props).map(([k, v]) => [k, s(v)])) };
  }
  if (Array.isArray(a.attributes)) el.attributes = a.attributes.map(normAttribute);
  if (Array.isArray(a.operations)) el.operations = a.operations.map(normOperation);
  if (Array.isArray(a.literals)) el.literals = a.literals.map((n: unknown) => ({ id: newMemberId(), name: String(n) }));
  if (Array.isArray(a.erdAttributes)) el.erdAttributes = a.erdAttributes.map(normErd);
  for (const key of ["start", "end"] as const)
    if (a[key]) el[key] = { name: "", multiplicity: "", navigability: "", aggregation: "association", ...el[key], ...a[key] };
  if (a.erd) el.erd = { kind: "NonIdentifying", multiplicityFrom: "1", multiplicityTo: "0..*", pairs: [], ...el.erd, ...a.erd };
}

/** Free spot to the right of existing shapes, wrapping to a new row past 1200px. */
function freeSpot(d: Diagram, type: string): { x: number; y: number } {
  const def = getElementDef(type);
  const shapes = d.views.filter((v): v is ShapeView => v.kind === "entity" && !v.container);
  if (!shapes.length) return { x: 40 + def.width / 2, y: 40 + def.height / 2 };
  const bottom = Math.max(...shapes.map((v) => v.y + v.height));
  const rowTop = Math.max(...shapes.map((v) => v.y).filter((y) => y >= bottom - 400), 40);
  const row = shapes.filter((v) => v.y + v.height > rowTop);
  const right = Math.max(...row.map((v) => v.x + v.width));
  if (right + 60 + def.width < 1200) return { x: right + 60 + def.width / 2, y: rowTop + def.height / 2 };
  return { x: 40 + def.width / 2, y: bottom + 60 + def.height / 2 };
}

// ---------- commands ----------

const commands: CommandDef[] = [
  {
    name: "get_catalog",
    description:
      "Lists the supported diagram types by group (UML, ERD, BPMN, C4, SysML, flowchart, ...). Start here to pick a diagram type id for create_diagram.",
    input: obj({ group: str("Optional group id to filter by.") }),
    mutates: false,
    run: (_ctx, a) =>
      diagramGroups
        .filter((g) => !a.group || g.id === a.group)
        .map((g) => ({ group: g.id, name: g.name.en, diagrams: g.diagrams.map((d) => ({ type: d.id, name: d.name.en })) })),
  },
  {
    name: "get_diagram_toolbox",
    description: "Element and connector types available on a diagram type, with default sizes and known props keys. Use these type ids with add_element and add_relation.",
    input: obj({ diagramType: str("Diagram type id, e.g. uml-class, entity-relationship, bpmn.") }, ["diagramType"]),
    mutates: false,
    run: (_ctx, a) => {
      if (!getDiagramType(a.diagramType)) throw new CommandError(`Unknown diagram type "${a.diagramType}". Call get_catalog.`);
      const tb = toolboxFor(a.diagramType);
      const describe = (t: string) => {
        const def = getElementDef(t);
        const fields = PROP_FIELDS[t];
        return {
          type: t,
          name: enName(t),
          ...(def.category === "node" ? { width: def.width, height: def.height, container: !!def.container } : {}),
          ...(fields ? { props: fields.map((f) => ({ key: f.key, kind: f.kind, options: f.options })) } : {}),
        };
      };
      return { elements: tb.nodes.map(describe), connectors: tb.edges.map(describe) };
    },
  },
  {
    name: "get_project",
    description: "Project name, authors, description and the list of diagrams with element counts.",
    input: obj({}),
    mutates: false,
    run: ({ project: p }) => ({
      name: p.name,
      authors: p.authors,
      description: p.description,
      elementCount: Object.keys(p.elements).length,
      diagrams: p.diagrams.map((d) => ({ id: d.id, name: d.name, type: d.type, viewCount: d.views.length })),
    }),
  },
  {
    name: "update_project",
    description: "Changes project name, authors or description.",
    input: obj({ name: str("Project name."), authors: str("Authors."), description: str("Description.") }),
    mutates: true,
    run: ({ project: p }, a) => {
      if (a.name !== undefined) p.name = String(a.name);
      if (a.authors !== undefined) p.authors = String(a.authors);
      if (a.description !== undefined) p.description = String(a.description);
      return { ok: true };
    },
  },
  {
    name: "list_diagrams",
    description: "Lists diagrams (id, name, type).",
    input: obj({}),
    mutates: false,
    run: ({ project: p }) => p.diagrams.map((d) => ({ id: d.id, name: d.name, type: d.type, viewCount: d.views.length })),
  },
  {
    name: "get_diagram",
    description: "Full content of a diagram: shapes (iid, elementId, type, name, position, size) and links (iid, elementId, type, endpoints).",
    input: obj({ diagramId: DIAGRAM_ID }, ["diagramId"]),
    mutates: false,
    run: ({ project: p }, a) => diagramSummary(p, diagramOf(p, a.diagramId)),
  },
  {
    name: "create_diagram",
    description: "Creates an empty diagram. Returns its id.",
    input: obj({ type: str("Diagram type id from get_catalog."), name: str("Diagram name.") }, ["type", "name"]),
    mutates: true,
    run: ({ project: p, ui }, a) => {
      if (!getDiagramType(a.type)) throw new CommandError(`Unknown diagram type "${a.type}". Call get_catalog.`);
      const d = createDiagram(a.type, String(a.name));
      p.diagrams.push(d);
      ui?.openDiagram(d.id);
      return { diagramId: d.id };
    },
  },
  {
    name: "rename_diagram",
    description: "Renames a diagram.",
    input: obj({ diagramId: DIAGRAM_ID, name: str("New name.") }, ["diagramId", "name"]),
    mutates: true,
    run: ({ project: p }, a) => {
      diagramOf(p, a.diagramId).name = String(a.name);
      return { ok: true };
    },
  },
  {
    name: "delete_diagram",
    description: "Deletes a diagram. Model elements stay in the project.",
    input: obj({ diagramId: DIAGRAM_ID }, ["diagramId"]),
    mutates: true,
    run: ({ project: p }, a) => {
      const d = diagramOf(p, a.diagramId);
      p.diagrams = p.diagrams.filter((x) => x !== d);
      return { ok: true };
    },
  },
  {
    name: "list_elements",
    description: "Lists model elements (shared by all diagrams), optionally filtered by type or name.",
    input: obj({ type: str("Element type id."), nameContains: str("Case-insensitive name filter."), limit: num("Maximum results, default 200.") }),
    mutates: false,
    run: ({ project: p }, a) => {
      const q = a.nameContains ? String(a.nameContains).toLowerCase() : "";
      return Object.values(p.elements)
        .filter((e) => (!a.type || e.type === a.type) && (!q || e.name.toLowerCase().includes(q)))
        .slice(0, Number(a.limit) || 200)
        .map((e) => ({ id: e.id, cid: e.cid, type: e.type, name: e.name, from: e.from, to: e.to }));
    },
  },
  {
    name: "get_element",
    description: "All data of one model element (attributes, operations, columns, props, relationship ends) and the diagrams showing it.",
    input: obj({ elementId: str("Element id or readable cid such as C001.") }, ["elementId"]),
    mutates: false,
    run: ({ project: p }, a) => {
      const el = elementOf(p, a.elementId);
      const shownOn = p.diagrams.flatMap((d) => d.views.filter((v) => v.ref === el.id).map((v) => ({ diagramId: d.id, diagramName: d.name, iid: v.iid })));
      return { ...elementSummary(el), shownOn };
    },
  },
  {
    name: "find_elements",
    description: "Full text search in names, members, documentation and comment text.",
    input: obj({ query: str("Text to find.") }, ["query"]),
    mutates: false,
    run: ({ project: p }, a) => {
      const q = String(a.query).toLowerCase();
      const text = (e: ModelElement) =>
        [e.name, e.documentation, e.props?.text, e.props?.message, ...(e.attributes ?? []).map((x) => x.name), ...(e.operations ?? []).map((x) => x.name), ...(e.erdAttributes ?? []).map((x) => x.name)]
          .join("\n")
          .toLowerCase();
      return Object.values(p.elements)
        .filter((e) => text(e).includes(q))
        .slice(0, 200)
        .map((e) => ({ id: e.id, cid: e.cid, type: e.type, name: e.name }));
    },
  },
  {
    name: "add_element",
    description:
      "Creates a new model element and its shape on a diagram. Without x/y it is placed next to existing shapes (run auto_layout afterwards for a tidy result). x/y is the centre of the shape. Returns elementId and the shape iid.",
    input: obj({ diagramId: DIAGRAM_ID, type: str("Element type from get_diagram_toolbox."), x: num("Centre x."), y: num("Centre y."), width: num("Width."), height: num("Height."), ...ELEMENT_FIELDS }, [
      "diagramId",
      "type",
    ]),
    mutates: true,
    run: ({ project: p }, a) => {
      const d = diagramOf(p, a.diagramId);
      const type = checkType(a.type, "node");
      checkProps(type, a.props);
      const spot = a.x !== undefined && a.y !== undefined ? { x: Number(a.x), y: Number(a.y) } : freeSpot(d, type);
      const shape = addNodeAt(p, d, type, spot.x, spot.y);
      const el = p.elements[shape.ref];
      patchElement(el, a);
      if (a.width) shape.width = Math.round(Number(a.width));
      if (a.height) shape.height = Math.round(Number(a.height));
      return { elementId: el.id, cid: el.cid, iid: shape.iid, name: el.name };
    },
  },
  {
    name: "place_element",
    description: "Shows an existing model element on another diagram (the shared model), including its relationships to elements already there.",
    input: obj({ diagramId: DIAGRAM_ID, elementId: str("Element id."), x: num("Centre x."), y: num("Centre y.") }, ["diagramId", "elementId"]),
    mutates: true,
    run: ({ project: p }, a) => {
      const d = diagramOf(p, a.diagramId);
      const el = elementOf(p, a.elementId);
      const spot = a.x !== undefined && a.y !== undefined ? { x: Number(a.x), y: Number(a.y) } : freeSpot(d, el.type);
      const shape = placeElement(p, d, el.id, spot.x, spot.y);
      if (!shape) throw new CommandError("Only node elements can be placed; relationships appear automatically.");
      return { iid: shape.iid };
    },
  },
  {
    name: "add_relation",
    description:
      "Connects two shapes on a diagram with a connector (association, generalization, ERD relationship, message, flow, ...). from/to accept element ids or shape iids. Returns elementId and link iid.",
    input: obj({ diagramId: DIAGRAM_ID, type: str("Connector type from get_diagram_toolbox."), from: str("Source element id or shape iid."), to: str("Target element id or shape iid."), ...RELATION_FIELDS }, [
      "diagramId",
      "type",
      "from",
      "to",
    ]),
    mutates: true,
    run: ({ project: p }, a) => {
      const d = diagramOf(p, a.diagramId);
      const type = checkType(a.type, "edge");
      checkProps(type, a.props);
      const link = addEdgeBetween(p, d, type, shapeOf(d, a.from), shapeOf(d, a.to));
      const el = p.elements[link.ref];
      patchElement(el, a);
      return { elementId: el.id, iid: link.iid };
    },
  },
  {
    name: "update_element",
    description: "Edits a model element. Only given fields change; member lists (attributes, operations, literals, erdAttributes) are replaced as a whole.",
    input: obj({ elementId: str("Element id or cid."), ...ELEMENT_FIELDS, guard: RELATION_FIELDS.guard, start: RELATION_FIELDS.start, end: RELATION_FIELDS.end, erd: RELATION_FIELDS.erd }, [
      "elementId",
    ]),
    mutates: true,
    run: ({ project: p }, a) => {
      const el = elementOf(p, a.elementId);
      patchElement(el, a);
      return elementSummary(el);
    },
  },
  {
    name: "update_view",
    description: "Changes the position or size of a shape, or the line style and waypoints of a link, on one diagram.",
    input: obj(
      {
        diagramId: DIAGRAM_ID,
        iid: str("Shape or link iid (an element id selects its first view)."),
        x: num("Left."),
        y: num("Top."),
        width: num("Width."),
        height: num("Height."),
        lineStyle: str("oblique, rectangular, rounded-rectangular, smooth or straight."),
        points: { type: "array", items: obj({ x: num("x"), y: num("y") }, ["x", "y"]), description: "Link waypoints; [] lets the line route itself." },
      },
      ["diagramId", "iid"],
    ),
    mutates: true,
    run: ({ project: p }, a) => {
      const d = diagramOf(p, a.diagramId);
      const v = viewOf(d, a.iid);
      if (v.kind === "entity") {
        for (const k of ["x", "y", "width", "height"] as const) if (a[k] !== undefined) v[k] = Math.round(Number(a[k]));
      } else {
        if (a.lineStyle) v.lineStyle = a.lineStyle as LineStyle;
        if (Array.isArray(a.points)) v.points = a.points.map((pt: any) => ({ x: Number(pt.x), y: Number(pt.y) }));
      }
      return { ok: true };
    },
  },
  {
    name: "move_views",
    description: "Moves shapes by an offset; nested shapes and links between moved shapes follow.",
    input: obj({ diagramId: DIAGRAM_ID, iids: strList("Shape iids or element ids."), dx: num("Horizontal offset."), dy: num("Vertical offset.") }, ["diagramId", "iids"]),
    mutates: true,
    run: ({ project: p }, a) => {
      const d = diagramOf(p, a.diagramId);
      moveViewsIn(d, iidsOf(d, a.iids), Number(a.dx) || 0, Number(a.dy) || 0);
      return { ok: true };
    },
  },
  {
    name: "remove_from_diagram",
    description: "Removes shapes or links from a diagram. With deleteFromModel the elements are deleted from the whole project.",
    input: obj({ diagramId: DIAGRAM_ID, iids: strList("View iids or element ids."), deleteFromModel: bool("Also delete the model elements.") }, ["diagramId", "iids"]),
    mutates: true,
    run: ({ project: p }, a) => {
      const d = diagramOf(p, a.diagramId);
      removeViews(p, d, iidsOf(d, a.iids), !!a.deleteFromModel);
      return { ok: true };
    },
  },
  {
    name: "delete_element",
    description: "Deletes a model element, its relationships and all its views on every diagram.",
    input: obj({ elementId: str("Element id or cid.") }, ["elementId"]),
    mutates: true,
    run: ({ project: p }, a) => {
      removeElement(p, elementOf(p, a.elementId).id);
      return { ok: true };
    },
  },
  {
    name: "arrange_views",
    description: "Aligns, distributes or reorders shapes. align needs 2+ shapes, distribute 3+.",
    input: obj(
      {
        diagramId: DIAGRAM_ID,
        iids: strList("Shape iids or element ids."),
        align: str("left, center, right, top, middle or bottom."),
        distribute: str("horizontal or vertical."),
        order: str("front or back."),
      },
      ["diagramId", "iids"],
    ),
    mutates: true,
    run: ({ project: p }, a) => {
      const d = diagramOf(p, a.diagramId);
      const iids = iidsOf(d, a.iids);
      if (a.align) alignShapes(d, iids, a.align as AlignMode);
      if (a.distribute) distributeShapes(d, iids, a.distribute as DistributeAxis);
      if (a.order) reorderViews(d, iids, a.order as ZOrder);
      return { ok: true };
    },
  },
  {
    name: "auto_layout",
    description: "Arranges the whole diagram automatically (layered layout) and resets link routes.",
    input: obj({ diagramId: DIAGRAM_ID }, ["diagramId"]),
    mutates: true,
    run: ({ project: p, style }, a) => ({ moved: applyLayout(p, diagramOf(p, a.diagramId), style) }),
  },
  {
    name: "export_svg",
    description: "Renders a diagram to SVG in the light diagram style (as the app exports it).",
    input: obj({ diagramId: DIAGRAM_ID }, ["diagramId"]),
    mutates: false,
    textOutput: "svg",
    run: ({ project: p, style }, a) => diagramToSvg(diagramOf(p, a.diagramId), p, style).svg,
  },
  {
    name: "export_sql",
    description: "Generates SQL DDL from ERD entities (whole project or one diagram).",
    input: obj({ dialect: str("Dialect: " + SQL_DIALECTS.map((d) => d.id).join(", ") + ".", { enum: SQL_DIALECTS.map((d) => d.id) }), diagramId: str("Optional diagram id.") }, ["dialect"]),
    mutates: false,
    textOutput: "sql",
    run: ({ project: p }, a) => generateDdl(p, a.dialect as SqlDialect, a.diagramId ? diagramOf(p, a.diagramId) : undefined),
  },
  {
    name: "export_xmi",
    description: "Exports the UML model as XMI 2.5.",
    input: obj({}),
    mutates: false,
    textOutput: "xmi",
    run: ({ project: p }) => exportXmi(p),
  },
  {
    name: "export_simp",
    description: "Serializes the project to .simp XML.",
    input: obj({}),
    mutates: false,
    textOutput: "simp",
    run: ({ project: p, style }) => writeSimp(p, collectRoutes(p, style)),
  },
  {
    name: "open_diagram_in_app",
    description: "Shows a diagram in the connected app (live mode only).",
    input: obj({ diagramId: DIAGRAM_ID }, ["diagramId"]),
    mutates: false,
    run: ({ project: p, ui }, a) => {
      if (!ui) throw new CommandError("The app is not connected; this works only in live mode.");
      ui.openDiagram(diagramOf(p, a.diagramId).id);
      return { ok: true };
    },
  },
  {
    name: "get_selection",
    description: "Diagram and shapes currently selected by the user in the app (live mode only).",
    input: obj({}),
    mutates: false,
    run: ({ project: p, ui }) => {
      if (!ui) throw new CommandError("The app is not connected; this works only in live mode.");
      const sel = ui.selection();
      const d = p.diagrams.find((x) => x.id === sel.diagramId);
      return {
        diagramId: sel.diagramId,
        diagramName: d?.name,
        selected: sel.iids.map((iid) => {
          const v = d?.views.find((x) => x.iid === iid);
          const el = v && p.elements[v.ref];
          return { iid, elementId: v?.ref, type: el?.type, name: el?.name };
        }),
      };
    },
  },
  {
    name: "new_project",
    description: "Replaces the current project with an empty one.",
    input: obj({ name: str("Project name.") }),
    mutates: true,
    replacesProject: true,
    run: ({ project: p }, a) => {
      Object.assign(p, emptyProject(a.name ? String(a.name) : undefined));
      return { ok: true };
    },
  },
  {
    name: "load_simp",
    description: "Replaces the project with parsed .simp XML.",
    input: obj({ xml: str("File content."), fileName: str("File name.") }, ["xml"]),
    mutates: true,
    replacesProject: true,
    internal: true,
    run: ({ project: p }, a) => {
      Object.assign(p, parseSimp(String(a.xml)));
      return { diagrams: p.diagrams.length, elements: Object.keys(p.elements).length };
    },
  },
  {
    name: "load_xmi",
    description: "Replaces the project with an XMI import and lays out its diagrams.",
    input: obj({ xml: str("File content."), fileName: str("File name.") }, ["xml"]),
    mutates: true,
    replacesProject: true,
    internal: true,
    run: ({ project: p, style }, a) => {
      Object.assign(p, importXmi(String(a.xml)));
      for (const d of p.diagrams) applyLayout(p, d, style);
      return { diagrams: p.diagrams.length, elements: Object.keys(p.elements).length };
    },
  },
];

export const COMMANDS: ReadonlyMap<string, CommandDef> = new Map(commands.map((c) => [c.name, c]));

export function getCommand(name: string): CommandDef {
  const c = COMMANDS.get(name);
  if (!c) throw new CommandError(`Unknown command: ${name}`);
  return c;
}

/** Short human readable description of a call, shown in the app's confirmation dialog. */
export function describeCall(name: string, args: Record<string, any>): string {
  const brief = Object.entries(args)
    .filter(([k]) => k !== "xml")
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(", ");
  return brief ? `${name} (${brief.length > 300 ? brief.slice(0, 300) + "..." : brief})` : name;
}
