import catalog from "../catalog/catalog.json";
import { notationOf } from "./notation";

export type ShapeKind =
  | "classifier"
  | "object"
  | "actor"
  | "usecase"
  | "boundary-box"
  | "package"
  | "note"
  | "text"
  | "rect"
  | "roundrect"
  | "ellipse"
  | "dashed-ellipse"
  | "dashed-roundrect"
  | "initial"
  | "final"
  | "flow-final"
  | "decision"
  | "bar"
  | "state"
  | "history"
  | "terminate"
  | "entry-point"
  | "exit-point"
  | "junction"
  | "lifeline"
  | "activation"
  | "fragment"
  | "operand"
  | "frame"
  | "destroy"
  | "component"
  | "artifact"
  | "node3d"
  | "send-signal"
  | "accept-event"
  | "time-event"
  | "pin"
  | "swimlane"
  | "lollipop"
  | "socket"
  | "port"
  | "seq-boundary"
  | "seq-control"
  | "seq-entity"
  | "erd-entity"
  | "chen-entity"
  | "chen-relationship"
  | "chen-attribute"
  | "idef1x-entity"
  | "cylinder"
  | "document"
  | "parallelogram"
  | "cloud"
  | "circle"
  // flowchart
  | "terminator"
  | "diamond-label"
  | "multi-document"
  | "predefined"
  | "internal-storage"
  | "stored-data"
  | "direct-data"
  | "manual-input"
  | "triangle-up"
  | "triangle-down"
  | "offline-storage"
  | "or-junction"
  | "summing-junction"
  | "delay"
  | "manual-operation"
  | "hexagon"
  | "display"
  | "sort"
  | "collate"
  | "off-page"
  | "circle-label"
  | "sequential-access"
  | "card"
  // data flow, mind map, C4
  | "dfd-process"
  | "dfd-external"
  | "dfd-store"
  | "mm-central"
  | "mm-node"
  | "c4-person"
  | "c4-box"
  | "c4-node"
  // BPMN
  | "bpmn-activity"
  | "bpmn-event"
  | "bpmn-gateway"
  | "bpmn-data"
  | "bpmn-pool"
  | "bpmn-group"
  | "envelope"
  | "annotation"
  | "bpmn-choreo"
  // SysML
  | "requirement"
  | "ui"
  | "symbol";

export type Marker =
  | "none"
  | "open-arrow"
  | "filled-arrow"
  | "hollow-triangle"
  | "hollow-diamond"
  | "filled-diamond"
  | "circle-plus"
  | "filled-dot"
  | "small-diamond"
  | "slash"
  | "small-circle"
  | "hollow-arrow";

export interface EdgeSpec {
  dashed: boolean;
  dotted?: boolean;
  start: Marker;
  end: Marker;
  label?: string;
  /** Line colour override (comment connectors are lighter). */
  faint?: boolean;
}

export interface ElementDef {
  type: string;
  category: "node" | "edge";
  shape: ShapeKind;
  width: number;
  height: number;
  edge?: EdgeSpec;
  /** Prefix of readable ids (cid) such as C001 for classes. */
  cidPrefix: string;
  /** Classifiers whose height follows their compartments. */
  autoHeight?: boolean;
  /** Containers are drawn below other shapes. */
  container?: boolean;
  stereotype?: string;
}

const solid = (end: Marker, start: Marker = "none", label?: string): EdgeSpec => ({ dashed: false, start, end, label });
const dashed = (end: Marker, label?: string): EdgeSpec => ({ dashed: true, start: "none", end, label });

