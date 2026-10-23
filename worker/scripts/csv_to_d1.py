#!/usr/bin/env python3
"""
csv_to_d1.py — Migration des CSV de data/ vers la base D1

Usage (depuis worker/) :
    uv run --project .. python scripts/csv_to_d1.py --sql seed.sql
    npx wrangler d1 execute swuleague --local  --file seed.sql   # base locale
    npx wrangler d1 execute swuleague --remote --file seed.sql   # base Cloudflare

    # Contrôle de parité TypeScript ↔ Python :
    uv run --project .. python scripts/csv_to_d1.py --fixtures test/fixtures.json
"""

import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import data  # noqa: E402
from data import NUM_STEPS, PLAYER_ALIASES, SETS, SHOPS, csv_path, data_dir  # noqa: E402


def raw_step(set_id: str, step: int, shop: str) -> dict | None:
    """Étape telle qu'écrite dans le CSV (pseudos bruts, alias non appliqués)."""
    path = csv_path(set_id, step, shop)
    if not path.exists():
        return None
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    forfait = False
    while lines and lines[0].lstrip().startswith("#"):
        if "forfait" in lines[0].lower():
            forfait = True
        lines = lines[1:]
    results = []
    for row in csv.DictReader(lines):
        joueur = row.get("joueur", "").strip()
        if not joueur or joueur.startswith("#"):
            continue
        results.append({
            "joueur": joueur,
            "victoires": int(row.get("victoires", 0) or 0),
            "defaites": int(row.get("defaites", 0) or 0),
            "nuls": int(row.get("nuls", 0) or 0),
            "recrutement": int(row.get("recrutement", 0) or 0),
        })
    return {"step": step, "forfait": forfait, "source": data.step_source(set_id, step, shop), "results": results}


def raw_recruitments(set_id: str, shop: str) -> list[list[str]]:
    path = data_dir(set_id, shop) / "recrutement.csv"
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return [[r["recrue"].strip(), r["recruteur"].strip()] for r in csv.DictReader(f)
                if r.get("recrue", "").strip() and r.get("recruteur", "").strip()]


def league_data(set_id: str, shop: str) -> dict:
    steps = [s for s in (raw_step(set_id, i, shop) for i in range(1, NUM_STEPS + 1)) if s]
    return {"steps": steps, "recruitments": raw_recruitments(set_id, shop), "aliases": PLAYER_ALIASES}


def q(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def write_sql(out: Path) -> None:
    lines = [
        "-- Généré par scripts/csv_to_d1.py — remplace les données des ligues (pas les comptes)",
        "DELETE FROM results; DELETE FROM steps; DELETE FROM recruitments;",
        "DELETE FROM aliases; DELETE FROM settings;",
        "DELETE FROM user_shops WHERE shop_slug NOT IN (" + ",".join(q(s) for s in SHOPS) + ");",
        "DELETE FROM shops WHERE slug NOT IN (" + ",".join(q(s) for s in SHOPS) + ");",
        "DELETE FROM sets;",
    ]
    for i, (slug, name) in enumerate(SETS.items()):
        lines.append(f"INSERT INTO sets (slug, name, position) VALUES ({q(slug)}, {q(name)}, {i});")
    for i, (slug, name) in enumerate(SHOPS.items()):
        lines.append(f"INSERT INTO shops (slug, name, position) VALUES ({q(slug)}, {q(name)}, {i}) "
                     f"ON CONFLICT (slug) DO UPDATE SET name = excluded.name, position = excluded.position;")
    lines.append(f"INSERT INTO settings (key, value) VALUES ('current_set', {q(data.CURRENT_SET)});")
    for alias, canonical in PLAYER_ALIASES.items():
        lines.append(f"INSERT INTO aliases (alias, canonical) VALUES ({q(alias)}, {q(canonical)});")

    n_steps = n_results = 0
    for set_id in SETS:
        for shop in SHOPS:
            league = league_data(set_id, shop)
            for s in league["steps"]:
                if not s["results"]:
                    continue
                n_steps += 1
                lines.append(
                    "INSERT INTO steps (set_slug, shop_slug, step, forfait, source, imported_by) VALUES "
                    f"({q(set_id)}, {q(shop)}, {s['step']}, {q(s['forfait'])}, {q(s['source'])}, 'migration CSV');")
                for pos, r in enumerate(s["results"]):
                    n_results += 1
                    lines.append(
                        "INSERT INTO results (set_slug, shop_slug, step, position, joueur, victoires, defaites, nuls, recrutement) "
                        f"VALUES ({q(set_id)}, {q(shop)}, {s['step']}, {pos}, {q(r['joueur'])}, "
                        f"{r['victoires']}, {r['defaites']}, {r['nuls']}, {r['recrutement']});")
            for pos, (recrue, recruteur) in enumerate(league["recruitments"]):
                lines.append(
                    "INSERT INTO recruitments (set_slug, shop_slug, recrue, recruteur, position) VALUES "
                    f"({q(set_id)}, {q(shop)}, {q(recrue)}, {q(recruteur)}, {pos}) "
                    "ON CONFLICT DO UPDATE SET recruteur = excluded.recruteur;")
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{out} : {len(SETS)} sets, {len(SHOPS)} boutiques, {n_steps} étapes, {n_results} résultats")


def write_fixtures(out: Path) -> None:
    """Données brutes + vues calculées par l'app Python, pour comparer avec le portage TS."""
    import app  # noqa: E402 — vues de référence (season_view, recruitment_view)
    from data import available_steps, build_ranking_up_to

    leagues = []
    for set_id in SETS:
        for shop in SHOPS:
            steps = available_steps(set_id, shop)
            top = build_ranking_up_to(set_id, shop, steps[-1])[1][:3] if steps else []
            leagues.append({
                "set": set_id, "shop": shop,
                "data": league_data(set_id, shop),
                "expected": {
                    "season": json.loads(json.dumps(app.season_view(set_id, shop))),
                    "recruitments": app.recruitment_view(set_id, shop),
                    "top": [{"joueur": p["joueur"], "total": p["total"]} for p in top],
                },
            })
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(leagues, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{out} : {len(leagues)} ligues")


def main():
    parser = argparse.ArgumentParser(description="Migration CSV → D1")
    parser.add_argument("--sql", type=Path, help="Fichier SQL de chargement à générer")
    parser.add_argument("--fixtures", type=Path, help="Fichier JSON de contrôle de parité à générer")
    args = parser.parse_args()
    if not args.sql and not args.fixtures:
        parser.error("indiquer --sql et/ou --fixtures")
    if args.sql:
        write_sql(args.sql)
    if args.fixtures:
        write_fixtures(args.fixtures)


if __name__ == "__main__":
    main()
