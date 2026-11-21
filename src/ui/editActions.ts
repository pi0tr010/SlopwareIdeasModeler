import { t } from "../i18n";
import { alignShapes, distributeShapes, reorderViews, type AlignMode } from "../model/arrange";
import { useEditor } from "../store/store";
import type { MenuItem } from "./MenuBar";

const sep: MenuItem = { label: "", separator: true };

/** Align, distribute and z-order commands, shared by the Diagram menu and the canvas context menu. */
export function arrangeItems(): MenuItem[] {
  const s = useEditor.getState();
  const n = s.selection.length;
  const align = (mode: AlignMode, key: string): MenuItem => ({ label: t(key), action: () => s.arrange((d, iids) => alignShapes(d, iids, mode)), disabled: n < 2 });
  return [
    align("left", "arrange.alignLeft"),
    align("center", "arrange.alignCenter"),
    align("right", "arrange.alignRight"),
    align("top", "arrange.alignTop"),
    align("middle", "arrange.alignMiddle"),
    align("bottom", "arrange.alignBottom"),
    sep,
    { label: t("arrange.distributeH"), action: () => s.arrange((d, iids) => distributeShapes(d, iids, "horizontal")), disabled: n < 3 },
    { label: t("arrange.distributeV"), action: () => s.arrange((d, iids) => distributeShapes(d, iids, "vertical")), disabled: n < 3 },
    sep,
    { label: t("arrange.front"), action: () => s.arrange((d, iids) => reorderViews(d, iids, "front")), disabled: n < 1 },
    { label: t("arrange.back"), action: () => s.arrange((d, iids) => reorderViews(d, iids, "back")), disabled: n < 1 },
  ];
}

export function clipboardItems(): MenuItem[] {
  const s = useEditor.getState();
  const has = s.selection.length > 0;
  return [
    { label: t("menu.copy"), shortcut: "Ctrl+C", action: s.copySelection, disabled: !has },
    { label: t("menu.paste"), shortcut: "Ctrl+V", action: s.paste, disabled: !s.clipboard },
    { label: t("menu.duplicate"), shortcut: "Ctrl+D", action: s.duplicateSelection, disabled: !has },
    { label: t("menu.delete"), shortcut: "Del", action: () => s.deleteSelection(false), disabled: !has },
    { label: t("menu.deleteFromModel"), shortcut: "Shift+Del", action: () => s.deleteSelection(true), disabled: !has },
  ];
}
