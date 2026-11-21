import type { ModelElement, ShapeView } from "../model/types";
import { simColor } from "./richtext";
import type { FontSpec, StyleSet } from "./style";

/** Per-element overrides read from a `<style style-name="...">` block. */
export interface CustomStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  shadow?: boolean;
  nameFont?: FontSpec;
  nameColor?: string;
  textFont?: FontSpec;
  textColor?: string;
  stereotypeFont?: FontSpec;
}

const PT = 96 / 72;
const cache = new Map<string, CustomStyle | null>();

/** Fonts look like "Verdana;10;B" (family; size in points; B/I/U flags). */
function parseFont(spec: string | null, base: FontSpec): FontSpec | undefined {
  if (!spec) return undefined;
  const [family, size, flags = ""] = spec.split(";");
  return {
    family: family ? `"${family}", ${base.family}` : base.family,
    size: Number(size) ? Number(size) * PT : base.size,
    weight: flags.includes("B") ? "bold" : "normal",
    italic: flags.includes("I"),
  };
}

function extractStyle(xml: string): string | null {
  const m = /<style\b[^>]*\bstyle-name="[^"]*"[\s\S]*?<\/style>/.exec(xml);
  return m ? m[0] : null;
}

export function parseCustomStyle(xml: string | undefined, base: StyleSet): CustomStyle | null {
  if (!xml || !xml.includes("style-name=")) return null;
  const key = base.id + "|" + xml;
  if (cache.has(key)) return cache.get(key)!;
  let result: CustomStyle | null = null;
  const block = extractStyle(xml);
  if (block) {
    const doc = new DOMParser().parseFromString(block, "application/xml");
    const s = doc.documentElement;
    if (s.tagName === "style") {
      result = {};
      const bg = s.querySelector(":scope > background");
      if (bg && bg.getAttribute("type") !== "none") result.fill = simColor(bg.getAttribute("color"), base.fill);
      const border = s.querySelector(":scope > border");
      if (border) {
        const width = Number(border.getAttribute("width") ?? "1");
        result.stroke = width > 0 ? simColor(border.getAttribute("color"), base.stroke) : "none";
        result.strokeWidth = width > 0 ? width : 0;
      }
      if (s.getAttribute("shadow-type") === "none") result.shadow = false;
      const text = (type: string) => s.querySelector(`:scope > text-style[type="${type}"]`);
      const name = text("name");
      if (name) {
        result.nameFont = parseFont(name.getAttribute("font"), base.nameFont);
        result.nameColor = simColor(name.getAttribute("color"), base.textColor);
      }
      const body = text("text");
      if (body) {
        result.textFont = parseFont(body.getAttribute("font"), base.textFont);
        result.textColor = simColor(body.getAttribute("color"), base.textColor);
      }
      const st = text("stereotype");
      if (st) result.stereotypeFont = parseFont(st.getAttribute("font"), base.stereotypeFont);
    }
  }
  if (cache.size > 2000) cache.clear();
  cache.set(key, result);
  return result;
}

/**
 * Style for one shape: the view's own style wins over the model element's. Custom colors are skipped in the
 * dark theme, where they would often be unreadable.
 */
export function styleForShape(shape: ShapeView, el: ModelElement, base: StyleSet): StyleSet {
  if (base.id === "classic-dark") return base;
  const custom = parseCustomStyle(shape.rawInner, base) ?? parseCustomStyle(el.raw, base);
  if (!custom) return base;
  return {
    ...base,
    fill: custom.fill ?? base.fill,
    stroke: custom.stroke ?? base.stroke,
    strokeWidth: custom.strokeWidth ?? base.strokeWidth,
    shadow: custom.shadow ?? base.shadow,
    nameFont: custom.nameFont ?? base.nameFont,
    textFont: custom.textFont ?? base.textFont,
    stereotypeFont: custom.stereotypeFont ?? base.stereotypeFont,
    textColor: custom.nameColor ?? custom.textColor ?? base.textColor,
  };
}