const EDGES: Record<string, EdgeSpec> = {
  relationship: solid("none"),
  generalization: solid("hollow-triangle"),
  realization: dashed("hollow-triangle"),
  "interface-realization": dashed("hollow-triangle"),
  dependency: dashed("open-arrow"),
  usage: dashed("open-arrow", "use"),
  abstraction: dashed("open-arrow", "abstraction"),
  substitution: dashed("open-arrow", "substitute"),
  manifestation: dashed("open-arrow", "manifest"),
  deployment: dashed("open-arrow", "deploy"),
  include: dashed("open-arrow", "include"),
  extend: dashed("open-arrow", "extend"),
  containment: solid("none", "circle-plus"),
  connector: solid("none"),
  "template-binding": dashed("open-arrow", "bind"),
  "role-binding": dashed("none"),
  "association-class-link": dashed("none"),
  "uml-n-ary-association": solid("none"),
  "comment-connector": { dashed: true, start: "none", end: "none", faint: true },
  "control-flow": solid("open-arrow"),
  "object-flow": solid("open-arrow"),
  "general-transition": solid("open-arrow"),
  transition: solid("open-arrow"),
  "sequence-action": solid("filled-arrow"),
  "communication-path": solid("none"),
  "uml-provided-interface-connector": solid("none"),
  "uml-required-interface-connector": solid("none"),
  "erd-relationship": solid("none"),
  "erd-chen-attribute-connector": solid("none"),
  "erd-chen-participation": solid("none"),
  "idef1x-relationship": solid("filled-dot"),
  "idef1x-connector": solid("none"),
  "information-flow": dashed("open-arrow", "flow"),
  // flowchart, data flow, mind map, C4
  "flowchart-flow": solid("filled-arrow"),
  "screenflow-flow": solid("filled-arrow"),
  "dfd-data-flow": solid("filled-arrow"),
  "mind-map-edge": solid("none"),
  "c4-relationship": dashed("open-arrow"),
  // BPMN
  "bpmn-sequence-flow": solid("filled-arrow"),
  "bpmn-conditional-flow": solid("filled-arrow", "small-diamond"),
  "bpmn-default-flow": solid("filled-arrow", "slash"),
  "bpmn-message-flow": { dashed: true, start: "small-circle", end: "hollow-arrow" },
  "bpmn-association": { dashed: false, dotted: true, start: "none", end: "none" },
  "bpmn-data-association": { dashed: false, dotted: true, start: "none", end: "open-arrow" },
  "bpmn-message-connector": { dashed: false, dotted: true, start: "none", end: "none" },
  "bpmn-conversation-link": solid("none"),
  "bpmn-forked-conversation-link": solid("none"),
  // SysML
  "sysml-allocate": dashed("open-arrow", "allocate"),
  "sysml-item-flow": solid("filled-arrow"),
  "sysml2-succession": solid("open-arrow"),
  "sysml2-transition": solid("open-arrow"),
  "sysml2-flow-connection": solid("filled-arrow"),
  "sysml2-action-flow": solid("filled-arrow"),
  "sysml2-message": solid("filled-arrow"),
  "sysml2-binding-connector": solid("none"),
  "sysml2-connection": solid("none"),
  "sysml2-interface-connection": solid("none"),
  "sysml2-port-binding-connection": solid("none"),
  "sysml2-constraint-binding-connection": solid("none"),
  "sysml2-allocation": dashed("open-arrow", "allocate"),
  "sysml2-subclassification": solid("hollow-triangle"),
  "sysml2-subsetting": solid("open-arrow"),
  "sysml2-ref-subsetting": solid("open-arrow"),
  "sysml2-redefinition": solid("open-arrow"),
  "sysml2-dependency": dashed("open-arrow"),
  "sysml2-satisfy-requirement": dashed("open-arrow", "satisfy"),
  "sysml2-verify": dashed("open-arrow", "verify"),
  "sysml2-include-rel": dashed("open-arrow", "include"),
  "sysml2-expose": dashed("open-arrow", "expose"),
  "sysml2-import": dashed("open-arrow", "import"),
  "sysml2-recursive-import": dashed("open-arrow", "import"),
  "sysml2-top-level-import": dashed("open-arrow", "import"),
  "sysml2-causation": solid("filled-arrow"),
  "sysml2-membership": solid("none", "circle-plus"),
  "sysml2-owned-membership": solid("none", "filled-diamond"),
  "sysml2-unowned-membership": solid("none", "hollow-diamond"),
  "sysml2-feature-membership": solid("none", "filled-diamond"),
  "sysml2-annotation-link": { dashed: true, start: "none", end: "none", faint: true },
};

type NodePreset = [ShapeKind, number, number, Partial<ElementDef>?];

