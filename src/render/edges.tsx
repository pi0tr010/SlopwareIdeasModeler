import { getElementDef, type EdgeSpec, type Marker } from "../model/registry";
import type { LineStyle, ModelElement, Point, RoleEnd } from "../model/types";
import { guillemets } from "./format";
import { polylineMidpoint } from "./geometry";
import type { StyleSet } from "./style";

export function edgeSpecFor(el: ModelElement): EdgeSpec {
  const base = getElementDef(el.type).edge ?? { dashed: false, start: "none", end: "open-arrow" };
  if (el.type === "relationship" && el.start && el.end) {
    return { ...base, start: roleMarker(el.start), end: roleMarker(el.end) };
  }
  if (el.type === "sequence-action") {
    const kind = el.props?.messageType ?? "call";
    const async = el.props?.async === "true";
    if (kind === "reply" || kind === "return") return { dashed: true, start: "none", end: "open-arrow" };
    if (kind === "create") return { dashed: true, start: "none", end: "open-arrow", label: "create" };
    return { dashed: false, start: "none", end: async ? "open-arrow" : "filled-arrow" };
  }
  if (el.type === "erd-relationship") return { dashed: el.erd?.kind !== "Identifying", start: "none", end: "none" };
  return base;
}

function roleMarker(r: RoleEnd): Marker {
  if (r.aggregation === "composition") return "filled-diamond";
  if (r.aggregation === "aggregation") return "hollow-diamond";
  if (r.navigability === "navigable") return "open-arrow";
  return "none";
}

export function linePath(points: Point[], style: LineStyle): string {
  if (points.length < 2) return "";
  if ((style === "smooth" || style === "curve") && points.length > 2) {
    let d = `M${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
      d += ` Q${points[i].x} ${points[i].y} ${i === points.length - 2 ? `${points[i + 1].x} ${points[i + 1].y}` : `${mid.x} ${mid.y}`}`;
    }
    return d;
  }
  if (style === "rounded-rectangular" && points.length > 2) {
    const r = 8;
    let d = `M${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i];
      const a = points[i - 1];
      const b = points[i + 1];
      const la = Math.hypot(p.x - a.x, p.y - a.y);
      const lb = Math.hypot(b.x - p.x, b.y - p.y);
      const ra = Math.min(r, la / 2);
      const rb = Math.min(r, lb / 2);
      const s = { x: p.x - ((p.x - a.x) / (la || 1)) * ra, y: p.y - ((p.y - a.y) / (la || 1)) * ra };
      const e = { x: p.x + ((b.x - p.x) / (lb || 1)) * rb, y: p.y + ((b.y - p.y) / (lb || 1)) * rb };
      d += ` L${s.x} ${s.y} Q${p.x} ${p.y} ${e.x} ${e.y}`;
    }
    const last = points[points.length - 1];
    return d + ` L${last.x} ${last.y}`;
  }
  return points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
}

/** Marker drawn at `tip`, pointing in the direction from `from` to `tip`. */
function MarkerShape({ kind, tip, from, color, width, fill }: { kind: Marker; tip: Point; from: Point; color: string; width: number; fill: string }) {
  if (kind === "none") return null;
  const angle = (Math.atan2(tip.y - from.y, tip.x - from.x) * 180) / Math.PI;
  const t = `translate(${tip.x} ${tip.y}) rotate(${angle})`;
  const common = { stroke: color, strokeWidth: width, strokeLinejoin: "miter" as const };
  switch (kind) {
    case "open-arrow":
      return <path transform={t} d="M-12 -6 L0 0 L-12 6" fill="none" {...common} />;
    case "filled-arrow":
      return <path transform={t} d="M-12 -5 L0 0 L-12 5 Z" fill={color} {...common} />;
    case "hollow-triangle":
      return <path transform={t} d="M-15 -8 L0 0 L-15 8 Z" fill={fill} {...common} />;
    case "hollow-diamond":
      return <path transform={t} d="M0 0 L-9 -5.5 L-18 0 L-9 5.5 Z" fill={fill} {...common} />;
    case "filled-diamond":
      return <path transform={t} d="M0 0 L-9 -5.5 L-18 0 L-9 5.5 Z" fill={color} {...common} />;
    case "circle-plus":
      return (
        <g transform={t} {...common} fill={fill}>
          <circle cx={-7} cy={0} r={7} />
          <path d="M-14 0 H0 M-7 -7 V7" />
        </g>
      );
    case "filled-dot":
      return <circle transform={t} cx={-4} cy={0} r={4} fill={color} {...common} />;
    case "small-diamond":
      return <path transform={t} d="M0 0 L-7 -4.5 L-14 0 L-7 4.5 Z" fill={fill} {...common} />;
    case "slash":
      return <path transform={t} d="M-14 -6 L-8 6" fill="none" {...common} />;
    case "small-circle":
      return <circle transform={t} cx={-4} cy={0} r={4} fill={fill} {...common} />;
    case "hollow-arrow":
      return <path transform={t} d="M-11 -5.5 L0 0 L-11 5.5 Z" fill={fill} {...common} />;
  }
}

