import { useSyncExternalStore } from "react";
import catalog from "../catalog/catalog.json";

type Dict = Record<string, string>;

// Every JSON file dropped into ./locales becomes an available language.
const modules = import.meta.glob<{ default: Dict }>("./locales/*.json", { eager: true });
const locales: Record<string, Dict> = {};
for (const [path, mod] of Object.entries(modules)) {
  const code = path.match(/\/([\w-]+)\.json$/)![1];
  locales[code] = mod.default;
}

export const availableLanguages = Object.keys(locales).sort();
const STORAGE_KEY = "sim.lang";

function initialLanguage(): string {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  if (saved && locales[saved]) return saved;
  const nav = typeof navigator !== "undefined" ? navigator.language.slice(0, 2) : "en";
  return locales[nav] ? nav : "en";
}

let current = initialLanguage();
const listeners = new Set<() => void>();

export function setLanguage(code: string) {
  if (!locales[code]) return;
  current = code;
  localStorage.setItem(STORAGE_KEY, code);
  document.documentElement.lang = code;
  listeners.forEach((l) => l());
}

export function getLanguage() {
  return current;
}

export function languageName(code: string) {
  return locales[code]?.["language.name"] ?? code;
}

export function t(key: string, params?: Record<string, string | number>): string {
  let s = locales[current]?.[key] ?? locales.en?.[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
  return s;
}

type Names = Record<string, string>;
const elementNames = (catalog as { elements: Record<string, { name: Names }> }).elements;

function pick(names: Names | undefined, key: string, fallback: string) {
  return locales[current]?.[key] ?? names?.[current] ?? names?.en ?? fallback;
}

export function elementName(typeId: string): string {
  return pick(elementNames[typeId]?.name, `element.${typeId}`, typeId);
}

export function diagramTypeName(typeId: string, names?: Names): string {
  return pick(names, `diagram.${typeId}`, typeId);
}

export function groupName(groupId: string, names?: Names): string {
  return pick(names, `group.${groupId}`, groupId);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Re-renders the calling component when the language changes. */
export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage);
}