const NODES: Record<string, NodePreset> = {
  class: ["classifier", 160, 80, { autoHeight: true }],
  "data-type": ["classifier", 160, 70, { autoHeight: true, stereotype: "dataType" }],
  signal: ["classifier", 160, 70, { autoHeight: true, stereotype: "signal" }],
  "uml-interface-classifier": ["classifier", 160, 70, { autoHeight: true, stereotype: "interface" }],
  enumeration: ["classifier", 160, 80, { autoHeight: true, stereotype: "enumeration" }],
  stereotype: ["classifier", 160, 60, { autoHeight: true, stereotype: "stereotype" }],
  object: ["object", 160, 60, { autoHeight: true }],
  part: ["rect", 140, 60],
  collaboration: ["dashed-ellipse", 160, 70],
  "collaboration-use": ["dashed-ellipse", 140, 60],
  component: ["component", 160, 80],
  artifact: ["artifact", 150, 70],
  node: ["node3d", 180, 120, { container: true }],
  device: ["node3d", 180, 120, { container: true, stereotype: "device" }],
  "execution-environment": ["node3d", 180, 120, { container: true, stereotype: "executionEnvironment" }],
  "deployment-specification": ["artifact", 160, 70, { stereotype: "deployment spec" }],
  package: ["package", 200, 140, { container: true }],
  "uml-interface": ["lollipop", 24, 24],
  "uml-required-interface-end": ["socket", 24, 24],
  "uml-required-interface": ["socket", 24, 24],
  port: ["port", 16, 16],
  "template-parameter": ["dashed-roundrect", 80, 24],
  actor: ["actor", 50, 100],
  "use-case": ["usecase", 140, 60],
  "system-boundary": ["boundary-box", 320, 400, { container: true }],
  extension: ["rect", 140, 40],
  comment: ["note", 160, 70],
  text: ["text", 120, 30],
  "formatted-text": ["text", 160, 60],
  // activity
  activity: ["dashed-roundrect", 400, 300, { container: true }],
  "initial-node": ["initial", 25, 25],
  "activity-final-node": ["final", 25, 25],
  "flow-final": ["flow-final", 25, 25],
  decision: ["decision", 40, 40],
  merge: ["decision", 40, 40],
  "fork-join": ["bar", 120, 8],
  fork: ["bar", 120, 8],
  join: ["bar", 120, 8],
  "fork-state": ["bar", 120, 8],
  "join-state": ["bar", 120, 8],
  junction: ["junction", 16, 16],
  swimlane: ["swimlane", 220, 400, { container: true }],
  "activity-region": ["swimlane", 220, 400, { container: true }],
  "interruptible-activity-region": ["dashed-roundrect", 300, 200, { container: true }],
  "expansion-region": ["dashed-roundrect", 300, 200, { container: true }],
  "conditional-node": ["dashed-roundrect", 300, 200, { container: true, stereotype: "conditional" }],
  "loop-node": ["dashed-roundrect", 300, 200, { container: true, stereotype: "loop" }],
  "signal-sending": ["send-signal", 140, 50],
  "send-object-action": ["send-signal", 140, 50],
  "accept-event-action": ["accept-event", 140, 50],
  "accept-time-event-action": ["time-event", 30, 40],
  "data-store-node": ["rect", 140, 50, { stereotype: "datastore" }],
  "central-buffer-node": ["rect", 140, 50, { stereotype: "centralBuffer" }],
  "activity-parameter-node": ["rect", 120, 40],
  "expansion-node": ["pin", 40, 14],
  pin: ["pin", 14, 14],
  "input-pin": ["pin", 14, 14],
  "output-pin": ["pin", 14, 14],
  "value-pin": ["pin", 14, 14],
  "edge-connector": ["circle", 24, 24],
  "exception-handler": ["rect", 120, 40],
  parameter: ["rect", 120, 30],
  // state machine
  state: ["state", 140, 60],
  "composite-state": ["state", 300, 200, { container: true }],
  "state-machine": ["frame", 400, 300, { container: true }],
  "state-region": ["dashed-roundrect", 280, 160, { container: true }],
  "initial-state": ["initial", 25, 25],
  "final-state": ["final", 25, 25],
  history: ["history", 28, 28],
  "terminate-node": ["terminate", 24, 24],
  "entry-point": ["entry-point", 20, 20],
  "exit-point": ["exit-point", 20, 20],
  choice: ["decision", 40, 40],
  // sequence / interaction
  lifeline: ["lifeline", 140, 400],
  "activation-bar": ["activation", 20, 70],
  fragment: ["fragment", 420, 200, { container: true }],
  "interaction-operand": ["operand", 400, 100],
  frame: ["frame", 500, 400, { container: true }],
  interaction: ["frame", 300, 160, { container: true }],
  "interaction-use": ["frame", 300, 60],
  destroy: ["destroy", 24, 24],
  "state-invariant": ["roundrect", 100, 30],
  boundary: ["seq-boundary", 60, 50],
  "uml-control": ["seq-control", 50, 50],
  "uml-entity": ["seq-entity", 50, 50],
  "uml-gate": ["port", 10, 10],
  "sequence-coregion": ["rect", 30, 80],
  "sequence-concurrent": ["rect", 30, 80],
  "timing-frame": ["frame", 600, 240, { container: true }],
  "timing-lifeline": ["swimlane", 560, 100],
  "communication-message": ["text", 120, 20],
  // ERD
  "erd-entity": ["erd-entity", 220, 90, { autoHeight: true }],
  "erd-chen-entity": ["chen-entity", 130, 50],
  "erd-chen-relationship": ["chen-relationship", 130, 70],
  "erd-chen-attribute": ["chen-attribute", 110, 44],
  "idef1x-entity": ["idef1x-entity", 200, 100, { autoHeight: true }],
  "idef1x-category-discriminator": ["circle", 30, 30],
  // flowchart
  "flowchart-process": ["rect", 140, 60],
  "flowchart-alternate-process": ["roundrect", 140, 60],
  "flowchart-start-end": ["terminator", 140, 50],
  "flowchart-decision": ["diamond-label", 140, 80],
  "flowchart-data": ["parallelogram", 140, 60],
  "flowchart-document": ["document", 140, 70],
  "flowchart-multi-document": ["multi-document", 140, 80],
  "flowchart-predefined-process": ["predefined", 140, 60],
  "flowchart-internal-storage": ["internal-storage", 120, 70],
  "flowchart-stored-data": ["stored-data", 140, 60],
  "flowchart-direct-data": ["direct-data", 140, 60],
  "flowchart-database": ["cylinder", 100, 80],
  "flowchart-user-input": ["manual-input", 140, 60],
  "flowchart-extract": ["triangle-up", 80, 70],
  "flowchart-merge": ["triangle-down", 80, 70],
  "flowchart-offline-storage": ["offline-storage", 80, 70],
  "flowchart-or-junction": ["or-junction", 40, 40],
  "flowchart-summing-junction": ["summing-junction", 40, 40],
  "flowchart-delay": ["delay", 120, 60],
  "flowchart-user-operation": ["manual-operation", 140, 60],
  "flowchart-preparation": ["hexagon", 140, 60],
  "flowchart-display": ["display", 140, 60],
  "flowchart-sort": ["sort", 60, 70],
  "flowchart-collate": ["collate", 60, 70],
  "flowchart-transfer": ["send-signal", 140, 60],
  "flowchart-off-page": ["off-page", 60, 60],
  "flowchart-connector": ["circle-label", 40, 40],
  "flowchart-swimlane": ["swimlane", 240, 400, { container: true }],
  "flowchart-sequential-access": ["sequential-access", 60, 60],
  "flowchart-card": ["card", 120, 70],
  "screenflow-screen": ["rect", 160, 110],
  "screenflow-start": ["initial", 25, 25],
  "screenflow-end": ["final", 25, 25],
  "screenflow-decision": ["decision", 40, 40],
  // data flow
  "dfd-process": ["dfd-process", 120, 120],
  "dfd-external": ["dfd-external", 140, 70],
  "dfd-data-store": ["dfd-store", 160, 40],
  "dfd-gate": ["junction", 14, 14],
  // mind map
  "mind-map-start": ["mm-central", 180, 80],
  "mind-map-node": ["mm-node", 140, 40],
  // C4
  "c4-person": ["c4-person", 180, 120],
  "c4-software-system": ["c4-box", 220, 140],
  "c4-container": ["c4-box", 220, 140],
  "c4-component": ["c4-box", 220, 140],
  "c4-deployment-node": ["c4-node", 400, 300, { container: true }],
  // BPMN
  "bpmn-task": ["bpmn-activity", 120, 80],
  "bpmn-sub-process": ["bpmn-activity", 140, 90],
  "bpmn-call-activity": ["bpmn-activity", 120, 80],
  "bpmn-transaction": ["bpmn-activity", 160, 100],
  "bpmn-event": ["bpmn-event", 36, 36],
  "bpmn-boundary-event": ["bpmn-event", 30, 30],
  "bpmn-gateway": ["bpmn-gateway", 50, 50],
  "bpmn-data-object": ["bpmn-data", 36, 50],
  "bpmn-data-object-reference": ["bpmn-data", 36, 50],
  "bpmn-data-input": ["bpmn-data", 36, 50],
  "bpmn-data-output": ["bpmn-data", 36, 50],
  "bpmn-data-state": ["roundrect", 80, 24],
  "bpmn-data-store": ["cylinder", 60, 60],
  "bpmn-data-store-reference": ["cylinder", 60, 60],
  "bpmn-pool": ["bpmn-pool", 600, 200, { container: true }],
  "bpmn-lane": ["bpmn-pool", 570, 150, { container: true }],
  "bpmn-participant": ["rect", 140, 60],
  "bpmn-group": ["bpmn-group", 300, 200, { container: true }],
  "bpmn-message": ["envelope", 40, 28],
  "bpmn-text-annotation": ["annotation", 140, 50],
  "bpmn-conversation": ["hexagon", 50, 44],
  "bpmn-sub-conversation": ["hexagon", 50, 44],
  "bpmn-call-conversation": ["hexagon", 50, 44],
  "bpmn-choreography-task": ["bpmn-choreo", 140, 100],
  "bpmn-choreography-sub-process": ["bpmn-choreo", 160, 110],
  "bpmn-call-choreography": ["bpmn-choreo", 140, 100],
  // SysML 1.x
  "sysml-block": ["classifier", 160, 80, { autoHeight: true, stereotype: "block" }],
  "sysml-constraint-block": ["classifier", 160, 80, { autoHeight: true, stereotype: "constraint" }],
  "sysml-value-type": ["classifier", 160, 70, { autoHeight: true, stereotype: "valueType" }],
  "sysml-unit": ["classifier", 140, 60, { autoHeight: true, stereotype: "unit" }],
  "sysml-quantity-kind": ["classifier", 140, 60, { autoHeight: true, stereotype: "quantityKind" }],
  "sysml-viewpoint": ["classifier", 160, 70, { autoHeight: true, stereotype: "viewpoint" }],
  "sysml-requirement": ["requirement", 200, 110],
  "sysml-test-case": ["requirement", 160, 60],
  "sysml-frame": ["frame", 600, 400, { container: true }],
  "sysml-constraint-property": ["roundrect", 160, 70, { stereotype: "constraint" }],
  "sysml-flow-port": ["port", 16, 16],
  "sysml-constraint-property-parameter": ["port", 16, 16],
  property: ["rect", 140, 50],
};

