# Cahier des charges — Site GR20

Oct 21, 2026 · @Sacha

## Objectif et public

Un site d'une seule page, au défilement cinématographique, qui fait comprendre le GR20 et le trek de Sacha (été 2027) en moins de 10 minutes de lecture.

- **Public :** famille et entourage, environ 50 ans, non randonneurs. Aucun prérequis en montagne.
- **Double rôle :** expliquer le GR20 en général, puis présenter le trek précis de Sacha.
- **Période d'usage :** avant le départ uniquement. Pas de suivi en direct, pas de carnet de route.
- **Partage :** un simple lien, lisible d'abord sur téléphone.
- **Hors périmètre :** son, compte utilisateur, commentaires, formulaire, mise à jour pendant le trek.

## Direction artistique

Le ton est cinématographique : le relief corse est le personnage principal, le texte est court et sert l'image.

- **Visuel principal :** le terrain 3D lui-même. Lumière rasante, brume dans les vallées, ciel de fin de journée. Aucune photo n'est indispensable.
- **Palette :** granit gris-rose, vert maquis, bleu nuit, accent orange pour le tracé.
- **Typographie :** un titre à empattements de grande taille, un corps sans empattements très lisible (18 px minimum sur mobile).
- **Animations :** déclenchées par le défilement. Fondus, chiffres qui s'incrémentent, caméra qui se déplace. Jamais d'animation qui bloque la lecture.
- **Vocabulaire :** zéro jargon. « D+ » devient « mètres de montée », « refuge » est expliqué une fois. Des comparaisons concrètes (« l'équivalent de X tours Eiffel de montée »).
- **Pas de son**, pas de lecture automatique de vidéo avec audio.

## Architecture du site

Une page unique en 8 sections, lues dans cet ordre par simple défilement.

1. **Ouverture** — écran sombre, la Corse apparaît vue du ciel, titre « GR20 — 12 jours, de Calenzana à Conca ».
2. **Le survol** — la caméra plonge sur Calenzana et suit le tracé jusqu'à Conca, piloté par le défilement.
3. **C'est quoi, le GR20** — les chiffres clés en grand, avec compteurs animés.
4. **Les 16 étapes** — une carte par étape officielle ; la vue 3D se recentre sur le tronçon concerné.
5. **Mon trek** — sens nord→sud, dates, refuges, et le découpage en 12 jours (étapes doublées).
6. **Préparation** — sac, matériel, entraînement sur 12 mois.
7. **Pour la famille** — où je dors chaque soir, zones sans réseau, quand s'inquiéter et qui prévenir.
8. **Fin** — plan large sur Conca et compte à rebours jusqu'au départ.

Un sommaire discret (points latéraux) permet de sauter à une section.

## Survol 3D drone

Le survol est la pièce maîtresse : un terrain réel en 3D, le tracé GPX posé dessus, une caméra qui le suit au rythme du défilement.

- **Moteur :** Three.js (ou MapLibre GL avec terrain si plus simple). Données embarquées dans le site, aucune dépendance à une API payante.
- **Terrain :** maillage généré depuis le MNT IGN, exagération verticale réglable (1,2 à 1,5×). Texture : teinte par altitude + ombrage du relief.
- **Tracé :** ligne orange épaisse qui se « dessine » au fur et à mesure de l'avancée.
- **Caméra :** vue drone en arrière et au-dessus du point courant, lissée (pas d'à-coups), regard orienté vers la suite du tracé.
- **Pilotage :** la position sur le tracé dépend du défilement (0 % = Calenzana, 100 % = Conca). Un bouton « Lecture » lance aussi un survol automatique d'environ 90 s.
- **Repères :** les 16 étapes et les refuges en marqueurs ; une étiquette affiche l'étape courante, l'altitude et les km parcourus.
- **Profil altimétrique :** bandeau en bas d'écran, synchronisé avec la caméra.
- **Performance :** 30 images/s minimum sur un téléphone récent. Prévoir une version allégée du terrain pour mobile.
- **Repli :** si WebGL est indisponible, afficher une carte 2D statique du tracé.

## Contenu par section

Toutes les distances et tous les dénivelés affichés sont calculés depuis le GPX, jamais recopiés d'un topo : les sources publiées se contredisent (de 177 à 200 km selon les guides).

**C'est quoi, le GR20.** Traversée de la Corse en diagonale, de Calenzana (Balagne) à Conca (près de Porto-Vecchio), en 16 étapes officielles depuis l'ajout du refuge de Matalza. Chiffres affichés : distance totale, montée cumulée, altitude maximale, nombre d'étapes, nombre de refuges. Un paragraphe sur le nord (rocheux, technique) et le sud (plus roulant).

**Les 16 étapes (sens nord→sud).** Une carte par étape : nom, distance, montée, descente, une phrase sur ce qu'on y voit.

| N° | Départ | Arrivée |
| --- | --- | --- |
| 1 | Calenzana | Ortu di u Piobbu |
| 2 | Ortu di u Piobbu | Carrozzu |
| 3 | Carrozzu | Ascu Stagnu |
| 4 | Ascu Stagnu | Tighjettu |
| 5 | Tighjettu | Ciottulu di i Mori |
| 6 | Ciottulu di i Mori | Manganu |
| 7 | Manganu | Petra Piana |
| 8 | Petra Piana | L'Onda |
| 9 | L'Onda | Vizzavona |
| 10 | Vizzavona | E Capannelle |
| 11 | E Capannelle | Prati |
| 12 | Prati | Usciolu |
| 13 | Usciolu | Matalza |
| 14 | Matalza | Asinau |
| 15 | Asinau | I Paliri |
| 16 | I Paliri | Conca |

**Mon trek.** Nord→sud, fin juillet / début août 2027, 12 jours, refuges uniquement, sans variante. Étapes doublées : 2+3, 8+9, 12+13, 14+15. Le site affiche les 12 journées et met en évidence les jours doublés.

| Jour | Trajet | Étapes | Nuit |
| --- | --- | --- | --- |
| 1 | Calenzana → Ortu di u Piobbu | 1 | Ortu di u Piobbu |
| 2 | Ortu → Ascu Stagnu | 2+3 | Ascu Stagnu |
| 3 | Ascu Stagnu → Tighjettu | 4 | Tighjettu |
| 4 | Tighjettu → Ciottulu di i Mori | 5 | Ciottulu di i Mori |
| 5 | Ciottulu → Manganu | 6 | Manganu |
| 6 | Manganu → Petra Piana | 7 | Petra Piana |
| 7 | Petra Piana → Vizzavona | 8+9 | Vizzavona |
| 8 | Vizzavona → E Capannelle | 10 | E Capannelle |
| 9 | E Capannelle → Prati | 11 | Prati |
| 10 | Prati → Matalza | 12+13 | Matalza |
| 11 | Matalza → I Paliri | 14+15 | I Paliri |
| 12 | I Paliri → Conca | 16 | Arrivée |

**Préparation.** Sac de 6 à 8 kg, nuits en refuge en demi-pension, matériel principal (chaussures de trail, veste imperméable, sac de couchage léger), programme d'entraînement sur 12 mois. Présentation visuelle : le sac « éclaté » en objets.

**Pour la famille.** Tableau des nuits ci-dessus en version simplifiée, zones sans réseau probables, fréquence des nouvelles, délai au-delà duquel s'inquiéter, numéros utiles. Textes à rédiger par Sacha.

## Données nécessaires

Trois fichiers fournis par Sacha suffisent ; tout le reste est calculé.

| Donnée | Format | Fourni par | Usage |
| --- | --- | --- | --- |
| Tracé GR20 officiel | GPX (un fichier, ou un par étape) | Sacha | Ligne 3D, distances, profil |
| Relief de la Corse | MNT IGN (RGE ALTI ou BD ALTI), GeoTIFF réduit à 1 000–2 000 px de côté | Sacha | Terrain 3D |
| Liste des refuges | JSON : nom, coordonnées, altitude | À extraire du GPX ou à saisir | Marqueurs |
| Textes perso | Markdown | Sacha | Sections 5 à 7 |

Sources de référence pour vérifier la cohérence : [GR20 Infos — 16 étapes et refuges](https://gr20-infos.com/en/12days), [Lonely Planet — guide pratique](https://www.lonelyplanet.fr/article/grr20-le-guide-pratique).

## Contraintes techniques

Site statique, gratuit à héberger, chargé en moins de 5 s en 4G.

- **Pile :** Vite + Three.js (ou MapLibre GL), JavaScript simple, pas de framework lourd. GSAP ScrollTrigger pour les animations au défilement.
- **Hébergement :** GitHub Pages depuis le dépôt du projet.
- **Poids :** 10 Mo maximum au total. Terrain précalculé et compressé (heightmap PNG 16 bits ou maillage .glb).
- **Prétraitement :** un script Python (rasterio, gpxpy) convertit le MNT et le GPX en fichiers prêts pour le navigateur. Il tourne une fois, ses sorties sont versionnées.
- **Mobile d'abord :** testé à 390 px de large, défilement tactile fluide.
- **Accessibilité :** contraste suffisant, texte jamais posé sur une zone claire du terrain sans voile sombre, option « réduire les animations » respectée.
- **Droits :** données IGN sous Licence Ouverte (mention « Source : IGN » en pied de page). Aucune photo trouvée sur Internet ; seulement le rendu 3D, les rendus Blender de Sacha, ou des photos libres (Wikimedia Commons) avec crédit.

## Jalons et validation

Quatre jalons, chacun validé sur téléphone avant de passer au suivant. Le survol vient en premier : s'il ne convainc pas, le reste n'a pas de sens.

1. **Données** — script de prétraitement : MNT et GPX convertis, découpés en 16 étapes, chiffres calculés. *Validé si* les distances et montées par étape sont cohérentes avec les topos (écart inférieur à 10 %).
2. **Survol** — terrain + tracé + caméra pilotée au défilement + profil altimétrique. *Validé si* le survol complet est fluide sur téléphone et que Sacha reconnaît les lieux.
3. **Contenu** — sections 3 à 8 avec textes et animations. *Validé si* une personne de 50 ans non randonneuse comprend le GR20 et le plan de Sacha sans poser de question.
4. **Mise en ligne** — GitHub Pages, vérification du poids, des crédits IGN et du repli sans WebGL.

- [ ] Fournir le GPX officiel
- [ ] Fournir le MNT IGN réduit
- [ ] Rédiger les textes « Mon trek » et « Pour la famille »
- [ ] Vérifier la réservation de Matalza sur pnr-resa.corsica

## Prompt pour Claude Code

À coller dans une session Code, une fois ce cahier des charges exporté en Markdown à la racine du dépôt (`CDC.md`) et les fichiers placés dans `data/raw/`.

```markdown
Tu construis un site statique d'une seule page sur le GR20, à partager avec ma famille.
Le cahier des charges complet est dans CDC.md : lis-le entièrement avant d'écrire du code et respecte-le.

Données fournies dans data/raw/ : le tracé GPX officiel et un MNT IGN de la Corse (GeoTIFF).

Travaille jalon par jalon, dans l'ordre de la section « Jalons et validation » :
1. Écris le script Python de prétraitement (data/ -> public/data/), découpe le tracé en 16 étapes,
   calcule distance, montée et descente par étape, et affiche-moi le tableau pour validation.
2. Construis le survol 3D (Vite + Three.js) piloté par le défilement, avec le profil altimétrique.
   Arrête-toi et demande-moi de tester sur téléphone avant de continuer.
3. Ajoute les sections de contenu. Laisse des marqueurs [À RÉDIGER] pour mes textes perso.
4. Configure le déploiement GitHub Pages.

Contraintes : mobile d'abord, 10 Mo maximum, aucun chiffre recopié d'un topo (tout vient du GPX),
pas de son, crédit « Source : IGN » en pied de page. Textes compréhensibles par des non-randonneurs.
```
