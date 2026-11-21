import { useMemo, useState } from "react";
import { t } from "../i18n";
import { saveFile } from "../io/files";
import { generateDdl, SQL_DIALECTS, type SqlDialect } from "../io/sql";
import { activeDiagram, useEditor } from "../store/store";

export function SqlDialog({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const diagram = useEditor(activeDiagram);
  const [dialect, setDialect] = useState<SqlDialect>("postgresql");
  const [onlyDiagram, setOnlyDiagram] = useState(true);
  const sql = useMemo(() => generateDdl(project, dialect, onlyDiagram ? diagram : undefined), [project, dialect, onlyDiagram, diagram]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t("sql.title")}</h2>
          <select value={dialect} onChange={(e) => setDialect(e.target.value as SqlDialect)}>
            {SQL_DIALECTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <label className="check">
            <input type="checkbox" checked={onlyDiagram} onChange={(e) => setOnlyDiagram(e.target.checked)} /> {t("sql.onlyDiagram")}
          </label>
        </div>
        <textarea className="code" readOnly value={sql} />
        <div className="modal-foot">
          <button onClick={() => navigator.clipboard.writeText(sql)}>{t("common.copy")}</button>
          <button onClick={() => saveFile((diagram?.name ?? "schema") + ".sql", sql, "text/sql")}>{t("common.save")}</button>
          <button className="primary" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