/** SysML v2: `*-df` types are definitions (rectangles), the rest usages (rounded), unless listed. */
const SYSML2_SPECIAL: Record<string, NodePreset> = {
  "sysml2-start": ["initial", 25, 25],
  "sysml2-done": ["final", 25, 25],
  "sysml2-fork": ["bar", 120, 8],
  "sysml2-join": ["bar", 120, 8],
  "sysml2-decision": ["decision", 40, 40],
  "sysml2-merge": ["decision", 40, 40],
  "sysml2-comment": ["note", 160, 70],
  "sysml2-documentation": ["note", 160, 70],
  "sysml2-textual-representation": ["note", 200, 90],
  "sysml2-package": ["package", 220, 160, { container: true }],
  "sysml2-library-package": ["package", 220, 160, { container: true, stereotype: "library" }],
  "sysml2-imported-package": ["package", 200, 140, { container: true }],
  "sysml2-actor": ["actor", 50, 100],
  "sysml2-stakeholder": ["actor", 50, 100, { stereotype: "stakeholder" }],
  "sysml2-use-case": ["usecase", 140, 60],
  "sysml2-include-use-case": ["usecase", 140, 60, { stereotype: "include" }],
  "sysml2-port": ["port", 16, 16],
  "sysml2-parameter": ["port", 16, 16],
  "sysml2-proxy": ["port", 16, 16],
  "sysml2-nary": ["decision", 30, 30],
  "sysml2-view-frame": ["frame", 500, 360, { container: true }],
};

