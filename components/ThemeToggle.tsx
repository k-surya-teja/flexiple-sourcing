"use client";

import { useEffect, useState } from "react";

/* Three states, because two is a lie: most people never touch this and should
   follow the OS, so "system" has to be a real, returnable state rather than an
   implicit starting position. Only an explicit choice writes data-theme; the
   CSS handles the system case on its own. */

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];

const ICONS: Record<Theme, React.ReactNode> = {
  system: (
    <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" aria-hidden>
      <rect x="2" y="3" width="12" height="8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 13.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="square" />
    </svg>
  ),
  light: (
    <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" aria-hidden>
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.95 3.05l-1.06 1.06M4.11 11.89l-1.06 1.06M12.95 12.95l-1.06-1.06M4.11 4.11L3.05 3.05"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="square"
      />
    </svg>
  ),
  dark: (
    <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" aria-hidden>
      <path
        d="M13.5 9.5A5.8 5.8 0 0 1 6.5 2.5a5.8 5.8 0 1 0 7 7z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    if (theme === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {
    /* private mode — the choice just does not persist */
  }
  window.setTimeout(() => root.classList.remove("theme-switching"), 60);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored: Theme = "system";
    try {
      const v = localStorage.getItem("theme");
      if (v === "light" || v === "dark") stored = v;
    } catch {
      /* ignore */
    }
    setTheme(stored);
    setReady(true);
  }, []);

  const next = () => {
    const t = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(t);
    apply(t);
  };

  return (
    <button
      onClick={next}
      title={`Theme: ${theme}. Click to change.`}
      aria-label={`Theme: ${theme}. Click to change.`}
      className="micro inline-flex cursor-pointer items-center gap-1.5 border border-rule px-2 py-1 text-ink-3 transition hover:border-ink-3 hover:text-ink"
    >
      {/* Render nothing meaningful until the stored choice is known, so the
          label never flashes the wrong state on hydration. */}
      <span className={ready ? "" : "opacity-0"}>{ICONS[theme]}</span>
      <span className={ready ? "" : "opacity-0"}>{theme}</span>
    </button>
  );
}
