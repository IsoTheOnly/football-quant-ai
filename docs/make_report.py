#!/usr/bin/env python3
"""Génère docs/Football_Quant_AI_rapport.pdf à partir des résultats d'entraînement (data/trained.json).

Usage : python3 docs/make_report.py
"""
import json
import pathlib

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle)

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "Football_Quant_AI_rapport.pdf"
FIG = ROOT / "docs" / "fig"
FIG.mkdir(parents=True, exist_ok=True)
T = json.loads((ROOT / "data" / "trained.json").read_text(encoding="utf-8"))

FD = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("DV", FD + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DVB", FD + "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DVI", FD + "DejaVuSans-Oblique.ttf"))
pdfmetrics.registerFontFamily("DV", normal="DV", bold="DVB", italic="DVI", boldItalic="DVB")

INK = colors.HexColor("#14211f")
MUTED = colors.HexColor("#5b6b67")
ACCENT = colors.HexColor("#b07a12")
LINE = colors.HexColor("#d6dedb")
SOFT = colors.HexColor("#f2f5f4")
NEG = colors.HexColor("#b4473b")
POS = colors.HexColor("#2f7d58")

st = {
    "title": ParagraphStyle("title", fontName="DVB", fontSize=24, leading=29, textColor=INK, spaceAfter=6),
    "subtitle": ParagraphStyle("subtitle", fontName="DV", fontSize=11.5, leading=16, textColor=MUTED, spaceAfter=14),
    "h1": ParagraphStyle("h1", fontName="DVB", fontSize=15.5, leading=20, textColor=INK, spaceBefore=12, spaceAfter=6),
    "h2": ParagraphStyle("h2", fontName="DVB", fontSize=11.5, leading=15, textColor=ACCENT, spaceBefore=8, spaceAfter=3),
    "p": ParagraphStyle("p", fontName="DV", fontSize=9.6, leading=14, textColor=INK, spaceAfter=5, alignment=TA_LEFT),
    "small": ParagraphStyle("small", fontName="DV", fontSize=8.2, leading=11, textColor=MUTED, spaceAfter=4),
    "cell": ParagraphStyle("cell", fontName="DV", fontSize=8.4, leading=10.8, textColor=INK),
    "cellb": ParagraphStyle("cellb", fontName="DVB", fontSize=8.4, leading=10.8, textColor=INK),
    "box": ParagraphStyle("box", fontName="DV", fontSize=9.6, leading=14, textColor=INK),
}


def P(t, s="p"):
    return Paragraph(t, st[s])


def bullets(items):
    return [Paragraph(f"• {x}", ParagraphStyle("b", parent=st["p"], leftIndent=10, firstLineIndent=-8)) for x in items]


def table(rows, widths, header=True, zebra=True):
    data = [[Paragraph(str(c), st["cellb"] if (header and i == 0) else st["cell"]) for c in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    style = [("GRID", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
             ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]
    if header:
        style.append(("BACKGROUND", (0, 0), (-1, 0), SOFT))
    if zebra:
        for i in range(2, len(rows), 2):
            style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#fafbfb")))
    t.setStyle(TableStyle(style))
    return t


def box(text, tone=ACCENT):
    t = Table([[Paragraph(text, st["box"])]], colWidths=[170 * mm])
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.8, tone), ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fbf8f1")),
                           ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    return t


fr = lambda x, d=2: (f"{x:,.{d}f}".replace(",", " ").replace(".", ",")) if isinstance(x, (int, float)) else "—"
pc = lambda x, d=0: (fr(100 * x, d) + " %") if isinstance(x, (int, float)) else "—"

COMP = {"PL": "Premier League", "PD": "La Liga", "FL1": "Ligue 1", "SA": "Serie A", "BL1": "Bundesliga", "DED": "Eredivisie", "ELC": "Championship",
        "BSA": "Brasileirão", "J1": "J1 League", "SSL": "Super League (Suisse)", "SPL": "Saudi Pro League", "CL": "Ligue des champions"}
ARM = {"fav45": "Favoris ≥ 45 %", "fav55": "Favoris ≥ 55 %", "fav65": "Favoris ≥ 65 %", "chance_v": "1N2 chance max, sans nul", "chance": "1N2 chance max",
       "securise": "Combiné sécurisé (≥ 70 %)", "multi": "Multi-marchés (≥ 50 %)", "valeur": "Valeur (espérance > 0)"}

# ------------------------------------------------------------------ figures
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 9, "axes.spines.top": False, "axes.spines.right": False})
C_MODEL, C_MKT, C_BASE, C_ACC = "#8a9b96", "#2f6f8f", "#d6c9a8", "#b07a12"

# 1. log loss par compétition
lg = [(c, v) for c, v in T["leagues"].items() if v["test"].get("n", 0) >= 30 and v["test"].get("market")]
fig, ax = plt.subplots(figsize=(7.2, 3.0), dpi=200)
x = range(len(lg)); w = 0.27
ax.bar([i - w for i in x], [v["test"]["base"] for _, v in lg], w, label="Référence naïve (fréquences)", color=C_BASE)
ax.bar(list(x), [v["test"]["market"]["llModel"] for _, v in lg], w, label="Notre modèle final", color=C_ACC)
ax.bar([i + w for i in x], [v["test"]["market"]["ll"] for _, v in lg], w, label="Marché (cotes, marge retirée)", color=C_MKT)
ax.set_xticks(list(x)); ax.set_xticklabels([c for c, _ in lg]); ax.set_ylim(0.85, 1.17); ax.set_ylabel("Log loss 1N2 (plus bas = mieux)")
ax.legend(frameon=False, fontsize=7.5, ncol=3, loc="upper center", bbox_to_anchor=(0.5, 1.15)); fig.tight_layout(); fig.savefig(FIG / "logloss.png"); plt.close(fig)

# 2. réussite des tickets vs cote, meilleure stratégie par niveau (46 semaines)
levels = []
for sc in T["tickets"]["scenarios"]:
    # stratégie de départ (choisie sur le passé seulement) : passé + test final
    k = sc["start"]; v = sc["arms"][k]
    n = v["train"]["n"] + v["test"]["n"]
    won = v["train"]["won"] + v["test"]["won"]; exp = v["train"]["expected"] + v["test"]["expected"]
    odds = ((v["train"]["avgOdds"] or 0) * v["train"]["n"] + (v["test"]["avgOdds"] or 0) * v["test"]["n"]) / n
    prof = v["train"]["profit"] + v["test"]["profit"]
    levels.append({"sc": sc["label"], "arm": k, "n": n, "won": won, "exp": exp, "odds": odds, "roi": prof / n, "legs": v["train"]["avgLegs"], "past": v["train"], "test": v["test"], "bandit": sc["bandit"]})
fig, ax = plt.subplots(figsize=(7.2, 3.0), dpi=200)
xs = [l["odds"] for l in levels]
ax.scatter(xs, [l["won"] / l["n"] for l in levels], s=60, color=C_ACC, zorder=3, label="Taux de réussite observé (stratégie de départ)")
ax.scatter(xs, [l["exp"] / l["n"] for l in levels], s=30, marker="x", color=C_MKT, zorder=3, label="Taux annoncé par nos probabilités")
import numpy as np
g = np.linspace(1.3, 60, 300); ax.plot(g, 1 / g, color=C_MODEL, lw=1, label="1 / cote (équilibre sans marge)")
for l in levels:
    ax.annotate(l["sc"], (l["odds"], l["won"] / l["n"]), textcoords="offset points", xytext=(6, 4), fontsize=8)
ax.set_xscale("log"); ax.set_xticks([1.5, 2, 3, 5, 8, 15, 40, 60]); ax.xaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: f"{v:g}".replace(".", ","))); ax.xaxis.set_minor_formatter(matplotlib.ticker.NullFormatter()); ax.set_xlabel("Cote totale moyenne du ticket (échelle log)"); ax.set_ylabel("Part de tickets gagnés")
ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0)); ax.legend(frameon=False, fontsize=7.5); fig.tight_layout(); fig.savefig(FIG / "tickets.png"); plt.close(fig)

