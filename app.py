#!/usr/bin/env python3
"""
app.py — Application web de suivi des ligues SWU
=================================================

Classements par boutique, import d'étape depuis un lien melee.gg,
gestion du recrutement. Lit et écrit les mêmes CSV que image.py.

Usage:
    flask --app app run                         # http://127.0.0.1:5000
    SWULEAGUE_ADMIN_PASSWORD=... flask --app app run --host 0.0.0.0
"""

import hmac
import os
import secrets
from functools import wraps
from pathlib import Path

from flask import (
    Flask, abort, flash, redirect, render_template, request,
    send_file, send_from_directory, session, url_for,
)

import melee
import data
from data import (
    NUM_STEPS, PTS_FORFAIT_MAX, PTS_PARTICIPATION, PTS_PARTIE,
    PTS_PARTIE_MAX, PTS_RECRUTEMENT, PTS_VICTOIRE, PTS_VICTOIRE_MAX,
    SEUIL_RECRUTEMENT, SETS, SHOPS, StepResult,
    available_steps, build_ranking_up_to, canonical_name, current_set, delete_step, slugify,
    load_recruitments, load_step, step_source, write_recruitments, write_step,
)
from drawing import DISCLAIMER, _player_color, generate_step_image
from parse_melee import parse_melee
from theme import OUTPUT_DIR

ROOT = Path(__file__).resolve().parent

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.environ.get("SWULEAGUE_SECRET_KEY") or secrets.token_hex(32),
    SESSION_COOKIE_SAMESITE="Lax",
)
ADMIN_PASSWORD = os.environ.get("SWULEAGUE_ADMIN_PASSWORD")


# ── Helpers ───────────────────────────────────────────────────────────────────

def is_admin() -> bool:
    return ADMIN_PASSWORD is None or session.get("admin") is True


@app.context_processor
def inject_globals():
    return {
        "SETS": SETS, "SHOPS": SHOPS, "NUM_STEPS": NUM_STEPS, "CURRENT_SET": current_set(),
        "is_admin": is_admin(), "auth_enabled": ADMIN_PASSWORD is not None,
        "player_color": _player_color, "DISCLAIMER": DISCLAIMER,
        "BAREME": [
            ("Participation", f"+{PTS_PARTICIPATION} pts"),
            ("Victoires", f"+{PTS_VICTOIRE} pts/V (max {PTS_VICTOIRE_MAX})"),
            ("Parties", f"+{PTS_PARTIE} pt/partie (max {PTS_PARTIE_MAX})"),
            ("Recrutement", f"+{PTS_RECRUTEMENT} pts/recrue ({SEUIL_RECRUTEMENT} pts)"),
            ("Jeu libre", f"{PTS_FORFAIT_MAX} pts forfait"),
        ],
    }


def admin_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not is_admin():
            flash("Connexion requise pour modifier la ligue.", "error")
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)
    return wrapper


def check_league(set_id: str, shop: str) -> None:
    if set_id not in SETS or shop not in SHOPS:
        abort(404)


def ranking_view(set_id: str, shop: str, step: int) -> dict:
    """Classement général à l'étape `step`, avec évolution depuis l'étape précédente."""
    steps_used, ranking, bonuses = build_ranking_up_to(set_id, shop, step)
    prev_steps = [s for s in steps_used if s < step]
    prev_ranking = build_ranking_up_to(set_id, shop, prev_steps[-1])[1] if prev_steps else None
    prev_pos = {p["joueur"]: i for i, p in enumerate(prev_ranking or [], start=1)}
    prev_tot = {p["joueur"]: p["total"] for p in prev_ranking or []}

    rows = []
    for rank, p in enumerate(ranking, start=1):
        name = p["joueur"]
        if prev_ranking is None:
            move = None
        elif name not in prev_pos:
            move = ("new", "NEW")
        else:
            delta = prev_pos[name] - rank
            move = (("up", f"▲{delta}") if delta > 0 else
                    ("down", f"▼{-delta}") if delta < 0 else ("same", "="))
        rows.append({**p, "rank": rank, "move": move,
                     "diff": p["total"] - prev_tot.get(name, 0)})
    return {"steps": steps_used, "rows": rows, "bonuses": bonuses}


