import templates from "./simpTemplates.json";

/**
 * Default XML of each element type, exactly as the original application saves a newly created
 * element. `{id}` and `{iid}` stand for the element id and the diagram item id.
 */
export interface ElementTemplate {
  /** Extra attributes of the model `<item>` (visibility, ...). */
  attrs?: Record<string, string>;
  /** Children of the model `<item>`: stereotypes and the type-specific detail element. */
  inner?: string;
  /** `type` attribute of the diagram item ("entity", "relation", "ui-button", ...); absent for model-only types. */
  view?: string;
  viewAttrs?: Record<string, string>;
  /** Extra `<layout>` attributes. */
  layout?: Record<string, string>;
  viewInner?: string;
  size?: [number, number];
}

const all = templates as unknown as Record<string, ElementTemplate>;

export function getTemplate(type: string): ElementTemplate | undefined {
  return all[type];
}

const fill = (xml: string, id: string, iid = "") => xml.replaceAll("{id}", id).replaceAll("{iid}", iid);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Model `<item>` for a new element of `type`, before names and properties are applied. */
export function templateItem(type: string, id: string, cid: string, now: string): string {
  const t = all[type];
  const attrs = { id, cid, type, name: "", ...t?.attrs, "creation-date": now };
  const head = Object.entries(attrs)
    .map(([k, v]) => `${k}="${esc(v)}"`)
    .join(" ");
  return `<item ${head}>${fill(t?.inner ?? "", id)}</item>`;
}

/** Diagram item defaults for a new view of an element of `type`. */
export function templateView(type: string, id: string, iid: string) {
  const t = all[type];
  return {
    itemType: t?.view,
    itemAttrs: t?.viewAttrs ? { ...t.viewAttrs } : undefined,
    layoutExtra: t?.layout ? { ...t.layout } : undefined,
    rawInner: t?.viewInner ? fill(t.viewInner, id, iid) : undefined,
  };
}
