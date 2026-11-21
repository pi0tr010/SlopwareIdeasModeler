import { create } from "zustand";
import { cloneElement, createDiagram, emptyProject, newIid } from "../model/factory";
import { addEdgeBetween, addNodeAt, moveViewsIn, placeElement, removeElement, removeViews } from "../model/ops";
import type { Diagram, DiagramView, LinkView, ModelElement, Project, ShapeView } from "../model/types";

const HISTORY_LIMIT = 100;
const AUTOSAVE_KEY = "sim.autosave";

export interface EditorState {
  project: Project;
  activeDiagramId: string | null;
  openDiagramIds: string[];
  selection: string[];
  /** Element type to place, or null for the selection tool. */
  tool: string | null;
  zoom: number;
  fileName: string | null;
  dirty: boolean;
  past: Project[];
  future: Project[];
  clipboard: { elements: ModelElement[]; views: DiagramView[] } | null;

  commit: (mutate: (p: Project) => void) => void;
  newProject: () => void;
  loadProject: (p: Project, fileName: string | null) => void;
  markSaved: (fileName: string | null) => void;
  undo: () => void;
  redo: () => void;

  addDiagram: (type: string, name: string) => string;
  openDiagram: (id: string) => void;
  closeDiagram: (id: string) => void;
  renameDiagram: (id: string, name: string) => void;
  deleteDiagram: (id: string) => void;

  setTool: (tool: string | null) => void;
  setZoom: (zoom: number) => void;
  select: (iids: string[]) => void;

  addNode: (type: string, x: number, y: number) => void;
  placeExisting: (elementId: string, x: number, y: number) => void;
  addEdge: (type: string, fromIid: string, toIid: string) => void;
  moveViews: (iids: string[], dx: number, dy: number) => void;
  updateView: (iid: string, patch: Partial<ShapeView> | Partial<LinkView>) => void;
  updateElement: (id: string, patch: Partial<ModelElement>) => void;
  deleteSelection: (fromModel: boolean) => void;
  deleteElement: (id: string) => void;
  copySelection: () => void;
  paste: () => void;
  duplicateSelection: () => void;
  arrange: (fn: (d: Diagram, iids: string[]) => void) => void;
}

export const activeDiagram = (s: EditorState): Diagram | undefined =>
  s.project.diagrams.find((d) => d.id === s.activeDiagramId);

function loadAutosave(): Project | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? (JSON.parse(raw) as Project) : null;
  } catch {
    return null;
  }
}

const initial = loadAutosave() ?? emptyProject();