def step_view(set_id: str, shop: str, step: int, bonuses: dict[str, int]) -> dict | None:
    """Résultats détaillés d'une étape (bonus de recrutement déclenchés inclus)."""
    results = load_step(set_id, step, shop)
    if not results:
        return None
    forfait = any(r.forfait for r in results)
    rows = []
    for r in results:
        bonus = bonuses.get(r.joueur, 0)
        rows.append({"r": r, "bonus": bonus, "total": r.total - r.pts_recrutement + bonus})
    if forfait:
        rows.sort(key=lambda x: x["r"].joueur.lower())
    else:
        rows.sort(key=lambda x: (-x["total"], -x["r"].victoires, x["r"].joueur))
    return {
        "step": step, "rows": rows, "forfait": forfait,
        "parties": sum(r.parties for r in results),
        "source": step_source(set_id, step, shop),
    }


def season_view(set_id: str, shop: str) -> dict:
    """Instantané classement + détail pour chaque étape jouée, sérialisable en JSON
    (le front anime le passage d'une étape à l'autre)."""
    snapshots = {}
    for step in available_steps(set_id, shop):
        ranking = ranking_view(set_id, shop, step)
        detail = step_view(set_id, shop, step, ranking["bonuses"].get(step, {}))
        snapshots[step] = {
            "rows": [
                {"joueur": p["joueur"], "rank": p["rank"], "total": p["total"],
                 "diff": p["diff"], "etapes": p["etapes"],
                 "move": p["move"][0] if p["move"] else None,
                 "delta": int(p["move"][1][1:]) if p["move"] and p["move"][0] in ("up", "down") else 0,
                 "par_etape": {str(s): v for s, v in p["par_etape"].items()}}
                for p in ranking["rows"]
            ],
            "detail": {
                "forfait": detail["forfait"], "parties": detail["parties"],
                "source": detail["source"],
                "rows": [
                    {"joueur": d["r"].joueur, "v": d["r"].victoires, "d": d["r"].defaites,
                     "n": d["r"].nuls, "participation": d["r"].pts_participation,
                     "victoires": d["r"].pts_victoires, "parties": d["r"].pts_parties,
                     "bonus": d["bonus"], "total": d["total"]}
                    for d in detail["rows"]
                ],
            },
        }
    players = sorted({r["joueur"] for s in snapshots.values() for r in s["rows"]}, key=str.lower)
    return {
        "numSteps": NUM_STEPS,
        "steps": list(snapshots),
        "snapshots": snapshots,
        "colors": {p: _player_color(p) for p in players},
    }


def recruitment_view(set_id: str, shop: str) -> list[dict]:
    """Statut de chaque recrue : points cumulés et étape du bonus éventuel."""
    steps = available_steps(set_id, shop)
    totals: dict[str, int] = {}
    reached: dict[str, int] = {}
    for step in steps:
        for r in load_step(set_id, step, shop):
            totals[r.joueur] = totals.get(r.joueur, 0) + r.total
            if totals[r.joueur] >= SEUIL_RECRUTEMENT:
                reached.setdefault(r.joueur, step)
    return [
        {"recrue": recrue, "recruteur": recruteur,
         "points": totals.get(recrue, 0), "bonus_step": reached.get(recrue)}
        for recrue, recruteur in sorted(load_recruitments(set_id, shop).items(),
                                        key=lambda kv: kv[0].lower())
    ]


def known_players(set_id: str, shop: str) -> set[str]:
    return {r.joueur for s in available_steps(set_id, shop) for r in load_step(set_id, s, shop)}


def next_step(set_id: str, shop: str) -> int:
    steps = available_steps(set_id, shop)
    return min((steps[-1] + 1) if steps else 1, NUM_STEPS)


# ── Pages ─────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return redirect(url_for("set_view", set_id=current_set()))


@app.route("/<set_id>/")
def set_view(set_id):
    if set_id not in SETS:
        abort(404)
    leagues = []
    for slug, name in SHOPS.items():
        steps = available_steps(set_id, slug)
        top = build_ranking_up_to(set_id, slug, steps[-1])[1][:3] if steps else []
        leagues.append({"slug": slug, "name": name, "steps": steps, "top": top})
    leagues.sort(key=lambda l: not l["steps"])
    return render_template("set.html", set_id=set_id, leagues=leagues)


