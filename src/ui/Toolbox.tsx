import { memo, useState } from "react";
import { toolboxFor } from "../catalog";
import { elementName, t, useLanguage } from "../i18n";
import { getElementDef } from "../model/registry";
import type { ModelElement } from "../model/types";
import { EdgeView } from "../render/edges";
import { ShapeNode } from "../render/shapes";
import type { StyleSet } from "../render/style";
import { activeDiagram, useEditor } from "../store/store";

const ToolIcon = memo(function ToolIcon({ type, style }: { type: string; style: StyleSet }) {
  const ICON_STYLE = { ...style, shadow: false, strokeWidth: 1.5 };
  const def = getElementDef(type);
  const el: ModelElement = { id: "icon", cid: "", type, name: "", stereotypes: [], props: { text: "" }, start: { name: "", multiplicity: "", navigability: "", aggregation: type === "relationship" ? "association" : "association" } };
  if (def.category === "edge") {
    if (type === "erd-relationship") el.erd = { kind: "NonIdentifying", multiplicityFrom: "1", multiplicityTo: "0..*", pairs: [] };
    return (
      <svg viewBox="0 0 40 40" width={22} height={22}>
        <EdgeView el={{ ...el, start: undefined, stereotypes: undefined }} points={[{ x: 4, y: 36 }, { x: 36, y: 4 }]} lineStyle="straight" style={{ ...ICON_STYLE, textFont: { ...ICON_STYLE.textFont, size: 0.01 } }} />
      </svg>
    );
  }
  const ratio = def.width / Math.max(1, def.height);
  const w = ratio >= 1 ? 100 : 100 * ratio;
  const h = ratio >= 1 ? 100 / ratio : 100;
  const box = { kind: "entity" as const, iid: "i", ref: "icon", x: (100 - w) / 2 + 4, y: (100 - h) / 2 + 4, width: w, height: Math.max(h, 8) };
  return (
    <svg viewBox="0 0 108 108" width={22} height={22}>
      <ShapeNode shape={box} el={el} style={{ ...ICON_STYLE, strokeWidth: 5 }} />
    </svg>
  );
});

export function Toolbox({ style }: { style: StyleSet }) {
  useLanguage();
  const diagram = useEditor(activeDiagram);
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const [filter, setFilter] = useState("");
  if (!diagram) return null;
  const { nodes, edges } = toolboxFor(diagram.type);
  const match = (type: string) => !filter || elementName(type).toLowerCase().includes(filter.toLowerCase());

  const item = (type: string) => (
    <button
      key={type}
      className={"tool" + (tool === type ? " active" : "")}
      title={elementName(type)}
      draggable={getElementDef(type).category === "node"}
      onDragStart={(e) => e.dataTransfer.setData("application/x-sim-type", type)}
      onClick={() => setTool(tool === type ? null : type)}
    >
      <ToolIcon type={type} style={style} />
      <span>{elementName(type)}</span>
    </button>
  );

  return (
    <aside className="toolbox">
      <button className={"tool" + (tool === null ? " active" : "")} onClick={() => setTool(null)} title={t("toolbox.select")}>
        <svg viewBox="0 0 24 24" width={22} height={22}>
          <path d="M6 3 L18 13 L12 13.5 L15 20 L12.5 21 L9.6 14.5 L6 18 Z" fill="currentColor" />
        </svg>
        <span>{t("toolbox.select")}</span>
      </button>
      {nodes.length + edges.length > 14 && <input className="toolbox-filter" placeholder={t("toolbox.filter")} value={filter} onChange={(e) => setFilter(e.target.value)} />}
      <div className="tool-section">{t("toolbox.elements")}</div>
      {nodes.filter(match).map(item)}
      {edges.length > 0 && <div className="tool-section">{t("toolbox.relationships")}</div>}
      {edges.filter(match).map(item)}
    </aside>
  );
}
