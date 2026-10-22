# Football Quant AI

Pronostics football quantitatifs sur 13 compétitions : un choix préférentiel par match, tickets hebdomadaires en paper betting (unités « u »), suivi des paris réels en euros, audit T+1 et backtest walk-forward.

L'application est une page HTML autonome (React via CDN + `htm`, sans compilation), publiée comme artifact Claude.

## Structure

| Chemin | Rôle |
|---|---|
| `src/engine.js` | Moteur quantitatif : Poisson / Dixon-Coles (MLE pondéré, décroissance temporelle, rétrécissement bayésien), marchés buteurs/passeurs, Kelly plafonné |
| `src/standings.js` | Classements, enjeux sportifs, projections Monte-Carlo (§25) |
| `src/core.js` | État, persistance, logique applicative (sans UI) |
| `src/autopilot.js` | Pipeline partagé : audit, analyses, choix, tickets — utilisé par la page et par la tâche planifiée |
| `src/etl2.js` | ETL v2 (Node + navigateur) : ESPN, football-data.co.uk |
| `src/train2.js` | Entraînement sur ≥ 12 mois d'historique, sans fuite de données |
| `src/runner.js` | Exécuteur Node de la tâche planifiée (`run` / `summary`) |
| `src/app.js` | Interface React |
| `src/boot.js`, `src/trained-loader.js`, `src/tailwind-config.js` | Amorçage de la page |
| `src/styles.css`, `src/template.html` | Styles et gabarit de la page |
| `etl/build_data.py` | ETL historique openfootball (CC0) → jeu de données compact |
| `data/snapshot.json.gz` | Instantané des données brutes embarqué dans la page |
| `data/trained.json` | Paramètres du modèle entraîné embarqués dans la page |
| `build.py` | Assemble `dist/football-quant-ai.html` |

## Construire la page

```bash
python3 build.py            # -> dist/football-quant-ai.html
```

La page produite est celle publiée sur claude.ai.

## Tests

```bash
npm install   # jsdom, React… pour le test de la page (hors CDN)
npm test      # moteur, ETL, cotes, règlements, CLV, tickets, couverture, intervalles, cycle complet, rendu de la page
```

## Exécuteur Node (tâche planifiée)

La tâche planifiée clone ce dépôt deux fois par jour, télécharge la base de la page (collection `auto`), puis :

```bash
ODDS_API_KEY=… node src/runner.js run <dossier>   # → <dossier>/out/plan.json (écritures pour la base)
node src/runner.js summary <dossier>               # résumé hebdomadaire des tickets
```

`run` télécharge directement, sans retranscription :

| Source | Données |
|---|---|
| ESPN (`site.api.espn.com`) | résultats, buteurs, horaires, cotes Bet 365 |
| football-data.co.uk | cotes d'avant-match et de clôture (Pinnacle, moyenne du marché) |
| The Odds API (`api.the-odds-api.com`, région `fr`) | cotes 1N2 Winamax, Betclic, Unibet, PMU, NetBet |

Si ESPN est injoignable, `run` sort avec le code 3 et écrit `fetch_plan.json` ; la tâche lit alors les pages par le web et relance avec `--fetched`.

## Battre le marché

Personne ne prédit mieux que Pinnacle avec des résultats et des buts seulement : quatre essais (recalibrer le marché, mélanger marché et modèle, prévoir le mouvement de cote, amplifier les forces) ont été rejetés sur la validation. La méthode retenue : Pinnacle (et les bourses Betfair, Matchbook) relevé dans le même appel que les bookmakers français (paramètre `bookmakers`, ≤ 10 = 1 crédit), utilisé comme cote juste ; une cote française au-dessus de cette cote juste + 3 % est une value bet, suivie à la clôture (CLV). Historique 2024-2026 : meilleur prix > cote juste Pinnacle + 2 % → espérance à la clôture +2,9 % sur 621 paris.

## Cotes

1N2 : cote relevée chez un bookmaker, jamais calculée :

1. meilleur prix parmi les 5 bookmakers français (par défaut), ou un bookmaker choisi dans les Paramètres ;
2. un ticket est chiffré chez le bookmaker français qui le paie le mieux (il se joue chez un seul) ;
3. sinon Bet 365 (crédits The Odds API épuisés pour le mois, ou compétition non couverte).

