export interface FontSpec {
  family: string;
  size: number;
  weight?: "bold" | "normal";
  italic?: boolean;
}

export interface StyleSet {
  id: string;
  name: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  textColor: string;
  nameFont: FontSpec;
  textFont: FontSpec;
  stereotypeFont: FontSpec;
  shadow: boolean;
  noteFill: string;
  noteStroke: string;
  lineColor: string;
  lineWidth: number;
  faintLineColor: string;
  canvas: string;
}

// Segoe UI is the font of .simp styles on Windows; the fallbacks keep metrics close on Linux.
const UI_FONT = '"Segoe UI", "Noto Sans", "DejaVu Sans", Arial, sans-serif';

/** Default .simp style of version 12+. Point sizes converted at 96 DPI. */
export const SIM12: StyleSet = {
  id: "sim12",
  name: "Default",
  fill: "#F2F2F2",
  stroke: "#555555",
  strokeWidth: 2,
  textColor: "#555555",
  nameFont: { family: UI_FONT, size: 15, weight: "bold" },
  textFont: { family: UI_FONT, size: 13 },
  stereotypeFont: { family: UI_FONT, size: 12, italic: true },
  shadow: true,
  noteFill: "#FBE8B3",
  noteStroke: "#D8B866",
  lineColor: "#555555",
  lineWidth: 1.5,
  faintLineColor: "rgba(0,0,0,0.5)",
  canvas: "#FFFFFF",
};

/** "Simple.simss": white shapes, black 1px borders, Arial 10pt. */
export const SIMPLE: StyleSet = {
  id: "simple",
  name: "Simple",
  fill: "#FFFFFF",
  stroke: "#000000",
  strokeWidth: 1,
  textColor: "#000000",
  nameFont: { family: 'Arial, "Liberation Sans", sans-serif', size: 13 },
  textFont: { family: 'Arial, "Liberation Sans", sans-serif', size: 13 },
  stereotypeFont: { family: 'Arial, "Liberation Sans", sans-serif', size: 13 },
  shadow: true,
  noteFill: "#FFFF55",
  noteStroke: "#000000",
  lineColor: "#000000",
  lineWidth: 1,
  faintLineColor: "rgba(0,0,0,0.5)",
  canvas: "#FFFFFF",
};

/** Classic look with blue tones. */
export const CLASSIC: StyleSet = {
  ...SIMPLE,
  id: "classic",
  name: "Classic",
  fill: "#E6EEF8",
  stroke: "#3A5A8C",
  textColor: "#1E1E1E",
  nameFont: { family: UI_FONT, size: 13, weight: "bold" },
  textFont: { family: UI_FONT, size: 12 },
  stereotypeFont: { family: UI_FONT, size: 12, italic: true },
  lineColor: "#3A5A8C",
};

export const STYLE_SETS = [SIM12, SIMPLE, CLASSIC];

/** Classic style for the dark theme; used only on screen, files and exports keep the light style. */
export const CLASSIC_DARK: StyleSet = {
  ...CLASSIC,
  id: "classic-dark",
  name: "Classic (dark)",
  fill: "#263244",
  stroke: "#8DB3EA",
  textColor: "#E3E8F0",
  shadow: false,
  noteFill: "#4A4130",
  noteStroke: "#C9A85A",
  lineColor: "#9DB8DE",
  faintLineColor: "rgba(255,255,255,0.45)",
  canvas: "#1B1D22",
};

export const cssFont = (f: FontSpec) => `${f.italic ? "italic " : ""}${f.weight === "bold" ? "bold " : ""}${f.size}px ${f.family}`;

let ctx: CanvasRenderingContext2D | null | undefined;
const cache = new Map<string, number>();

export function measureText(text: string, font: FontSpec): number {
  const key = cssFont(font) + "|" + text;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (ctx === undefined) {
    try {
      ctx = document.createElement("canvas").getContext("2d");
    } catch {
      ctx = null;
    }
  }
  let w: number;
  if (ctx) {
    ctx.font = cssFont(font);
    w = ctx.measureText(text).width;
  } else {
    w = text.length * font.size * (font.weight === "bold" ? 0.6 : 0.55);
  }
  if (cache.size > 20000) cache.clear();
  cache.set(key, w);
  return w;
}

/** Greedy word wrap used for names inside shapes (names wrap by default). */
export function wrapText(text: string, font: FontSpec, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = words[0];
    for (const w of words.slice(1)) {
      const candidate = line + " " + w;
      if (measureText(candidate, font) <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = w;
      }
    }
    lines.push(line);
  }
  return lines;
}
