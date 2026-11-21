import type { ModelElement } from "../model/types";
import { CenteredName, Lines } from "./primitives";
import type { StyleSet } from "./style";

/**
 * Screen controls, drawn the way the original paints them: the element style for the frame,
 * the name as the caption, and the small mark that tells the controls apart.
 */
export function UiControl({ type, w, h, el, style }: { type: string; w: number; h: number; el: ModelElement; style: StyleSet }) {
  const sw = style.strokeWidth;
  const frame = { fill: style.fill, stroke: style.stroke, strokeWidth: sw };
  const ink = { fill: "none", stroke: style.stroke, strokeWidth: sw, strokeLinecap: "round" as const };
  const name = (x: number, y: number, nw: number, nh: number, color = style.textColor) => (
    <g transform={`translate(${x} ${y})`}>
      <CenteredName el={el} w={nw} h={nh} style={style} color={color} />
    </g>
  );
  const box = Math.min(16, h - 8);

  switch (type) {
    case "ui-check-box":
      return (
        <>
          <rect x={2} y={(h - box) / 2} width={box} height={box} rx={2} {...frame} />
          <path d={`M${6} ${h / 2} l${box * 0.28} ${box * 0.28} l${box * 0.45} ${-box * 0.5}`} {...ink} />
          {name(box + 8, 0, w - box - 10, h)}
        </>
      );
    case "ui-radio-button":
      return (
        <>
          <circle cx={box / 2 + 2} cy={h / 2} r={box / 2} {...frame} />
          <circle cx={box / 2 + 2} cy={h / 2} r={box / 5} fill={style.stroke} />
          {name(box + 8, 0, w - box - 10, h)}
        </>
      );
    case "ui-on-off":
      return (
        <>
          <rect width={w} height={h} rx={h / 2} {...frame} />
          <circle cx={w - h / 2} cy={h / 2} r={h / 2 - 3} fill={style.stroke} />
        </>
      );
    case "ui-combo-box":
    case "ui-drop-down-button": {
      const bw = Math.min(h, 28);
      return (
        <>
          <rect width={w} height={h} rx={4} {...frame} />
          <path d={`M${w - bw} 0 V${h}`} {...ink} />
          <path d={`M${w - bw + 6} ${h * 0.4} H${w - 6} L${w - bw / 2} ${h * 0.68} Z`} fill={style.stroke} />
          {name(4, 0, w - bw - 6, h)}
        </>
      );
    }
    case "ui-text-box":
    case "ui-numeric-box":
    case "ui-search-box":
    case "ui-time-control":
      return (
        <>
          <rect width={w} height={h} rx={2} {...frame} />
          {name(8, 0, w - 16, h)}
        </>
      );
    case "ui-multi-line":
    case "ui-paragraph":
      return (
        <>
          <rect width={w} height={h} rx={2} {...frame} />
          <Lines lines={[el.name]} x={8} y={8} valign="top" anchor="start" font={style.textFont} color={style.textColor} />
        </>
      );
    case "ui-label":
    case "ui-item":
    case "ui-menu-item":
      return name(0, 0, w, h);
    case "ui-list-box":
    case "ui-checked-list":
    case "ui-field-list":
    case "ui-menu":
    case "ui-context-menu":
    case "ui-tree":
    case "ui-accordion-menu":
    case "ui-thumbnail-view": {
      const row = 22;
      const mark = type === "ui-tree" ? "▸ " : type === "ui-checked-list" ? "☑ " : "";
      return (
        <>
          <rect width={w} height={h} {...frame} />
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              {i > 0 && <path d={`M0 ${8 + i * row} H${w}`} stroke={style.stroke} strokeWidth={0.5} opacity={0.35} />}
              <Lines lines={[i === 0 ? mark + el.name : mark + " "]} x={8} y={8 + i * row + row / 2} anchor="start" font={style.textFont} color={style.textColor} />
            </g>
          ))}
        </>
      );
    }
    case "ui-progress-bar":
      return (
        <>
          <rect width={w} height={h} rx={h / 2} {...frame} />
          <rect x={2} y={2} width={w * 0.6} height={h - 4} rx={h / 2} fill={style.stroke} />
        </>
      );
    case "ui-track-bar":
    case "ui-slider":
      return (
        <>
          <path d={`M4 ${h / 2} H${w - 4}`} {...ink} />
          <rect x={w * 0.45} y={h / 2 - 7} width={10} height={14} rx={2} {...frame} />
        </>
      );
    case "ui-rating-bar":
      return (
        <g fill={style.stroke}>
          {[0, 1, 2, 3, 4].map((i) => (
            <polygon key={i} transform={`translate(${8 + i * ((w - 16) / 5)} ${h / 2 - 7})`} points="7,0 9,5 14,5 10,8 12,14 7,10 2,14 4,8 0,5 5,5" />
          ))}
        </g>
      );
    case "ui-scroll-bar":
      return (
        <>
          <rect width={w} height={h} {...frame} />
          <rect x={2} y={h * 0.15} width={Math.max(4, w - 4)} height={h * 0.4} rx={2} fill={style.stroke} />
        </>
      );
    case "ui-window":
    case "ui-web-browser":
    case "ui-smartphone": {
      const bar = type === "ui-smartphone" ? 22 : 28;
      return (
        <>
          <rect width={w} height={h} {...frame} />
          <rect width={w} height={bar} fill={style.stroke} />
          <Lines lines={[el.name]} x={8} y={bar / 2} anchor="start" font={style.textFont} color={style.fill} />
          {type !== "ui-smartphone" && (
            <g stroke={style.fill} strokeWidth={1.4}>
              <path d={`M${w - 40} ${bar * 0.5} H${w - 30}`} />
              <rect x={w - 26} y={6} width={10} height={bar - 12} fill="none" />
              <path d={`M${w - 12} 7 L${w - 6} ${bar - 7} M${w - 6} 7 L${w - 12} ${bar - 7}`} />
            </g>
          )}
        </>
      );
    }
    case "ui-tab-control":
    case "ui-tabs":
      return (
        <>
          <rect y={22} width={w} height={h - 22} {...frame} />
          <rect width={Math.min(90, w / 2)} height={22} {...frame} />
          <Lines lines={[el.name]} x={8} y={11} anchor="start" font={style.textFont} color={style.textColor} />
        </>
      );
    case "ui-toolbar":
    case "ui-alphabet-bar":
    case "ui-breadcrumbs":
    case "ui-pager":
      return (
        <>
          <rect width={w} height={h} {...frame} />
          {name(4, 0, w - 8, h)}
        </>
      );
    case "ui-group-box":
    case "ui-titled-panel":
    case "ui-named-box":
    case "ui-app-title-panel":
      return (
        <>
          <rect y={10} width={w} height={h - 10} {...frame} />
          <Lines lines={[el.name]} x={12} y={10} font={style.textFont} color={style.textColor} />
        </>
      );
    case "ui-panel":
    case "ui-area":
      return (
        <>
          <rect width={w} height={h} {...frame} />
          {name(0, 0, w, h)}
        </>
      );
    case "ui-grid":
      return (
        <>
          <rect width={w} height={h} {...frame} />
          <path d={`M0 22 H${w} M${w / 3} 0 V${h} M${(2 * w) / 3} 0 V${h}`} stroke={style.stroke} strokeWidth={sw} />
          <Lines lines={[el.name]} x={6} y={11} anchor="start" font={style.textFont} color={style.textColor} />
        </>
      );
    case "ui-splitter":
      return <rect width={w} height={h} {...frame} />;
    case "ui-loading-spinner":
      return <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2 - 2} {...ink} strokeDasharray="18 10" />;
    case "ui-alert":
      return (
        <>
          <rect width={w} height={h} rx={4} {...frame} />
          <circle cx={16} cy={h / 2} r={8} {...ink} />
          {name(30, 0, w - 36, h)}
        </>
      );
    case "ui-login":
      return (
        <>
          <rect width={w} height={h} rx={4} {...frame} />
          <rect x={12} y={h * 0.28} width={w - 24} height={18} rx={2} {...ink} />
          <rect x={12} y={h * 0.55} width={w - 24} height={18} rx={2} {...ink} />
        </>
      );
    case "ui-map":
      return (
        <>
          <rect width={w} height={h} {...frame} />
          <path d={`M8 ${h - 8} L${w * 0.35} 16 L${w * 0.6} ${h * 0.55} L${w - 8} 12`} {...ink} />
        </>
      );
    case "ui-video":
      return (
        <>
          <rect width={w} height={h} {...frame} />
          <polygon points={`${w / 2 - 10},${h / 2 - 14} ${w / 2 - 10},${h / 2 + 14} ${w / 2 + 16},${h / 2}`} fill={style.stroke} />
        </>
      );
    case "ui-keyboard":
      return (
        <>
          <rect width={w} height={h} rx={4} {...frame} />
          {Array.from({ length: 10 }, (_, i) => (
            <rect key={i} x={8 + i * ((w - 16) / 10)} y={10} width={(w - 16) / 10 - 3} height={14} rx={2} {...ink} />
          ))}
        </>
      );
    case "ui-calendar":
      return (
        <>
          <rect width={w} height={h} {...frame} />
          <rect width={w} height={24} fill={style.stroke} />
          <Lines lines={[el.name]} x={8} y={12} anchor="start" font={style.textFont} color={style.fill} />
        </>
      );
    case "ui-ruler":
      return (
        <>
          <rect width={w} height={h} {...frame} />
          <path d={Array.from({ length: 9 }, (_, i) => `M${(i + 1) * (w / 10)} 0 V${i % 2 ? h * 0.45 : h * 0.75}`).join(" ")} {...ink} />
        </>
      );
    default:
      return (
        <>
          <rect width={w} height={h} rx={4} {...frame} />
          {name(0, 0, w, h)}
        </>
      );
  }
}