# 3. espérance d'un combiné selon le nombre de sélections (marge FR mesurée)
fig, ax = plt.subplots(figsize=(7.2, 2.6), dpi=200)
n = np.arange(1, 16)
for edge, lab, col in [(-0.087, "Meilleur prix FR (médiane −8,7 % par sélection)", NEG.hexval().replace("0x", "#")), (-0.115, "Prix FR moyen (marge ≈ 11,5 %)", C_MODEL), (-0.06, "Bet 365 (marge ≈ 6 %)", C_MKT)]:
    ax.plot(n, (1 + edge) ** n - 1, marker="o", ms=3, lw=1.4, label=lab, color=col)
ax.axhline(0, color="#999", lw=0.8)
ax.set_xlabel("Nombre de sélections du combiné"); ax.set_ylabel("Espérance du ticket")
ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0)); ax.legend(frameon=False, fontsize=7.5); fig.tight_layout(); fig.savefig(FIG / "marge.png"); plt.close(fig)

# ------------------------------------------------------------------ contenu
S = T["summary"]; B = T["blend"]; BG = T["blendGoals"]; PK = T["picks"]; POL = T["policy"]
story = []
story += [P("Football Quant AI", "title"),
          P("Rapport de projet · état au 16 octobre 2026 · rédigé pour une lecture sans connaissance préalable du sujet", "subtitle")]
story.append(box(
    "<b>En une phrase.</b> Football Quant AI est un outil personnel qui estime les probabilités des matchs de 13 compétitions de football, "
    "les compare aux cotes réelles des bookmakers français et construit chaque semaine des combinés suivis en « paper betting » (mises fictives). "
    "<br/><br/><b>Verdict actuel.</b> Le système prédit correctement, mais il ne fait pas mieux que les bookmakers. Sur les "
    f"{T['summary0']['testN']} matchs cotés du test final (jamais utilisés pour régler quoi que ce soit), sa log loss (mesure d'erreur, plus bas = mieux) est de {fr(T['summary0']['testLLFinal'],4)} contre {fr(T['summary0']['testMarketLL'],4)} pour les cotes du marché : "
    f"écart {fr(T['summary0']['diffFinalVsMarket']['mean'],4)}, intervalle de confiance à 95 % de {fr(T['summary0']['diffFinalVsMarket']['ci'][0],4)} à {fr(T['summary0']['diffFinalVsMarket']['ci'][1],4)}. "
    "Il n'a donc pas d'avantage démontré. Comme les bookmakers français prennent une marge de 10 à 13 % sur chaque pari, toute stratégie sans avantage perd de l'argent sur la durée, "
    "et d'autant plus vite que les combinés sont longs. Le projet en est au stade d'un <b>outil d'aide à la décision honnête et mesuré</b>, pas d'une machine à gagner."))
story.append(Spacer(1, 8))

story.append(P("1. Objectifs", "h1"))
story += bullets([
    "Pronostiquer tous les matchs des 14 prochains jours de 13 compétitions (Premier League, Liga, Ligue 1, Serie A, Bundesliga, Eredivisie, Championship, Brasileirão, J1 League, Super League suisse, Saudi Pro League, Ligue des champions, Coupe du monde).",
    "Donner un choix par match, justifié, et des combinés hebdomadaires à plusieurs niveaux de risque (cote ≈ 1,5 · 3–4 · 7–8 · 40–60).",
    "Utiliser des cotes réelles, au plus près de ce qu'un parieur peut obtenir en France, et ne jamais inventer de cote.",
    "Tourner sans intervention : mise à jour automatique deux fois par jour, notification hebdomadaire.",
    "S'améliorer en continu : apprendre des résultats réels, auditer chaque semaine, ne garder que ce qui améliore la prédiction mesurée.",
    "Viser à la fois une forte probabilité de gain et une espérance positive. La partie 7 explique pourquoi les deux ne vont ensemble qu'en présence d'un avantage réel."])

