import { CLASSIFIER_TYPES, getElementDef } from "../model/registry";
import type { LinkView, ModelElement, Point, ShapeView } from "../model/types";
import { erdKeyLabel, formatAttribute, formatErdType, formatOperation, stereotypeLine } from "./format";
import { measureText, type StyleSet } from "./style";

export const center = (s: ShapeView): Point => ({ x: s.x + s.width / 2, y: s.y + s.height / 2 });

const ELLIPTIC = new Set(["usecase", "ellipse", "dashed-ellipse", "initial", "final", "flow-final", "circle", "history", "entry-point", "exit-point", "junction", "lollipop", "chen-attribute"]);
const DIAMOND = new Set(["decision", "chen-relationship"]);

/** Point where the segment from the shape centre towards `toward` leaves the shape outline. */
export function anchor(shape: ShapeView, el: ModelElement | undefined, toward: Point): Point {
  const c = center(shape);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const kind = el ? getElementDef(el.type).shape : "rect";
  const hw = shape.width / 2;
  const hh = shape.height / 2;
  if (kind === "actor") {
    return rectAnchor(c, dx, dy, hw, hh);
  }
  if (ELLIPTIC.has(kind)) {
    const t = 1 / Math.sqrt((dx * dx) / (hw * hw) + (dy * dy) / (hh * hh));
    return { x: c.x + dx * t, y: c.y + dy * t };
  }
  if (DIAMOND.has(kind)) {
    const t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
    return { x: c.x + dx * t, y: c.y + dy * t };
  }
  return rectAnchor(c, dx, dy, hw, hh);
}

