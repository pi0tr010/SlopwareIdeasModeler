import type { ReactNode } from "react";
import { englishTypeName } from "../model/factory";
import { getElementDef } from "../model/registry";
import type { ModelElement, ShapeView } from "../model/types";
import { stereotypeLine } from "./format";
import { classifierLayout, erdLayout } from "./geometry";
import { styleForShape } from "./customStyle";
import { box, CenteredName, Lines } from "./primitives";
import { FormattedText } from "./richtext";
import { ExtraShape } from "./shapes-extra";
import { NotationSymbol } from "./symbols";
import { UiControl } from "./ui-controls";
import { wrapText, type StyleSet } from "./style";

interface Props {
  shape: ShapeView;
  el: ModelElement;
  style: StyleSet;
  /** Element a lifeline represents (an actor lifeline draws a stick figure). */
  classifier?: ModelElement;
  /** Some element types look different per diagram (Yourdon vs Gane-Sarson data flow). */
  diagramType?: string;
}

const SYSML_FRAME: Record<string, string> = {
  "sysml-block-definition": "bdd",
  "sysml-internal-block": "ibd",
  "sysml-parametric": "par",
  "sysml-requirement": "req",
};

const NO_SHADOW = new Set(["text", "lifeline", "operand", "pin", "port", "annotation", "bpmn-group", "c4-node", "dfd-store"]);