story.append(P("2. Les notions indispensables", "h1"))
story.append(table([
    ["Notion", "Définition", "Exemple"],
    ["Cote décimale", "Ce que rapporte 1 € misé s'il gagne (mise comprise).", "Cote 2,00 : 1 € misé rapporte 2 €, soit 1 € de gain net."],
    ["Probabilité implicite", "1 / cote : la chance que la cote « suppose ».", "Cote 2,00 → 50 %."],
    ["Marge du bookmaker", "Somme des probabilités implicites d'un match moins 100 %. C'est la commission du bookmaker.", "1 / N / 2 à 2,05 / 3,30 / 3,45 → 48,8 + 30,3 + 29,0 = 108,1 % : marge 8,1 %."],
    ["Cote juste", "1 / probabilité estimée : la cote à laquelle un pari est neutre.", "Proba estimée 55 % → cote juste 1,82."],
    ["Espérance (EV)", "Gain moyen par euro misé : probabilité × cote − 1.", "55 % × 2,00 − 1 = +10 % ; 55 % × 1,70 − 1 = −6,5 %."],
    ["Combiné", "Plusieurs sélections sur un ticket : il faut toutes les gagner ; les cotes se multiplient, les marges aussi.", "3 sélections à 1,50 → cote 3,375."],
    ["Log loss", "Pénalité moyenne d'une prévision probabiliste (forte si l'on était sûr et que l'on se trompe). Plus bas = mieux.", "Prévoir 1/3-1/3-1/3 donne 1,099."],
    ["CLV", "Écart entre la cote prise et la cote juste avant le coup d'envoi (clôture). Battre la clôture régulièrement est le meilleur signe d'un avantage réel.", "Pris à 2,10, clôture à 1,95 : bon signe."],
], [32 * mm, 74 * mm, 64 * mm]))

story.append(P("3. Données", "h1"))
story.append(table([
    ["Source", "Contenu", "Usage"],
    ["ESPN (API publique)", "Calendriers, résultats, buteurs avec minute, cotes Bet 365 d'avant-match", "Base des matchs, règlement des paris, buteurs"],
    ["football-data.co.uk", "Résultats et cotes historiques (Bet 365, moyenne du marché, Pinnacle jusqu'en janvier 2026, clôture, ±2,5 buts)", "Entraînement, tests, cotes de clôture"],
    ["The Odds API (offre gratuite, 500 crédits/mois)", "Cotes 1N2 de Winamax, Betclic, Unibet, PMU, NetBet ; « les deux équipes marquent » et ±2,5 chez NetBet et PMU", "Cotes réellement jouables en France"],
    ["openfootball (domaine public)", "Calendrier de la Super League suisse", "Complément du calendrier"],
    ["Saisie manuelle", "Cotes vues par l'utilisateur (dont cotes boostées), tickets réellement joués", "Marchés sans cote publique, apprentissage"],
], [42 * mm, 74 * mm, 54 * mm]))
story.append(P(f"Volume : {S['learnPredictions']} matchs d'apprentissage (juillet 2025 → février 2026), {S['valPredictions']} de validation (mars → juin 2026) et {S['testPredictions']} de test final (juillet → mi-octobre 2026), sur 12 compétitions. "
               "Les cotes françaises historiques n'existent pas en libre accès : l'historique est rejoué avec les cotes Bet 365 abaissées du rapport mesuré entre les prix français et Bet 365 "
               f"({fr(T['tickets']['frFactor']['factor'],3)} sur {T['tickets']['frFactor']['n']} matchs comparables).", "small"))

story.append(P("4. Comment le modèle estime une probabilité", "h1"))
story.append(P("Le calcul se fait en quatre étages. Chacun n'est conservé que s'il améliore la prédiction sur la période de validation, des matchs que l'apprentissage n'a pas vus."))
story.append(P("Étage 1 · Modèle de buts (Poisson / Dixon-Coles)", "h2"))
story.append(P("Chaque équipe reçoit une force d'attaque et de défense, plus un avantage du terrain par compétition. Elles sont estimées sur les matchs passés, les plus récents pesant davantage (demi-vie de 120 à 400 jours). "
               "Le rétrécissement ramène les équipes peu observées vers la moyenne, avec un a priori pour les promus. On en déduit le nombre de buts attendus de chaque équipe, puis la probabilité de chaque score : "
               "victoire, nul, défaite, les deux équipes marquent, plus/moins de 2,5 buts. La correction de Dixon-Coles ajuste les petits scores (0-0, 1-0, 1-1). Les hyperparamètres sont réglés par compétition sur 12 configurations testées."))
story.append(P("Étage 2 · Calibration", "h2"))
C1 = T["calibration"]
story.append(P(f"Une température (1N2) et une correction de Platt (BTTS) recalent les probabilités : quand le modèle annonce 60 %, l'événement doit arriver environ 6 fois sur 10. "
               f"Sur la validation, la température 1N2 apprise ({fr(C1['detail1N2']['Ttrain'],2)}) {'améliorait' if C1['detail1N2']['accepted'] else 'n’améliorait pas'} la prédiction : {'gardée' if C1['detail1N2']['accepted'] else 'elle est donc laissée à 1 (pas de correction)'}. "
               f"La correction BTTS est {'gardée' if C1['bttsAB'] else 'rejetée'}."))