Autres marchés des combinés :

| Marché | Cote |
|---|---|
| Les deux équipes marquent, ±2,5 buts | relevée match par match (The Odds API, NetBet / PMU), 2 crédits par match |
| Double chance | **estimée** d'après le 1N2 réel du même bookmaker (1 / (1/c₁ + 1/c₂)), corrigée par les cotes réelles saisies dans « Mon ticket » ; marquée d'un astérisque |
| Buteur, joueur décisif | aucune cote française accessible : cote juste et cote minimale affichées, cote saisissable à la main |
| Toute sélection | cote saisie par Iso (vue ou boostée) : prioritaire, marquée « saisie par toi » |

Multiboost Betclic (option, désactivée par défaut) : bonus de cote totale selon le nombre de sélections, barème de départ relevé sur des tickets réels (8 → +4,7 %, 10 → +6,2 %, 13 → +7,7 %), remplacé par les bonus observés sur les tickets Betclic saisis.

Les crédits (500 par mois, offre gratuite) sont répartis sur le mois, davantage du jeudi au samedi pour les tickets. Le « seuil 1/p » est la cote minimale à exiger selon le modèle, pas une cote de bookmaker.

## Probabilités et apprentissage

Validation chronologique en trois périodes : apprentissage (01/07/2025 → 28/02/2026), validation (01/03 → 30/06/2026), test final (depuis le 01/07/2026).

- La validation décide si un réglage est gardé : hyperparamètres par compétition, calibration, méthode de retrait de la marge, poids modèle / marché. Un réglage gardé est réajusté sur apprentissage + validation.
- Le test final n'est utilisé pour aucun choix : il est seulement mesuré, avec intervalles de confiance (Wilson pour les taux de réussite, bootstrap pour les rendements et les écarts de log loss).
- Sources séparées : chaque sélection garde la probabilité du marché sans marge, celle du modèle sportif seul et la probabilité retenue (mélange appris).
- À moins de 24 h du coup d'envoi, la probabilité retenue est celle du marché seul : sur l'historique (Bet 365 avant-match → clôture, `tools/poids_cloture.js`), le poids optimal du modèle tombe à 0 près du match, et le suivi réel du 16 au 21/10 attribuait tout l'écart au marché aux compétitions où le modèle gardait un poids.

## Suivi prospectif

