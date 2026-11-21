import { measureText, type FontSpec } from "./style";

/** A run of text with one font and color, from `<formatted-text>`. */
interface Run {
  text: string;
  font: FontSpec;
  color: string;
}

interface Paragraph {
  runs: Run[];
  bullet: boolean;
  leftIndent: number;
  firstIndent: number;
  lineSpacing: number;
  spaceBefore: number;
  spaceAfter: number;
}

const PT = 96 / 72;

/** .simp stores colors as #AARRGGBB. */
export function simColor(argb: string | null | undefined, fallback: string): string {
  if (!argb) return fallback;
  const m = /^#([0-9a-f]{2})([0-9a-f]{6})$/i.exec(argb);
  if (!m) return argb;
  const alpha = parseInt(m[1], 16) / 255;
  return alpha >= 1 ? `#${m[2]}` : `rgba(${parseInt(m[2].slice(0, 2), 16)}, ${parseInt(m[2].slice(2, 4), 16)}, ${parseInt(m[2].slice(4), 16)}, ${alpha.toFixed(3)})`;
}

interface RunStyle {
  font: FontSpec;
  color: string;
}

function readStyle(s: Element | null | undefined, base: RunStyle): RunStyle {
  if (!s) return base;
  const size = s.getAttribute("font-size");
  const brush = s.querySelector(":scope > text > solid-brush");
  return {
    font: {
      family: s.getAttribute("font-name") ? `"${s.getAttribute("font-name")}", serif` : base.font.family,
      size: size ? Number(size) * PT : base.font.size,
      weight: s.hasAttribute("font-bold") ? (s.getAttribute("font-bold") === "true" ? "bold" : "normal") : base.font.weight,
      italic: s.hasAttribute("font-italic") ? s.getAttribute("font-italic") === "true" : base.font.italic,
    },
    color: brush ? simColor(brush.getAttribute("color"), base.color) : base.color,
  };
}

const cache = new Map<string, Paragraph[]>();

export function parseFormattedText(raw: string, base: RunStyle): Paragraph[] {
  const key = raw + "|" + base.font.family + base.font.size + base.color;
  const hit = cache.get(key);
  if (hit) return hit;
  const doc = new DOMParser().parseFromString(`<root>${raw}</root>`, "application/xml");
  const root = doc.querySelector("formatted-text > text");
  const named = new Map<string, Element>();
  root?.querySelectorAll(":scope > styles > style").forEach((s) => named.set(s.getAttribute("name") ?? "", s));
  const out: Paragraph[] = [];
  root?.querySelectorAll(":scope > content > paragraph").forEach((para) => {
    const ps = para.querySelector(":scope > style");
    const paraBase = readStyle(ps?.querySelector(":scope > text > style"), base);
    const runs: Run[] = [];
    para.querySelectorAll(":scope > p").forEach((p) => {
      const st = p.getAttribute("s") ? readStyle(named.get(p.getAttribute("s")!), paraBase) : paraBase;
      const text = Array.from(p.querySelectorAll(":scope > t"))
        .map((t) => t.textContent ?? "")
        .join("");
      if (text) runs.push({ text, font: st.font, color: st.color });
    });
    const n = (a: string, d = 0) => Number(ps?.getAttribute(a) ?? d) || d;
    out.push({
      runs,
      bullet: ps?.getAttribute("type") === "BulletedList",
      leftIndent: n("left-indent") * PT,
      firstIndent: n("first-indent") * PT,
      lineSpacing: n("line-spacing", 1) || 1,
      spaceBefore: n("space-before") * PT,
      spaceAfter: n("space-after") * PT,
    });
  });
  cache.set(key, out);
  return out;
}

interface Placed {
  x: number;
  y: number;
  text: string;
  font: FontSpec;
  color: string;
}

function layout(paragraphs: Paragraph[], width: number, pad: number): { placed: Placed[]; bullets: Placed[] } {
  const placed: Placed[] = [];
  const bullets: Placed[] = [];
  let y = pad;
  for (const para of paragraphs) {
    y += para.spaceBefore;
    const left = pad + para.leftIndent;
    let line: Placed[] = [];
    let x = left;
    let lineMax = 0;
    let first = true;
    const flush = () => {
      const h = Math.max(lineMax, para.runs[0]?.font.size ?? 13) * 1.2 * para.lineSpacing;
      const baseline = y + h * 0.8;
      for (const p of line) placed.push({ ...p, y: baseline });
      if (first && para.bullet && para.runs[0]) bullets.push({ x: pad + para.firstIndent, y: baseline, text: "\u2022", font: para.runs[0].font, color: para.runs[0].color });
      first = false;
      y += h;
      line = [];
      x = left;
      lineMax = 0;
    };
    for (const run of para.runs) {
      // Paragraph text ends with "\n" in .simp; it marks the paragraph end, not an empty line.
      const parts = run.text.replace(/\n+$/, "").split("\n");
      parts.forEach((part, i) => {
        if (i > 0) flush();
        for (const token of part.split(/(\s+)/).filter(Boolean)) {
          const w = measureText(token, run.font);
          if (x + w > width - pad && x > left && token.trim()) flush();
          if (!token.trim() && x === left) continue;
          line.push({ x, y: 0, text: token, font: run.font, color: run.color });
          x += w;
          lineMax = Math.max(lineMax, run.font.size);
        }
      });
    }
    if (line.length || first) flush();
    y += para.spaceAfter;
  }
  return { placed, bullets };
}

export function FormattedText({ raw, width, base }: { raw: string; width: number; base: RunStyle }) {
  const { placed, bullets } = layout(parseFormattedText(raw, base), width, 4);
  return (
    <g>
      {[...bullets, ...placed].map((p, i) => (
        <text
          key={i}
          x={p.x}
          y={p.y}
          xmlSpace="preserve"
          fontFamily={p.font.family}
          fontSize={p.font.size}
          fontWeight={p.font.weight}
          fontStyle={p.font.italic ? "italic" : undefined}
          fill={p.color}
        >
          {p.text}
        </text>
      ))}
    </g>
  );
}
