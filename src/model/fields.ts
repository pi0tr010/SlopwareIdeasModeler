export type ExtraField = { key: string; label: string; kind: "text" | "check" | "select" | "textarea"; options?: string[] };

export const FRAGMENT_OPERATORS = ["alt", "opt", "loop", "par", "break", "critical", "neg", "assert", "strict", "seq", "ignore", "consider", "ref"];

const description: ExtraField = { key: "description", label: "props.description", kind: "textarea" };
const technology: ExtraField = { key: "technology", label: "props.technology", kind: "text" };
const external: ExtraField = { key: "external", label: "props.external", kind: "check" };

/**
 * Per-type values kept in `props`, edited with plain inputs. Check fields hold "true" or "false".
 * Every key is stored in the native place of the .simp format (see io/nativeProps.ts).
 */
export const EXTRA_FIELDS: Record<string, ExtraField[]> = {
  "c4-person": [external, description],
  "c4-software-system": [external, description],
  "c4-container": [technology, description],
  "c4-component": [technology, description],
  "c4-deployment-node": [technology, description],
  "bpmn-event": [{ key: "eventType", label: "props.eventType", kind: "select", options: ["Start", "Intermediate", "End"] }],
  "bpmn-gateway": [
    {
      key: "gatewayType",
      label: "props.gatewayType",
      kind: "select",
      options: ["", "Exclusive", "EventBased", "Parallel", "Inclusive", "Complex", "ExclusiveEventBased", "ParallelEventBased"],
    },
  ],
  "bpmn-sub-process": [{ key: "collapsed", label: "props.collapsed", kind: "check" }],
  "bpmn-data-object": [{ key: "collection", label: "props.collection", kind: "check" }],
  "bpmn-text-annotation": [{ key: "text", label: "props.text", kind: "textarea" }],
  "sysml-requirement": [
    { key: "reqId", label: "props.reqId", kind: "text" },
    { key: "text", label: "props.text", kind: "textarea" },
  ],
};

export const MESSAGE_TYPES = ["call", "reply", "create", "destroy", "send"];

/** All known `props` keys per type, including those with a dedicated editor in the Properties panel. */
export const PROP_FIELDS: Record<string, ExtraField[]> = {
  ...EXTRA_FIELDS,
  comment: [{ key: "text", label: "props.text", kind: "textarea" }],
  fragment: [{ key: "operator", label: "props.operator", kind: "select", options: FRAGMENT_OPERATORS }],
  "sequence-action": [
    { key: "message", label: "props.message", kind: "text" },
    { key: "messageType", label: "props.messageType", kind: "select", options: MESSAGE_TYPES },
    { key: "async", label: "props.async", kind: "check" },
    { key: "returnValue", label: "props.returnValue", kind: "text" },
  ],
};