function rectAnchor(c: Point, dx: number, dy: number, hw: number, hh: number): Point {
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

const ORTHOGONAL = new Set(["rectangular", "rounded-rectangular", "perpendicular"]);

/** Full polyline of a link: start anchor, waypoints, end anchor. */
export function routeLink(
  link: LinkView,
  from: ShapeView,
  to: ShapeView,
  fromEl: ModelElement | undefined,
  toEl: ModelElement | undefined,
  style: StyleSet,
): Point[] {
  if (link.itemType === "sequence-action") return routeMessage(link, from, to);
  if (from.iid === to.iid && !link.startAnchor) return selfLoop(link, from);

  const fieldY = (s: ShapeView, el: ModelElement | undefined, field?: string) =>
    link.lockToFields && field && el?.type === "erd-entity" ? erdFieldY(s, el, field, style) : undefined;
  const fy = fieldY(from, fromEl, link.fromField);
  const ty = fieldY(to, toEl, link.toField);
  const wp = link.points;

  if (fy !== undefined || ty !== undefined) {
    const fromRight = center(to).x > center(from).x;
    const start = { x: fromRight ? from.x + from.width : from.x, y: fy ?? center(from).y };
    const end = { x: fromRight ? to.x : to.x + to.width, y: ty ?? center(to).y };
    if (wp.length) return [start, ...wp, end];
    const midX = (start.x + end.x) / 2;
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }

  const fixed = (s: ShapeView, a?: Point) => (a ? { x: s.x + clamp01(a.x) * s.width, y: s.y + clamp01(a.y) * s.height } : undefined);
  const fixedStart = fixed(from, link.startAnchor);
  const fixedEnd = fixed(to, link.endAnchor);

  if (ORTHOGONAL.has(link.lineStyle)) {
    if (!wp.length && !fixedStart && !fixedEnd) return orthogonal(from, to, fromEl, toEl);
    const start = fixedStart ?? anchor(from, fromEl, wp[0] ?? center(to));
    const end = fixedEnd ?? anchor(to, toEl, wp[wp.length - 1] ?? center(from));
    return perpendicularPath(start, from, wp, end, to);
  }

  const first = wp[0] ?? center(to);
  const last = wp[wp.length - 1] ?? center(from);
  return [fixedStart ?? anchor(from, fromEl, first), ...wp, fixedEnd ?? anchor(to, toEl, last)];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Leaves the start border perpendicularly, then alternates horizontal/vertical segments through the waypoints. */
function perpendicularPath(start: Point, from: ShapeView, wp: Point[], end: Point, to: ShapeView): Point[] {
  const onSide = (p: Point, s: ShapeView) => Math.min(Math.abs(p.x - s.x), Math.abs(p.x - s.x - s.width)) < Math.min(Math.abs(p.y - s.y), Math.abs(p.y - s.y - s.height));
  let horizontal = onSide(start, from);
  const out: Point[] = [start];
  let cur = start;
  for (const p of wp) {
    cur = horizontal ? { x: p.x, y: cur.y } : { x: cur.x, y: p.y };
    out.push(cur);
    horizontal = !horizontal;
  }
  const endHorizontal = onSide(end, to);
  if (horizontal === endHorizontal) {
    // one elbow is not enough when both ends need the same orientation: use a middle segment
    if (horizontal) {
      const midX = (cur.x + end.x) / 2;
      out.push({ x: midX, y: cur.y }, { x: midX, y: end.y });
    } else {
      const midY = (cur.y + end.y) / 2;
      out.push({ x: cur.x, y: midY }, { x: end.x, y: midY });
    }
  } else {
    out.push(horizontal ? { x: end.x, y: cur.y } : { x: cur.x, y: end.y });
  }
  out.push(end);
  return out.filter((p, i) => i === 0 || Math.abs(p.x - out[i - 1].x) > 0.5 || Math.abs(p.y - out[i - 1].y) > 0.5);
}

function orthogonal(a: ShapeView, b: ShapeView, ae?: ModelElement, be?: ModelElement): Point[] {
  const ca = center(a);
  const cb = center(b);
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (overlapX > 10) {
    const x = (Math.max(a.x, b.x) + Math.min(a.x + a.width, b.x + b.width)) / 2;
    const down = cb.y > ca.y;
    return [{ x, y: down ? a.y + a.height : a.y }, { x, y: down ? b.y : b.y + b.height }];
  }
  if (overlapY > 10) {
    const y = (Math.max(a.y, b.y) + Math.min(a.y + a.height, b.y + b.height)) / 2;
    const right = cb.x > ca.x;
    return [{ x: right ? a.x + a.width : a.x, y }, { x: right ? b.x : b.x + b.width, y }];
  }
  const horizontalFirst = Math.abs(cb.x - ca.x) > Math.abs(cb.y - ca.y);
  if (horizontalFirst) {
    const s = anchor(a, ae, { x: cb.x, y: ca.y });
    const e = anchor(b, be, { x: ca.x, y: cb.y });
    const midX = (s.x + e.x) / 2;
    return [s, { x: midX, y: s.y }, { x: midX, y: e.y }, e];
  }
  const s = anchor(a, ae, { x: ca.x, y: cb.y });
  const e = anchor(b, be, { x: cb.x, y: ca.y });
  const midY = (s.y + e.y) / 2;
  return [s, { x: s.x, y: midY }, { x: e.x, y: midY }, e];
}

function selfLoop(link: LinkView, s: ShapeView): Point[] {
  if (link.points.length >= 2) {
    const first = link.points[0];
    const last = link.points[link.points.length - 1];
    return [rectAnchor(center(s), first.x - center(s).x, first.y - center(s).y, s.width / 2, s.height / 2), ...link.points, rectAnchor(center(s), last.x - center(s).x, last.y - center(s).y, s.width / 2, s.height / 2)];
  }
  const r = s.x + s.width;
  const t = s.y;
  return [
    { x: r - 30, y: t },
    { x: r - 30, y: t - 30 },
    { x: r + 30, y: t - 30 },
    { x: r + 30, y: t + 30 },
    { x: r, y: t + 30 },
  ];
}

function routeMessage(link: LinkView, from: ShapeView, to: ShapeView): Point[] {
  const y = link.points[0]?.y ?? Math.max(from.y, to.y) + 15;
  if (from.iid === to.iid) {
    const x = from.x + from.width;
    return [{ x, y }, { x: x + 40, y }, { x: x + 40, y: y + 25 }, { x, y: y + 25 }];
  }
  const toRight = center(to).x >= center(from).x;
  const x1 = toRight ? from.x + from.width : from.x;
  const x2 = toRight ? to.x : to.x + to.width;
  return [
    { x: x1, y },
    { x: x2, y },
  ];
}

// ----- classifier and ERD layouts -----

export interface ClassifierLayout {
  stereotype: string | null;
  headerHeight: number;
  sections: { rows: { text: string; underline?: boolean; italic?: boolean }[]; y: number; height: number }[];
  minWidth: number;
  height: number;
  rowHeight: number;
}

const PAD = 6;

export function classifierLayout(el: ModelElement, style: StyleSet): ClassifierLayout {
  const rowHeight = Math.round(style.textFont.size * 1.45);
  const stereotype = stereotypeLine(el);
  const nameH = Math.round(style.nameFont.size * 1.4);
  const stereoH = stereotype ? Math.round(style.stereotypeFont.size * 1.4) : 0;
  const headerHeight = PAD + stereoH + nameH + PAD - 2;
  const lists: { text: string; underline?: boolean; italic?: boolean }[][] = [];
  if (el.type === "enumeration") {
    lists.push((el.literals ?? []).map((l) => ({ text: l.name })));
    if (el.operations?.length) lists.push(el.operations.map((o) => ({ text: formatOperation(o) })));
  } else if (el.type === "stereotype") {
    lists.push((el.attributes ?? []).map((a) => ({ text: formatAttribute(a), underline: a.isStatic })));
  } else if (CLASSIFIER_TYPES.has(el.type)) {
    lists.push((el.attributes ?? []).map((a) => ({ text: formatAttribute(a), underline: a.isStatic })));
    lists.push((el.operations ?? []).map((o) => ({ text: formatOperation(o), underline: o.isStatic, italic: o.isAbstract })));
  } else if (el.type === "object") {
    lists.push((el.attributes ?? []).map((a) => ({ text: `${a.name}${a.defaultValue ? " = " + a.defaultValue : ""}` })));
  }
  let y = headerHeight;
  let minWidth = Math.max(
    measureText(el.name || " ", style.nameFont),
    stereotype ? measureText(stereotype, style.stereotypeFont) : 0,
  );
  const sections = lists.map((rows) => {
    const height = rows.length ? rows.length * rowHeight + PAD : 10;
    const section = { rows, y, height };
    y += height;
    for (const r of rows) minWidth = Math.max(minWidth, measureText(r.text, style.textFont));
    return section;
  });
  return { stereotype, headerHeight, sections, minWidth: Math.ceil(minWidth + PAD * 2 + 4), height: y, rowHeight };
}

export interface ErdLayout {
  headerHeight: number;
  rowHeight: number;
  rows: { id: string; key: string; name: string; type: string; nullable: boolean; y: number }[];
  keyCol: number;
  typeCol: number;
  nullCol: number;
  height: number;
  minWidth: number;
}

export function erdLayout(el: ModelElement, style: StyleSet): ErdLayout {
  const rowHeight = Math.round(style.textFont.size * 1.5);
  const headerHeight = Math.round(style.nameFont.size * 1.4) + PAD * 2;
  const attrs = el.erdAttributes ?? [];
  // primary keys are listed first, separated from other columns as in the original
  const ordered = [...attrs.filter((a) => a.primaryKey), ...attrs.filter((a) => !a.primaryKey)];
  const keyCol = Math.max(24, ...ordered.map((a) => measureText(erdKeyLabel(a), style.textFont) + 10));
  const nameW = Math.max(40, ...ordered.map((a) => measureText(a.name, style.textFont)));
  const typeW = Math.max(30, ...ordered.map((a) => measureText(formatErdType(a), style.textFont)));
  const nullW = measureText("NOT NULL", style.textFont);
  const rows = ordered.map((a, i) => ({
    id: a.id,
    key: erdKeyLabel(a),
    name: a.name,
    type: formatErdType(a),
    nullable: a.nullable,
    y: headerHeight + PAD / 2 + i * rowHeight + (a.primaryKey ? 0 : ordered.some((x) => x.primaryKey) ? PAD : 0),
  }));
  const height = headerHeight + PAD + rows.length * rowHeight + (ordered.some((x) => x.primaryKey) && ordered.some((x) => !x.primaryKey) ? PAD : 0) + (rows.length ? 0 : 10);
  const typeCol = PAD + keyCol + nameW + 16;
  const nullCol = typeCol + typeW + 14;
  return {
    headerHeight,
    rowHeight,
    rows,
    keyCol,
    typeCol,
    nullCol,
    height,
    minWidth: Math.max(nullCol + nullW + PAD, measureText(el.name, style.nameFont) + PAD * 4),
  };
}

function erdFieldY(s: ShapeView, el: ModelElement, field: string, style: StyleSet): number | undefined {
  const l = erdLayout(el, style);
  const row = l.rows.find((r) => r.id === field);
  return row ? s.y + row.y + l.rowHeight / 2 : undefined;
}

/** Height actually drawn: auto-sized classifiers never clip their compartments. */
export function effectiveSize(shape: ShapeView, el: ModelElement | undefined, style: StyleSet): { width: number; height: number } {
  if (!el) return shape;
  const def = getElementDef(el.type);
  if (def.shape === "classifier" || def.shape === "object") {
    const l = classifierLayout(el, style);
    return { width: Math.max(shape.width, l.minWidth), height: Math.max(shape.height, l.height) };
  }
  if (def.shape === "erd-entity") {
    const l = erdLayout(el, style);
    return { width: Math.max(shape.width, l.minWidth), height: Math.max(shape.height, l.height) };
  }
  return shape;
}

export function polylineMidpoint(points: Point[]): { point: Point; angle: number } {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  let half = total / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (half <= len && len > 0) {
      const t = half / len;
      return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    half -= len;
  }
  return { point: points[0] ?? { x: 0, y: 0 }, angle: 0 };
}

export function distanceToPolyline(p: Point, pts: Point[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}
