import { useEffect, useRef, useState, type ReactNode } from "react";
import { availableLanguages, getLanguage, languageName, setLanguage, t, useLanguage } from "../i18n";
import { STYLE_SETS, type StyleSet } from "../render/style";
import { useEditor } from "../store/store";
import * as A from "./actions";
import { arrangeItems, clipboardItems } from "./editActions";
import type { ThemeChoice } from "./theme";

export interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
}

function Menu({ label, items, open, anyOpen, onOpen, onClose }: { label: string; items: MenuItem[]; open: boolean; anyOpen: boolean; onOpen: () => void; onClose: () => void }) {
  return (
    <div className="menu" onMouseEnter={() => anyOpen && !open && onOpen()}>
      <button className={"menu-button" + (open ? " open" : "")} onClick={() => (open ? onClose() : onOpen())}>
        {label}
      </button>
      {open && (
        <div className="menu-dropdown">
          {items.map((it, i) =>
            it.separator ? (
              <div key={i} className="menu-sep" />
            ) : (
              <button
                key={i}
                className="menu-item"
                disabled={it.disabled}
                onClick={() => {
                  onClose();
                  it.action?.();
                }}
              >
                <span className="menu-check">{it.checked ? "✓" : ""}</span>
                <span className="menu-label">{it.label}</span>
                {it.shortcut && <span className="menu-shortcut">{it.shortcut}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function MenuBar(props: {
  style: StyleSet;
  setStyle: (s: StyleSet) => void;
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
  onNewDiagram: () => void; onSql: () => void; onAbout: () => void; onFind: () => void; right?: ReactNode }) {
  useLanguage();
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const st = useEditor();
  const hasDiagram = !!st.activeDiagramId;
  const sep: MenuItem = { label: "", separator: true };

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  const menus: { id: string; label: string; items: MenuItem[] }[] = [
    {
      id: "file",
      label: t("menu.file"),
      items: [
        { label: t("menu.newProject"), action: A.newProject },
        { label: t("menu.newDiagram"), shortcut: "Ctrl+M", action: props.onNewDiagram },
        { label: t("menu.open"), shortcut: "Ctrl+O", action: () => A.openProject(props.style) },
        { label: t("menu.save"), shortcut: "Ctrl+S", action: () => A.saveProject(props.style) },
        sep,
        { label: t("menu.importXmi"), action: () => A.importXmiIntoProject(props.style) },
        { label: t("menu.exportXmi"), action: A.exportXmiFile },
        sep,
        { label: t("menu.exportPng"), action: () => A.exportDiagram("png", props.style), disabled: !hasDiagram },
        { label: t("menu.exportSvg"), action: () => A.exportDiagram("svg", props.style), disabled: !hasDiagram },
        { label: t("menu.exportPdf"), action: () => A.exportDiagram("pdf", props.style), disabled: !hasDiagram },
        { label: t("menu.exportSql"), action: props.onSql },
      ],
    },
    {
      id: "edit",
      label: t("menu.edit"),
      items: [
        { label: t("menu.undo"), shortcut: "Ctrl+Z", action: st.undo, disabled: !st.past.length },
        { label: t("menu.redo"), shortcut: "Ctrl+Y", action: st.redo, disabled: !st.future.length },
        sep,
        ...clipboardItems(),
        sep,
        { label: t("menu.selectAll"), shortcut: "Ctrl+A", action: selectAll, disabled: !hasDiagram },
        { label: t("menu.find"), shortcut: "Ctrl+F", action: props.onFind },
      ],
    },
    {
      id: "view",
      label: t("menu.view"),
      items: [
        { label: t("menu.zoomIn"), shortcut: "Ctrl++", action: () => st.setZoom(st.zoom * 1.2) },
        { label: t("menu.zoomOut"), shortcut: "Ctrl+-", action: () => st.setZoom(st.zoom / 1.2) },
        { label: t("menu.zoomReset"), shortcut: "Ctrl+0", action: () => st.setZoom(1) },
        sep,
        ...(["light", "dark", "system"] as const).map((th) => ({ label: t("menu.theme") + ": " + t("theme." + th), checked: props.theme === th, action: () => props.setTheme(th) })),
        sep,
        ...STYLE_SETS.map((s) => ({ label: t("menu.style") + ": " + s.name, checked: s.id === props.style.id, action: () => props.setStyle(s) })),
      ],
    },
    {
      id: "diagram",
      label: t("menu.diagram"),
      items: [{ label: t("menu.autoLayout"), shortcut: "Ctrl+L", action: () => A.applyAutoLayout(props.style), disabled: !hasDiagram }, sep, ...arrangeItems()],
    },
    {
      id: "lang",
      label: t("menu.language"),
      items: availableLanguages.map((l) => ({ label: languageName(l), checked: l === getLanguage(), action: () => setLanguage(l) })),
    },
    { id: "help", label: t("menu.help"), items: [{ label: t("menu.about"), action: props.onAbout }] },
  ];

  return (
    <div className="menubar" ref={ref}>
      <span className="brand">
        <img className="brand-mark" src="/logo.svg" alt="" />
        SlopwareIdeasModeler
      </span>
      {menus.map((m) => (
        <Menu key={m.id} label={m.label} items={m.items} open={open === m.id} anyOpen={open !== null} onOpen={() => setOpen(m.id)} onClose={() => setOpen(null)} />
      ))}
      <div className="menubar-right">{props.right}</div>
    </div>
  );
}

export function selectAll() {
  const s = useEditor.getState();
  const d = s.project.diagrams.find((x) => x.id === s.activeDiagramId);
  if (d) s.select(d.views.filter((v) => v.kind === "entity").map((v) => v.iid));
}
