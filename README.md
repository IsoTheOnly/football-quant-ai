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
| `src/runner.js` | Exécuteur Node de la tâche planifiée (`plan` / `apply`) |
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

La page produite est identique à la version publiée le 16/10/2026.

## Exécuteur Node (tâche planifiée)

`src/runner.js` charge les modules `fq-*.js` depuis son dossier de travail :

```bash
mkdir -p run && for m in engine standings core autopilot etl2 train2; do cp src/$m.js run/fq-$m.js; done
node src/runner.js plan  run           # -> run/fetch_plan.json
node src/runner.js apply run [--train] # -> run/out/plan.json
```

## Sources de données

- ESPN (résultats, calendriers, cotes)
- football-data.co.uk
- openfootball (CC0)
