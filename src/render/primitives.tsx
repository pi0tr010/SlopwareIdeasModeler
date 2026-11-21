import type { ModelElement } from "../model/types";
import { stereotypeLine } from "./format";
import { wrapText, type FontSpec, type StyleSet } from "./style";

export const fontAttrs = (f: FontSpec) => ({
  fontFamily: f.family,
  fontSize: f.size,
  fontWeight: f.weight ?? "normal",
  fontStyle: f.italic ? "italic" : "normal",
});

export function Lines(props: {
  lines: string[];
  x: number;
  y: number;
  font: FontSpec;
  color: string;
  anchor?: "start" | "middle" | "end";
  italic?: boolean;
  underline?: boolean;
  /** "middle": y is the vertical centre of the block, "top": y is its top. */
  valign?: "middle" | "top";
}) {
  const lh = props.font.size * 1.25;
  const top = props.valign === "top" ? props.y + props.font.size * 0.95 : props.y - ((props.lines.length - 1) * lh) / 2 + props.font.size * 0.35;
  return (
    <text
      {...fontAttrs(props.font)}
      fontStyle={props.italic || props.font.italic ? "italic" : "normal"}
      textDecoration={props.underline ? "underline" : undefined}
      fill={props.color}
      textAnchor={props.anchor ?? "middle"}
    >
      {props.lines.map((l, i) => (
        <tspan key={i} x={props.x} y={top + i * lh}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

export function CenteredName({
  el,
  w,
  h,
  style,
  top,
  underline,
  color,
}: {
  el: ModelElement;
  w: number;
  h: number;
  style: StyleSet;
  top?: number;
  underline?: boolean;
  color?: string;
}) {
  const st = stereotypeLine(el);
  const lines = wrapText(el.name, style.nameFont, Math.max(20, w - 10));
  const stereoH = st ? style.stereotypeFont.size * 1.3 : 0;
  const blockH = lines.length * style.nameFont.size * 1.25 + stereoH;
  const y0 = top ?? (h - blockH) / 2;
  const fill = color ?? style.textColor;
  return (
    <>
      {st && <Lines lines={[st]} x={w / 2} y={y0} valign="top" font={style.stereotypeFont} color={fill} />}
      <Lines lines={lines} x={w / 2} y={y0 + stereoH} valign="top" font={style.nameFont} color={fill} underline={underline} />
    </>
  );
}

export const box = (s: StyleSet, extra: Record<string, unknown> = {}) => ({
  fill: s.fill,
  stroke: s.stroke,
  strokeWidth: s.strokeWidth,
  ...extra,
});
