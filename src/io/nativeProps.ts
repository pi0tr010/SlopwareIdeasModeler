/**
 * Where the editable `props` of each element type live inside the model `<item>` of a .simp file.
 * Values are stored exactly as the original application stores them, so files stay compatible.
 */
interface NativeProp {
  key: string;
  /** Child element of `<item>` that holds the value. */
  el: string;
  /** Attribute of `el`; without it the value is the text of `el` (or of its `sub` child). */
  attr?: string;
  sub?: string;
  /** Converts the stored value to the `props` value (undefined drops it). */
  read?: (stored: string | null) => string | undefined;
  /** Converts the `props` value to the stored value (null removes the attribute). */
  write?: (value: string) => string | null;
}

const location = (el: string): NativeProp => ({
  key: "external",
  el,
  attr: "location",
  read: (v) => (v === "External" ? "true" : undefined),
  write: (v) => (v === "true" ? "External" : "Internal"),
});
const technology = (el: string): NativeProp => ({ key: "technology", el, attr: "technology" });
const description = (el: string): NativeProp => ({ key: "description", el, sub: "description" });

const NATIVE_PROPS: Record<string, NativeProp[]> = {
  "c4-person": [location("person"), description("person")],
  "c4-software-system": [location("software-system"), description("software-system")],
  "c4-container": [technology("container"), description("container")],
  "c4-component": [technology("container"), description("container")],
  "c4-deployment-node": [technology("deployment-node"), description("deployment-node")],
  "bpmn-event": [
    {
      key: "eventType",
      el: "event",
      attr: "timming-type",
      read: (v) => v || "Intermediate",
      write: (v) => (!v || v === "Intermediate" ? null : v),
    },
  ],
  "bpmn-gateway": [{ key: "gatewayType", el: "gateway", attr: "type", write: (v) => v || null }],
  "bpmn-data-object": [
    { key: "collection", el: "data-object", attr: "is-collection", read: (v) => (v === "true" ? "true" : undefined), write: (v) => (v === "true" ? "true" : null) },
  ],
  "bpmn-text-annotation": [{ key: "text", el: "text-annotation" }],
  "sysml-requirement": [{ key: "text", el: "text" }],
};

export const nativePropKeys = (type: string): string[] => (NATIVE_PROPS[type] ?? []).map((p) => p.key);

const childOf = (el: Element, tag: string) => Array.from(el.children).find((c) => c.tagName === tag);

export function readNativeProps(item: Element, type: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of NATIVE_PROPS[type] ?? []) {
    const host = childOf(item, p.el);
    if (!host) continue;
    const stored = p.attr ? host.getAttribute(p.attr) : ((p.sub ? childOf(host, p.sub) : host)?.textContent ?? null);
    const value = p.read ? p.read(stored) : stored || undefined;
    if (value !== undefined) out[p.key] = value;
  }
  return out;
}

/** Writes `props` into the native places of `item`, creating the detail element when needed. */
export function writeNativeProps(item: Element, type: string, props: Record<string, string> = {}): void {
  const doc = item.ownerDocument;
  for (const p of NATIVE_PROPS[type] ?? []) {
    const value = props[p.key] ?? "";
    let host = childOf(item, p.el);
    if (!host) {
      host = doc.createElement(p.el);
      item.appendChild(host);
    }
    const stored = p.write ? p.write(value) : value;
    if (p.attr) {
      if (stored === null) host.removeAttribute(p.attr);
      else host.setAttribute(p.attr, stored);
      continue;
    }
    let target = host;
    if (p.sub) {
      target = childOf(host, p.sub) ?? host.appendChild(doc.createElement(p.sub));
    }
    target.textContent = stored ?? "";
  }
}
