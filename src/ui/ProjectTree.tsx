import { useMemo, useState } from "react";
import { getDiagramType } from "../catalog";
import { diagramTypeName, elementName, t, useLanguage } from "../i18n";
import { getElementDef } from "../model/registry";
import { useEditor } from "../store/store";

export function ProjectTree({ onNewDiagram }: { onNewDiagram: () => void }) {
  useLanguage();
  const project = useEditor((s) => s.project);
  const activeId = useEditor((s) => s.activeDiagramId);
  const openDiagram = useEditor((s) => s.openDiagram);
  const renameDiagram = useEditor((s) => s.renameDiagram);
  const deleteDiagram = useEditor((s) => s.deleteDiagram);
  const deleteElement = useEditor((s) => s.deleteElement);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>();
    for (const el of Object.values(project.elements)) {
      if (getElementDef(el.type).category === "edge" || !el.name) continue;
      if (!map.has(el.type)) map.set(el.type, []);
      map.get(el.type)!.push({ id: el.id, name: el.name });
    }
    return [...map.entries()].sort((a, b) => elementName(a[0]).localeCompare(elementName(b[0])));
  }, [project.elements]);

  const toggle = (k: string) => setCollapsed((c) => ({ ...c, [k]: !c[k] }));

  return (
    <aside className="tree">
      <div className="panel-title">
        <span>{project.name}</span>
        <button className="small" onClick={onNewDiagram} title={t("menu.newDiagram")}>
          + {t("tree.diagram")}
        </button>
      </div>
      <div className="tree-section" onClick={() => toggle("diagrams")}>
        {collapsed.diagrams ? "▸" : "▾"} {t("tree.diagrams")} ({project.diagrams.length})
      </div>
      {!collapsed.diagrams &&
        project.diagrams.map((d) => (
          <div key={d.id} className={"tree-item" + (d.id === activeId ? " active" : "")} onClick={() => openDiagram(d.id)} onDoubleClick={() => setRenaming(d.id)} title={diagramTypeName(d.type, getDiagramType(d.type)?.name)}>
            {renaming === d.id ? (
              <input
                autoFocus
                defaultValue={d.name}
                onBlur={(e) => {
                  renameDiagram(d.id, e.target.value);
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setRenaming(null);
                  e.stopPropagation();
                }}
              />
            ) : (
              <>
                <span className="tree-icon">▦</span>
                <span className="tree-label">{d.name}</span>
                <button
                  className="tree-del"
                  title={t("tree.deleteDiagram")}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(t("tree.confirmDeleteDiagram", { name: d.name }))) deleteDiagram(d.id);
                  }}
                >
                  ×
                </button>
              </>
            )}
          </div>
        ))}
      <div className="tree-section" onClick={() => toggle("model")}>
        {collapsed.model ? "▸" : "▾"} {t("tree.model")}
      </div>
      {!collapsed.model &&
        groups.map(([type, items]) => (
          <div key={type}>
            <div className="tree-group" onClick={() => toggle(type)}>
              {collapsed[type] ? "▸" : "▾"} {elementName(type)} ({items.length})
            </div>
            {!collapsed[type] &&
              items
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((it) => (
                  <div key={it.id} className="tree-item nested" draggable onDragStart={(e) => e.dataTransfer.setData("application/x-sim-element", it.id)} title={t("tree.dragHint")}>
                    <span className="tree-label">{it.name}</span>
                    <button
                      className="tree-del"
                      title={t("tree.deleteElement")}
                      onClick={() => {
                        if (confirm(t("tree.confirmDeleteElement", { name: it.name }))) deleteElement(it.id);
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
          </div>
        ))}
    </aside>
  );
}