- Le test final (01/07 → 15/10/2026) a été consulté pendant le développement : il est figé comme référence historique (`data/reference_test_2026-10-16.json`, `FQ.T.FROZEN_TEST_TO`) et ne sert plus à aucun choix.
- Journal des prévisions (`state.forecastLog`, jamais réécrit) : un instantané par match et par horizon (J-14, J-7, J-3, J-1, J-0), plus la dernière prévision avant le coup d'envoi, avec modèle seul, marché, retenue, poids, choix, cote, source, fiabilité et inclusion dans un ticket. Évalué par horizon et par version (Performance › Suivi prospectif). Les lignes de plus de 120 jours passent dans des totaux archivés.
- Absences (API-Football, offre gratuite, clé `APIFOOTBALL_KEY` gardée hors du dépôt) : blessés et suspendus du jour et du lendemain, rattachés aux matchs ; un absent pèse selon sa part des buts de son équipe (coefficient 0,05 validé sur 2024-25 : −0,0003 de log loss face aux cotes d'avant-match, IC entièrement sous zéro ; `tools/blessures.js`). Un buteur absent n'est plus proposé.
- Compositions officielles (ESPN, titulaires habituels absents pondérés par leur part des buts) : testées sur 2025-26 (2 001 matchs), aucun apport face aux cotes d'avant-match (validation +0,00001, IC −0,0005 à +0,0005) ; rejetées (`tools/compositions_espn.js`, `tools/compositions_test.js`).
- Drivers gardés : forces d'équipe lues dans les cotes d'avant-match des matchs passés (`FQ.fitRatings`, `FQ.driverLambdas`), combinées au modèle de buts avec des poids appris (actuellement 90 % / 10 %) ; notre modèle n'est donc plus indépendant des bookmakers (affiché). Tirs cadrés (football-data, colonnes HST / AST) : testés, poids nul.
- Drivers : chaque candidat est construit sans fuite, appris sur l'apprentissage, gardé seulement s'il améliore la validation. Repos et congestion : rejetés (`tools/driver_repos.js`).

## Tickets

Quatre niveaux : Sûr 1,4–1,8, Prudent 3–4, Équilibré 7–8, Audacieux 40–60.

- **Chance et profit ensemble** : à cote totale fixée, chance = produit des rendements des sélections (chance × cote) ÷ cote, et l'espérance suit le même produit. Le ticket garde les sélections où le bookmaker prélève le moins, avec le nombre de sélections qui donne la meilleure chance (comparé de 1 à 15), et à 10 % près le meilleur rendement.
- **Prudence** : probabilité diminuée de κ × |modèle − marché| quand les deux sources divergent ; κ choisi sur le passé d'après le rendement réalisé des sélections.
- **Stratégies** (favoris 45 / 55 / 65 %, chance max avec ou sans nul, sécurisé multi-marchés, multi-marchés, valeur) : chacune propose son ticket, suivi en fantôme. La stratégie jouée a la plus forte chance corrigée par son historique (tickets gagnés ÷ annoncés, semaines rejouées à demi-poids, rétréci vers 1). Cette procédure et l'autre (meilleur taux de réussite) sont rejouées semaine par semaine sans regarder l'avenir ; la meilleure sur le passé est retenue.
- **Aucun ticket admissible** quand le meilleur ticket d'un niveau a une espérance sous le seuil (−20 % par défaut, Paramètres) ; la stratégie reste suivie en fantôme.
- **Justification** de chaque sélection en clair (issue, marché / modèle, marge prélevée comparée aux autres sélections, contexte) et de chaque ticket (méthode, comparaison par nombre de sélections, autres stratégies, seuil de rentabilité).

## Audit

- Audit de chaque semaine terminée : tickets joués et fantômes, choix du modèle (réel vs attendu), log loss face au marché, CLV, paris saisis par Iso (réels et tests séparés).
- Paris saisis : « test » (simulation, par défaut) ou « réel ». Les tests sont suivis et audités, mais n'entrent pas dans le bilan en euros.
- Contrôle de couverture à chaque cycle : par compétition, matchs à venir sur 14 jours, analysés, avec cote ; résultats manquants, reports, doublons.
- Réentraînement complet chaque semaine par la tâche planifiée.

## Cote de clôture (CLV)

Chaque choix, ticket fictif et pari réel est comparé à la cote de clôture : Pinnacle (football-data.co.uk), sinon le dernier relevé français avant le coup d'envoi (provisoire). Espérance à la clôture = cote prise × probabilité sans marge de la clôture − 1.

## Sources de données

- ESPN (résultats, calendriers, cotes Bet 365)
- football-data.co.uk (cotes de clôture)
- The Odds API (bookmakers français)
- openfootball (CC0, calendrier suisse)

## Simulation Claude : road to 1 M€ (paper)

Règles fixées par Iso le 22/10/2026 : chaque parcours démarre avec 100 € fictifs, entièrement misés sur un ticket de cote totale ≥ 2.
À chaque ticket gagné, 50 % du capital part au coffre jusqu'à 400 € de coffre pour le parcours, puis tout le capital reste en jeu jusqu'à 1 M€.
Capital perdu : nouveau parcours à 100 €, le coffre n'est jamais remis en jeu. Bilan = coffre total + capital en jeu − total des mises de départ.
Ticket choisi : la plus grande chance de passer à cote ≥ 2 (à chance quasi égale, l'espérance départage), chez un seul bookmaker,
matchs des 3 prochains jours, sélections à 40 % ou plus (nul seulement à 35 % ou plus), 1 à 4 sélections ; réoptimisé jusqu'au premier coup d'envoi, puis figé.
Code : `updateClaudeSim` (src/autopilot.js), carte « Road to 1 M€ » (onglet Pronostics), ligne dans le résumé du jeudi.
