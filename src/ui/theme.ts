import { useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";

const KEY = "sim.theme";
const query = () => window.matchMedia?.("(prefers-color-scheme: dark)");

/** Returns the chosen theme, its effective value, and a setter; keeps `<html data-theme>` in sync. */
export function useTheme(): { choice: ThemeChoice; dark: boolean; setChoice: (c: ThemeChoice) => void } {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => {
    const saved = localStorage.getItem(KEY);
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
  });
  const [systemDark, setSystemDark] = useState(() => !!query()?.matches);

  useEffect(() => {
    const mq = query();
    if (!mq) return;
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const dark = choice === "dark" || (choice === "system" && systemDark);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  const setChoice = (c: ThemeChoice) => {
    setChoiceState(c);
    localStorage.setItem(KEY, c);
  };
  return { choice, dark, setChoice };
}
