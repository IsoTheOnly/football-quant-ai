#!/usr/bin/env python3
"""ETL openfootball (CC0) -> dataset compact pour Football Quant AI.

Usage: python3 build_data.py <data_root> <out.json>
<data_root> contient les clones git : of (football.json), europe, world,
champions-league, worldcup.json.
Chaque match : [id, date, time, round, home, away, hg, ag, goals]
goals = [[side(0/1), name, minute, flag]] flag: "" | "p" | "og"  (ou null si inconnu)
"""
import json, re, subprocess, sys, os, datetime, unicodedata

ROOT = sys.argv[1]
OUT = sys.argv[2]

def git_info(repo):
    p = os.path.join(ROOT, repo)
    d = subprocess.check_output(["git", "-C", p, "log", "-1", "--format=%cI"]).decode().strip()
    h = subprocess.check_output(["git", "-C", p, "rev-parse", "--short", "HEAD"]).decode().strip()
    return {"repo": f"github.com/openfootball/{'football.json' if repo=='of' else repo}", "commit": h, "commitDate": d}

def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

# Harmonisation des noms (même club, libellés différents selon les fichiers source)
ALIASES = {
    "BSC Young Boys": "Young Boys", "FC Basel 1893": "FC Basel", "FC Lugano": "Lugano",
    "FC St. Gallen": "FC Sankt Gallen", "Grasshopper Club Zürich": "Grasshoppers",
}
def A(n):
    n = n.strip()
    return ALIASES.get(n, n)

def mid(comp, date, home, away):
    return f"{comp}-{date}-{slug(home)[:14]}-{slug(away)[:14]}"

def ft_of(m):
    s = m.get("score")
    if isinstance(s, dict):
        ft = s.get("ft")
        return ft if ft and len(ft) == 2 else None
    if isinstance(s, list) and len(s) == 2:
        return s
    return None

def norm_minute(x):
    return str(x).replace("'", "")

def json_goals(m):
    if "goals1" not in m and "goals2" not in m:
        return None
    out = []
    for side, k in ((0, "goals1"), (1, "goals2")):
        for g in m.get(k) or []:
            flag = "og" if g.get("owngoal") else ("p" if g.get("penalty") else "")
            out.append([side, g.get("name", "?"), norm_minute(g.get("minute", "")), flag])
    return out

def load_json(comp, path):
    d = json.load(open(os.path.join(ROOT, path)))
    res = []
    for m in d["matches"]:
        ft = ft_of(m)
        if not m.get("date") or not m.get("team1") or not m.get("team2"):
            continue
        t = (m.get("time") or "").strip()
        res.append([mid(comp, m["date"], A(m["team1"]), A(m["team2"])), m["date"], t, m.get("round", ""),
                    A(m["team1"]), A(m["team2"]), ft[0] if ft else None, ft[1] if ft else None,
                    json_goals(m) if ft else None])
    return res