function sysml2Preset(type: string): NodePreset {
  const special = SYSML2_SPECIAL[type];
  if (special) return special;
  const base = type.slice("sysml2-".length);
  if (base.endsWith("-df")) {
    const kind = base.slice(0, -3).replace(/-/g, " ");
    return ["classifier", 160, 70, { autoHeight: true, stereotype: `${kind} def` }];
  }
  return ["roundrect", 150, 60, { stereotype: base.replace(/-/g, " ") }];
}

const KNOWN_CID: Record<string, string> = {
  class: "C",
  enumeration: "E",
  actor: "AC",
  "use-case": "UC",
  relationship: "REL",
  include: "INC",
  extend: "EXT",
  generalization: "GNR",
  dependency: "DEP",
  "erd-entity": "ENT",
  "erd-relationship": "REL",
  comment: "CMT",
  "comment-connector": "CN",
  state: "ST",
  lifeline: "LL",
  "sequence-action": "SM",
  "activation-bar": "AB",
  fragment: "FR",
  object: "OBJ",
  package: "PKG",
  "uml-interface-classifier": "I",
  node: "N",
  artifact: "ART",
  component: "CMP",
};

const EDGE_PATTERN = /(connector|flow$|-flow|relationship|relation$|link$|transition|association|-path$|dependency|participation|message-link|-edge$|arc$|line$|arrow$|-dependency|binding)/;
const NODE_EXCEPTIONS = new Set([
  "edge-connector",
  "communication-message",
  "association-class",
  "page-connector",
  "off-page-connector",
  "pn-transition",
  "grafcet-transition",
  "ig-timeline",
]);
const NODE_PATTERN = /(-action$|-port$|^ui-|^drawing-(?!line$))/;

