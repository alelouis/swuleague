"""
data.py — Modèle de données, I/O CSV, constantes scoring, ranking
"""

import csv
import json
import re
import unicodedata
from pathlib import Path
from typing import NamedTuple

# ── Configuration ─────────────────────────────────────────────────────────────
# Sets, boutiques et set en cours sont stockés dans data/leagues.json
# (modifiable depuis l'application web). SETS et SHOPS sont mis à jour sur place
# pour que les modules qui les importent voient les ajouts.

DATA_ROOT = Path(__file__).resolve().parent / "data"
LEAGUES_FILE = DATA_ROOT / "leagues.json"

def _load_leagues() -> dict:
    return json.loads(LEAGUES_FILE.read_text(encoding="utf-8"))

_leagues = _load_leagues()
SETS: dict[str, str] = dict(_leagues["sets"])
SHOPS: dict[str, str] = dict(_leagues["shops"])
CURRENT_SET: str = _leagues["current_set"]

def _save_leagues() -> None:
    payload = {"current_set": CURRENT_SET, "sets": SETS, "shops": SHOPS}
    LEAGUES_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

def slugify(name: str) -> str:
    """« Sortilèges Perpignan » → « sortileges-perpignan »"""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")

def _check_new(kind: dict[str, str], slug: str, label: str) -> None:
    if not label.strip():
        raise ValueError("Le nom est obligatoire.")
    if not SLUG_RE.match(slug):
        raise ValueError(f"Identifiant invalide « {slug} » (minuscules, chiffres et tirets).")
    if slug in kind:
        raise ValueError(f"L'identifiant « {slug} » existe déjà.")

def add_set(slug: str, label: str, make_current: bool = False) -> None:
    global CURRENT_SET
    _check_new(SETS, slug, label)
    SETS[slug] = label.strip()
    if make_current:
        CURRENT_SET = slug
    _save_leagues()

def add_shop(slug: str, label: str) -> None:
    _check_new(SHOPS, slug, label)
    SHOPS[slug] = label.strip()
    _save_leagues()

def rename(kind: str, slug: str, label: str) -> None:
    target = {"set": SETS, "shop": SHOPS}[kind]
    if slug not in target or not label.strip():
        raise ValueError("Nom invalide.")
    target[slug] = label.strip()
    _save_leagues()

def set_current_set(slug: str) -> None:
    global CURRENT_SET
    if slug not in SETS:
        raise ValueError(f"Set inconnu : {slug}")
    CURRENT_SET = slug
    _save_leagues()

def current_set() -> str:
    return CURRENT_SET

NUM_STEPS = 10
CSV_FIELDS = ["joueur", "victoires", "defaites", "nuls", "recrutement"]

PTS_PARTICIPATION = 2
PTS_VICTOIRE      = 2
PTS_VICTOIRE_MAX  = 6
PTS_PARTIE        = 1
PTS_PARTIE_MAX    = 3
PTS_RECRUTEMENT   = 5

# ── Alias joueurs (ancien pseudo → pseudo canonique) ─────────────────────────
# Certains joueurs changent de pseudo sur melee.gg ; on normalise ici.
PLAYER_ALIASES: dict[str, str] = {
    "Dracos": "ADB_Dracos",
    "Eivro":  "ADB_Eivro",
}

def canonical_name(name: str) -> str:
    return PLAYER_ALIASES.get(name, name)

# ── Data model ────────────────────────────────────────────────────────────────

PTS_FORFAIT_MAX = PTS_PARTICIPATION + PTS_VICTOIRE_MAX + PTS_PARTIE_MAX  # = 11

class StepResult(NamedTuple):
    joueur:      str
    victoires:   int
    defaites:    int
    nuls:        int
    recrutement: int  # nombre de recrues (pas encore multiplié par 5)
    forfait:     bool = False  # tournoi amical : 11 pts forfaitaires pour tous

    @property
    def parties(self):           return self.victoires + self.defaites + self.nuls
    @property
    def pts_participation(self): return PTS_PARTICIPATION if (self.forfait or self.parties > 0) else 0
    @property
    def pts_victoires(self):
        if self.forfait: return PTS_VICTOIRE_MAX
        return min(self.victoires * PTS_VICTOIRE, PTS_VICTOIRE_MAX)
    @property
    def pts_parties(self):
        if self.forfait: return PTS_PARTIE_MAX
        return min(self.parties, PTS_PARTIE_MAX)
    @property
    def pts_recrutement(self):   return self.recrutement * PTS_RECRUTEMENT
    @property
    def total(self):
        if self.forfait:
            return PTS_FORFAIT_MAX + self.pts_recrutement
        return (self.pts_participation + self.pts_victoires
                + self.pts_parties + self.pts_recrutement)

# ── CSV I/O ───────────────────────────────────────────────────────────────────

def data_dir(set_id: str, shop: str) -> Path:
    return DATA_ROOT / set_id / shop

def csv_path(set_id: str, step: int, shop: str) -> Path:
    return data_dir(set_id, shop) / f"etape_{step:02d}.csv"