MONTHS = {m: i for i, m in enumerate(["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], 1)}
RE_DATE = re.compile(r"^\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Z][a-z]{2})\s+(\d{1,2})(?:\s+(\d{4}))?\s*$")
RE_ROUND = re.compile(r"^\s*▪\s*(.+?)\s*$")
RE_TIME = re.compile(r"^\s*(\d{1,2}:\d{2})\s+(.*)$")
RE_SCORE_MID = re.compile(r"^(.*?)\s+(\d+)-(\d+)(?:\s*\(\d+-\d+\))?(?:\s+(?:a\.e\.t\.|aet|pen\.?).*?)?\s{2,}(.+?)\s*$")
RE_V = re.compile(r"^(.*?)\s+v\s+(.*?)\s*$")
RE_SCORE_END = re.compile(r"^(.*?)\s+(\d+)-(\d+)(?:\s*\(\d+-\d+\))?.*$")

def parse_goal_side(txt, side):
    goals = []
    # "Lewin Blum 22', Alvyn Sanches 40', Samuel ESSENDE 66', 73'(p)"
    for mt in re.finditer(r"([^,\d][^\d]*?)\s+((?:\d+(?:\+\d+)?'(?:\((?:p|og|pen)\))?(?:,\s*)?)+)", txt):
        name = mt.group(1).strip(" ,")
        for mm in re.finditer(r"(\d+(?:\+\d+)?)'(?:\((p|og|pen)\))?", mt.group(2)):
            flag = mm.group(2) or ""
            if flag == "pen": flag = "p"
            goals.append([side, name, mm.group(1), flag])
    return goals

def load_txt(comp, path, start_year):
    lines = open(os.path.join(ROOT, path), encoding="utf-8").read().split("\n")
    res = []
    rnd = ""; cur_date = None; year = start_year; last_month = None; cur_time = ""
    pending_goals = None
    i = 0
    while i < len(lines):
        ln = lines[i].rstrip()
        i += 1
        if not ln.strip() or ln.lstrip().startswith("#") or ln.startswith("="):
            continue
        r = RE_ROUND.match(ln)
        if r:
            rnd = r.group(1); continue
        dm = RE_DATE.match(ln)
        if dm:
            mon = MONTHS[dm.group(2)]; day = int(dm.group(3))
            if dm.group(4):
                year = int(dm.group(4))
            else:
                cand = datetime.date(year, mon, day)
                if last_month and (last_month - cand).days > 60:
                    year += 1
            last_month = datetime.date(year, mon, day)
            cur_date = f"{year:04d}-{mon:02d}-{day:02d}"
            cur_time = ""
            continue
        s = ln.strip()
        if s.startswith("("):
            # scorers block (may span lines until ')')
            block = s
            while not block.rstrip().endswith(")") and i < len(lines):
                block += " " + lines[i].strip(); i += 1
            if res and res[-1][6] is not None:
                inner = block.strip()[1:-1]
                parts = inner.split(";")
                g = parse_goal_side(parts[0], 0)
                if len(parts) > 1:
                    g += parse_goal_side(parts[1], 1)
                elif res[-1][6] == 0:
                    g = parse_goal_side(parts[0], 1)
                res[-1][8] = g
            continue
        if cur_date is None:
            continue
        tm = RE_TIME.match(ln)
        body = ln
        if tm:
            cur_time = tm.group(1); body = tm.group(2)
        body = body.strip()
        # format A : "Home  1-0 (0-0)  Away"  ; format B : "Home v Away 2-5 (1-1)" ; unplayed "Home v Away"
        home = away = None; hg = ag = None
        mv = re.match(r"^(.*?)\s+v\s+(.*)$", body)
        if mv:
            home = mv.group(1).strip()
            rest = mv.group(2).strip()
            se = re.match(r"^(.*?)\s{2,}(\d+)-(\d+)(.*)$", rest) or re.match(r"^(.*?)\s+(\d+)-(\d+)(\s*\(.*)?$", rest)
            if se:
                away = se.group(1).strip(); hg = int(se.group(2)); ag = int(se.group(3))
            else:
                away = re.sub(r"\s{2,}.*$", "", rest).strip()
        else:
            sm = RE_SCORE_MID.match(body)
            if sm:
                home = sm.group(1).strip(); hg = int(sm.group(2)); ag = int(sm.group(3)); away = sm.group(4).strip()
        if not home or not away:
            continue
        away = A(re.sub(r"\s+(a\.e\.t\.|aet|pen\.).*$", "", away)); home = A(home)
        res.append([mid(comp, cur_date, home, away), cur_date, cur_time, rnd, home, away, hg, ag, [] if hg == 0 and ag == 0 else None])
    return res

COMPS = [
    # code, nom, pays, tz, saisonnage, [(saison, loader, path)]
    ("PL", "Premier League", "Angleterre", "Europe/London", "2 ans", [("2025-26", "json", "of/2025-26/en.1.json"), ("2026-27", "json", "of/2026-27/en.1.json")]),
    ("PD", "La Liga", "Espagne", "Europe/Madrid", "2 ans", [("2025-26", "json", "of/2025-26/es.1.json"), ("2026-27", "json", "of/2026-27/es.1.json")]),
    ("FL1", "Ligue 1", "France", "Europe/Paris", "2 ans", [("2025-26", "json", "of/2025-26/fr.1.json"), ("2026-27", "json", "of/2026-27/fr.1.json")]),
    ("SA", "Serie A", "Italie", "Europe/Rome", "2 ans", [("2025-26", "json", "of/2025-26/it.1.json"), ("2026-27", "json", "of/2026-27/it.1.json")]),
    ("BL1", "Bundesliga", "Allemagne", "Europe/Berlin", "2 ans", [("2025-26", "json", "of/2025-26/de.1-full.json"), ("2026-27", "json", "of/2026-27/de.1.json")]),
    ("CL", "UEFA Champions League", "Europe", "Europe/Paris", "2 ans", [("2025-26", "txt", "champions-league/2025-26/cl.txt", 2025)]),
    ("WC", "Coupe du Monde FIFA", "International", "UTC", "édition", [("2026", "json", "worldcup.json/2026/worldcup.json")]),
    ("J1", "J1 League", "Japon", "Asia/Tokyo", "année civile → 2 ans", [("2025", "json", "of/2025/jp.1.json")]),
    ("DED", "Eredivisie", "Pays-Bas", "Europe/Amsterdam", "2 ans", [("2025-26", "json", "of/2025-26/nl.1.json"), ("2026-27", "json", "of/2026-27/nl.1.json")]),
    ("BSA", "Brasileirão Série A", "Brésil", "America/Sao_Paulo", "année civile", [("2025", "json", "of/2025/br.1.json"), ("2026", "json", "of/2026/br.1.json")]),
    ("ELC", "EFL Championship", "Angleterre", "Europe/London", "2 ans", [("2025-26", "json", "of/2025-26/en.2.json"), ("2026-27", "json", "of/2026-27/en.2.json")]),
    ("SSL", "Swiss Super League", "Suisse", "Europe/Zurich", "2 ans", [("2024-25", "txt", "europe/switzerland/2024-25_ch1.txt", 2024), ("2026-27", "txt", "europe/switzerland/2026-27_ch1.txt", 2026)]),
    ("SPL", "Saudi Pro League", "Arabie saoudite", "Asia/Riyadh", "2 ans", [("2024-25", "txt", "world/middle-east/saudi-arabia/2024-25_sa1.txt", 2024)]),
]

REPO_OF = {"of": "of", "champions-league": "champions-league", "worldcup.json": "worldcup.json", "europe": "europe", "world": "world"}

def main():
    repos = {k: git_info(k) for k in REPO_OF}
    out = {"generatedAt": datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).replace(microsecond=0).isoformat() + "Z",
           "source": {"name": "openfootball", "license": "CC0-1.0 (domaine public)", "url": "https://github.com/openfootball", "repos": repos},
           "competitions": [], "aliases": ALIASES}
    for code, name, country, tz, stype, seasons in COMPS:
        c = {"code": code, "name": name, "country": country, "tz": tz, "seasonType": stype, "seasons": []}
        for s in seasons:
            season, kind, path = s[0], s[1], s[2]
            rows = load_json(code, path) if kind == "json" else load_txt(code, path, s[3])
            # dedupe ids
            seen = {}
            for r in rows:
                if r[0] in seen:
                    seen[r[0]] += 1; r[0] = f"{r[0]}-{seen[r[0]]}"
                else:
                    seen[r[0]] = 0
            repo = path.split("/")[0]
            played = sum(1 for r in rows if r[6] is not None)
            withg = sum(1 for r in rows if r[8])
            c["seasons"].append({"season": season, "file": path, "repo": repo, "commitDate": repos[repo]["commitDate"],
                                 "count": len(rows), "played": played, "withScorers": withg, "matches": rows})
            print(f"{code} {season}: {len(rows)} matchs, {played} joués, {withg} avec buteurs, dernier joué {max([r[1] for r in rows if r[6] is not None] or ['-'])}")
        out["competitions"].append(c)
    json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    print("taille", os.path.getsize(OUT))

main()