export function ShapeNode({ shape, el, style: baseStyle, classifier, diagramType }: Props) {
  const style = styleForShape(shape, el, baseStyle);
  const def = getElementDef(el.type);
  const w = shape.width;
  const h = shape.height;
  const filter = style.shadow && !NO_SHADOW.has(def.shape) ? "url(#sim-shadow)" : undefined;
  let body: ReactNode;
  const sw = style.strokeWidth;

  switch (def.shape) {
    case "classifier":
    case "object": {
      const l = classifierLayout(el, style);
      const isObject = def.shape === "object";
      const title = isObject ? objectTitle(el) : el.name;
      body = (
        <>
          <rect width={w} height={h} {...box(style)} />
          {l.stereotype && <Lines lines={[l.stereotype]} x={w / 2} y={6} valign="top" font={style.stereotypeFont} color={style.textColor} />}
          <Lines
            lines={[title]}
            x={w / 2}
            y={6 + (l.stereotype ? style.stereotypeFont.size * 1.4 : 0)}
            valign="top"
            font={style.nameFont}
            color={style.textColor}
            italic={el.isAbstract}
            underline={isObject}
          />
          {l.sections.map((sec, i) => (
            <g key={i}>
              <line x1={0} x2={w} y1={sec.y} y2={sec.y} stroke={style.stroke} strokeWidth={sw} />
              {sec.rows.map((r, j) => (
                <Lines
                  key={j}
                  lines={[r.text]}
                  x={6}
                  y={sec.y + 3 + j * l.rowHeight + l.rowHeight / 2}
                  anchor="start"
                  font={style.textFont}
                  color={style.textColor}
                  underline={r.underline}
                  italic={r.italic}
                />
              ))}
            </g>
          ))}
        </>
      );
      break;
    }
    case "erd-entity": {
      const l = erdLayout(el, style);
      const pkEnd = l.rows.findIndex((r) => !r.key.includes("PK"));
      const sepY = pkEnd > 0 ? l.rows[pkEnd].y - 3 : undefined;
      body = (
        <>
          <rect width={w} height={h} rx={4} {...box(style)} />
          <path d={`M0 ${l.headerHeight} H${w}`} stroke={style.stroke} strokeWidth={sw} />
          <Lines lines={[el.name]} x={w / 2} y={l.headerHeight / 2} font={style.nameFont} color={style.textColor} />
          {sepY !== undefined && <path d={`M0 ${sepY} H${w}`} stroke={style.stroke} strokeWidth={1} strokeDasharray="4 3" />}
          {l.rows.map((r) => (
            <g key={r.id} transform={`translate(0 ${r.y + l.rowHeight / 2})`}>
              <Lines lines={[r.key]} x={6} y={0} anchor="start" font={{ ...style.textFont, weight: "bold" }} color={style.textColor} />
              <Lines lines={[r.name]} x={6 + l.keyCol} y={0} anchor="start" font={style.textFont} color={style.textColor} underline={r.key.includes("PK")} />
              <Lines lines={[r.type]} x={l.typeCol} y={0} anchor="start" font={style.textFont} color={style.textColor} />
              <Lines lines={[r.nullable ? "NULL" : "NOT NULL"]} x={l.nullCol} y={0} anchor="start" font={{ ...style.textFont, size: style.textFont.size - 2 }} color={style.textColor} />
            </g>
          ))}
        </>
      );
      break;
    }
    case "actor":
      body = <ActorFigure w={w} h={h} el={el} style={style} nameInside={!!shape.layoutExtra && shape.layoutExtra["name-anchor"] !== "bottom"} />;
      break;
    case "usecase":
      body = (
        <>
          <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...box(style)} />
          <g transform={`translate(${w * 0.1} 0)`}>
            <CenteredName el={el} w={w * 0.8} h={h} style={style} />
          </g>
        </>
      );
      break;
    case "boundary-box":
    case "swimlane":
      body = (
        <>
          <rect width={w} height={h} {...box(style)} />
          {def.shape === "swimlane" && <path d={`M0 30 H${w}`} stroke={style.stroke} strokeWidth={sw} />}
          <CenteredName el={el} w={w} h={30} style={style} top={6} />
        </>
      );
      break;
    case "package": {
      const tabW = Math.min(w * 0.4, Math.max(60, w * 0.35));
      body = (
        <>
          <path d={`M0 0 H${tabW} V20 H0 Z`} {...box(style)} />
          <rect y={20} width={w} height={h - 20} {...box(style)} />
          <CenteredName el={el} w={w} h={40} style={style} top={26} />
        </>
      );
      break;
    }
    case "note": {
      const f = 14;
      const text = el.props?.text || el.documentation || el.name;
      body = (
        <>
          <path d={`M0 0 H${w - f} L${w} ${f} V${h} H0 Z`} fill={style.noteFill} stroke={style.noteStroke} strokeWidth={sw} />
          <path d={`M${w - f} 0 V${f} H${w}`} fill="none" stroke={style.noteStroke} strokeWidth={sw} />
          <Lines lines={wrapText(text, style.textFont, w - 14)} x={7} y={7} valign="top" anchor="start" font={style.textFont} color={style.textColor} />
        </>
      );
      break;
    }
    case "text":
      if (shape.rawInner?.includes("<formatted-text")) {
        body = <FormattedText raw={shape.rawInner} width={w} base={{ font: style.textFont, color: style.textColor }} />;
        break;
      }
      body = <Lines lines={wrapText(el.props?.text || el.name, style.textFont, w)} x={w / 2} y={h / 2} font={style.textFont} color={style.textColor} />;
      break;
    case "rect":
    case "roundrect":
    case "state":
      body = (
        <>
          <rect width={w} height={h} rx={def.shape === "rect" ? 0 : def.shape === "state" ? 12 : 10} {...box(style)} />
          {def.shape === "state" && h > 50 ? (
            <>
              <CenteredName el={el} w={w} h={30} style={style} top={5} />
              <path d={`M0 30 H${w}`} stroke={style.stroke} strokeWidth={sw} />
            </>
          ) : (
            <CenteredName el={el} w={w} h={h} style={style} />
          )}
        </>
      );
      break;
    case "dashed-roundrect":
      body = (
        <>
          <rect width={w} height={h} rx={12} {...box(style, { strokeDasharray: "6 4" })} />
          <Lines lines={[stereotypeLine(el) ?? "", el.name].filter(Boolean)} x={10} y={8} valign="top" anchor="start" font={style.nameFont} color={style.textColor} />
        </>
      );
      break;
    case "ellipse":
    case "dashed-ellipse":
    case "chen-attribute":
      body = (
        <>
          <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...box(style, def.shape === "dashed-ellipse" ? { strokeDasharray: "6 4" } : {})} />
          <CenteredName el={el} w={w * 0.85} h={h} style={style} underline={el.type === "erd-chen-attribute" && el.props?.key === "true"} />
        </>
      );
      break;
    case "circle":
      body = <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...box(style)} />;
      break;
    case "initial":
      body = <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2} fill={style.stroke} />;
      break;
    case "final": {
      const r = Math.min(w, h) / 2;
      body = (
        <>
          <circle cx={w / 2} cy={h / 2} r={r} fill={style.fill} stroke={style.stroke} strokeWidth={sw} />
          <circle cx={w / 2} cy={h / 2} r={r * 0.6} fill={style.stroke} />
        </>
      );
      break;
    }
    case "flow-final": {
      const r = Math.min(w, h) / 2;
      const d = r * 0.7;
      body = (
        <>
          <circle cx={w / 2} cy={h / 2} r={r} {...box(style)} />
          <path d={`M${w / 2 - d} ${h / 2 - d} L${w / 2 + d} ${h / 2 + d} M${w / 2 + d} ${h / 2 - d} L${w / 2 - d} ${h / 2 + d}`} stroke={style.stroke} strokeWidth={sw} />
        </>
      );
      break;
    }
    case "decision":
    case "chen-relationship":
      body = (
        <>
          <path d={`M${w / 2} 0 L${w} ${h / 2} L${w / 2} ${h} L0 ${h / 2} Z`} {...box(style)} />
          {def.shape === "chen-relationship" && (
            <g transform={`translate(${w * 0.2} 0)`}>
              <CenteredName el={el} w={w * 0.6} h={h} style={style} />
            </g>
          )}
        </>
      );
      break;
    case "bar":
      body = <rect width={w} height={h} fill={style.stroke} rx={1} />;
      break;
    case "junction":
      body = <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2} fill={style.stroke} />;
      break;
    case "history":
      body = (
        <>
          <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2} {...box(style)} />
          <Lines lines={[el.props?.deep === "true" ? "H*" : "H"]} x={w / 2} y={h / 2} font={{ ...style.nameFont, size: 13 }} color={style.textColor} />
        </>
      );
      break;
    case "terminate":
      body = <path d={`M0 0 L${w} ${h} M${w} 0 L0 ${h}`} stroke={style.stroke} strokeWidth={sw + 0.5} />;
      break;
    case "entry-point":
      body = <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2} {...box(style)} />;
      break;
    case "exit-point": {
      const r = Math.min(w, h) / 2;
      const d = r * 0.7;
      body = (
        <>
          <circle cx={w / 2} cy={h / 2} r={r} {...box(style)} />
          <path d={`M${w / 2 - d} ${h / 2 - d} L${w / 2 + d} ${h / 2 + d} M${w / 2 + d} ${h / 2 - d} L${w / 2 - d} ${h / 2 + d}`} stroke={style.stroke} strokeWidth={1.5} />
        </>
      );
      break;
    }
    case "lifeline":
      body = <Lifeline w={w} h={h} el={el} style={style} classifier={classifier} />;
      break;
    case "activation":
      body = <rect width={w} height={h} fill={style.canvas} stroke={style.stroke} strokeWidth={sw} />;
      break;
    case "fragment": {
      const op = el.props?.operator ?? "alt";
      const tw = Math.max(50, op.length * 9 + 24);
      body = (
        <>
          <rect width={w} height={h} fill="none" stroke={style.stroke} strokeWidth={sw} />
          <path d={`M0 0 H${tw} V14 L${tw - 10} 24 H0 Z`} {...box(style)} />
          <Lines lines={[op]} x={8} y={12} anchor="start" font={{ ...style.textFont, weight: "bold" }} color={style.textColor} />
          {el.guard && <Lines lines={[`[${el.guard}]`]} x={tw + 10} y={14} anchor="start" font={style.textFont} color={style.textColor} />}
        </>
      );
      break;
    }
    case "operand":
      body = (
        <>
          <path d={`M0 0 H${w}`} stroke={style.stroke} strokeWidth={1.5} strokeDasharray="6 4" />
          {el.guard && <Lines lines={[`[${el.guard}]`]} x={10} y={14} anchor="start" font={style.textFont} color={style.textColor} />}
        </>
      );
      break;
    case "frame": {
      const prefix =
        el.type === "interaction-use" ? "ref" : el.type === "state-machine" ? "stm" : el.type === "sysml-frame" ? (SYSML_FRAME[diagramType ?? ""] ?? "bdd") : "sd";
      const label = `${prefix} ${el.name}`;
      const tw = Math.max(60, label.length * 8 + 24);
      body = (
        <>
          <rect width={w} height={h} fill={el.type === "interaction-use" ? style.fill : "none"} stroke={style.stroke} strokeWidth={sw} />
          <path d={`M0 0 H${tw} V14 L${tw - 10} 24 H0 Z`} {...box(style)} />
          <Lines lines={[label]} x={8} y={12} anchor="start" font={{ ...style.textFont, weight: "bold" }} color={style.textColor} />
        </>
      );
      break;
    }
    case "destroy":
      body = <path d={`M0 0 L${w} ${h} M${w} 0 L0 ${h}`} stroke={style.stroke} strokeWidth={2.5} />;
      break;
    case "component":
      body = (
        <>
          <rect width={w} height={h} {...box(style)} />
          <g transform={`translate(${w - 26} 8)`} fill={style.fill} stroke={style.stroke} strokeWidth={1.2}>
            <rect x={4} width={16} height={20} />
            <rect x={0} y={4} width={8} height={4} />
            <rect x={0} y={12} width={8} height={4} />
          </g>
          <CenteredName el={{ ...el, stereotypes: el.stereotypes?.length ? el.stereotypes : ["component"] }} w={w - 20} h={h} style={style} />
        </>
      );
      break;
    case "artifact":
      body = (
        <>
          <rect width={w} height={h} {...box(style)} />
          <g transform={`translate(${w - 22} 6)`} fill={style.fill} stroke={style.stroke} strokeWidth={1.2}>
            <path d="M0 0 H9 L14 5 V18 H0 Z M9 0 V5 H14" />
          </g>
          <CenteredName el={{ ...el, stereotypes: el.stereotypes?.length ? el.stereotypes : ["artifact"] }} w={w} h={h} style={style} />
        </>
      );
      break;
    case "node3d": {
      const d = 12;
      body = (
        <>
          <path d={`M0 ${d} L${d} 0 H${w} V${h - d} L${w - d} ${h} H0 Z`} {...box(style)} />
          <path d={`M0 ${d} H${w - d} V${h} M${w - d} ${d} L${w} 0`} fill="none" stroke={style.stroke} strokeWidth={sw} />
          <g transform={`translate(0 ${d})`}>
            <CenteredName el={el} w={w - d} h={40} style={style} top={6} />
          </g>
        </>
      );
      break;
    }
    case "send-signal":
      body = (
        <>
          <path d={`M0 0 H${w - 18} L${w} ${h / 2} L${w - 18} ${h} H0 Z`} {...box(style)} />
          <CenteredName el={el} w={w - 18} h={h} style={style} />
        </>
      );
      break;
    case "accept-event":
      body = (
        <>
          <path d={`M0 0 H${w} V${h} H0 L18 ${h / 2} Z`} {...box(style)} />
          <g transform="translate(18 0)">
            <CenteredName el={el} w={w - 18} h={h} style={style} />
          </g>
        </>
      );
      break;
    case "time-event":
      body = (
        <>
          <path d={`M0 0 H${w} L0 ${h} H${w} Z`} {...box(style)} />
          <Lines lines={[el.name]} x={w / 2} y={h + 4} valign="top" font={style.textFont} color={style.textColor} />
        </>
      );
      break;
    case "pin":
      body = <rect width={w} height={h} {...box(style, { strokeWidth: 1.5 })} />;
      break;
    case "port":
      body = <rect width={w} height={h} {...box(style, { strokeWidth: 1.5 })} />;
      break;
    case "lollipop":
      body = (
        <>
          <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2} {...box(style)} />
          <Lines lines={[el.name]} x={w / 2} y={h + 4} valign="top" font={style.textFont} color={style.textColor} />
        </>
      );
      break;
    case "socket":
      body = (
        <>
          <path d={`M${w / 2} 0 A${w / 2} ${h / 2} 0 0 0 ${w / 2} ${h}`} fill="none" stroke={style.stroke} strokeWidth={sw} />
          <Lines lines={[el.name]} x={w / 2} y={h + 4} valign="top" font={style.textFont} color={style.textColor} />
        </>
      );
      break;
    case "seq-boundary":
    case "seq-control":
    case "seq-entity": {
      const r = Math.min(h - 18, w) / 2 - 2;
      const cx = w / 2 + (def.shape === "seq-boundary" ? 6 : 0);
      const cy = r + 2;
      body = (
        <>
          <circle cx={cx} cy={cy} r={r} {...box(style)} />
          {def.shape === "seq-boundary" && <path d={`M${cx - r - 10} ${cy - r} V${cy + r} M${cx - r - 10} ${cy} H${cx - r}`} stroke={style.stroke} strokeWidth={sw} />}
          {def.shape === "seq-entity" && <path d={`M${cx - r} ${cy + r + 2} H${cx + r}`} stroke={style.stroke} strokeWidth={sw} />}
          {def.shape === "seq-control" && <path d={`M${cx - 2} ${cy - r - 5} L${cx + 5} ${cy - r} L${cx - 2} ${cy - r + 5}`} fill="none" stroke={style.stroke} strokeWidth={sw} />}
          <Lines lines={[el.name]} x={w / 2} y={2 * r + 8} valign="top" font={style.textFont} color={style.textColor} />
        </>
      );
      break;
    }
    case "chen-entity":
      body = (
        <>
          <rect width={w} height={h} {...box(style)} />
          {el.props?.weak === "true" && <rect x={4} y={4} width={w - 8} height={h - 8} fill="none" stroke={style.stroke} strokeWidth={1} />}
          <CenteredName el={el} w={w} h={h} style={style} />
        </>
      );
      break;
    case "idef1x-entity": {
      const titleH = style.nameFont.size * 1.5;
      const attrs = el.erdAttributes ?? [];
      const keys = attrs.filter((a) => a.primaryKey);
      const rest = attrs.filter((a) => !a.primaryKey);
      const rowH = style.textFont.size * 1.45;
      const keyH = Math.max(rowH, keys.length * rowH) + 8;
      body = (
        <>
          <Lines lines={[el.name]} x={4} y={0} valign="top" anchor="start" font={style.nameFont} color={style.textColor} />
          <rect y={titleH} width={w} height={h - titleH} rx={el.props?.dependent === "true" ? 10 : 0} {...box(style)} />
          <path d={`M0 ${titleH + keyH} H${w}`} stroke={style.stroke} strokeWidth={sw} />
          {keys.map((a, i) => (
            <Lines key={a.id} lines={[a.name + (a.foreignKey ? " (FK)" : "")]} x={6} y={titleH + 4 + i * rowH + rowH / 2} anchor="start" font={style.textFont} color={style.textColor} />
          ))}
          {rest.map((a, i) => (
            <Lines key={a.id} lines={[a.name + (a.foreignKey ? " (FK)" : "")]} x={6} y={titleH + keyH + 4 + i * rowH + rowH / 2} anchor="start" font={style.textFont} color={style.textColor} />
          ))}
        </>
      );
      break;
    }
    case "cylinder": {
      const e = Math.min(14, h / 5);
      body = (
        <>
          <path d={`M0 ${e} A${w / 2} ${e} 0 0 1 ${w} ${e} V${h - e} A${w / 2} ${e} 0 0 1 0 ${h - e} Z`} {...box(style)} />
          <path d={`M0 ${e} A${w / 2} ${e} 0 0 0 ${w} ${e}`} fill="none" stroke={style.stroke} strokeWidth={sw} />
          <CenteredName el={el} w={w} h={h + e} style={style} />
        </>
      );
      break;
    }
    case "document":
      body = (
        <>
          <path d={`M0 0 H${w} V${h - 10} Q${(w * 3) / 4} ${h - 22} ${w / 2} ${h - 10} T0 ${h - 10} Z`} {...box(style)} />
          <CenteredName el={el} w={w} h={h - 10} style={style} />
        </>
      );
      break;
    case "parallelogram":
      body = (
        <>
          <path d={`M16 0 H${w} L${w - 16} ${h} H0 Z`} {...box(style)} />
          <CenteredName el={el} w={w} h={h} style={style} />
        </>
      );
      break;
    case "cloud":
      body = (
        <>
          <path
            d={`M${w * 0.25} ${h * 0.85} C${w * 0.02} ${h * 0.85} ${w * 0.02} ${h * 0.45} ${w * 0.22} ${h * 0.45} C${w * 0.2} ${h * 0.12} ${w * 0.55} ${h * 0.05} ${w * 0.6} ${h * 0.3} C${w * 0.75} ${h * 0.12} ${w * 0.98} ${h * 0.3} ${w * 0.85} ${h * 0.5} C${w * 1.02} ${h * 0.6} ${w * 0.95} ${h * 0.88} ${w * 0.75} ${h * 0.85} Z`}
            {...box(style)}
          />
          <CenteredName el={el} w={w} h={h} style={style} />
        </>
      );
      break;
    case "ui":
      body = <UiControl type={el.type} w={w} h={h} el={el} style={style} />;
      break;
    case "symbol":
      body = <NotationSymbol type={el.type} w={w} h={h} el={el} style={style} />;
      break;
    default:
      body = ExtraShape({ kind: def.shape, w, h, el, style, diagramType, collapsed: shape.itemAttrs?.collapsed }) ?? (
        <>
          <rect width={w} height={h} {...box(style)} />
          <CenteredName el={el} w={w} h={h} style={style} />
        </>
      );
  }

  return (
    <g transform={`translate(${shape.x} ${shape.y})`} filter={filter}>
      {body}
    </g>
  );
}

