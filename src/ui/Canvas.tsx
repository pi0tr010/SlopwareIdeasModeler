import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as RME, type WheelEvent as RWE } from "react";
import { defaultConnector } from "../catalog";
import { getElementDef } from "../model/registry";
import type { Diagram, LinkView, Point, ShapeView } from "../model/types";
import { DiagramContent, resolveDiagram, SvgDefs, type ResolvedDiagram } from "../render/DiagramSvg";
import { distanceToPolyline } from "../render/geometry";
import type { StyleSet } from "../render/style";
import { activeDiagram, useEditor } from "../store/store";
import { t } from "../i18n";
import { ContextMenu } from "./ContextMenu";
import { arrangeItems, clipboardItems } from "./editActions";
import { selectAll } from "./MenuBar";

type Drag =
  | { mode: "pan"; start: Point; pan0: Point; button: number }
  | { mode: "move"; start: Point; delta: Point; iids: string[] }
  | { mode: "resize"; start: Point; iid: string; handle: string; box0: ShapeView; box: ShapeView }
  | { mode: "rubber"; start: Point; end: Point; additive: boolean }
  | { mode: "connect"; fromIid: string; type: string; end: Point }
  | { mode: "waypoint"; iid: string; index: number; points: Point[] }
  | { mode: "message"; iid: string; start: Point; y0: number; y: number };

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
const SELECT = "#2F7CF6";

function handlePos(b: ShapeView, h: string): Point {
  const x = h.includes("w") ? b.x : h.includes("e") ? b.x + b.width : b.x + b.width / 2;
  const y = h.includes("n") ? b.y : h.includes("s") ? b.y + b.height : b.y + b.height / 2;
  return { x, y };
}

function applyPreview(diagram: Diagram, drag: Drag | null): Diagram {
  if (!drag) return diagram;
  if (drag.mode === "move" && (drag.delta.x || drag.delta.y)) {
    const moving = new Set(drag.iids);
    for (const v of diagram.views) if (v.kind === "entity" && v.container && moving.has(v.container)) moving.add(v.iid);
    return {
      ...diagram,
      views: diagram.views.map((v) => {
        if (v.kind === "entity" && moving.has(v.iid)) return { ...v, x: v.x + drag.delta.x, y: v.y + drag.delta.y };
        if (v.kind === "relation" && ((moving.has(v.fromIid) && moving.has(v.toIid)) || moving.has(v.iid)))
          return { ...v, points: v.points.map((p) => ({ x: p.x + drag.delta.x, y: p.y + drag.delta.y })) };
        if (v.kind === "relation" && v.itemType === "sequence-action" && moving.has(v.fromIid))
          return { ...v, points: v.points.map((p) => ({ x: p.x, y: p.y + drag.delta.y })) };
        return v;
      }),
    };
  }
  if (drag.mode === "resize") return { ...diagram, views: diagram.views.map((v) => (v.iid === drag.iid ? drag.box : v)) };
  if (drag.mode === "waypoint") return { ...diagram, views: diagram.views.map((v) => (v.iid === drag.iid ? { ...(v as LinkView), points: drag.points } : v)) };
  if (drag.mode === "message")
    return { ...diagram, views: diagram.views.map((v) => (v.iid === drag.iid ? { ...(v as LinkView), points: (v as LinkView).points.map((p) => ({ ...p, y: drag.y })) } : v)) };
  return diagram;
}