story.append(P("Étage 3 · Mélange avec le marché", "h2"))
DV = B["devigDetail"]
story.append(P(f"Les cotes sont converties en probabilités en retirant la marge. Deux méthodes : à parts égales, ou « puissance », qui retire davantage de marge sur les outsiders (biais favori-outsider). "
               f"La puissance était meilleure sur l'apprentissage ({fr(DV['trainPower'],4)} contre {fr(DV['trainNorm'],4)}) mais pas sur la validation ({fr(DV['valPower'],4)} contre {fr(DV['valNorm'],4)}) : la règle retient donc « {'puissance' if B['devig'] == 'power' else 'parts égales'} ». "
               f"Sur le test final, la puissance aurait été un peu meilleure ({fr(DV['testPower'],4)} contre {fr(DV['testNorm'],4)}) ; la règle n'en tient volontairement pas compte, sinon le test ne serait plus un test. "
               f"Le poids du modèle dans le mélange est appris : {int(100*B['w'])} % en général, {', '.join(f'{int(100*w)} % en {COMP[c]}' for c, w in B['byComp'].items())}, car c'est là seulement que la validation l'a justifié. "
               f"Pour les buts (±2,5), le marché seul est meilleur que le modèle ({fr(BG['testMarketLL'],4)} contre {fr(BG['testModelLL'],4)}) : poids 0 %."))
story.append(P("Étage 4 · Fiabilité et joueurs", "h2"))
story.append(P("Un score de fiabilité (0–100) tient compte du nombre de matchs observés, des résultats manquants et de la fraîcheur des données. Il exclut les matchs douteux des tickets. "
               "Les probabilités de buteur et de joueur décisif viennent de la part de buts de chaque joueur appliquée aux buts attendus de son équipe."))

story.append(P("5. Protocole de validation (sans tricher)", "h1"))
story += bullets([
    "Validation chronologique : pour prédire un match, le modèle n'utilise que les matchs joués avant. Aucune information du futur.",
    "Trois périodes. Apprentissage (1er juillet 2025 → 28 février 2026) : le modèle ajuste ses paramètres. Validation (1er mars → 30 juin 2026) : elle décide si un réglage est gardé. Test final (1er juillet → 15 octobre 2026) : il est seulement mesuré et ne sert à aucun choix.",
    "Ce test final a été consulté pendant le développement : il est figé au 16 octobre 2026 comme référence historique (fichier data/reference_test_2026-10-16.json) et ne sera plus jamais utilisé pour choisir. La mesure indépendante, désormais, c'est le journal des prévisions réellement émises (partie 7.5).",
    "Un réglage gardé est réajusté sur apprentissage + validation avant d'être mesuré sur le test.",
    "Intervalles de confiance à 95 % : Wilson pour les taux de réussite, bootstrap pour les rendements et les écarts de log loss. Avec 8 semaines de test, la plupart des intervalles sont très larges : aucune conclusion de rentabilité n'est possible.",
    "Comparaisons systématiques avec deux références : les fréquences naïves (domicile/nul/extérieur) et les cotes du marché.",
    "Tickets rejoués semaine par semaine (jeudi → dimanche), comme en direct, avec les cotes d'avant-match.",
    "Réentraînement complet chaque semaine sur les nouvelles données, par la tâche planifiée."])

story.append(PageBreak())
story.append(P("6. Fonctionnement au quotidien", "h1"))
story.append(table([
    ["Étape", "Ce qui se passe"],
    ["Deux fois par jour (6 h 54 et 18 h 54)", "Une tâche planifiée récupère le code sur GitHub, télécharge ESPN, football-data et The Odds API (dans la limite des crédits du mois), intègre les résultats, recalcule les pronostics et les tickets, règle les paris terminés, mesure la CLV et écrit le tout dans la base de la page."],
    ["Choix par match", "Pour chaque match des 14 jours : l'issue retenue (pari à espérance positive s'il en existe, sinon l'issue la plus probable), sa probabilité, la cote disponible et sa source, la justification. Le tableau « Cotes et seuils » donne, pour chaque sélection (1N2, double chance, BTTS, ±2,5, buteurs, joueur décisif), la cote juste, la cote minimale intéressante (espérance ≥ 3 %) et un champ pour saisir la cote vue, même boostée."],
    ["Tickets hebdomadaires", "Quatre niveaux : Sûr (1,4–1,8), Prudent (3–4), Équilibré (7–8), Audacieux (40–60). Huit stratégies proposent chacune leur meilleur ticket (voir partie 6 bis) ; le ticket joué (fictivement, 1 unité) est celui de la stratégie à la meilleure chance corrigée par son historique. Chaque ticket est chiffré chez le bookmaker français qui le paie le mieux, avec la comparaison par nombre de sélections, les autres stratégies, son espérance et la cote totale à partir de laquelle il deviendrait rentable."],
    ["Mes tickets (tests et réels)", "Bouton « Mon ticket » : recherche du match, marché (1N2, double chance, gagne ou 2 buts d'avance, BTTS, buts, buteur, autre), cote obtenue, mise, et le type : test (simulation, par défaut) ou joué pour de vrai. Les deux sont réglés et audités ; seuls les paris réels entrent dans le bilan en euros. Les cotes saisies servent aussi à corriger les estimations."],
    ["Contrôle de couverture", "À chaque cycle, par compétition : matchs à venir sur 14 jours, analysés, avec cote ; résultats manquants, reports, doublons. Les anomalies sont listées dans Automatique › Détails."],
    ["Chaque jeudi 19 h 12", "Notification avec les tickets de la semaine."],
    ["Chaque lundi", "Audit de la semaine écoulée : tickets joués et fantômes, réussite observée contre attendue, log loss face au marché, CLV. Mise à jour du choix de stratégie."],
], [42 * mm, 128 * mm]))
story.append(Spacer(1, 4))
TK = T["tickets"]; CD = TK["choiceDetail"]
story.append(P("6 bis. Construire un ticket : chance et profit ensemble", "h1"))
story.append(P("Pour une cote totale C donnée, la chance qu'un combiné passe vaut le produit des « rendements » de ses sélections (chance × cote ; 1 = prix juste) divisé par C, et son espérance vaut ce même produit moins 1. "
               "Chance et profit montent donc ensemble : il faut les sélections où le bookmaker prélève le moins, et le moins de sélections possible, car chacune ajoute sa marge. "
               "Le constructeur compare, pour chaque ticket, le meilleur ticket possible avec 1, 2, 3… jusqu'à 15 sélections (affiché sous forme de barres), garde la meilleure chance et, à 10 % près, le meilleur rendement."))
