import { useEffect, useState } from "react";
import { setAgentStyle } from "./agent/bridge";
import { getDiagramType } from "./catalog";
import { diagramTypeName, t, useLanguage } from "./i18n";
import { isDesktop } from "./io/files";
import { parseSimp } from "./io/simp";
import { CLASSIC_DARK, STYLE_SETS, type StyleSet } from "./render/style";
import { useEditor } from "./store/store";
import * as A from "./ui/actions";
import { AgentButton, AgentConfirm, AgentDialog } from "./ui/AgentDialog";
import { Canvas } from "./ui/Canvas";
import { MenuBar, selectAll } from "./ui/MenuBar";
import { NewDiagramDialog } from "./ui/NewDiagramDialog";
import { ProjectTree } from "./ui/ProjectTree";
import { Properties } from "./ui/Properties";
import { SearchDialog } from "./ui/SearchDialog";
import { SqlDialog } from "./ui/SqlDialog";
import { useTheme } from "./ui/theme";
import { Toolbox } from "./ui/Toolbox";

const STYLE_KEY = "sim.style";

export default function App() {
  useLanguage();
  // `style` is the light style used for files and exports; the canvas switches to CLASSIC_DARK in the dark theme.
  const [style, setStyleState] = useState<StyleSet>(() => STYLE_SETS.find((s) => s.id === localStorage.getItem(STYLE_KEY)) ?? STYLE_SETS[0]);
  const theme = useTheme();
  const screenStyle = theme.dark ? CLASSIC_DARK : style;
  const [dialog, setDialog] = useState<"new" | "sql" | "about" | "find" | "agent" | null>(null);
  const project = useEditor((s) => s.project);
  const openIds = useEditor((s) => s.openDiagramIds);
  const activeId = useEditor((s) => s.activeDiagramId);
  const fileName = useEditor((s) => s.fileName);
  const dirty = useEditor((s) => s.dirty);
  const api = useEditor.getState;

  useEffect(() => setAgentStyle(style), [style]);

  const setStyle = (s: StyleSet) => {
    setStyleState(s);
    localStorage.setItem(STYLE_KEY, s.id);
  };

  useEffect(() => {
    // ?open=<url of a .simp file>&diagram=<index> loads a shared project, e.g. course examples.
    const params = new URLSearchParams(location.search);
    const url = params.get("open");
    if (!url) return;
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status} ${r.statusText}`))))
      .then((text) => {
        api().loadProject(parseSimp(text), url.split("/").pop() ?? null);
        const first = api().project.diagrams[0];
        const d = api().project.diagrams[Number(params.get("diagram") ?? 0)];
        if (d && d !== first) {
          api().openDiagram(d.id);
          api().closeDiagram(first.id);
        }
      })
      .catch((e) => alert(t("error.generic", { message: String(e) })));
  }, [api]);

  useEffect(() => {
    document.title = `${dirty ? "* " : ""}${fileName ?? project.name} - SlopwareIdeasModeler`;
  }, [dirty, fileName, project.name]);

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty && !isDesktop()) e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select")) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const s = api();
      const k = e.key.toLowerCase();
      if (ctrl && k === "z" && !e.shiftKey) s.undo();
      else if (ctrl && (k === "y" || (k === "z" && e.shiftKey))) s.redo();
      else if (ctrl && k === "c") s.copySelection();
      else if (ctrl && k === "v") s.paste();
      else if (ctrl && k === "d") s.duplicateSelection();
      else if (ctrl && k === "f") setDialog("find");
      else if (ctrl && k === "a") selectAll();
      else if (ctrl && k === "s") A.saveProject(style);
      else if (ctrl && k === "o") A.openProject(style);
      else if (ctrl && k === "m") setDialog("new");
      else if (ctrl && k === "l") A.applyAutoLayout(style);
      else if (ctrl && (k === "+" || k === "=")) s.setZoom(s.zoom * 1.2);
      else if (ctrl && k === "-") s.setZoom(s.zoom / 1.2);
      else if (ctrl && k === "0") s.setZoom(1);
      else if (k === "delete" || k === "backspace") s.deleteSelection(e.shiftKey);
      else if (k === "escape") {
        s.setTool(null);
        s.select([]);
      } else if (k.startsWith("arrow") && s.selection.length) {
        const step = e.shiftKey ? 10 : 1;
        s.moveViews(s.selection, k === "arrowleft" ? -step : k === "arrowright" ? step : 0, k === "arrowup" ? -step : k === "arrowdown" ? step : 0);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [style, api]);

  const diagramName = (id: string) => project.diagrams.find((d) => d.id === id)?.name ?? "";

  return (
    <div className="app">
      <MenuBar
        style={style}
        setStyle={setStyle}
        theme={theme.choice}
        setTheme={theme.setChoice}
        onNewDiagram={() => setDialog("new")}
        onSql={() => setDialog("sql")}
        onAbout={() => setDialog("about")}
        onFind={() => setDialog("find")}
        right={
          <>
            <span className="file-name">{(dirty ? "● " : "") + (fileName ?? t("app.unsaved"))}</span>
            <AgentButton onClick={() => setDialog("agent")} />
          </>
        }
      />
      <div className="workspace">
        <ProjectTree onNewDiagram={() => setDialog("new")} />
        <Toolbox style={screenStyle} />
        <main className="center">
          {openIds.length > 0 && (
            <div className="tabs">
              {openIds.map((id) => (
                <div key={id} className={"tab" + (id === activeId ? " active" : "")} onClick={() => api().openDiagram(id)}>
                  <span>{diagramName(id)}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      api().closeDiagram(id);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {activeId ? (
            <Canvas style={screenStyle} />
          ) : (
            <div className="welcome">
              <h1>SlopwareIdeasModeler</h1>
              <p>{t("welcome.text")}</p>
              <div className="welcome-actions">
                <button className="primary" onClick={() => setDialog("new")}>
                  {t("menu.newDiagram")}
                </button>
                <button onClick={() => A.openProject(style)}>{t("menu.open")}</button>
              </div>
              {project.diagrams.length > 0 && (
                <ul className="welcome-list">
                  {project.diagrams.map((d) => (
                    <li key={d.id}>
                      <button className="link" onClick={() => api().openDiagram(d.id)}>
                        {d.name}
                      </button>{" "}
                      <small>{diagramTypeName(d.type, getDiagramType(d.type)?.name)}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </main>
        <Properties />
      </div>
      {dialog === "new" && (
        <NewDiagramDialog
          onClose={() => setDialog(null)}
          onCreate={(type, name) => {
            api().addDiagram(type, name);
            setDialog(null);
          }}
        />
      )}
      {dialog === "sql" && <SqlDialog onClose={() => setDialog(null)} />}
      {dialog === "find" && <SearchDialog onClose={() => setDialog(null)} />}
      {dialog === "agent" && <AgentDialog onClose={() => setDialog(null)} />}
      <AgentConfirm />
      {dialog === "about" && (
        <div className="modal-backdrop" onMouseDown={() => setDialog(null)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <img className="about-mark" src="/logo.svg" alt="" />
            <h2>SlopwareIdeasModeler</h2>
            <p>{t("about.text")}</p>
            <p className="hint">{t("about.shortcuts")}</p>
            <div className="modal-foot">
              <button className="primary" onClick={() => setDialog(null)}>
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
