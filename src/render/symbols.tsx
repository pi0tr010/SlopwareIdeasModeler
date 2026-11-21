import type { ModelElement } from "../model/types";
import { CenteredName } from "./primitives";
import type { StyleSet } from "./style";

/** Marks for the notations that are not a plain rectangle: schematic, ArchiMate, gates, steps, charts. */
export function NotationSymbol({ type, w, h, el, style }: { type: string; w: number; h: number; el: ModelElement; style: StyleSet }) {
  const ink = { fill: "none" as const, stroke: style.stroke, strokeWidth: style.strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const frame = { fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth };
  const name = (top = 0, height = h) => (
    <g transform={`translate(0 ${top})`}>
      <CenteredName el={el} w={w} h={height} style={style} />
    </g>
  );

  if (type.startsWith("circuit-")) return <Circuit type={type} w={w} h={h} style={style} />;
  if (type.startsWith("arch-")) {
    return (
      <>
        <rect width={w} height={h} rx={8} {...frame} />
        <rect x={w - 20} y={4} width={16} height={16} rx={2} fill="none" stroke={style.stroke} strokeWidth={1} />
        {name(14, h - 14)}
      </>
    );
  }
  if (type.startsWith("fta-")) return <FaultGate type={type} w={w} h={h} style={style} name={el.name} />;
  if (type.startsWith("grafcet-")) {
    const doubled = type.includes("initial") || type.includes("enclosing") || type === "grafcet-macro-step";
    return (
      <>
        <rect x={4} y={4} width={w - 8} height={h - 8} {...frame} />
        {doubled && <rect x={8} y={8} width={w - 16} height={h - 16} fill="none" stroke={style.stroke} strokeWidth={style.strokeWidth} />}
        {type === "grafcet-and" || type === "grafcet-or" ? null : name()}
        {(type === "grafcet-and" || type === "grafcet-or") && <CenteredName el={{ ...el, name: type === "grafcet-and" ? "&" : "≥1" }} w={w} h={h} style={style} />}
      </>
    );
  }
  if (type.startsWith("nsd-")) return <Nassi type={type} w={w} h={h} el={el} style={style} />;
  if (type === "area-chart" || type === "bar-chart") {
    return (
      <>
        <rect width={w} height={h} {...frame} />
        <path d={`M8 ${h - 8} V${h * 0.45} H${w * 0.28} V${h * 0.25} H${w * 0.5} V${h * 0.55} H${w * 0.72} V${h * 0.2} H${w - 8} V${h - 8} Z`} {...ink} />
      </>
    );
  }
  if (type === "circular-chart" || type === "arc-bar-chart" || type === "ig-pie-cycle" || type === "ig-pie-segment") {
    const r = Math.min(w, h) / 2 - 4;
    return (
      <>
        <circle cx={w / 2} cy={h / 2} r={r} {...frame} />
        <path d={`M${w / 2} ${h / 2} L${w / 2} ${h / 2 - r} A${r} ${r} 0 0 1 ${w / 2 + r} ${h / 2} Z`} fill={style.stroke} opacity={0.25} />
      </>
    );
  }
  if (type === "spider-chart") return <polygon points={spider(w, h)} {...frame} />;
  if (type === "table-chart" || type === "decision-table" || type === "gc-task-table" || type === "matrix" || type === "data-summary" || type === "cmmn-planning-table") {
    return (
      <>
        <rect width={w} height={h} {...frame} />
        <path d={`M0 ${h / 3} H${w} M0 ${(2 * h) / 3} H${w} M${w / 2} 0 V${h}`} stroke={style.stroke} strokeWidth={style.strokeWidth} />
        {name(0, h / 3)}
      </>
    );
  }
  if (type === "tree-map-chart") {
    return (
      <>
        <rect width={w} height={h} {...frame} />
        <path d={`M${w * 0.55} 0 V${h} M0 ${h * 0.45} H${w * 0.55} M${w * 0.55} ${h * 0.6} H${w}`} stroke={style.stroke} strokeWidth={style.strokeWidth} />
      </>
    );
  }
  if (type === "ig-progress-bar") {
    return (
      <>
        <rect width={w} height={h} rx={h / 2} {...frame} />
        <rect width={w * 0.6} height={h} rx={h / 2} fill={style.stroke} />
      </>
    );
  }
  if (type === "crc-card") {
    return (
      <>
        <rect width={w} height={h} {...frame} />
        <path d={`M0 28 H${w} M${w / 2} 28 V${h}`} stroke={style.stroke} strokeWidth={style.strokeWidth} />
        {name(0, 28)}
      </>
    );
  }
  return (
    <>
      <rect width={w} height={h} rx={6} {...frame} />
      {name()}
    </>
  );
}

function spider(w: number, h: number): string {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2 - 6;
  return Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(" ");
}

function FaultGate({ type, w, h, style, name }: { type: string; w: number; h: number; style: StyleSet; name: string }) {
  const ink = { fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth };
  if (type === "fta-inhibit-gate") {
    return (
      <>
        <polygon points={`${w / 2},4 ${w - 4},${h / 2} ${w / 2},${h - 4} 4,${h / 2}`} {...ink} />
        <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontSize={11} fill={style.textColor}>
          {name}
        </text>
      </>
    );
  }
  if (type === "fta-external-event") {
    return <polygon points={`4,4 ${w - 4},4 ${w / 2},${h - 4}`} {...ink} />;
  }
  const flat = type.includes("and");
  const d = flat
    ? `M8 ${h * 0.55} H${w - 8} V${h * 0.35} A${(w - 16) / 2} ${h * 0.35} 0 0 0 8 ${h * 0.35} Z`
    : `M8 ${h * 0.7} Q${w / 2} ${h * 0.15} ${w - 8} ${h * 0.7} Q${w / 2} ${h * 0.4} 8 ${h * 0.7} Z`;
  return <path d={d} {...ink} />;
}

function Nassi({ type, w, h, el, style }: { type: string; w: number; h: number; el: ModelElement; style: StyleSet }) {
  const frame = { fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth };
  if (type === "nsd-condition") {
    return (
      <>
        <polygon points={`0,0 ${w},0 ${w / 2},${h}`} {...frame} />
        <path d={`M0 0 L${w} ${h * 0.55} M${w} 0 L0 ${h * 0.55}`} fill="none" stroke={style.stroke} strokeWidth={style.strokeWidth} />
        <CenteredName el={el} w={w} h={h * 0.4} style={style} />
      </>
    );
  }
  if (type === "nsd-loop") {
    return (
      <>
        <rect width={w} height={h} {...frame} />
        <path d={`M0 18 H${w} M28 18 V${h}`} stroke={style.stroke} strokeWidth={style.strokeWidth} />
        <CenteredName el={el} w={w} h={18} style={style} />
      </>
    );
  }
  return (
    <>
      <rect width={w} height={h} {...frame} />
      <CenteredName el={el} w={w} h={h} style={style} />
    </>
  );
}

function Circuit({ type, w, h, style }: { type: string; w: number; h: number; style: StyleSet }) {
  const sw = style.strokeWidth;
  const ink = { fill: "none" as const, stroke: style.stroke, strokeWidth: sw, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const y = h / 2;
  const lead = `M0 ${y} H${w * 0.22} M${w * 0.78} ${y} H${w}`;
  const body = circuitBody(type, w, h);
  return (
    <>
      <path d={lead} {...ink} />
      <path d={body} {...ink} />
      {type.includes("meter") || type === "circuit-motor" || type === "circuit-lamp" || type === "circuit-lighting-lamp" || type === "circuit-galvanometer" ? (
        <text x={w / 2} y={y + 4} textAnchor="middle" fontSize={11} fill={style.textColor}>
          {type.includes("volt") ? "V" : type.includes("ohm") ? "Ω" : type.includes("amp") || type.includes("galvano") ? "A" : type.includes("motor") ? "M" : ""}
        </text>
      ) : null}
    </>
  );
}

function circuitBody(type: string, w: number, h: number): string {
  const y = h / 2;
  const x0 = w * 0.22;
  const x1 = w * 0.78;
  const mid = w / 2;
  if (type.includes("resistor") || type.includes("rheostat") || type.includes("potentiometer") || type.includes("preset") || type.includes("thermistor") || type.includes("heater")) {
    const steps = 6;
    const dx = (x1 - x0) / steps;
    let d = `M${x0} ${y}`;
    for (let i = 0; i < steps; i++) d += ` L${x0 + dx * (i + 0.5)} ${y + (i % 2 ? 8 : -8)} L${x0 + dx * (i + 1)} ${y}`;
    return d;
  }
  if (type.includes("capacitor") || type.includes("piezo")) return `M${x0} ${y - 12} V${y + 12} M${x1} ${y - 12} V${y + 12}`;
  if (type.includes("inductor")) return `M${x0} ${y} Q${x0 + 8} ${y - 14} ${x0 + 16} ${y} T${x0 + 32} ${y} T${x0 + 48} ${y}`;
  if (type.includes("diode") || type === "circuit-led") return `M${x0} ${y - 10} L${x1} ${y} L${x0} ${y + 10} Z M${x1} ${y - 10} V${y + 10}`;
  if (type.includes("transistor")) return `M${mid} ${y - 16} V${y + 16} M${mid} ${y - 6} L${x1} ${y - 16} M${mid} ${y + 6} L${x1} ${y + 16} M${x0} ${y} H${mid}`;
  if (type.includes("and-gate") || type === "circuit-nand-gate") return `M${x0} ${y - 14} H${mid} A14 14 0 0 1 ${mid} ${y + 14} H${x0} Z`;
  if (type.includes("or-gate") || type.includes("xor") || type === "circuit-nor-gate") return `M${x0} ${y - 14} Q${mid} ${y} ${x0} ${y + 14} Q${mid} ${y} ${x1} ${y} Q${mid} ${y} ${x0} ${y - 14}`;
  if (type === "circuit-not-gate" || type === "circuit-buffer" || type === "circuit-amplifier") return `M${x0} ${y - 12} L${x1} ${y} L${x0} ${y + 12} Z`;
  if (type === "circuit-ground") return `M${mid} 4 V${y} M${mid - 12} ${y} H${mid + 12} M${mid - 8} ${y + 5} H${mid + 8} M${mid - 4} ${y + 10} H${mid + 4}`;
  if (type.includes("battery") || type.includes("voltage") || type.includes("current-source") || type.includes("solar"))
    return `M${x0} ${y - 14} V${y + 14} M${x0 + 8} ${y - 7} V${y + 7} M${x1 - 8} ${y - 14} V${y + 14} M${x1} ${y - 7} V${y + 7}`;
  if (type.includes("switch")) return `M${x0} ${y} L${x1} ${y - 12}`;
  if (type === "circuit-fuse") return `M${x0} ${y - 6} H${x1} V${y + 6} H${x0} Z`;
  if (type === "circuit-wire") return `M0 ${y} H${w}`;
  return `M${x0} ${y} H${x1} M${mid} ${y} m-12 0 a12 12 0 1 0 24 0 a12 12 0 1 0 -24 0`;
}