function objectTitle(el: ModelElement): string {
  const cls = el.props?.classifierName;
  return cls ? `${el.name} : ${cls}` : el.name;
}

function ActorFigure({ w, h, el, style, nameInside }: { w: number; h: number; el: ModelElement; style: StyleSet; nameInside?: boolean }) {
  // Current versions anchor the name below the box; older files keep it inside, under the figure.
  const names = wrapText(el.name, style.nameFont, Math.max(80, w * 2.5));
  const nameH = names.length * style.nameFont.size * 1.3;
  const figH = nameInside ? Math.max(h * 0.5, h - nameH - 4) : h;
  const cx = w / 2;
  const head = Math.min(figH * 0.12, w * 0.28);
  const neck = head * 2;
  const hip = figH * 0.62;
  const armY = figH * 0.34;
  const half = Math.min(w / 2, figH * 0.3) - 1;
  const stroke = { stroke: style.stroke, strokeWidth: style.strokeWidth, fill: "none", strokeLinecap: "round" as const };
  return (
    <>
      <rect width={w} height={h} fill="transparent" />
      <circle cx={cx} cy={head} r={head} fill={style.fill} stroke={style.stroke} strokeWidth={style.strokeWidth} />
      <path d={`M${cx} ${neck} V${hip} M${cx - half} ${armY} H${cx + half} M${cx} ${hip} L${cx - half} ${figH} M${cx} ${hip} L${cx + half} ${figH}`} {...stroke} />
      <Lines lines={names} x={cx} y={figH + 3} valign="top" font={style.nameFont} color={style.textColor} />
    </>
  );
}

