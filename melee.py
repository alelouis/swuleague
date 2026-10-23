"""
melee.py — Récupération des résultats d'un tournoi melee.gg (page publique)

Le classement est lu via l'endpoint JSON utilisé par la page du tournoi
(`/Standing/GetRoundStandings`), sur la dernière ronde terminée.
"""

import html
import json
import re
import urllib.parse
import urllib.request
from typing import NamedTuple

BASE_URL = "https://melee.gg"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)
TIMEOUT = 20


class MeleeError(Exception):
    pass


class Tournament(NamedTuple):
    id:      int
    name:    str
    url:     str
    round:   str
    results: list[dict]  # dicts au format CSV_FIELDS de data.py


def parse_tournament_id(url_or_id: str) -> int:
    """Accepte `https://melee.gg/Tournament/View/12345` (avec ou sans #ancre) ou `12345`."""
    s = url_or_id.strip()
    if s.isdigit():
        return int(s)
    m = re.search(r"melee\.gg/Tournament/View/(\d+)", s, re.IGNORECASE)
    if not m:
        raise MeleeError("Lien melee.gg invalide (attendu : https://melee.gg/Tournament/View/<id>)")
    return int(m.group(1))


def tournament_url(tournament_id: int) -> str:
    return f"{BASE_URL}/Tournament/View/{tournament_id}"


def _request(url: str, data: dict | None = None) -> str:
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers={
        "User-Agent": USER_AGENT,
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        **({"X-Requested-With": "XMLHttpRequest"} if data is not None else {}),
    })
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raise MeleeError(f"melee.gg a répondu {e.code} pour {url}") from e
    except urllib.error.URLError as e:
        raise MeleeError(f"Impossible de joindre melee.gg : {e.reason}") from e


def _last_completed_round(page: str) -> tuple[int, str]:
    """Dernière ronde terminée du sélecteur de ronde de la section Standings."""
    m = re.search(r'id="standings-round-selector-container"(.*?)</div>', page, re.DOTALL)
    if not m:
        raise MeleeError("Section « Standings » introuvable sur la page du tournoi")
    rounds = re.findall(
        r'<button[^>]*data-id="(\d+)"[^>]*data-name="([^"]*)"[^>]*data-is-completed="True"',
        m.group(1),
    )
    if not rounds:
        raise MeleeError("Aucune ronde terminée pour ce tournoi")
    round_id, round_name = rounds[-1]
    return int(round_id), html.unescape(round_name)


def _standings_payload(round_id: int) -> dict:
    # Paramètres DataTables attendus par l'endpoint côté serveur
    return {
        "draw": "1",
        "columns[0][data]": "Rank", "columns[0][name]": "Rank",
        "columns[0][searchable]": "true", "columns[0][orderable]": "true",
        "columns[0][search][value]": "", "columns[0][search][regex]": "false",
        "order[0][column]": "0", "order[0][dir]": "asc",
        "start": "0", "length": "1000",
        "search[value]": "", "search[regex]": "false",
        "roundId": str(round_id),
    }


def _player_name(row: dict) -> str:
    players = (row.get("Team") or {}).get("Players") or []
    names = [p.get("DisplayName") or p.get("Username") or "" for p in players]
    return " / ".join(n.strip() for n in names if n.strip())


def fetch_tournament(url_or_id: str) -> Tournament:
    tid = parse_tournament_id(url_or_id)
    url = tournament_url(tid)
    page = _request(url)

    title = re.search(r"<title>([^<]*)</title>", page)
    name = html.unescape(title.group(1)).rsplit("|", 1)[0].strip() if title else f"Tournoi {tid}"

    round_id, round_name = _last_completed_round(page)
    try:
        payload = json.loads(_request(f"{BASE_URL}/Standing/GetRoundStandings",
                                      _standings_payload(round_id)))
    except json.JSONDecodeError as e:
        raise MeleeError("Réponse inattendue de melee.gg pour le classement") from e
    if payload.get("Error") or "data" not in payload:
        raise MeleeError(payload.get("Message") or "Classement indisponible sur melee.gg")

    rows = sorted(payload["data"], key=lambda r: r.get("Rank") or 0)
    results = []
    for row in rows:
        joueur = _player_name(row)
        if not joueur:
            continue
        results.append({
            "joueur":      joueur,
            "victoires":   int(row.get("MatchWins") or 0),
            "defaites":    int(row.get("MatchLosses") or 0),
            "nuls":        int(row.get("MatchDraws") or 0),
            "recrutement": 0,
        })
    if not results:
        raise MeleeError("Aucun joueur dans le classement de ce tournoi")
    return Tournament(tid, name, url, round_name, results)