story += bullets([
    f"Prudence : quand notre modèle et le marché ne sont pas d'accord sur une sélection, sa chance est diminuée de κ × l'écart pour construire le ticket. κ = {fr(TK['kappa'],1)} a été choisi sur le passé (rendement réalisé des sélections). "
    f"Sur le test final, mesuré après coup, les stratégies ont gagné {next(x['testWon'] for x in TK['kappaGrid'] if x['kappa'] == TK['kappa'])} tickets sur {next(x['testN'] for x in TK['kappaGrid'] if x['kappa'] == TK['kappa'])} avec cette prudence, contre {next(x['testWon'] for x in TK['kappaGrid'] if x['kappa'] == 0)} sur {next(x['testN'] for x in TK['kappaGrid'] if x['kappa'] == 0)} sans.",
    "Chaque stratégie (favoris à 45, 55 ou 65 %, chance maximale avec ou sans nul, sécurisé multi-marchés, multi-marchés, valeur) propose son ticket, suivi chaque semaine en « fantôme ».",
    "Correction apprise : pour chaque stratégie, tickets gagnés ÷ tickets annoncés (semaines rejouées comptées à moitié, semaines réelles en entier), rétréci vers 1 tant que l'historique est court. Les tickets de favoris passent par exemple plus souvent qu'annoncé (biais favori-outsider).",
    f"Choix de la stratégie jouée : la meilleure chance corrigée de la semaine. Rejouée semaine par semaine sans regarder l'avenir, cette règle a gagné {CD['corrected']['past']} tickets sur {CD['nPast']} sur le passé, contre {CD['hitrate']['past']} pour la règle « meilleur taux de réussite » : écart dans le bruit. "
    "Elle est retenue parce qu'elle suit la chance réelle du ticket de la semaine (l'autre règle pouvait jouer un ticket deux fois moins probable qu'une alternative).",
    "Chaque sélection est justifiée en clair : l'issue, la chance selon le marché et selon notre modèle, la marge prélevée comparée aux autres sélections de la semaine, le contexte (classement, forme, buts attendus)."])

story.append(P("7. Résultats actuels", "h1"))
story.append(P("7.1 Qualité des probabilités", "h2"))
story.append(Image(str(FIG / "logloss.png"), width=170 * mm, height=70.8 * mm))
story.append(P(f"Le modèle bat largement la référence naïve dans toutes les compétitions, mais il reste au niveau du marché, sans le dépasser. Sur l'ensemble du test : modèle seul {fr(S['testModelOnly']['market']['llModel'],4)}, "
               f"marché {fr(S['test']['market']['ll'],4)}, modèle final mêlé au marché {fr(S['test']['market']['llModel'],4)}. Le choix retenu pour chaque match est juste dans {pc(PK['test']['hitRate'],1)} des cas en test "
               f"({PK['test']['n']} matchs), mais ce taux reflète surtout des sélections courtes (« les deux équipes marquent : oui », favoris), pas un gain.", "small"))
h72 = P("7.2 Parier sur les écarts entre modèle et cotes", "h2")
rows = [["Seuil d'espérance", "Cote max.", "Paris (apprentissage)", "Rendement", "Paris (test)", "Rendement"]]
for m in POL["modelOnly"]:
    if m["maxOdds"] in (2.5, 1000):
        rows.append([pc(m["evMin"]), "aucune" if m["maxOdds"] == 1000 else fr(m["maxOdds"], 1), m["train"]["bets"], pc(m["train"]["roi"], 1), m["test"]["bets"], pc(m["test"]["roi"], 1)])
story.append(KeepTogether([h72, table(rows, [28 * mm, 22 * mm, 32 * mm, 26 * mm, 30 * mm, 32 * mm])]))
story.append(P("Quand le modèle seul juge une cote trop haute, parier dessus perd de l'argent dans toutes les configurations testées : ses « bonnes affaires » sont surtout ses erreurs. "
               "Les paris automatiques sont donc désactivés, et resteront suspendus tant qu'aucune politique n'est rentable sur l'apprentissage puis confirmée en test.", "small"))
h73 = P("7.3 Tickets combinés rejoués semaine par semaine", "h2")
ci = lambda c: f"{pc(c[0])}–{pc(c[1])}" if c else "—"
rows = [["Niveau", "Stratégie de départ (choisie sur le passé)", "Passé gagnés", "Test final gagnés (IC 95 %)", "Rendement test", "Choix semaine par semaine, test"]]
for l in levels:
    b = l["bandit"]
    rows.append([l["sc"], ARM.get(l["arm"], l["arm"]), f"{l['past']['won']}/{l['past']['n']}", f"{l['test']['won']}/{l['test']['n']} ({ci(l['test'].get('hitCI'))})", pc(l["test"]["roi"]), f"{b['won']}/{b['n']} ({ci(b.get('hitCI'))})"])
story.append(KeepTogether([h73, table(rows, [20 * mm, 44 * mm, 20 * mm, 32 * mm, 22 * mm, 32 * mm])]))
story.append(Spacer(1, 3))
story.append(Image(str(FIG / "tickets.png"), width=170 * mm, height=70.8 * mm))
story.append(P("La réussite d'un ticket est dictée par sa cote : elle suit de près 1/cote, un peu en dessous à cause de la marge. Un ticket qui gagne plus de 60 % du temps a forcément une cote d'environ 1,6 ou moins. "
               "Le niveau Sûr y parvient (65 à 80 % selon la stratégie). Les longs tickets de favoris pour une cote de 40 à 60 n'ont presque jamais gagné. "
               "Le test final ne compte que 8 semaines : les intervalles de confiance vont souvent de 0 à 40 %, et un ticket gagné de plus change le rendement de dizaines de points. Aucune conclusion de rentabilité n'est possible.", "small"))
