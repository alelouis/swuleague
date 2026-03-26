"""
data.py — Modèle de données, I/O CSV, constantes scoring, ranking
"""

import csv
from pathlib import Path
from typing import NamedTuple

# ── Configuration ─────────────────────────────────────────────────────────────

SETS = {
    "set-7": "Set 7",
}
CURRENT_SET = "set-7"

SHOPS = {
    "all4play":      "All4Play",
    "cercle-du-jeu": "Le Cercle du Jeu",
    "test":          "Boutique Test",
}

NUM_STEPS = 10
CSV_FIELDS = ["joueur", "victoires", "defaites", "nuls", "recrutement"]

PTS_PARTICIPATION = 2
PTS_VICTOIRE      = 2
PTS_VICTOIRE_MAX  = 6
PTS_PARTIE        = 1
PTS_PARTIE_MAX    = 3
PTS_RECRUTEMENT   = 5

# ── Data model ────────────────────────────────────────────────────────────────

class StepResult(NamedTuple):
    joueur:      str
    victoires:   int
    defaites:    int
    nuls:        int
    recrutement: int  # nombre de recrues (pas encore multiplié par 5)

    @property
    def parties(self):           return self.victoires + self.defaites + self.nuls
    @property
    def pts_participation(self): return PTS_PARTICIPATION if self.parties > 0 else 0
    @property
    def pts_victoires(self):     return min(self.victoires * PTS_VICTOIRE, PTS_VICTOIRE_MAX)
    @property
    def pts_parties(self):       return min(self.parties, PTS_PARTIE_MAX)
    @property
    def pts_recrutement(self):   return self.recrutement * PTS_RECRUTEMENT
    @property
    def total(self):
        return (self.pts_participation + self.pts_victoires
                + self.pts_parties + self.pts_recrutement)

# ── CSV I/O ───────────────────────────────────────────────────────────────────

def data_dir(set_id: str, shop: str) -> Path:
    return Path("data") / set_id / shop

def csv_path(set_id: str, step: int, shop: str) -> Path:
    return data_dir(set_id, shop) / f"etape_{step:02d}.csv"

def load_step(set_id: str, step: int, shop: str) -> list[StepResult]:
    path = csv_path(set_id, step, shop)
    if not path.exists():
        return []
    results = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            joueur = row.get("joueur", "").strip()
            if not joueur or joueur.startswith("#"):
                continue
            results.append(StepResult(
                joueur      = joueur,
                victoires   = int(row.get("victoires",   0) or 0),
                defaites    = int(row.get("defaites",    0) or 0),
                nuls        = int(row.get("nuls",        0) or 0),
                recrutement = int(row.get("recrutement", 0) or 0),
            ))
    return results

def available_steps(set_id: str, shop: str) -> list[int]:
    d = data_dir(set_id, shop)
    if not d.exists():
        return []
    return [i for i in range(1, NUM_STEPS + 1)
            if csv_path(set_id, i, shop).exists() and load_step(set_id, i, shop)]

# ── Ranking ───────────────────────────────────────────────────────────────────

def build_ranking_up_to(set_id: str, shop: str, up_to_step: int) -> tuple[list[int], list[dict]]:
    """Construit le classement en ne prenant en compte que les étapes <= up_to_step."""
    steps_used = [s for s in available_steps(set_id, shop) if s <= up_to_step]
    players: dict[str, dict] = {}
    for step in steps_used:
        for r in load_step(set_id, step, shop):
            p = players.setdefault(r.joueur, {
                "joueur": r.joueur, "total": 0, "etapes": 0,
                "victoires": 0, "parties": 0, "recrutement": 0,
                "par_etape": {},
            })
            p["total"]       += r.total
            p["etapes"]      += 1
            p["victoires"]   += r.victoires
            p["parties"]     += r.parties
            p["recrutement"] += r.pts_recrutement
            p["par_etape"][step] = r.total

    ranking = sorted(players.values(),
                     key=lambda p: (-p["total"], -p["etapes"], p["joueur"]))
    return steps_used, ranking
