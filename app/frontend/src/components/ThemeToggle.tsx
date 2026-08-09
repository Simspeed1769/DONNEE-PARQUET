import { useEffect, useState } from "react";

type Choice = "system" | "light" | "dark";

const STORAGE_KEY = "damir-theme";

function readChoice(): Choice {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

/** La bascule doit gagner dans les deux sens : un choix explicite l'emporte sur
 *  le réglage du système, y compris pour forcer le mode clair sur un poste
 *  configuré en sombre. C'est l'attribut `data-theme` qui porte ce choix. */
function applyChoice(choice: Choice): void {
  if (choice === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", choice);
}

const ORDER: Choice[] = ["system", "light", "dark"];
const LABELS: Record<Choice, string> = {
  system: "Thème du système",
  light: "Thème clair",
  dark: "Thème sombre",
};

export function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>(readChoice);

  useEffect(() => {
    applyChoice(choice);
    if (choice === "system") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, choice);
  }, [choice]);

  const next = () => setChoice((current) => ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]);

  return (
    <button type="button" className="theme-toggle" onClick={next} title={LABELS[choice]} aria-label={LABELS[choice]}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {choice === "dark" ? <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>
          : choice === "light" ? <><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></>
          : <><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/></>}
      </svg>
    </button>
  );
}