@app.route("/<set_id>/<shop>/")
def shop_view(set_id, shop):
    check_league(set_id, shop)
    steps = available_steps(set_id, shop)
    current = request.args.get("etape", type=int)
    if steps and current not in steps:
        current = steps[-1]
    return render_template(
        "shop.html", set_id=set_id, shop=shop, steps=steps, current=current,
        season=season_view(set_id, shop),
        recruitments=recruitment_view(set_id, shop),
        players=sorted(known_players(set_id, shop), key=str.lower),
        SEUIL_RECRUTEMENT=SEUIL_RECRUTEMENT,
    )


@app.route("/<set_id>/<shop>/etape/<int:step>.webp")
def step_image(set_id, shop, step):
    check_league(set_id, shop)
    if step not in available_steps(set_id, shop):
        abort(404)
    path = generate_step_image(set_id, shop, step, ROOT / OUTPUT_DIR / set_id / shop)
    return send_file(path, mimetype="image/webp",
                     download_name=f"{set_id}_{shop}_etape_{step:02d}.webp")


@app.route("/fonts/<path:name>")
def fonts(name):
    return send_from_directory(ROOT / "fonts", name)


# ── Import d'une étape ────────────────────────────────────────────────────────

def _preview_rows(set_id: str, shop: str, results: list[dict], forfait: bool) -> list[dict]:
    known = known_players(set_id, shop)
    rows = []
    for r in results:
        canon = canonical_name(r["joueur"])
        res = StepResult(canon, r["victoires"], r["defaites"], r["nuls"], 0, forfait)
        rows.append({**r, "canon": canon, "known": canon in known, "points": res.total})
    return rows


@app.route("/<set_id>/<shop>/import", methods=["GET", "POST"])
@admin_required
def import_step(set_id, shop):
    check_league(set_id, shop)
    steps = available_steps(set_id, shop)
    form = {
        "url": request.form.get("url", "").strip(),
        "paste": request.form.get("paste", ""),
        "step": request.form.get("step", type=int) or next_step(set_id, shop),
        "forfait": request.form.get("forfait") == "on",
    }
    ctx = {"set_id": set_id, "shop": shop, "steps": steps, "form": form, "preview": None}
    if request.method == "GET":
        return render_template("import.html", **ctx)

    if not 1 <= form["step"] <= NUM_STEPS:
        flash(f"Numéro d'étape invalide (1 à {NUM_STEPS}).", "error")
        return render_template("import.html", **ctx), 400

    if request.form.get("action") == "save":
        return _save_import(set_id, shop, form)

    # Aperçu : depuis le lien melee.gg, sinon depuis le copié-collé
    source = None
    try:
        if form["url"]:
            t = melee.fetch_tournament(form["url"])
            results, source = t.results, t.url
            ctx["tournament"] = t
        elif form["paste"].strip():
            results = parse_melee(form["paste"])
            if not results:
                raise melee.MeleeError("Aucun résultat reconnu dans le copié-collé.")
        else:
            raise melee.MeleeError("Indiquez un lien melee.gg ou collez le classement.")
    except melee.MeleeError as e:
        flash(str(e), "error")
        return render_template("import.html", **ctx), 400

    ctx["source"] = source
    ctx["preview"] = _preview_rows(set_id, shop, results, form["forfait"])
    return render_template("import.html", **ctx)


def _save_import(set_id: str, shop: str, form: dict):
    f = request.form
    results = []
    for i in f.getlist("keep", type=int):
        joueur = f.get(f"joueur-{i}", "").strip()
        if not joueur:
            continue
        try:
            results.append({
                "joueur": joueur,
                "victoires": max(0, int(f.get(f"victoires-{i}", 0))),
                "defaites": max(0, int(f.get(f"defaites-{i}", 0))),
                "nuls": max(0, int(f.get(f"nuls-{i}", 0))),
                "recrutement": 0,
            })
        except ValueError:
            flash(f"Score invalide pour {joueur}.", "error")
            return redirect(url_for("import_step", set_id=set_id, shop=shop))
    if not results:
        flash("Aucun joueur sélectionné : rien n'a été enregistré.", "error")
        return redirect(url_for("import_step", set_id=set_id, shop=shop))

    replaced = form["step"] in available_steps(set_id, shop)
    write_step(set_id, form["step"], shop, results,
               forfait=form["forfait"], source=f.get("source") or None)
    flash(f"Étape {form['step']} {'remplacée' if replaced else 'ajoutée'} "
          f"({len(results)} joueurs).", "success")
    return redirect(url_for("shop_view", set_id=set_id, shop=shop, etape=form["step"]))