export const useEditor = create<EditorState>((set, get) => {
  const withDiagram = (p: Project, fn: (d: Diagram) => void) => {
    const d = p.diagrams.find((x) => x.id === get().activeDiagramId);
    if (d) fn(d);
  };

  return {
    project: initial,
    activeDiagramId: initial.diagrams[0]?.id ?? null,
    openDiagramIds: initial.diagrams[0] ? [initial.diagrams[0].id] : [],
    selection: [],
    tool: null,
    zoom: 1,
    fileName: null,
    dirty: false,
    past: [],
    future: [],
    clipboard: null,

    commit: (mutate) => {
      const prev = get().project;
      const next = structuredClone(prev);
      mutate(next);
      set((s) => ({ project: next, past: [...s.past, prev].slice(-HISTORY_LIMIT), future: [], dirty: true }));
    },

    newProject: () =>
      set({ project: emptyProject(), activeDiagramId: null, openDiagramIds: [], selection: [], past: [], future: [], fileName: null, dirty: false }),

    loadProject: (p, fileName) =>
      set({
        project: p,
        activeDiagramId: p.diagrams[0]?.id ?? null,
        openDiagramIds: p.diagrams[0] ? [p.diagrams[0].id] : [],
        selection: [],
        past: [],
        future: [],
        fileName,
        dirty: false,
      }),

    markSaved: (fileName) => set({ fileName, dirty: false }),

    undo: () => {
      const { past, project, future } = get();
      if (!past.length) return;
      set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], selection: [] });
    },

    redo: () => {
      const { past, project, future } = get();
      if (!future.length) return;
      set({ project: future[0], past: [...past, project], future: future.slice(1), selection: [] });
    },

    addDiagram: (type, name) => {
      const d = createDiagram(type, name);
      get().commit((p) => p.diagrams.push(d));
      set((s) => ({ activeDiagramId: d.id, openDiagramIds: [...s.openDiagramIds, d.id], selection: [] }));
      return d.id;
    },

    openDiagram: (id) =>
      set((s) => ({
        activeDiagramId: id,
        openDiagramIds: s.openDiagramIds.includes(id) ? s.openDiagramIds : [...s.openDiagramIds, id],
        selection: [],
      })),

    closeDiagram: (id) =>
      set((s) => {
        const open = s.openDiagramIds.filter((x) => x !== id);
        return { openDiagramIds: open, activeDiagramId: s.activeDiagramId === id ? (open[open.length - 1] ?? null) : s.activeDiagramId };
      }),

    renameDiagram: (id, name) =>
      get().commit((p) => {
        const d = p.diagrams.find((x) => x.id === id);
        if (d) d.name = name;
      }),

    deleteDiagram: (id) => {
      get().commit((p) => {
        p.diagrams = p.diagrams.filter((d) => d.id !== id);
      });
      get().closeDiagram(id);
    },

    setTool: (tool) => set({ tool }),
    setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0.1, zoom)) }),
    select: (iids) => set({ selection: iids }),

    addNode: (type, x, y) => {
      let iid = "";
      get().commit((p) => withDiagram(p, (d) => (iid = addNodeAt(p, d, type, x, y).iid)));
      set({ selection: iid ? [iid] : [], tool: null });
    },
    placeExisting: (elementId, x, y) => get().commit((p) => withDiagram(p, (d) => placeElement(p, d, elementId, x, y))),
    addEdge: (type, fromIid, toIid) => {
      let iid = "";
      get().commit((p) =>
        withDiagram(p, (d) => {
          const a = d.views.find((v) => v.iid === fromIid) as ShapeView | undefined;
          const b = d.views.find((v) => v.iid === toIid) as ShapeView | undefined;
          if (a && b) iid = addEdgeBetween(p, d, type, a, b).iid;
        }),
      );
      set({ selection: iid ? [iid] : [], tool: null });
    },
    moveViews: (iids, dx, dy) => {
      if (!dx && !dy) return;
      get().commit((p) => withDiagram(p, (d) => moveViewsIn(d, iids, dx, dy)));
    },
    updateView: (iid, patch) =>
      get().commit((p) =>
        withDiagram(p, (d) => {
          const v = d.views.find((x) => x.iid === iid);
          if (v) Object.assign(v, patch);
        }),
      ),

    updateElement: (id, patch) =>
      get().commit((p) => {
        const el = p.elements[id];
        if (el) Object.assign(el, patch);
      }),

    deleteSelection: (fromModel) => {
      const sel = get().selection;
      if (!sel.length) return;
      get().commit((p) => withDiagram(p, (d) => removeViews(p, d, sel, fromModel)));
      set({ selection: [] });
    },
    deleteElement: (id) => get().commit((p) => removeElement(p, id)),

    copySelection: () => {
      const s = get();
      const d = activeDiagram(s);
      if (!d) return;
      const views = d.views.filter((v) => s.selection.includes(v.iid));
      const elements = views.map((v) => s.project.elements[v.ref]).filter(Boolean);
      set({ clipboard: structuredClone({ elements, views }) });
    },

    paste: () => {
      const clip = get().clipboard;
      if (!clip) return;
      const newSel: string[] = [];
      get().commit((p) =>
        withDiagram(p, (d) => {
          const iidMap = new Map<string, string>();
          const refMap = new Map<string, string>();
          for (const v of clip.views) iidMap.set(v.iid, newIid());
          for (const old of clip.elements) {
            if (!refMap.has(old.id)) refMap.set(old.id, cloneElement(p, old).id);
          }
          for (const v of clip.views) {
            const nv = structuredClone(v);
            nv.iid = iidMap.get(v.iid)!;
            nv.ref = refMap.get(v.ref) ?? v.ref;
            if (nv.kind === "entity") {
              nv.x += 20;
              nv.y += 20;
              if (nv.container) nv.container = iidMap.get(nv.container);
            } else {
              if (!iidMap.has(nv.fromIid) || !iidMap.has(nv.toIid)) continue;
              nv.fromIid = iidMap.get(nv.fromIid)!;
              nv.toIid = iidMap.get(nv.toIid)!;
              nv.points = nv.points.map((pt) => ({ x: pt.x + 20, y: pt.y + 20 }));
              const el = p.elements[nv.ref];
              if (el?.from) el.from = refMap.get(el.from) ?? el.from;
              if (el?.to) el.to = refMap.get(el.to) ?? el.to;
            }
            d.views.push(nv);
            newSel.push(nv.iid);
          }
        }),
      );
      set({ selection: newSel });
    },

    duplicateSelection: () => {
      const keep = get().clipboard;
      get().copySelection();
      get().paste();
      set({ clipboard: keep });
    },

    arrange: (fn) => {
      const sel = get().selection;
      if (!sel.length) return;
      get().commit((p) => withDiagram(p, (d) => fn(d, sel)));
    },
  };
});

let saveTimer: ReturnType<typeof setTimeout> | undefined;
useEditor.subscribe((s, prev) => {
  if (s.project === prev.project) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(s.project));
    } catch {
      /* quota exceeded: autosave is best effort */
    }
  }, 800);
});