story.append(KeepTogether([P("7.4 Ce que coûte la marge", "h2"), Image(str(FIG / "marge.png"), width=170 * mm, height=61.4 * mm)]))
story.append(P("Mesuré le 16/10/2026 sur 123 matchs : marge 1N2 de Winamax 12,9 %, Unibet 12,5 %, PMU 11,5 %, Betclic 11,3 %, NetBet 10,4 %, contre 6,3 % chez Bet 365. "
               "Même en prenant le meilleur prix des cinq bookmakers français, l'espérance médiane d'une sélection est de −8,7 %. Seules 3 sélections sur 369 étaient positives. Dans un combiné, ces pertes se multiplient.", "small"))
story.append(box("<b>Pourquoi on ne peut pas, aujourd'hui, avoir à la fois une forte chance de gain et une espérance positive.</b> "
                 "Pour un ticket de cote C, l'espérance vaut p × C − 1. Avec des probabilités égales à celles du marché, p ≈ (1/C) × (1 − marge), donc l'espérance ≈ −marge, quel que soit le choix des sélections. "
                 "Elle ne devient positive que si notre p est meilleur que celui du marché (un avantage d'information ou de modèle), ou si la cote est meilleure que la normale (cote boostée, promotion, meilleur prix). "
                 "La logique actuelle cherche donc ces deux sources et affiche, pour chaque ticket, la cote totale à partir de laquelle il deviendrait rentable.", NEG))

# --- 7.5 suivi prospectif, 7.6 drivers, 7.7 audit des tickets
story.append(P("7.5 Suivi prospectif : le journal des prévisions", "h2"))
story.append(P("Depuis le 16 octobre 2026, chaque prévision est enregistrée avant le match et n'est jamais réécrite : un instantané quand le match entre dans chaque horizon (10 à 14 jours, 5 à 10, 2 à 5, 12 h à 2 jours, moins de 12 h), plus la dernière prévision émise avant le coup d'envoi. "
               "Chaque ligne garde le match, l'heure d'émission, la version du modèle, les probabilités du modèle sportif seul, du marché sans marge et retenues, le poids du modèle, le choix, la cote et sa source, la fiabilité et l'inclusion dans un ticket (niveau, pari réel ou test). "
               "La page compare, par horizon, la log loss retenue, celle du modèle seul et celle du marché sur les mêmes matchs, avec un intervalle de confiance, et par version du modèle. Les premiers résultats arrivent avec les matchs du week-end ; il faudra plusieurs centaines de matchs pour conclure quoi que ce soit."))
DIS = T["summary0"].get("disagree")
if DIS:
    rows = [["Quand le modèle seul s'écarte du marché de 8 points ou plus", "Issues", "Modèle disait", "Marché disait", "Arrivé"]]
    for lab, per in (("passé", "past"), ("test final", "test")):
        for k, l in (("up", "plus optimiste"), ("down", "moins optimiste")):
            x = DIS[per][k]; rows.append([f"Modèle {l} · {lab}", x["n"], pc(x["mo"], 1), pc(x["mk"], 1), pc(x["y"], 1)])
    story.append(KeepTogether([P("Qui avait raison quand modèle et marché divergent", "h2"), table(rows, [70 * mm, 20 * mm, 26 * mm, 26 * mm, 28 * mm]),
        P("Quand ils divergent, c'est presque toujours le marché qui avait raison a posteriori : la prudence appliquée aux tickets est justifiée par les faits, pas par principe. Ce tableau est recalculé en direct sur la page à partir du journal.", "small")]))
story.append(P("7.6 Drivers testés", "h2"))
story.append(P("Un driver n'est gardé que s'il améliore la validation, construit uniquement avec l'information disponible avant le match. Premier test : repos et congestion du calendrier, calculés à partir de nos propres calendriers (aucune source extérieure)."))
story.append(table([
    ["Driver (construction)", "Appris sur l'apprentissage", "Effet sur la validation (log loss, IC 95 %)", "Décision"],
    ["Jours de repos (écart domicile − extérieur, borné 2–8 j)", "β = 0 sur le modèle ; −0,01 sur le marché", "−0,0002 (−0,0006 à +0,0005)", "Rejeté : rien de démontré"],
    ["Repos court (3 jours ou moins)", "β = 0 sur le modèle ; −0,03 sur le marché", "−0,0003 (−0,0006 à 0,0000)", "Rejeté : intervalle qui touche zéro"],
    ["Congestion (matchs joués sur 21 jours)", "β = 0", "0", "Rejeté"],
], [56 * mm, 40 * mm, 46 * mm, 28 * mm]))
story.append(P("Limite : nos calendriers ne contiennent pas les coupes nationales ni la Ligue Europa et la Conférence, donc le repos est mal mesuré pour les équipes engagées partout. Le script est dans tools/driver_repos.js.", "small"))
story.append(table([
    ["Source gratuite", "Contenu utile", "Conditions", "Statut"],
    ["API-Football (offre gratuite)", "Blessures, compositions, statistiques joueurs", "100 requêtes par jour, compte et clé nécessaires ; saisons accessibles à vérifier", "À tester si tu crées un compte (clé gardée hors du dépôt)"],
    ["ClubElo (api.clubelo.com)", "Classement Elo quotidien des clubs européens", "Gratuit, fichiers CSV ; domaine à autoriser", "Candidat : risque de double emploi avec nos forces d'équipe, à valider"],
    ["Understat", "xG des 6 grands championnats", "Pas d'API officielle : il faudrait aspirer le site, conditions d'utilisation non claires", "Écarté (règle : aucun contournement)"],
    ["StatsBomb Open Data", "Événements détaillés", "Gratuit, mais compétitions passées choisies seulement", "Inutile pour les matchs à venir"],
], [36 * mm, 42 * mm, 56 * mm, 36 * mm]))
story.append(P("7.7 Audit des tickets et de leurs dépendances", "h2"))
rows = [["Niveau", "Stratégie de départ", "Tickets gagnés / annoncés", "Sélections gagnées / annoncées", "Aux cotes Bet 365 brutes (passé · test)"]]
for sc in T["tickets"]["scenarios"]:
    a = sc["arms"][sc["start"]]; tr, te = a["train"], a["test"]
    rows.append([sc["label"], ARM.get(sc["start"], sc["start"]), f"{tr['won'] + te['won']} / {fr(tr['expected'] + te['expected'], 1)}", f"{tr['legs']['won'] + te['legs']['won']} / {fr(tr['legs']['expected'] + te['legs']['expected'], 0)}",
                 f"{sc['rawOdds']['train']['won']}/{sc['rawOdds']['train']['n']} · {sc['rawOdds']['test']['won']}/{sc['rawOdds']['test']['n']}"])