@app.post("/<set_id>/<shop>/etape/<int:step>/delete")
@admin_required
def delete_step_view(set_id, shop, step):
    check_league(set_id, shop)
    delete_step(set_id, step, shop)
    flash(f"Étape {step} supprimée.", "success")
    return redirect(url_for("shop_view", set_id=set_id, shop=shop))


# ── Recrutement ───────────────────────────────────────────────────────────────

@app.post("/<set_id>/<shop>/recrutement")
@admin_required
def add_recruitment(set_id, shop):
    check_league(set_id, shop)
    recrue = canonical_name(request.form.get("recrue", "").strip())
    recruteur = canonical_name(request.form.get("recruteur", "").strip())
    if not recrue or not recruteur or recrue == recruteur:
        flash("Recrue et recruteur doivent être deux joueurs différents.", "error")
    else:
        pairs = load_recruitments(set_id, shop)
        pairs[recrue] = recruteur
        write_recruitments(set_id, shop, pairs)
        flash(f"{recrue} enregistré(e) comme recrue de {recruteur}.", "success")
    return redirect(url_for("shop_view", set_id=set_id, shop=shop) + "#recrutement")


@app.post("/<set_id>/<shop>/recrutement/delete")
@admin_required
def delete_recruitment(set_id, shop):
    check_league(set_id, shop)
    pairs = load_recruitments(set_id, shop)
    recrue = request.form.get("recrue", "")
    if pairs.pop(recrue, None):
        write_recruitments(set_id, shop, pairs)
        flash(f"Recrutement de {recrue} retiré.", "success")
    return redirect(url_for("shop_view", set_id=set_id, shop=shop) + "#recrutement")


# ── Gestion des sets et boutiques ─────────────────────────────────────────────

@app.route("/gestion")
@admin_required
def manage():
    stats = {
        sid: {slug: len(available_steps(sid, slug)) for slug in SHOPS}
        for sid in SETS
    }
    return render_template("manage.html", stats=stats)


def _new_entry(form) -> tuple[str, str]:
    label = form.get("name", "").strip()
    slug = form.get("slug", "").strip().lower() or slugify(label)
    return slug, label


@app.post("/gestion/sets")
@admin_required
def add_set_view():
    slug, label = _new_entry(request.form)
    make_current = request.form.get("current") == "on"
    try:
        data.add_set(slug, label, make_current=make_current)
    except ValueError as e:
        flash(str(e), "error")
        return redirect(url_for("manage"))
    flash(f"Set « {label} » créé" + (" et défini comme set en cours." if make_current else "."), "success")
    return redirect(url_for("manage"))


@app.post("/gestion/shops")
@admin_required
def add_shop_view():
    slug, label = _new_entry(request.form)
    try:
        data.add_shop(slug, label)
    except ValueError as e:
        flash(str(e), "error")
        return redirect(url_for("manage"))
    flash(f"Boutique « {label} » ajoutée.", "success")
    return redirect(url_for("manage"))


@app.post("/gestion/<kind>/<slug>/rename")
@admin_required
def rename_view(kind, slug):
    if kind not in ("set", "shop"):
        abort(404)
    try:
        data.rename(kind, slug, request.form.get("name", ""))
    except ValueError as e:
        flash(str(e), "error")
    else:
        flash("Nom mis à jour.", "success")
    return redirect(url_for("manage"))


@app.post("/gestion/sets/<slug>/current")
@admin_required
def set_current_view(slug):
    try:
        data.set_current_set(slug)
    except ValueError as e:
        flash(str(e), "error")
    else:
        flash(f"{SETS[slug]} est maintenant le set en cours.", "success")
    return redirect(url_for("manage"))


# ── Authentification (seulement si SWULEAGUE_ADMIN_PASSWORD est défini) ───────

@app.route("/login", methods=["GET", "POST"])
def login():
    target = request.values.get("next", "")
    if not target.startswith("/") or target.startswith("//"):
        target = url_for("index")
    if ADMIN_PASSWORD is None:
        return redirect(target)
    if request.method == "POST":
        if hmac.compare_digest(request.form.get("password", ""), ADMIN_PASSWORD):
            session["admin"] = True
            return redirect(target)
        flash("Mot de passe incorrect.", "error")
    return render_template("login.html", next=target)


@app.post("/logout")
def logout():
    session.pop("admin", None)
    return redirect(url_for("index"))


if __name__ == "__main__":
    app.run(debug=True)
