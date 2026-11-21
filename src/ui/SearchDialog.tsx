import { useMemo, useState } from "react";
import { elementName, t } from "../i18n";
import type { ModelElement, Project } from "../model/types";
import { useEditor } from "../store/store";

interface Hit {
  el: ModelElement;
  places: { diagramId: string; diagramName: string; iid: string }[];
}

const MAX_HITS = 200;

function searchText(el: ModelElement): string {
  const parts = [el.name, el.documentation ?? "", el.props?.text ?? "", el.props?.message ?? ""];
  for (const a of el.attributes ?? []) parts.push(a.name);
  for (const o of el.operations ?? []) parts.push(o.name);
  for (const a of el.erdAttributes ?? []) parts.push(a.name);
  return parts.join("\n").toLowerCase();
}

export function findElements(project: Project, query: string): Hit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: Hit[] = [];
  for (const el of Object.values(project.elements)) {
    if (!searchText(el).includes(q)) continue;
    const places = project.diagrams.flatMap((d) => d.views.filter((v) => v.ref === el.id).map((v) => ({ diagramId: d.id, diagramName: d.name, iid: v.iid })));
    hits.push({ el, places });
    if (hits.length >= MAX_HITS) break;
  }
  return hits.sort((a, b) => Number(!a.el.name.toLowerCase().includes(q)) - Number(!b.el.name.toLowerCase().includes(q)) || a.el.name.localeCompare(b.el.name));
}

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const [query, setQuery] = useState("");
  const hits = useMemo(() => findElements(project, query), [project, query]);

  const reveal = (place: Hit["places"][number]) => {
    const s = useEditor.getState();
    s.openDiagram(place.diagramId);
    s.select([place.iid]);
    onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal search-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{t("search.title")}</h2>
        <input
          autoFocus
          className="search-input"
          placeholder={t("search.placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && hits[0]?.places[0]) reveal(hits[0].places[0]);
          }}
        />
        <ul className="search-results">
          {hits.map(({ el, places }) => (
            <li key={el.id}>
              <div>
                <strong>{el.name || "(" + t("search.unnamed") + ")"}</strong> <small>{elementName(el.type)}</small>
              </div>
              <div className="search-places">
                {places.length ? (
                  places.map((pl) => (
                    <button key={pl.iid} className="link" onClick={() => reveal(pl)}>
                      {pl.diagramName}
                    </button>
                  ))
                ) : (
                  <small>{t("search.notOnDiagram")}</small>
                )}
              </div>
            </li>
          ))}
          {query.trim() && !hits.length && <li className="hint">{t("search.none")}</li>}
        </ul>
        <div className="modal-foot">
          <button onClick={onClose}>{t("common.close")}</button>
        </div>
      </div>
    </div>
  );
}
