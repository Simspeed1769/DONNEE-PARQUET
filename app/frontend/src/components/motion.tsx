/** Le mouvement du chrome — et rien d'autre.
 *
 *  Motion est **la seule dépendance ajoutée** au produit depuis son origine,
 *  et l'autorisation est explicite. Elle vaut pour le chrome de l'interface :
 *  le tiroir des séries, les popovers, l'entrée et la sortie des puces, la
 *  bascule Panorama ↔ Comparer, l'apparition des blocs repliés.
 *
 *  **Les graphiques n'y touchent pas.** ECharts a son propre moteur de
 *  transition — `universalTransition`, `divideShape: "clone"`, l'époque de
 *  style de `EChart.tsx` — et deux systèmes d'animation sur le même élément se
 *  contrarient. Aucun `m.*` ne doit envelopper un conteneur de graphique.
 *
 *  ## Les cinq règles, tenues ici plutôt que dispersées
 *
 *  1. **`LazyMotion` + `m`.** Le composant `motion.div` embarque tout le moteur
 *     dans le bundle initial ; `m` n'embarque que la coquille, et `LazyMotion`
 *     charge les fonctionnalités à la demande. C'est la différence entre ~34 ko
 *     et ~5 ko sur le chemin critique.
 *  2. **`transform` et `opacity` uniquement**, écrits avec les raccourcis de
 *     Motion — `x`, `y`, `scale` — plutôt qu'avec une chaîne `transform:`.
 *     Ce sont les deux propriétés que le compositeur anime sans repasser par
 *     la mise en page ; animer une hauteur ou une marge ferait travailler le
 *     moteur de rendu à chaque image, et l'écran porte déjà un canevas ECharts.
 *     Les raccourcis, eux, sont ce que Motion sait composer entre eux et ce
 *     que sa neutralisation du mouvement inspecte.
 *  3. **200 à 300 ms, en ressort.** Un easing linéaire se remarque ; un ressort
 *     court se lit comme une conséquence du geste.
 *  4. **`prefers-reduced-motion` sans exception.** Pas de durée réduite : pas
 *     d'animation du tout. Le réglage n'est pas une préférence esthétique.
 *  5. **Aucun saut de mise en page.** On n'anime que ce qui est déjà posé.
 *
 *  Rester sobre : une animation qu'on remarque est une animation ratée.
 */

import type { ReactNode } from "react";
import { LazyMotion, MotionConfig, m, useReducedMotion } from "motion/react";

/** Chargé à la demande, dans son propre morceau : voir `motionFeatures.ts`. */
const loadFeatures = () => import("./motionFeatures").then((module) => module.default);

export { m };

/** Le ressort commun. Court, amorti, sans rebond visible.
 *
 *  `visualDuration` fixe le temps que le mouvement *paraît* prendre, ce qui est
 *  la grandeur qu'on veut régler — la durée réelle d'un ressort dépend de sa
 *  raideur et n'est pas ce qu'on perçoit.
 */
export const SPRING = { type: "spring", visualDuration: 0.24, bounce: 0.12 } as const;

/** Un ressort à peine plus lent, pour ce qui couvre une plus grande distance —
 *  le tiroir des séries, qui traverse un tiers de l'écran. */
export const SPRING_WIDE = { type: "spring", visualDuration: 0.3, bounce: 0.1 } as const;

/** Aucune animation. Pas « plus courte » : nulle.
 *
 *  Une durée de zéro n'est pas une subtilité de bibliothèque, c'est de
 *  l'arithmétique — rien ne peut s'animer. C'est ce qui rend la garde
 *  vérifiable en la lisant, sans avoir à faire confiance à la façon dont Motion
 *  classe telle ou telle propriété. */
export const INSTANT = { duration: 0 } as const;

/** Le fondu-glissé des panneaux flottants : popovers, tiroirs de filtres.
 *
 *  Six pixels de translation, pas davantage : assez pour que l'œil comprenne
 *  d'où le panneau sort, trop peu pour qu'il attende son arrivée.
 */
export const POPOVER = {
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
} as const;

/** L'entrée et la sortie d'une puce de comparaison.
 *
 *  Elle grandit depuis 96 % plutôt que depuis zéro : une puce qui naît d'un
 *  point attire l'œil comme un événement, alors qu'ajouter une série est un
 *  geste ordinaire.
 */
export const CHIP = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
} as const;

/** L'apparition d'un bloc replié — « Voir les valeurs », « Autres vues ». */
export const REVEAL = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
} as const;

/** Le tiroir des séries, qui entre par la droite. */
export const DRAWER = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 24 },
} as const;

/**
 * Vrai quand l'utilisateur a demandé moins de mouvement.
 *
 * `MotionConfig reducedMotion="user"` suffit et fait le travail : **vérifié en
 * forçant `reducedMotion="always"` et en interceptant `Element.animate` —
 * zéro animation demandée**, contre transform + opacity en marche normale. Le
 * contrôle passe par l'interception plutôt que par l'observation d'un
 * mouvement, parce qu'un onglet caché gèle l'horloge d'animation et rend toute
 * mesure de position mensongère.
 *
 * Ce crochet reste pour un composant qui aurait besoin de ne rien faire du
 * tout ; aucun n'en a besoin aujourd'hui.
 */
export function useStillness(): boolean {
  return useReducedMotion() ?? false;
}

/** Enveloppe l'application entière. Posée une seule fois, dans `App.tsx`.
 *
 *  `strict` interdit `motion.*` : seul `m` passe. C'est un garde-fou de
 *  construction — sans lui, un `motion.div` importé par distraction annulerait
 *  tout le bénéfice de `LazyMotion` sans que rien ne le signale.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const still = useReducedMotion() ?? false;
  return (
    <LazyMotion features={loadFeatures} strict>
      {/* Deux gardes plutôt qu'une, et c'est délibéré.
          `reducedMotion="user"` est celle de Motion : elle retire les
          déplacements. La durée nulle est la nôtre : elle ne dépend d'aucune
          classification interne, et se vérifie en la lisant.
          La transition est posée **ici seulement** — aucun composant du chrome
          ne fournit la sienne, faute de quoi il court-circuiterait la garde
          sans que rien ne le signale. */}
      <MotionConfig reducedMotion="user" transition={still ? INSTANT : SPRING}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
