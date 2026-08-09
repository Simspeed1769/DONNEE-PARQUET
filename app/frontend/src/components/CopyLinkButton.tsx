import { useEffect, useState } from "react";
import { copyCurrentUrl } from "../utils";

/** Le mode de partage entre collègues : l'état de chaque écran vit dans
 *  l'URL, mais rien ne le disait jusqu'ici — `copyCurrentUrl()` existait sans
 *  bouton pour l'atteindre. Posé dans le shell (topbar), il est donc présent
 *  sur toutes les pages sans qu'aucune n'ait à le répéter.
 *
 *  Sur le modèle de `ThemeToggle` : un bouton icône autonome, sa propre miette
 *  d'état. La confirmation est discrète — l'icône bascule en coche un instant,
 *  pas de bandeau ni de toast qui déplacerait le reste du shell. */
export function CopyLinkButton() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await copyCurrentUrl();
      setCopied(true);
    } catch {
      // Presse-papiers indisponible (contexte non sécurisé, permission
      // refusée) : on ne casse pas l'écran pour un geste secondaire, le bouton
      // reste simplement sans effet visible.
    }
  };

  const label = copied ? "Lien copié" : "Copier le lien";

  return (
    <button
      type="button"
      className="copy-link-button"
      onClick={copy}
      title={label}
      aria-label={label}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {copied
          ? <path d="M20 6 9 17l-5-5" />
          : <><path d="M10 13.5a4 4 0 0 0 5.7.4l3-3a4 4 0 0 0-5.7-5.7l-1.7 1.7" /><path d="M14 10.5a4 4 0 0 0-5.7-.4l-3 3a4 4 0 0 0 5.7 5.7l1.7-1.7" /></>}
      </svg>
      <span role="status" aria-live="polite" className="sr-only">{copied ? "Lien copié dans le presse-papiers" : ""}</span>
    </button>
  );
}