function Lifeline({ w, h, el, style, classifier }: { w: number; h: number; el: ModelElement; style: StyleSet; classifier?: ModelElement }) {
  const label = lifelineLabel(el, classifier);
  if (classifier?.type === "actor") {
    const figH = 50;
    return (
      <>
        <g transform={`translate(${w / 2 - 15} 0)`}>
          <ActorFigure w={30} h={figH} el={{ ...el, name: label }} style={style} />
        </g>
        <path d={`M${w / 2} ${figH + 24} V${h}`} stroke={style.stroke} strokeWidth={1.5} strokeDasharray="6 4" />
      </>
    );
  }
  const headH = 40;
  return (
    <>
      <rect width={w} height={headH} {...box(style)} />
      <Lines lines={wrapText(label, style.nameFont, w - 8)} x={w / 2} y={headH / 2} font={style.nameFont} color={style.textColor} />
      <path d={`M${w / 2} ${headH} V${h}`} stroke={style.stroke} strokeWidth={1.5} strokeDasharray="6 4" />
    </>
  );
}

export function lifelineLabel(el: ModelElement, classifier?: ModelElement): string {
  const cls = classifier?.name ?? el.props?.classifierName ?? "";
  if (el.name && cls) return `${el.name} : ${cls}`;
  if (cls) return classifier?.type === "actor" ? cls : `: ${cls}`;
  return el.name || englishTypeName(el.type);
}