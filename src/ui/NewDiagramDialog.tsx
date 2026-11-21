import { useState } from "react";
import { diagramGroups, type DiagramTypeDef } from "../catalog";
import { diagramTypeName, groupName, t, useLanguage } from "../i18n";
import { hasDedicatedSupport } from "../model/registry";

const PRIORITY = ["UML", "EntityRelationship"];

function supportLevel(d: DiagramTypeDef): "full" | "basic" {
  if (!d.elements.length) return "full";
  const dedicated = d.elements.filter(hasDedicatedSupport).length;
  return dedicated / d.elements.length >= 0.6 ? "full" : "basic";
}

export function NewDiagramDialog({ onCreate, onClose }: { onCreate: (type: string, name: string) => void; onClose: () => void }) {
  useLanguage();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<DiagramTypeDef | null>(null);
  const [name, setName] = useState("");
  const groups = [...diagramGroups].sort((a, b) => {
    const pa = PRIORITY.indexOf(a.id);
    const pb = PRIORITY.indexOf(b.id);
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
  });
  const f = filter.toLowerCase();

  const create = (d: DiagramTypeDef) => onCreate(d.id, name.trim() || diagramTypeName(d.id, d.name));

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal wide" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="modal-head">
          <h2>{t("newDiagram.title")}</h2>
          <input autoFocus className="search" placeholder={t("newDiagram.search")} value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div className="diagram-groups">
          {groups.map((g) => {
            const items = g.diagrams.filter((d) => !f || diagramTypeName(d.id, d.name).toLowerCase().includes(f) || d.id.includes(f));
            if (!items.length) return null;
            return (
              <section key={g.id}>
                <h3>{groupName(g.id, g.name)}</h3>
                <div className="diagram-grid">
                  {items.map((d) => (
                    <button key={d.id} className={"diagram-card" + (selected?.id === d.id ? " selected" : "")} onClick={() => setSelected(d)} onDoubleClick={() => create(d)}>
                      <span className="diagram-card-name">{diagramTypeName(d.id, d.name)}</span>
                      {supportLevel(d) === "basic" && <span className="badge">{t("newDiagram.basic")}</span>}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <div className="modal-foot">
          <input placeholder={t("newDiagram.name")} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && selected && create(selected)} />
          <button onClick={onClose}>{t("common.cancel")}</button>
          <button className="primary" disabled={!selected} onClick={() => selected && create(selected)}>
            {t("common.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