function guessShape(type: string): NodePreset {
  const t = type;
  if (/gateway|decision|choice|rhombus/.test(t)) return ["decision", 44, 44];
  if (/start-event|end-event|intermediate|event$|-event-/.test(t)) return ["circle", 36, 36];
  if (/(^|-)start$|initial/.test(t)) return ["initial", 25, 25];
  if (/(^|-)end$|final|terminal/.test(t)) return ["final", 28, 28];
  if (/data-store|database|storage|repository|disk/.test(t)) return ["cylinder", 90, 70];
  if (/document|report/.test(t)) return ["document", 120, 70];
  if (/note|comment|annotation/.test(t)) return ["note", 160, 70];
  if (/actor|person|user$|stakeholder|role$/.test(t)) return ["actor", 40, 80];
  if (/cloud|internet/.test(t)) return ["cloud", 140, 90];
  if (/(^|-)node$|server|device|computer|router|switch|firewall|machine/.test(t)) return ["node3d", 140, 90];
  if (/input|output|io$|parallelogram/.test(t)) return ["parallelogram", 140, 60];
  if (/pool|lane|swimlane|boundary|region|frame|group|container|zone|system$|layer/.test(t))
    return ["swimlane", 360, 220, { container: true }];
  if (/junction|connector|point$|dot/.test(t)) return ["circle", 20, 20];
  if (/ellipse|circle|oval|use-case|goal/.test(t)) return ["ellipse", 120, 60];
  if (/text|label|title|caption|heading|paragraph/.test(t)) return ["text", 140, 30];
  if (/task|activity|process|action|step|function|state|procedure|operation/.test(t)) return ["roundrect", 140, 60];
  return ["rect", 140, 60];
}

const catalogElements = (catalog as { elements: Record<string, unknown> }).elements;
const defs = new Map<string, ElementDef>();

export function isEdgeType(type: string): boolean {
  const pick = notationOf(type);
  if (pick) return "edge" in pick;
  if (EDGES[type]) return true;
  if (NODES[type] || NODE_EXCEPTIONS.has(type) || NODE_PATTERN.test(type)) return false;
  return EDGE_PATTERN.test(type);
}

