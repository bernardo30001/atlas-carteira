"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_KEY, resolveTheme, type Theme } from "../lib/theme";
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      let saved = null;
      try {
        saved = localStorage.getItem(THEME_KEY);
      } catch {}
      const value = resolveTheme(saved, media.matches);
      document.documentElement.dataset.theme = value;
      document.documentElement.style.colorScheme = value;
      setTheme(value);
    };
    const storage = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null) sync();
    };
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("storage", storage);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", storage);
    };
  }, []);
  const toggle = () => {
    const value: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = value;
    document.documentElement.style.colorScheme = value;
    setTheme(value);
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch {}
  };
  return (
    <button
      type="button"
      className="theme-toggle"
      role="switch"
      aria-checked={theme === "dark"}
      aria-label="Visualização escura"
      title={
        theme === "dark"
          ? "Ativar visualização clara"
          : "Ativar visualização escura"
      }
      onClick={toggle}
    >
      {theme === "dark" ? <Moon size={17} /> : <Sun size={17} />}
      <span>{theme === "dark" ? "Escuro" : "Claro"}</span>
    </button>
  );
}