story.append(table(rows, [22 * mm, 40 * mm, 34 * mm, 36 * mm, 38 * mm]))
story += bullets([
    "Corrélations : un ticket ne contient jamais deux sélections du même match, donc aucune corrélation interne au match. Entre matchs différents, l'indépendance est supposée ; on la vérifie en comparant tickets gagnés et tickets annoncés : un écart durable signalerait des chances surestimées.",
    "Les sélections gagnent à peu près aussi souvent qu'annoncé (colonne 4) : les probabilités ne sont pas gonflées. Les tickets de favoris gagnent un peu plus souvent qu'annoncé (biais favori-outsider), ce que la correction apprise par stratégie prend en compte.",
    "Provenance des cotes : historique = cotes Bet 365 réellement observées ramenées au niveau français (approximation × " + fr(T["tickets"]["frFactor"]["factor"], 3) + ") ; dernière colonne = même calcul sans approximation. En direct : cotes françaises collectées, double chance estimée (marquée *), cotes saisies (marquées). Aucun rendement présenté comme réel ne repose sur une cote théorique.",
    "Ticket non admissible : si le meilleur ticket d'un niveau a une espérance sous −20 % (réglable), aucun ticket n'est affiché cette semaine-là, plutôt qu'un ticket forcé ; la stratégie reste suivie en fantôme."])

story.append(PageBreak())
story.append(P("8. Hypothèses", "h1"))
story += bullets([
    "Les buts suivent une loi de Poisson corrigée (Dixon-Coles) ; les matchs d'un même ticket sont indépendants.",
    "Les forces des équipes évoluent lentement (pondération temporelle) ; les promus démarrent sous la moyenne.",
    "Les cotes Bet 365 abaissées du rapport mesuré (× 0,962) représentent bien les prix français passés.",
    "La double chance est estimée à partir du 1N2 du même bookmaker (1 / (1/c₁ + 1/c₂)) faute de source ; l'estimation est corrigée dès que des cotes réelles sont saisies.",
    "Le Multiboost Betclic suit un barème relevé sur quelques tickets réels (8 sélections → +4,7 %, 13 → +7,7 %) ; il est désactivé par défaut.",
    "Un pari se règle au temps réglementaire ; un ticket se joue chez un seul bookmaker."])

story.append(P("9. Limites identifiées", "h1"))
story += bullets([
    "Pas d'avantage démontré : le modèle n'utilise que les résultats et les buts. Il ignore compositions, blessures, suspensions, motivation, météo, calendrier européen et transferts, que le marché intègre.",
    "Petits échantillons : 46 semaines de tickets, c'est peu. Un ou deux tickets gagnés de plus changent le rendement de dizaines de points. Plusieurs écarts entre « annoncé » et « observé » relèvent du hasard.",
    "Pinnacle (la référence la plus précise) n'est plus publié gratuitement depuis janvier 2026, et la référence actuelle (Bet 365, moyenne du marché) est moins précise.",
    "Crédits limités (500/mois) : les cotes « deux équipes marquent » et ±2,5 ne sont relevées que pour quelques matchs par passage ; aucune cote buteur française n'est accessible.",
    "Cotes historiques françaises inexistantes : les rejeux utilisent une approximation.",
    "Saudi Pro League et Ligue des champions : pas de cotes historiques, donc pas de test de rentabilité possible.",
    "Le rendement des paris sportifs est très variable : même une stratégie à espérance positive peut perdre pendant des mois."])

story.append(P("10. Pistes d'amélioration, par ordre d'impact attendu", "h1"))
story.append(table([
    ["Piste", "Pourquoi", "Coût / effort"],
    ["Chasser les cotes boostées et promotions", "Seule source d'espérance positive accessible sans avantage de modèle. Saisir la cote boostée dans le tableau « Cotes et seuils » donne immédiatement l'espérance.", "Faible : la saisie est en place"],
    ["Paris simples ou combinés courts plutôt que longs", "La marge se multiplie à chaque sélection : 3 sélections ≈ −24 %, 13 ≈ −69 % au prix français médian.", "Nul"],
    ["Référence « sharp » (Pinnacle, Betfair)", "Comparer le meilleur prix français à la cote juste Pinnacle identifie les vraies anomalies de prix. C'est la méthode de value betting la plus éprouvée.", "Payant (≈ 30 $/mois) : exclu tant que le budget est de 0 €"],
    ["Ajouter l'information que le marché intègre", "Compositions probables, absences, xG, repos et rotations : sources gratuites et légales à trouver ; chaque ajout n'est gardé que s'il améliore la validation.", "Élevé"],
    ["Suivre la CLV de chaque choix", "Indicateur d'avantage bien plus rapide que le rendement : plusieurs centaines de paris suffisent.", "En place, à observer"],
    ["Allonger l'historique", "Plus de saisons pour l'entraînement et les rejeux : des estimations plus stables.", "Moyen"],
    ["Discipline de mise", "Mises fixes ou Kelly fractionné ; jamais de mise pour se refaire.", "Nul"],
], [48 * mm, 82 * mm, 40 * mm]))