const UI_SIZE: Record<string, [number, number]> = {
  "ui-button": [110, 32],
  "ui-drop-down-button": [130, 32],
  "ui-button-group": [160, 48],
  "ui-button-panel": [180, 48],
  "ui-check-box": [140, 28],
  "ui-radio-button": [140, 28],
  "ui-on-off": [64, 28],
  "ui-text-box": [160, 32],
  "ui-numeric-box": [120, 32],
  "ui-search-box": [180, 32],
  "ui-time-control": [140, 32],
  "ui-combo-box": [160, 32],
  "ui-multi-line": [180, 80],
  "ui-paragraph": [200, 70],
  "ui-label": [120, 24],
  "ui-item": [120, 24],
  "ui-menu-item": [140, 24],
  "ui-list-box": [160, 110],
  "ui-checked-list": [160, 110],
  "ui-field-list": [180, 110],
  "ui-tree": [160, 120],
  "ui-menu": [150, 100],
  "ui-context-menu": [150, 100],
  "ui-accordion-menu": [170, 110],
  "ui-progress-bar": [160, 22],
  "ui-track-bar": [160, 28],
  "ui-slider": [160, 28],
  "ui-rating-bar": [120, 28],
  "ui-scroll-bar": [16, 120],
  "ui-window": [260, 180],
  "ui-panel": [200, 140],
  "ui-area": [200, 140],
  "ui-group-box": [200, 120],
  "ui-titled-panel": [200, 140],
  "ui-app-title-panel": [220, 40],
  "ui-named-box": [160, 80],
  "ui-tab-control": [220, 140],
  "ui-tabs": [180, 36],
  "ui-toolbar": [220, 36],
  "ui-grid": [200, 120],
  "ui-splitter": [12, 120],
  "ui-map": [200, 140],
  "ui-video": [200, 120],
  "ui-web-browser": [240, 160],
  "ui-smartphone": [120, 210],
  "ui-keyboard": [220, 80],
  "ui-calendar": [180, 150],
  "ui-login": [180, 120],
  "ui-loading-spinner": [48, 48],
  "ui-alert": [200, 48],
  "ui-breadcrumbs": [200, 28],
  "ui-pager": [160, 28],
  "ui-alphabet-bar": [200, 28],
  "ui-ruler": [180, 24],
  "ui-thumbnail-view": [180, 110],
};

export function getElementDef(type: string): ElementDef {
  let def = defs.get(type);
  if (def) return def;
  const cidPrefix = KNOWN_CID[type] ?? "ELEM";
  const pick = notationOf(type);
  if (type.startsWith("ui-")) {
    const size = UI_SIZE[type] ?? [150, 36];
    def = { type, category: "node", shape: "ui", width: size[0], height: size[1], cidPrefix: "UI" };
  } else if (pick && "edge" in pick) {
    def = {
      type,
      category: "edge",
      shape: "rect",
      width: 0,
      height: 0,
      edge: { dashed: !!pick.dashed, start: pick.start ?? "none", end: pick.end ?? "open-arrow" },
      cidPrefix,
    };
  } else if (pick) {
    def = { type, category: "node", shape: pick.shape, width: pick.w, height: pick.h, cidPrefix, container: pick.container, stereotype: pick.stereotype };
  } else if (isEdgeType(type)) {
    def = { type, category: "edge", shape: "rect", width: 0, height: 0, edge: EDGES[type] ?? solid("open-arrow"), cidPrefix };
  } else {
    const [shape, width, height, extra] = NODES[type] ?? (type.startsWith("sysml2-") ? sysml2Preset(type) : guessShape(type));
    def = { type, category: "node", shape, width, height, cidPrefix, ...extra };
  }
  defs.set(type, def);
  return def;
}

export function isKnownType(type: string): boolean {
  return type in catalogElements || type in EDGES || type in NODES;
}

/** Types with dedicated rendering and editing; everything else uses heuristics. */
export function hasDedicatedSupport(type: string): boolean {
  return type in EDGES || type in NODES || type.startsWith("sysml2-") || type.startsWith("ui-") || notationOf(type) !== undefined;
}

export const CLASSIFIER_TYPES = new Set(["class", "data-type", "signal", "uml-interface-classifier", "enumeration", "stereotype"]);
