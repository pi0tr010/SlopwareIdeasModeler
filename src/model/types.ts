export interface Point {
  x: number;
  y: number;
}

export type Visibility = "public" | "private" | "protected" | "package";

export interface UmlAttribute {
  id: string;
  name: string;
  type: string;
  visibility: Visibility;
  isStatic?: boolean;
  isId?: boolean;
  defaultValue?: string;
  multiplicity?: string;
}

export interface UmlParameter {
  name: string;
  type: string;
  direction?: "in" | "out" | "inout" | "return";
  defaultValue?: string;
}

export interface UmlOperation {
  id: string;
  name: string;
  returnType: string;
  visibility: Visibility;
  isStatic?: boolean;
  isAbstract?: boolean;
  parameters: UmlParameter[];
}

export interface EnumLiteral {
  id: string;
  name: string;
}

export interface ErdAttribute {
  id: string;
  name: string;
  type: string;
  size: string;
  primaryKey: boolean;
  foreignKey: boolean;
  nullable: boolean;
  unique?: boolean;
  autoIncrement: boolean;
  defaultValue: string;
  description: string;
}

export type AggregationKind = "association" | "aggregation" | "composition";
export type Navigability = "" | "navigable" | "non-navigable";

export interface RoleEnd {
  name: string;
  multiplicity: string;
  navigability: Navigability;
  aggregation: AggregationKind;
}

export interface ErdRelationInfo {
  kind: "Identifying" | "NonIdentifying";
  multiplicityFrom: string;
  multiplicityTo: string;
  pairs: { from: string; to: string }[];
}

/** A model element, independent of how many diagrams show it. Type ids follow the .simp format. */
export interface ModelElement {
  id: string;
  cid: string;
  type: string;
  name: string;
  stereotypes?: string[];
  visibility?: string;
  isAbstract?: boolean;
  documentation?: string;
  from?: string;
  to?: string;
  attributes?: UmlAttribute[];
  operations?: UmlOperation[];
  literals?: EnumLiteral[];
  erdAttributes?: ErdAttribute[];
  start?: RoleEnd;
  end?: RoleEnd;
  erd?: ErdRelationInfo;
  guard?: string;
  /** Free-form properties for element types without a dedicated editor. */
  props?: Record<string, string>;
  /** Original .simp XML of the item, re-emitted for types this app does not model in detail. */
  raw?: string;
}

export type LineStyle =
  | "oblique"
  | "straight"
  | "rectangular"
  | "rounded-rectangular"
  | "perpendicular"
  | "smooth"
  | "curve";

export interface ShapeView {
  kind: "entity";
  iid: string;
  ref: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Diagram item type in .simp: "entity" for most shapes, "lifeline" for sequence lifelines. */
  itemType?: string;
  /** iid of the shape this one is nested in (activation bars live inside lifelines). */
  container?: string;
  /** Inner XML of the diagram item in .simp (for example `<class />`), kept for round-trip. */
  rawInner?: string;
  /** Extra attributes of the diagram item in .simp (collapsed, show-fields, ...), kept for round-trip. */
  itemAttrs?: Record<string, string>;
  /** Extra `<layout>` attributes from .simp (name-position, name-anchor, ...), kept for round-trip. */
  layoutExtra?: Record<string, string>;
}

export interface LinkView {
  kind: "relation";
  iid: string;
  ref: string;
  fromIid: string;
  toIid: string;
  points: Point[];
  lineStyle: LineStyle;
  /** Diagram item type in .simp: "relation", "comment-connector", or "sequence-action" for messages. */
  itemType?: string;
  /** End points as fractions of the shape box (0..1), kept from .simp files so lines attach where the file had them. */
  startAnchor?: Point;
  endAnchor?: Point;
  fromField?: string;
  toField?: string;
  /** When true, the line ends sit on the rows of fromField/toField ("lock-to-fields" in .simp). */
  lockToFields?: boolean;
  itemAttrs?: Record<string, string>;
  /** Extra `<layout>` attributes from .simp (role label positions, ...), kept for round-trip. */
  layoutExtra?: Record<string, string>;
}

export type DiagramView = ShapeView | LinkView;

export interface Diagram {
  id: string;
  type: string;
  name: string;
  views: DiagramView[];
  /** Attributes of the <diagram> element we do not interpret (show-* flags etc.). */
  attrs?: Record<string, string>;
}

export interface Project {
  name: string;
  authors: string;
  description: string;
  elements: Record<string, ModelElement>;
  diagrams: Diagram[];
  /** Per type-id counters used to build readable ids like C001 or UC012. */
  counters: Record<string, number>;
}
