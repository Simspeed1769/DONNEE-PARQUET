/** Le moteur d'animation, dans son propre morceau de bundle.
 *
 *  Ce fichier n'existe que pour créer un **point de découpe**. `LazyMotion`
 *  ne charge ses fonctionnalités à la demande que si on les lui passe sous
 *  forme de fonction asynchrone ; importer `domAnimation` directement dans le
 *  module qui rend l'application le remet sur le chemin critique, et le motif
 *  ne sert plus à rien.
 *
 *  Mesuré : avec l'import statique, le morceau `index` passait de 7,5 à 32 Ko
 *  gzip. C'est exactement ce que ce fichier évite.
 */

export { domAnimation as default } from "motion/react";