/** Crow's foot notation end for an ERD relationship multiplicity ("1", "0..1", "1..*", "0..*", "*"). */
function CrowFoot({ mult, tip, from, color, bg }: { mult: string; tip: Point; from: Point; color: string; bg: string }) {
  const angle = (Math.atan2(tip.y - from.y, tip.x - from.x) * 180) / Math.PI;
  const many = /\*|n|m/i.test(mult) || /\.\.\s*[2-9]/.test(mult);
  const optional = /^0/.test(mult.trim());
  const parts: string[] = [];
  if (many) parts.push("M0 -7 L-12 0 L0 7 M0 0 L-12 0");
  else parts.push("M-8 -7 V7");
  if (optional) {
    return (
      <g transform={`translate(${tip.x} ${tip.y}) rotate(${angle})`} stroke={color} strokeWidth={1.5} fill="none">
        <path d={parts.join(" ")} />
        <circle cx={-19} cy={0} r={5} fill={bg} />
      </g>
    );
  }
  parts.push("M-15 -7 V7");
  return <path transform={`translate(${tip.x} ${tip.y}) rotate(${angle})`} d={parts.join(" ")} stroke={color} strokeWidth={1.5} fill="none" />;
}

function EndLabel({ at, toward, text, side, style }: { at: Point; toward: Point; text: string; side: 1 | -1; style: StyleSet }) {
  if (!text) return null;
  const dx = toward.x - at.x;
  const dy = toward.y - at.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy * side;
  const py = ux * side;
  const x = at.x + ux * 14 + px * 6;
  const y = at.y + uy * 14 + py * 6;
  // Grow the text away from the line so labels on opposite sides never overlap.
  const anchor = Math.abs(px) > 0.5 ? (px < 0 ? "end" : "start") : "middle";
  const fs = style.textFont.size - 1;
  const baseline = Math.abs(py) > 0.5 ? (py > 0 ? y + fs : y - 2) : y + fs / 3;
  return (
    <text x={x} y={baseline} textAnchor={anchor} fontFamily={style.textFont.family} fontSize={fs} fill={style.textColor}>
      {text}
    </text>
  );
}

export function EdgeView({ el, points, lineStyle, style }: { el: ModelElement; points: Point[]; lineStyle: LineStyle; style: StyleSet }) {
  if (points.length < 2) return null;
  const spec = edgeSpecFor(el);
  const color = spec.faint ? style.faintLineColor : style.lineColor;
  const width = spec.faint ? 1 : style.lineWidth;
  const first = points[0];
  const second = points[1];
  const last = points[points.length - 1];
  const beforeLast = points[points.length - 2];
  const mid = polylineMidpoint(points);
  const labels: string[] = [];
  if (spec.label) labels.push(guillemets(spec.label));
  const extraStereotypes = (el.stereotypes ?? []).filter((s) => s !== spec.label);
  if (extraStereotypes.length) labels.push(extraStereotypes.map(guillemets).join(" "));
  const midText = edgeMidText(el);
  if (midText) labels.push(...midText.split("\n"));
  const fontSize = style.textFont.size - 1;

  return (
    <g>
      <path d={linePath(points, lineStyle)} fill="none" stroke={color} strokeWidth={width} strokeDasharray={spec.dashed ? "6 4" : spec.dotted ? "2 3" : undefined} />
      {el.type === "erd-relationship" && el.erd ? (
        <>
          <CrowFoot mult={el.erd.multiplicityFrom} tip={first} from={second} color={color} bg={style.canvas} />
          <CrowFoot mult={el.erd.multiplicityTo} tip={last} from={beforeLast} color={color} bg={style.canvas} />
        </>
      ) : (
        <>
          <MarkerShape kind={spec.start} tip={first} from={second} color={color} width={width} fill={style.canvas} />
          <MarkerShape kind={spec.end} tip={last} from={beforeLast} color={color} width={width} fill={style.canvas} />
        </>
      )}
      {labels.length > 0 && (
        <text x={mid.point.x} y={mid.point.y - 6 - (labels.length - 1) * fontSize * 1.2} textAnchor="middle" fontFamily={style.textFont.family} fontSize={fontSize} fill={style.textColor}>
          {labels.map((l, i) => (
            <tspan key={i} x={mid.point.x} dy={i ? fontSize * 1.2 : 0}>
              {l}
            </tspan>
          ))}
        </text>
      )}
      {el.start && (
        <>
          <EndLabel at={first} toward={second} text={el.start.name} side={-1} style={style} />
          <EndLabel at={first} toward={second} text={el.start.multiplicity} side={1} style={style} />
        </>
      )}
      {el.end && (
        <>
          <EndLabel at={last} toward={beforeLast} text={el.end.name} side={1} style={style} />
          <EndLabel at={last} toward={beforeLast} text={el.end.multiplicity} side={-1} style={style} />
        </>
      )}
    </g>
  );
}

function edgeMidText(el: ModelElement): string {
  switch (el.type) {
    case "sequence-action": {
      const msg = el.props?.message ?? "";
      const ret = el.props?.returnValue ? ` : ${el.props.returnValue}` : "";
      return msg ? msg + ret : "";
    }
    case "general-transition":
    case "transition":
    case "control-flow":
    case "object-flow": {
      const parts = [el.name, el.guard ? `[${el.guard}]` : "", el.props?.effect ? `/ ${el.props.effect}` : ""].filter(Boolean);
      return parts.join(" ");
    }
    default:
      return el.name;
  }
}