story.append(P("11. Revue externe (deuxième audit) : état de chaque recommandation", "h1"))
story.append(table([
    ["Recommandation", "État", "Ce qui a été fait / limite"],
    ["P1 · Sanctuariser la validation", "Opérationnel", "Test final figé au 16/10/2026 (référence) ; registre prospectif des prévisions réellement émises, évalué par horizon et par version avec IC. Fuites vérifiées dans le code : modèle, classements, buteurs et forme n'utilisent que les matchs antérieurs. Réserve : au Brésil, au Japon et en Suisse, l'historique ne fournit que la cote de clôture, connue au coup d'envoi seulement."],
    ["P2 · Historiser toutes les prévisions", "Opérationnel", "Un instantané par horizon (J-14, J-7, J-3, J-1, J-0) et un au coup d'envoi, jamais réécrits. Les versions intermédiaires entre deux horizons ne sont pas gardées (volume)."],
    ["P3 · Drivers gratuits", "Partiel", "Repos et congestion testés et rejetés (rien de démontré). Blessures et compositions : API-Football gratuite à tester (compte requis). xG : pas de source gratuite sans aspiration de site."],
    ["P4 · Indépendance face aux bookmakers", "Opérationnel", "Chaque pronostic affiche modèle seul, marché, retenue, poids appliqué, écart et origine du choix ; une probabilité tirée du marché est dite comme telle."],
    ["P5 · Tickets et corrélations", "Opérationnel", "Une sélection par match ; annoncé contre observé ; comparaison par nombre de sélections ; politique de choix rejouée sans regarder l'avenir ; « aucun ticket admissible » sous un seuil d'espérance."],
    ["P6 · Cotes et rentabilité", "Opérationnel", "Provenance distinguée (collectée, historique Bet 365, reconstruite, estimée *, saisie) ; résultats refaits sans approximation."],
    ["P7 · Couverture des 14 jours", "Partiel", "État par compétition (couverte, partielle, trêve, inactive), sources, résultats manquants, reports, doublons. Les changements d'horaire ne sont pas encore historisés."],
    ["P8 · Automatisation", "À surveiller", "Deux passages par jour programmés ; la page signale désormais toute absence d'exécution réussie depuis plus de 14 h (une tâche programmée n'est pas une exécution réussie). Clé hors dépôt."],
    ["P9 · Interface", "Partiel", "Légende et lexique, tri et filtres, détails à la demande. La navigation reste en 4 onglets ; un regroupement plus épuré est possible."],
], [42 * mm, 24 * mm, 104 * mm]))
story.append(P("Ce qui reste incomplet", "h2"))
story += bullets([
    "Aucun avantage prédictif démontré face au marché, ni sur l'historique ni (pour l'instant) en prospectif.",
    "Blessures, compositions, xG et minutes des joueurs absents ; buteurs estimés à partir de la part de buts passée.",
    "Pas de cote française gratuite pour les buteurs ; double chance estimée à partir du 1N2.",
    "Historique de cotes françaises inexistant : rejeux par approximation (et refaits sans).",
    "Le suivi prospectif démarre : plusieurs mois seront nécessaires pour des conclusions solides."])
story.append(KeepTogether([P("Mini-guide", "h2")] + bullets([
    "Pronostics : un choix par match sur 14 jours. Trie et filtre (cote, probabilité, espérance, fiabilité) ; le bouton (i) montre d'où vient la probabilité et toutes les sélections du match, avec une case pour saisir la cote que tu vois.",
    "Tickets : quatre niveaux chaque semaine à partir du jeudi, avec la chance, l'espérance et le pourquoi. « Enregistrer ce ticket » le range dans « Mes tickets », en test ou en réel.",
    "Performance : suivi prospectif, désaccords modèle / marché, stratégies de tickets, CLV, entraînement.",
    "Légende et lexique en bas de chaque page ; rien à faire au quotidien, tout se met à jour seul deux fois par jour."])))

story.append(P("12. Architecture technique", "h1"))
story.append(P("Le code est sur GitHub (dépôt privé IsoTheOnly/football-quant-ai). La page est un fichier HTML autonome (React), publiée comme artefact Claude ; sa base de données partagée stocke l'état. "
               "Un exécuteur Node (src/runner.js) fait tourner le même moteur que la page. 35 tests automatiques couvrent le moteur, les données, les cotes, les règlements, la CLV, un cycle complet et le rendu de la page. "
               "Fichiers principaux : src/engine.js (modèle), src/etl2.js (données), src/train2.js (entraînement), src/autopilot.js (pronostics, tickets, apprentissage), src/app.js (interface).", "small"))
story.append(Spacer(1, 6))
story.append(P("Avertissement : outil personnel d'aide à la décision. Aucune rentabilité n'est garantie ; ne pariez que ce que vous pouvez perdre. Aide : joueurs-info-service.fr — 09 74 75 13 13.", "small"))


def deco(c, d):
    c.saveState()
    c.setFont("DV", 7.5); c.setFillColor(MUTED)
    c.drawString(20 * mm, 10 * mm, "Football Quant AI · rapport de projet · 16/10/2026")
    c.drawRightString(190 * mm, 10 * mm, f"{d.page}")
    c.restoreState()


doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
                        title="Football Quant AI — rapport de projet", author="Iso (avec Claude)")
doc.build(story, onFirstPage=deco, onLaterPages=deco)
print(OUT)
