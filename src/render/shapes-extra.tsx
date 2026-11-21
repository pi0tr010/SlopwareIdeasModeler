import type { ReactNode } from "react";
import type { ShapeKind } from "../model/registry";
import type { ModelElement } from "../model/types";
import { box, CenteredName, Lines } from "./primitives";
import { wrapText, type StyleSet } from "./style";

interface ExtraProps {
  kind: ShapeKind;
  w: number;
  h: number;
  el: ModelElement;
  style: StyleSet;
  diagramType?: string;
  /** `collapsed` attribute of the diagram item. */
  collapsed?: string;
}

/** Shapes for flowchart, DFD, mind map, C4, BPMN and SysML. Returns null for kinds handled elsewhere. */
export function ExtraShape({ kind, w, h, el, style, diagramType, collapsed }: ExtraProps): ReactNode | null {
  const sw = style.strokeWidth;
  const line = { fill: "none", stroke: style.stroke, strokeWidth: sw };
  const name = (nw = w, nh = h, dx = 0, dy = 0) => (
    <g transform={`translate(${dx} ${dy})`}>
      <CenteredName el={el} w={nw} h={nh} style={style} />
    </g>
  );

  switch (kind) {
    // ---- flowchart ----
    case "terminator":
      return (
        <>
          <rect width={w} height={h} rx={h / 2} {...box(style)} />
          {name()}
        </>
      );
    case "diamond-label":
      return (
        <>
          <path d={`M${w / 2} 0 L${w} ${h / 2} L${w / 2} ${h} L0 ${h / 2} Z`} {...box(style)} />
          {name(w * 0.6, h, w * 0.2)}
        </>
      );
    case "multi-document": {
      const o = 6;
      const doc = (x: number, y: number, dw: number, dh: number) =>
        `M${x} ${y} H${x + dw} V${y + dh - 10} Q${x + (dw * 3) / 4} ${y + dh - 22} ${x + dw / 2} ${y + dh - 10} T${x} ${y + dh - 10} Z`;
      return (
        <>
          <path d={doc(2 * o, 0, w - 2 * o, h - 2 * o)} {...box(style)} />
          <path d={doc(o, o, w - 2 * o, h - 2 * o)} {...box(style)} />
          <path d={doc(0, 2 * o, w - 2 * o, h - 2 * o)} {...box(style)} />
          {name(w - 2 * o, h - 12, 0, 2 * o)}
        </>
      );
    }
    case "predefined":
      return (
        <>
          <rect width={w} height={h} {...box(style)} />
          <path d={`M10 0 V${h} M${w - 10} 0 V${h}`} {...line} />
          {name(w - 20, h, 10)}
        </>
      );
    case "internal-storage":
      return (
        <>
          <rect width={w} height={h} {...box(style)} />
          <path d={`M12 0 V${h} M0 12 H${w}`} {...line} />
          {name(w - 12, h - 12, 12, 12)}
        </>
      );
    case "stored-data":
      return (
        <>
          <path d={`M16 0 H${w} Q${w - 16} ${h / 2} ${w} ${h} H16 Q0 ${h / 2} 16 0 Z`} {...box(style)} />
          {name(w - 16, h, 8)}
        </>
      );
    case "direct-data": {
      const e = Math.min(14, w / 6);
      return (
        <>
          <path d={`M${e} 0 H${w - e} A${e} ${h / 2} 0 0 1 ${w - e} ${h} H${e} A${e} ${h / 2} 0 0 1 ${e} 0 Z`} {...box(style)} />
          <path d={`M${w - e} 0 A${e} ${h / 2} 0 0 0 ${w - e} ${h}`} {...line} />
          {name(w - 2 * e, h, 0)}
        </>
      );
    }
    case "manual-input":
      return (
        <>
          <path d={`M0 ${h * 0.3} L${w} 0 V${h} H0 Z`} {...box(style)} />
          {name(w, h * 0.75, 0, h * 0.25)}
        </>
      );
    case "triangle-up":
      return (
        <>
          <path d={`M${w / 2} 0 L${w} ${h} H0 Z`} {...box(style)} />
          {name(w * 0.6, h * 0.6, w * 0.2, h * 0.4)}
        </>
      );
    case "triangle-down":
      return (
        <>
          <path d={`M0 0 H${w} L${w / 2} ${h} Z`} {...box(style)} />
          {name(w * 0.6, h * 0.6, w * 0.2, 0)}
        </>
      );
    case "offline-storage":
      return (
        <>
          <path d={`M0 0 H${w} L${w / 2} ${h} Z`} {...box(style)} />
          <path d={`M${w * 0.35} ${h * 0.7} H${w * 0.65}`} {...line} />
          {name(w * 0.6, h * 0.55, w * 0.2, 0)}
        </>
      );
    case "or-junction":
    case "summing-junction": {
      const r = Math.min(w, h) / 2;
      const c = { x: w / 2, y: h / 2 };
      const d = kind === "or-junction" ? `M${c.x - r} ${c.y} H${c.x + r} M${c.x} ${c.y - r} V${c.y + r}` : `M${c.x - r * 0.7} ${c.y - r * 0.7} L${c.x + r * 0.7} ${c.y + r * 0.7} M${c.x + r * 0.7} ${c.y - r * 0.7} L${c.x - r * 0.7} ${c.y + r * 0.7}`;
      return (
        <>
          <circle cx={c.x} cy={c.y} r={r} {...box(style)} />
          <path d={d} {...line} />
        </>
      );
    }
    case "delay":
      return (
        <>
          <path d={`M0 0 H${w - h / 2} A${h / 2} ${h / 2} 0 0 1 ${w - h / 2} ${h} H0 Z`} {...box(style)} />
          {name(w - h / 4, h)}
        </>
      );
    case "manual-operation":
      return (
        <>
          <path d={`M0 0 H${w} L${w - 16} ${h} H16 Z`} {...box(style)} />
          {name(w - 32, h, 16)}
        </>
      );
    case "hexagon": {
      const s = Math.min(20, w / 4);
      return (
        <>
          <path d={`M${s} 0 H${w - s} L${w} ${h / 2} L${w - s} ${h} H${s} L0 ${h / 2} Z`} {...box(style, el.type === "bpmn-call-conversation" ? { strokeWidth: sw * 2 } : {})} />
          {el.type === "bpmn-sub-conversation" && <PlusMarker x={w / 2 - 7} y={h - 16} style={style} />}
          {name(w - 2 * s, h, s)}
        </>
      );
    }
    case "display":
      return (
        <>
          <path d={`M0 ${h / 2} L${w * 0.15} 0 H${w - h / 2} A${h / 2} ${h / 2} 0 0 1 ${w - h / 2} ${h} H${w * 0.15} Z`} {...box(style)} />
          {name(w * 0.75, h, w * 0.12)}
        </>
      );
    case "sort":
      return (
        <>
          <path d={`M${w / 2} 0 L${w} ${h / 2} L${w / 2} ${h} L0 ${h / 2} Z`} {...box(style)} />
          <path d={`M0 ${h / 2} H${w}`} {...line} />
        </>
      );
    case "collate":
      return <path d={`M0 0 H${w} L0 ${h} H${w} Z`} {...box(style)} />;
    case "off-page":
      return (
        <>
          <path d={`M0 0 H${w} V${h * 0.6} L${w / 2} ${h} L0 ${h * 0.6} Z`} {...box(style)} />
          {name(w, h * 0.6)}
        </>
      );
    case "circle-label":
      return (
        <>
          <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...box(style)} />
          {name()}
        </>
      );
    case "sequential-access": {
      const r = Math.min(w, h) / 2;
      return (
        <>
          <circle cx={w / 2} cy={h / 2} r={r} {...box(style)} />
          <path d={`M${w / 2} ${h / 2 + r} H${w}`} {...line} />
          {name(r * 1.6, h, w / 2 - r * 0.8)}
        </>
      );
    }
    case "card":
      return (
        <>
          <path d={`M14 0 H${w} V${h} H0 V14 Z`} {...box(style)} />
          {name()}
        </>
      );

    // ---- data flow (Yourdon/DeMarco and Gane-Sarson share element types) ----
    case "dfd-process":
      if (diagramType === "gane-sarson-data-flow") {
        const band = 22;
        return (
          <>
            <rect width={w} height={h} rx={10} {...box(style)} />
            <path d={`M0 ${band} H${w}`} {...line} />
            <Lines lines={[el.cid ?? ""]} x={w / 2} y={band / 2} font={style.textFont} color={style.textColor} />
            {name(w, h - band, 0, band)}
          </>
        );
      }
      return (
        <>
          <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...box(style)} />
          {name(w * 0.8, h, w * 0.1)}
        </>
      );
    case "dfd-external":
      if (diagramType === "gane-sarson-data-flow") {
        const d = 6;
        return (
          <>
            <rect x={d} y={d} width={w - d} height={h - d} {...box(style)} />
            <path d={`M${d} ${d} L0 0 H${w - d} L${w} ${d} M0 0 V${h - d} L${d} ${h}`} {...line} />
            {name(w - d, h - d, d, d)}
          </>
        );
      }
      return (
        <>
          <rect width={w} height={h} {...box(style)} />
          {name()}
        </>
      );
    case "dfd-store":
      if (diagramType === "gane-sarson-data-flow") {
        const idw = 30;
        return (
          <>
            <rect width={w} height={h} fill={style.fill} stroke="none" />
            <path d={`M${w} 0 H0 V${h} H${w} M${idw} 0 V${h}`} {...line} />
            <Lines lines={[el.cid ?? "D"]} x={idw / 2} y={h / 2} font={style.textFont} color={style.textColor} />
            {name(w - idw, h, idw)}
          </>
        );
      }
      return (
        <>
          <rect width={w} height={h} fill={style.fill} stroke="none" />
          <path d={`M0 0 H${w} M0 ${h} H${w}`} {...line} />
          {name()}
        </>
      );

    // ---- mind map ----
    case "mm-central":
      return (
        <>
          <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...box(style, { strokeWidth: sw * 1.5 })} />
          {name(w * 0.85, h, w * 0.075)}
        </>
      );
    case "mm-node":
      return (
        <>
          <rect width={w} height={h} rx={h / 2} {...box(style)} />
          {name()}
        </>
      );

    // ---- C4: collapsed views are filled boxes, expanded ones are boundaries with the text at the bottom ----
    case "c4-person":
    case "c4-box":
    case "c4-node": {
      const expanded = collapsed === "false";
      const outline = expanded && kind !== "c4-node" ? { ...box(style), fill: "none", strokeDasharray: "6 6" } : box(style);
      return (
        <>
          <rect width={w} height={h} rx={kind === "c4-node" && expanded ? 10 : 0} {...outline} />
          <C4Text el={el} w={w} h={h} style={style} bottom={expanded} />
        </>
      );
    }

    // ---- BPMN ----
    case "bpmn-activity": {
      const thick = el.type === "bpmn-call-activity";
      return (
        <>
          <rect width={w} height={h} rx={10} {...box(style, thick ? { strokeWidth: sw * 2 } : {})} />
          {el.type === "bpmn-transaction" && <rect x={4} y={4} width={w - 8} height={h - 8} rx={7} fill="none" stroke={style.stroke} strokeWidth={1} />}
          {el.type === "bpmn-sub-process" && (el.props?.collapsed ?? collapsed) === "true" && <PlusMarker x={w / 2 - 7} y={h - 17} style={style} />}
          {name(w - 8, h - 10, 4)}
        </>
      );
    }
    case "bpmn-event": {
      const r = Math.min(w, h) / 2;
      const kindOf = el.type === "bpmn-boundary-event" ? "intermediate" : (el.props?.eventType ?? "start").toLowerCase();
      return (
        <>
          <circle cx={w / 2} cy={h / 2} r={r} {...box(style, { strokeWidth: kindOf === "end" ? sw * 2 : 1.5 })} />
          {kindOf === "intermediate" && <circle cx={w / 2} cy={h / 2} r={r - 3} fill="none" stroke={style.stroke} strokeWidth={1.5} />}
          {el.name && <Lines lines={wrapText(el.name, style.textFont, Math.max(80, w * 3))} x={w / 2} y={h + 4} valign="top" font={style.textFont} color={style.textColor} />}
        </>
      );
    }
    case "bpmn-gateway": {
      const g = (el.props?.gatewayType ?? "").toLowerCase();
      const c = { x: w / 2, y: h / 2 };
      const m = Math.min(w, h) * 0.2;
      return (
        <>
          <path d={`M${c.x} 0 L${w} ${c.y} L${c.x} ${h} L0 ${c.y} Z`} {...box(style)} />
          {g === "exclusive" && <path d={`M${c.x - m} ${c.y - m} L${c.x + m} ${c.y + m} M${c.x + m} ${c.y - m} L${c.x - m} ${c.y + m}`} stroke={style.stroke} strokeWidth={3} />}
          {g === "parallel" && <path d={`M${c.x - m * 1.3} ${c.y} H${c.x + m * 1.3} M${c.x} ${c.y - m * 1.3} V${c.y + m * 1.3}`} stroke={style.stroke} strokeWidth={3} />}
          {g === "inclusive" && <circle cx={c.x} cy={c.y} r={m * 1.2} fill="none" stroke={style.stroke} strokeWidth={2.5} />}
          {g === "complex" && <path d={`M${c.x - m * 1.2} ${c.y} H${c.x + m * 1.2} M${c.x} ${c.y - m * 1.2} V${c.y + m * 1.2} M${c.x - m} ${c.y - m} L${c.x + m} ${c.y + m} M${c.x + m} ${c.y - m} L${c.x - m} ${c.y + m}`} stroke={style.stroke} strokeWidth={2.5} />}
          {g.endsWith("eventbased") && (
            <>
              <circle cx={c.x} cy={c.y} r={m * 1.4} fill="none" stroke={style.stroke} strokeWidth={1} />
              <circle cx={c.x} cy={c.y} r={m * 1.15} fill="none" stroke={style.stroke} strokeWidth={1} />
            </>
          )}
          {el.name && <Lines lines={wrapText(el.name, style.textFont, Math.max(80, w * 3))} x={w / 2} y={h + 4} valign="top" font={style.textFont} color={style.textColor} />}
        </>
      );
    }
    case "bpmn-data": {
      const f = Math.min(12, w / 3);
      const arrow = el.type === "bpmn-data-input" ? "none" : el.type === "bpmn-data-output" ? style.stroke : undefined;
      return (
        <>
          <path d={`M0 0 H${w - f} L${w} ${f} V${h} H0 Z`} {...box(style)} />
          <path d={`M${w - f} 0 V${f} H${w}`} {...line} />
          {arrow !== undefined && <path d="M4 7 H10 V3 L17 10 L10 17 V13 H4 Z" fill={arrow === "none" ? style.fill : arrow} stroke={style.stroke} strokeWidth={1} />}
          {el.type === "bpmn-data-object" && el.props?.collection === "true" && <path d={`M${w / 2 - 6} ${h - 12} V${h - 3} M${w / 2} ${h - 12} V${h - 3} M${w / 2 + 6} ${h - 12} V${h - 3}`} {...line} />}
          {el.name && <Lines lines={wrapText(el.name, style.textFont, Math.max(80, w * 3))} x={w / 2} y={h + 4} valign="top" font={style.textFont} color={style.textColor} />}
        </>
      );
    }
    case "bpmn-pool": {
      const band = 30;
      const lines = wrapText(el.name, style.nameFont, Math.max(40, h - 12));
      return (
        <>
          <rect width={w} height={h} {...box(style)} />
          <path d={`M${band} 0 V${h}`} {...line} />
          <g transform={`translate(${band / 2} ${h / 2}) rotate(-90)`}>
            <Lines lines={lines} x={0} y={0} font={style.nameFont} color={style.textColor} />
          </g>
        </>
      );
    }
    case "bpmn-group":
      return (
        <>
          <rect width={w} height={h} rx={10} fill="none" stroke={style.stroke} strokeWidth={1.5} strokeDasharray="8 4 2 4" />
          {el.name && <Lines lines={[el.name]} x={w / 2} y={6} valign="top" font={style.textFont} color={style.textColor} />}
        </>
      );
    case "envelope":
      return (
        <>
          <rect width={w} height={h} {...box(style)} />
          <path d={`M0 0 L${w / 2} ${h * 0.55} L${w} 0`} {...line} />
          {el.name && <Lines lines={[el.name]} x={w / 2} y={h + 4} valign="top" font={style.textFont} color={style.textColor} />}
        </>
      );
    case "annotation": {
      const text = el.props?.text || el.documentation || el.name;
      return (
        <>
          <rect width={w} height={h} fill="transparent" />
          <path d={`M14 0 H0 V${h} H14`} {...line} />
          <Lines lines={wrapText(text, style.textFont, w - 12)} x={8} y={6} valign="top" anchor="start" font={style.textFont} color={style.textColor} />
        </>
      );
    }
    case "bpmn-choreo": {
      const band = Math.min(24, h / 4);
      return (
        <>
          <rect width={w} height={h} rx={10} {...box(style)} />
          <path d={`M0 ${band} H${w} M0 ${h - band} H${w}`} {...line} />
          {name(w, h - 2 * band, 0, band)}
          {el.type !== "bpmn-choreography-task" && <PlusMarker x={w / 2 - 7} y={h - band - 16} style={style} />}
        </>
      );
    }

    // ---- SysML ----
    case "requirement": {
      const headH = style.stereotypeFont.size * 1.4 + style.nameFont.size * 1.4 + 10;
      const rows = [`id = ${el.props?.reqId ?? el.cid ?? ""}`, `text = ${el.props?.text ?? el.documentation ?? ""}`];
      const wrapped = rows.flatMap((r) => wrapText(r, style.textFont, w - 12));
      return (
        <>
          <rect width={w} height={h} {...box(style)} />
          <Lines lines={[el.type === "sysml-test-case" ? "«testCase»" : "«requirement»"]} x={w / 2} y={5} valign="top" font={style.stereotypeFont} color={style.textColor} />
          <Lines lines={[el.name]} x={w / 2} y={5 + style.stereotypeFont.size * 1.4} valign="top" font={style.nameFont} color={style.textColor} />
          {el.type !== "sysml-test-case" && (
            <>
              <path d={`M0 ${headH} H${w}`} {...line} />
              <Lines lines={wrapped} x={6} y={headH + 4} valign="top" anchor="start" font={style.textFont} color={style.textColor} />
            </>
          )}
        </>
      );
    }
  }
  return null;
}

