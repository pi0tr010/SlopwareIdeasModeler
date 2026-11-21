import { getElementDef } from "../model/registry";
import type { ErdAttribute, ModelElement, UmlAttribute, UmlOperation, Visibility } from "../model/types";

const VIS: Record<Visibility, string> = { public: "+", private: "-", protected: "#", package: "~" };

export const visibilitySymbol = (v?: string) => VIS[(v ?? "public") as Visibility] ?? "";

export function formatAttribute(a: UmlAttribute, showVisibility = true): string {
  let s = (showVisibility ? visibilitySymbol(a.visibility) + " " : "") + a.name;
  if (a.type) s += " : " + a.type;
  if (a.multiplicity) s += ` [${a.multiplicity}]`;
  if (a.defaultValue) s += " = " + a.defaultValue;
  return s;
}

export function formatOperation(o: UmlOperation, showVisibility = true): string {
  const params = o.parameters
    .map((p) => `${p.direction && p.direction !== "in" ? p.direction + " " : ""}${p.name}${p.type ? " : " + p.type : ""}${p.defaultValue ? " = " + p.defaultValue : ""}`)
    .join(", ");
  let s = (showVisibility ? visibilitySymbol(o.visibility) + " " : "") + `${o.name}(${params})`;
  if (o.returnType) s += " : " + o.returnType;
  return s;
}

export function formatErdType(a: ErdAttribute): string {
  return a.size ? `${a.type}(${a.size})` : a.type;
}

export function erdKeyLabel(a: ErdAttribute): string {
  return [a.primaryKey ? "PK" : "", a.foreignKey ? "FK" : ""].filter(Boolean).join(",");
}

export const guillemets = (s: string) => `\u00AB${s}\u00BB`;

/** User stereotypes plus the one implied by the element type (the original shows «block», «interface», ... without storing them). */
export function stereotypeLine(el: ModelElement): string | null {
  const implied = getElementDef(el.type).stereotype;
  const all = implied && !el.stereotypes?.includes(implied) ? [implied, ...(el.stereotypes ?? [])] : (el.stereotypes ?? []);
  return all.length ? all.map(guillemets).join(" ") : null;
}
