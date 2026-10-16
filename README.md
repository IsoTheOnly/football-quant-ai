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
| `src/demo.js` | Jeu de démonstration fictif (graine fixe) |
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
npm test      # moteur, ETL, cotes, règlements, CLV, cycle complet, rendu de la page
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

## Cotes

Une cote affichée ou jouée vient toujours d'un bookmaker, jamais d'un calcul :

1. bookmaker français de référence (Paramètres, Winamax par défaut) ;
2. sinon médiane des bookmakers français relevés pour le match ;
3. sinon Bet 365 (crédits The Odds API épuisés pour le mois, ou compétition non couverte).

Les crédits (500 par mois, offre gratuite) sont répartis sur le mois, davantage du jeudi au samedi pour les tickets. « Les deux équipes marquent » et les buteurs n'ont pas de cote française accessible : ils restent en pronostic, sans cote ni pari. Le « seuil 1/p » est la cote minimale à exiger selon le modèle, pas une cote de bookmaker.

## Cote de clôture (CLV)

Chaque choix, ticket fictif et pari réel est comparé à la cote de clôture : Pinnacle (football-data.co.uk), sinon le dernier relevé français avant le coup d'envoi (provisoire). Espérance à la clôture = cote prise × probabilité sans marge de la clôture − 1.

## Sources de données

- ESPN (résultats, calendriers, cotes Bet 365)
- football-data.co.uk (cotes de clôture)
- The Odds API (bookmakers français)
- openfootball (CC0, calendrier suisse)