def load_step(set_id: str, step: int, shop: str) -> list[StepResult]:
    path = csv_path(set_id, step, shop)
    if not path.exists():
        return []

    # Détecte et retire les lignes de commentaires en tête (#),
    # et repère un éventuel marqueur "# forfait".
    raw_lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    forfait = False
    while raw_lines and raw_lines[0].lstrip().startswith("#"):
        if "forfait" in raw_lines[0].lower():
            forfait = True
        raw_lines = raw_lines[1:]

    results = []
    for row in csv.DictReader(raw_lines):
        joueur = row.get("joueur", "").strip()
        if not joueur or joueur.startswith("#"):
            continue
        joueur = canonical_name(joueur)
        results.append(StepResult(
            joueur      = joueur,
            victoires   = int(row.get("victoires",   0) or 0),
            defaites    = int(row.get("defaites",    0) or 0),
            nuls        = int(row.get("nuls",        0) or 0),
            recrutement = int(row.get("recrutement", 0) or 0),
            forfait     = forfait,
        ))
    return results

def available_steps(set_id: str, shop: str) -> list[int]:
    d = data_dir(set_id, shop)
    if not d.exists():
        return []
    return [i for i in range(1, NUM_STEPS + 1)
            if csv_path(set_id, i, shop).exists() and load_step(set_id, i, shop)]

def step_source(set_id: str, step: int, shop: str) -> str | None:
    """URL melee.gg d'origine, si notée en tête du CSV (`# melee: <url>`)."""
    path = csv_path(set_id, step, shop)
    if not path.exists():
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.lstrip().startswith("#"):
            break
        m = re.match(r"\s*#\s*melee:\s*(\S+)", line)
        if m:
            return m.group(1)
    return None

def write_step(set_id: str, step: int, shop: str, results: list[dict],
               forfait: bool = False, source: str | None = None) -> Path:
    """Écrit (ou écrase) le CSV d'une étape. `results` : dicts au format CSV_FIELDS."""
    path = csv_path(set_id, step, shop)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        if forfait:
            f.write("# forfait\n")
        if source:
            f.write(f"# melee: {source}\n")
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, lineterminator="\n")
        writer.writeheader()
        for r in results:
            writer.writerow({k: r.get(k, 0) for k in CSV_FIELDS})
    return path

def delete_step(set_id: str, step: int, shop: str) -> None:
    csv_path(set_id, step, shop).unlink(missing_ok=True)

def load_recruitments(set_id: str, shop: str) -> dict[str, str]:
    """Retourne {recrue: recruteur} depuis recrutement.csv de la ligue."""
    path = data_dir(set_id, shop) / "recrutement.csv"
    if not path.exists():
        return {}
    result = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            recrue    = row.get("recrue",    "").strip()
            recruteur = row.get("recruteur", "").strip()
            if recrue and recruteur:
                result[canonical_name(recrue)] = canonical_name(recruteur)
    return result

def write_recruitments(set_id: str, shop: str, pairs: dict[str, str]) -> None:
    path = data_dir(set_id, shop) / "recrutement.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(["recrue", "recruteur"])
        for recrue, recruteur in pairs.items():
            writer.writerow([recrue, recruteur])

# ── Ranking ───────────────────────────────────────────────────────────────────

SEUIL_RECRUTEMENT = 15  # points cumulés pour déclencher le bonus recruteur

def build_ranking_up_to(set_id: str, shop: str, up_to_step: int) -> tuple[list[int], list[dict], dict[int, dict[str, int]]]:
    """Construit le classement en ne prenant en compte que les étapes <= up_to_step.

    Règle recrutement : quand un recruté dépasse SEUIL_RECRUTEMENT points cumulés
    pour la première fois, son recruteur gagne PTS_RECRUTEMENT points ce même step.
    """
    steps_used   = [s for s in available_steps(set_id, shop) if s <= up_to_step]
    recruitments = load_recruitments(set_id, shop)   # {recrue: recruteur}

    players:      dict[str, dict] = {}
    running_totals: dict[str, int] = {}  # points cumulés par joueur au fil des steps
    bonus_deja_donne: set[str] = set()   # recrues dont le bonus a déjà été déclenché

    def _ensure_player(joueur: str) -> dict:
        return players.setdefault(joueur, {
            "joueur": joueur, "total": 0, "etapes": 0,
            "victoires": 0, "parties": 0, "recrutement": 0,
            "par_etape": {},
        })

    bonuses_par_etape: dict[int, dict[str, int]] = {}

    for step in steps_used:
        step_results = load_step(set_id, step, shop)

        # 1. Accumulation des résultats du step
        for r in step_results:
            running_totals[r.joueur] = running_totals.get(r.joueur, 0) + r.total
            p = _ensure_player(r.joueur)
            p["total"]       += r.total
            p["etapes"]      += 1
            p["victoires"]   += r.victoires
            p["parties"]     += r.parties
            p["recrutement"] += r.pts_recrutement
            p["par_etape"][step] = p["par_etape"].get(step, 0) + r.total

        # 2. Vérification des seuils de recrutement
        step_bonuses: dict[str, int] = {}
        for recrue, recruteur in recruitments.items():
            if recrue in bonus_deja_donne:
                continue
            if running_totals.get(recrue, 0) >= SEUIL_RECRUTEMENT:
                bonus_deja_donne.add(recrue)
                step_bonuses[recruteur] = step_bonuses.get(recruteur, 0) + PTS_RECRUTEMENT
                p = _ensure_player(recruteur)
                p["total"]       += PTS_RECRUTEMENT
                p["recrutement"] += PTS_RECRUTEMENT
                p["par_etape"][step] = p["par_etape"].get(step, 0) + PTS_RECRUTEMENT

        bonuses_par_etape[step] = step_bonuses

    ranking = sorted(players.values(),
                     key=lambda p: (-p["total"], -p["etapes"], p["joueur"]))
    return steps_used, ranking, bonuses_par_etape