export function Canvas({ style }: { style: StyleSet }) {
  const project = useEditor((s) => s.project);
  const diagram = useEditor(activeDiagram);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const zoom = useEditor((s) => s.zoom);
  const api = useEditor.getState;

  const svgRef = useRef<SVGSVGElement>(null);
  const [pan, setPan] = useState<Point>({ x: 60, y: 60 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [editing, setEditing] = useState<{ iid: string; value: string } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; onItem: boolean } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!diagram) return;
    const b = resolveDiagram(diagram, project, style).bounds;
    const empty = !diagram.views.length;
    setPan({ x: 60 - (empty ? 0 : Math.min(b.x, 0) * zoom), y: 60 - (empty ? 0 : Math.min(b.y, 0) * zoom) });
  }, [diagram?.id]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) && setSpaceDown(true);
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpaceDown(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const shown = useMemo(() => (diagram ? applyPreview(diagram, drag) : undefined), [diagram, drag]);
  const resolved: ResolvedDiagram | undefined = useMemo(() => (shown ? resolveDiagram(shown, project, style) : undefined), [shown, project, style]);

  if (!diagram || !resolved) return <div className="canvas-empty">{t("canvas.noDiagram")}</div>;

  const toModel = (e: { clientX: number; clientY: number }): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - pan.x) / zoom, y: (e.clientY - r.top - pan.y) / zoom };
  };

  const hitShape = (p: Point, skipContainersFirst = true) => {
    const list = [...resolved.shapes].reverse();
    const inside = (b: ShapeView, el = "") => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height + (el === "actor" ? 22 : 0);
    if (skipContainersFirst) {
      const nonContainer = list.find((s) => !getElementDef(s.el.type).container && inside(s.box, s.el.type));
      if (nonContainer) return nonContainer;
      // Containers (packages, fragments, boundaries) are picked by their border or header area.
      return list.find((s) => inside(s.box) && (p.y - s.box.y < 32 || p.x - s.box.x < 8 || s.box.x + s.box.width - p.x < 8 || s.box.y + s.box.height - p.y < 8));
    }
    return list.find((s) => inside(s.box, s.el.type));
  };
  const hitLink = (p: Point) => resolved.links.find((l) => distanceToPolyline(p, l.points) < 6 / zoom);

  const selectedShape = selection.length === 1 ? resolved.shapes.find((s) => s.view.iid === selection[0]) : undefined;
  const selectedLink = selection.length === 1 ? resolved.links.find((l) => l.view.iid === selection[0]) : undefined;

  const onMouseDown = (e: RME) => {
    if (editing) commitEdit();
    const p = toModel(e);
    if (e.button === 1 || spaceDown || e.button === 2) {
      e.preventDefault();
      setMenu(null);
      setDrag({ mode: "pan", start: { x: e.clientX, y: e.clientY }, pan0: pan, button: e.button });
      return;
    }
    if (e.button !== 0) return;

    if (tool) {
      const def = getElementDef(tool);
      if (def.category === "node") {
        api().addNode(tool, p.x, p.y);
      } else {
        const s = hitShape(p, false);
        if (s) setDrag({ mode: "connect", fromIid: s.view.iid, type: tool, end: p });
      }
      return;
    }

    // handles of the current selection
    if (selectedShape) {
      const b = selectedShape.box;
      const qc = { x: b.x + b.width + 14, y: b.y + b.height / 2 };
      const connector = defaultConnector(diagram.type);
      if (connector && Math.hypot(p.x - qc.x, p.y - qc.y) < 9 / zoom) {
        setDrag({ mode: "connect", fromIid: b.iid, type: connector, end: p });
        return;
      }
      for (const h of HANDLES) {
        const hp = handlePos(b, h);
        if (Math.abs(hp.x - p.x) < 6 / zoom && Math.abs(hp.y - p.y) < 6 / zoom) {
          setDrag({ mode: "resize", start: p, iid: b.iid, handle: h, box0: { ...selectedShape.view, width: b.width, height: b.height }, box: { ...selectedShape.view, width: b.width, height: b.height } });
          return;
        }
      }
    }
    if (selectedLink && selectedLink.view.itemType !== "sequence-action") {
      const pts = selectedLink.points;
      const wp = selectedLink.view.points;
      for (let i = 0; i < wp.length; i++)
        if (Math.hypot(wp[i].x - p.x, wp[i].y - p.y) < 7 / zoom) {
          setDrag({ mode: "waypoint", iid: selectedLink.view.iid, index: i, points: wp });
          return;
        }
      for (let i = 1; i < pts.length; i++) {
        const m = { x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2 };
        if (Math.hypot(m.x - p.x, m.y - p.y) < 7 / zoom) {
          const points = [...wp];
          points.splice(i - 1, 0, m);
          setDrag({ mode: "waypoint", iid: selectedLink.view.iid, index: i - 1, points });
          return;
        }
      }
    }

    const link = hitLink(p);
    if (link) {
      api().select(e.shiftKey ? [...selection, link.view.iid] : [link.view.iid]);
      if (link.view.itemType === "sequence-action") setDrag({ mode: "message", iid: link.view.iid, start: p, y0: link.points[0].y, y: link.points[0].y });
      return;
    }
    const shape = hitShape(p);
    if (shape) {
      const iid = shape.view.iid;
      let sel = selection;
      if (e.shiftKey || e.ctrlKey || e.metaKey) sel = selection.includes(iid) ? selection.filter((x) => x !== iid) : [...selection, iid];
      else if (!selection.includes(iid)) sel = [iid];
      api().select(sel);
      setDrag({ mode: "move", start: p, delta: { x: 0, y: 0 }, iids: sel.filter((x) => resolved.shapes.some((s) => s.view.iid === x)) });
      return;
    }
    if (!e.shiftKey) api().select([]);
    setDrag({ mode: "rubber", start: p, end: p, additive: e.shiftKey });
  };

  const onMouseMove = (e: RME) => {
    if (!drag) return;
    const p = toModel(e);
    switch (drag.mode) {
      case "pan":
        setPan({ x: drag.pan0.x + e.clientX - drag.start.x, y: drag.pan0.y + e.clientY - drag.start.y });
        break;
      case "move": {
        const snap = (v: number) => (e.altKey ? v : Math.round(v / 5) * 5);
        setDrag({ ...drag, delta: { x: snap(p.x - drag.start.x), y: snap(p.y - drag.start.y) } });
        break;
      }
      case "resize": {
        const b = { ...drag.box0 };
        const dx = Math.round(p.x - drag.start.x);
        const dy = Math.round(p.y - drag.start.y);
        if (drag.handle.includes("e")) b.width = Math.max(10, drag.box0.width + dx);
        if (drag.handle.includes("s")) b.height = Math.max(10, drag.box0.height + dy);
        if (drag.handle.includes("w")) {
          b.width = Math.max(10, drag.box0.width - dx);
          b.x = drag.box0.x + drag.box0.width - b.width;
        }
        if (drag.handle.includes("n")) {
          b.height = Math.max(10, drag.box0.height - dy);
          b.y = drag.box0.y + drag.box0.height - b.height;
        }
        setDrag({ ...drag, box: b });
        break;
      }
      case "rubber":
      case "connect":
        setDrag({ ...drag, end: p } as Drag);
        break;
      case "waypoint": {
        const points = [...drag.points];
        points[drag.index] = { x: Math.round(p.x), y: Math.round(p.y) };
        setDrag({ ...drag, points });
        break;
      }
      case "message":
        setDrag({ ...drag, y: Math.round(drag.y0 + p.y - drag.start.y) });
        break;
    }
  };

  const onMouseUp = (e: RME) => {
    if (!drag) return;
    const p = toModel(e);
    switch (drag.mode) {
      case "pan":
        if (drag.button === 2 && Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y) < 4) openMenu(e);
        break;
      case "move":
        api().moveViews(drag.iids, drag.delta.x, drag.delta.y);
        break;
      case "resize": {
        const { x, y, width, height } = drag.box;
        api().updateView(drag.iid, { x, y, width, height });
        break;
      }
      case "rubber": {
        const x1 = Math.min(drag.start.x, drag.end.x);
        const x2 = Math.max(drag.start.x, drag.end.x);
        const y1 = Math.min(drag.start.y, drag.end.y);
        const y2 = Math.max(drag.start.y, drag.end.y);
        if (x2 - x1 > 3 || y2 - y1 > 3) {
          const hits = resolved.shapes.filter((s) => s.box.x >= x1 && s.box.y >= y1 && s.box.x + s.box.width <= x2 && s.box.y + s.box.height <= y2).map((s) => s.view.iid);
          api().select(drag.additive ? [...new Set([...selection, ...hits])] : hits);
        }
        break;
      }
      case "connect": {
        const target = hitShape(p, false);
        if (target) api().addEdge(drag.type, drag.fromIid, target.view.iid);
        break;
      }
      case "waypoint":
        api().updateView(drag.iid, { points: drag.points });
        break;
      case "message":
        if (drag.y !== drag.y0) {
          const v = diagram.views.find((x) => x.iid === drag.iid) as LinkView;
          api().updateView(drag.iid, { points: v.points.map((pt) => ({ ...pt, y: drag.y })) });
        }
        break;
    }
    setDrag(null);
  };

  const openMenu = (e: RME) => {
    const p = toModel(e);
    const hit = hitShape(p)?.view.iid ?? hitLink(p)?.view.iid;
    if (hit && !selection.includes(hit)) api().select([hit]);
    if (!hit) api().select([]);
    const r = svgRef.current!.getBoundingClientRect();
    setMenu({ x: e.clientX - r.left, y: e.clientY - r.top, onItem: !!hit });
  };

  const onDoubleClick = (e: RME) => {
    const p = toModel(e);
    if (selectedLink) {
      const idx = selectedLink.view.points.findIndex((w) => Math.hypot(w.x - p.x, w.y - p.y) < 7 / zoom);
      if (idx >= 0) {
        api().updateView(selectedLink.view.iid, { points: selectedLink.view.points.filter((_, i) => i !== idx) });
        return;
      }
    }
    const link = hitLink(p);
    if (link) {
      setEditing({ iid: link.view.iid, value: link.el.type === "sequence-action" ? (link.el.props?.message ?? "") : link.el.name });
      return;
    }
    const s = hitShape(p);
    if (s) setEditing({ iid: s.view.iid, value: s.el.type === "comment" ? (s.el.props?.text ?? "") : s.el.name });
  };

  const commitEdit = () => {
    if (!editing) return;
    const s = resolved.shapes.find((x) => x.view.iid === editing.iid);
    const l = resolved.links.find((x) => x.view.iid === editing.iid);
    const el = s?.el ?? l?.el;
    if (el) {
      if (el.type === "comment") api().updateElement(el.id, { props: { ...el.props, text: editing.value } });
      else if (el.type === "sequence-action") api().updateElement(el.id, { props: { ...el.props, message: editing.value } });
      else if (editing.value !== el.name) api().updateElement(el.id, { name: editing.value });
    }
    setEditing(null);
  };

  const onWheel = (e: RWE) => {
    if (e.ctrlKey || e.metaKey) {
      const r = svgRef.current!.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const nz = Math.min(4, Math.max(0.1, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      setPan({ x: mx - ((mx - pan.x) / zoom) * nz, y: my - ((my - pan.y) / zoom) * nz });
      api().setZoom(nz);
    } else {
      setPan({ x: pan.x - (e.shiftKey ? e.deltaY : e.deltaX), y: pan.y - (e.shiftKey ? 0 : e.deltaY) });
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const p = toModel(e);
    const elementId = e.dataTransfer.getData("application/x-sim-element");
    const type = e.dataTransfer.getData("application/x-sim-type");
    if (elementId) api().placeExisting(elementId, p.x, p.y);
    else if (type && getElementDef(type).category === "node") api().addNode(type, p.x, p.y);
  };

  const editTarget = editing ? (resolved.shapes.find((s) => s.view.iid === editing.iid)?.box ?? null) : null;
  const editLink = editing && !editTarget ? resolved.links.find((l) => l.view.iid === editing.iid) : undefined;
  const fromShape = drag?.mode === "connect" ? resolved.shapes.find((s) => s.view.iid === drag.fromIid) : undefined;
  const cursor = drag?.mode === "pan" || spaceDown ? "grabbing" : tool ? "crosshair" : "default";
  const gridSize = 20 * zoom;

  return (
    <div className="canvas-wrap" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <svg
        ref={svgRef}
        className="canvas"
        style={{
          cursor,
          backgroundColor: style.canvas,
          backgroundSize: `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => drag?.mode === "pan" && setDrag(null)}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <SvgDefs />
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          <DiagramContent resolved={resolved} project={project} style={style} />

          {resolved.shapes
            .filter((s) => selection.includes(s.view.iid))
            .map((s) => (
              <rect key={s.view.iid} x={s.box.x - 3} y={s.box.y - 3} width={s.box.width + 6} height={s.box.height + 6} fill="none" stroke={SELECT} strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} />
            ))}
          {resolved.links
            .filter((l) => selection.includes(l.view.iid))
            .map((l) => (
              <polyline key={l.view.iid} points={l.points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={SELECT} strokeOpacity={0.35} strokeWidth={6 / zoom} />
            ))}
          {selectedShape && !drag && (
            <>
              {HANDLES.map((h) => {
                const hp = handlePos(selectedShape.box, h);
                const s = 7 / zoom;
                return <rect key={h} x={hp.x - s / 2} y={hp.y - s / 2} width={s} height={s} fill="#fff" stroke={SELECT} strokeWidth={1 / zoom} style={{ cursor: `${h}-resize` }} />;
              })}
              {defaultConnector(diagram.type) && (
                <g transform={`translate(${selectedShape.box.x + selectedShape.box.width + 14} ${selectedShape.box.y + selectedShape.box.height / 2}) scale(${1 / zoom})`} style={{ cursor: "crosshair" }}>
                  <circle r={8} fill={SELECT} />
                  <path d="M-4 0 H4 M1 -3 L4 0 L1 3" stroke="#fff" strokeWidth={1.6} fill="none" />
                  <title>{t("canvas.quickConnect")}</title>
                </g>
              )}
            </>
          )}
          {selectedLink && !drag && selectedLink.view.itemType !== "sequence-action" && (
            <>
              {selectedLink.view.points.map((p, i) => (
                <circle key={"w" + i} cx={p.x} cy={p.y} r={5 / zoom} fill="#fff" stroke={SELECT} strokeWidth={1.5 / zoom} />
              ))}
              {selectedLink.points.slice(1).map((p, i) => {
                const a = selectedLink.points[i];
                return <circle key={"m" + i} cx={(a.x + p.x) / 2} cy={(a.y + p.y) / 2} r={3.5 / zoom} fill={SELECT} fillOpacity={0.5} />;
              })}
            </>
          )}
          {drag?.mode === "rubber" && (
            <rect
              x={Math.min(drag.start.x, drag.end.x)}
              y={Math.min(drag.start.y, drag.end.y)}
              width={Math.abs(drag.end.x - drag.start.x)}
              height={Math.abs(drag.end.y - drag.start.y)}
              fill={SELECT}
              fillOpacity={0.08}
              stroke={SELECT}
              strokeWidth={1 / zoom}
            />
          )}
          {drag?.mode === "connect" && fromShape && (
            <line x1={fromShape.box.x + fromShape.box.width / 2} y1={fromShape.box.y + fromShape.box.height / 2} x2={drag.end.x} y2={drag.end.y} stroke={SELECT} strokeWidth={1.5 / zoom} strokeDasharray={`${5 / zoom} ${3 / zoom}`} />
          )}
        </g>
      </svg>
      {editing && (editTarget || editLink) && (
        <EditBox
          value={editing.value}
          multiline={resolved.shapes.find((s) => s.view.iid === editing.iid)?.el.type === "comment"}
          onChange={(value) => setEditing({ ...editing, value })}
          onCommit={commitEdit}
          onCancel={() => setEditing(null)}
          x={pan.x + (editTarget ? editTarget.x : (editLink!.points[0].x + editLink!.points[editLink!.points.length - 1].x) / 2 - 80) * zoom}
          y={pan.y + (editTarget ? editTarget.y + Math.min(editTarget.height / 2 - 14, 20) : (editLink!.points[0].y + editLink!.points[editLink!.points.length - 1].y) / 2 - 30) * zoom}
          width={Math.max(160, (editTarget?.width ?? 160) * zoom)}
        />
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={
            menu.onItem
              ? [...clipboardItems(), { label: "", separator: true }, ...arrangeItems()]
              : [
                  { label: t("menu.paste"), shortcut: "Ctrl+V", action: api().paste, disabled: !api().clipboard },
                  { label: t("menu.selectAll"), shortcut: "Ctrl+A", action: selectAll },
                ]
          }
          onClose={closeMenu}
        />
      )}
      <div className="zoom-indicator">{Math.round(zoom * 100)}%</div>
    </div>
  );
}

function EditBox(props: { value: string; multiline?: boolean; x: number; y: number; width: number; onChange: (v: string) => void; onCommit: () => void; onCancel: () => void }) {
  const common = {
    autoFocus: true,
    className: "inline-edit",
    style: { left: props.x, top: props.y, width: props.width },
    value: props.value,
    onBlur: props.onCommit,
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") props.onCancel();
      if (e.key === "Enter" && (!props.multiline || e.ctrlKey)) props.onCommit();
    },
  };
  return props.multiline ? (
    <textarea {...common} rows={4} onChange={(e) => props.onChange(e.target.value)} />
  ) : (
    <input {...common} onChange={(e) => props.onChange(e.target.value)} onFocus={(e) => e.target.select()} />
  );
}
