#!/usr/bin/env python3
"""Assemble la page autonome dist/football-quant-ai.html à partir des sources.

Le gabarit src/template.html contient deux types de marqueurs :
  {{include:<chemin>}}  -> contenu texte du fichier, inséré tel quel
  {{b64:<chemin>}}      -> fichier binaire encodé en base64 (instantané gzip des données)

Usage : python3 build.py [sortie]
"""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent


def render(template: str) -> str:
    def sub(m: re.Match) -> str:
        kind, rel = m.group(1), m.group(2)
        path = ROOT / rel
        if kind == "include":
            return path.read_text(encoding="utf-8")
        return base64.b64encode(path.read_bytes()).decode("ascii")

    return re.sub(r"\{\{(include|b64):([^}]+)\}\}", sub, template)


def main() -> None:
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist" / "football-quant-ai.html"
    html = render((ROOT / "src" / "template.html").read_text(encoding="utf-8"))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"{out} ({len(html.encode('utf-8')):,} octets)")


if __name__ == "__main__":
    main()