function PlusMarker({ x, y, style }: { x: number; y: number; style: StyleSet }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={14} height={14} fill={style.fill} stroke={style.stroke} strokeWidth={1.2} />
      <path d="M3 7 H11 M7 3 V11" stroke={style.stroke} strokeWidth={1.4} />
    </g>
  );
}

/** Subtitle of C4 elements, as the original writes it (the technology part stays even when empty). */
function c4Subtitle(el: ModelElement): string {
  const tech = el.props?.technology ?? "";
  switch (el.type) {
    case "c4-person":
      return "Person";
    case "c4-software-system":
      return "Software System";
    case "c4-container":
      return `Container: ${tech}`;
    case "c4-component":
      return `Component: ${tech}`;
    case "c4-deployment-node":
      return `Deployment Node: ${tech}`;
    default:
      return "";
  }
}

/** Name, [subtitle] and description; centred in collapsed views, at the bottom of expanded ones. */
function C4Text({ el, w, h, style, bottom }: { el: ModelElement; w: number; h: number; style: StyleSet; bottom: boolean }) {
  const pad = 4;
  const nameLines = wrapText(el.name, style.nameFont, w - 2 * pad);
  const sub = wrapText(`[${c4Subtitle(el)}]`, style.textFont, w - 2 * pad);
  const desc = el.props?.description ? wrapText(el.props.description, style.textFont, w - 2 * pad) : [];
  const nameH = nameLines.length * style.nameFont.size * 1.25;
  const lineH = style.textFont.size * 1.25;
  const total = nameH + (sub.length + desc.length) * lineH;
  const top = bottom ? Math.max(pad, h - pad - total) : Math.max(pad, (h - total) / 2);
  return (
    <>
      <Lines lines={nameLines} x={w / 2} y={top} valign="top" font={style.nameFont} color={style.textColor} />
      <Lines lines={sub} x={w / 2} y={top + nameH} valign="top" font={style.textFont} color={style.textColor} />
      {desc.length > 0 && <Lines lines={desc} x={w / 2} y={top + nameH + sub.length * lineH} valign="top" font={style.textFont} color={style.textColor} />}
    </>
  );
}
