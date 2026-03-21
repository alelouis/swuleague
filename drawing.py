"""
drawing.py — Rendu PIL (draw_panel, draw_bareme, text helpers, composition image)
"""

import hashlib
import sys
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from data import (
    available_steps, build_ranking_up_to, load_step,
    NUM_STEPS, SETS, SHOPS,
    PTS_PARTICIPATION, PTS_VICTOIRE, PTS_VICTOIRE_MAX,
    PTS_PARTIE, PTS_PARTIE_MAX, PTS_RECRUTEMENT,
)
from theme import (
    BG, BG_HEADER, BG_ROW_EVEN, BG_ROW_ODD,
    BG_GOLD, BG_SILVER, BG_BRONZE,
    TEXT_PRIMARY, TEXT_HEADER, TEXT_GOLD, TEXT_SILVER, TEXT_BRONZE,
    TEXT_DIM, TEXT_TITLE, TEXT_UP, TEXT_DOWN, TEXT_NEW,
    ACCENT_LINE, ACCENT_TITLE,
    SCALE,
    FONT_SIZE_SHOP, FONT_SIZE_CELL, FONT_SIZE_HEADER,
    ROW_HEIGHT, HEADER_HEIGHT, TITLE_HEIGHT, FOOTER_HEIGHT,
    PADDING_X, PADDING_Y, COL_GAP, PANEL_GAP,
    BAREME_HEIGHT, BAREME_PADDING,
    font_shop, font_title, font_header, font_cell, font_bold,
    font_footer, font_bareme,
)

# ── Text helpers ──────────────────────────────────────────────────────────────

def text_width(text: str, font: ImageFont.FreeTypeFont) -> int:
    bbox = font.getbbox(text)
    return bbox[2] - bbox[0]


def compute_col_widths(
    headers: list[str],
    rows: list[list[str]],
    min_widths: list[int] | None = None,
) -> list[int]:
    n = len(headers)
    widths = [0] * n
    for i, h in enumerate(headers):
        max_line_w = max(text_width(line, font_header) for line in h.split("\n"))
        widths[i] = max_line_w + COL_GAP * 2
    for row in rows:
        for i, cell in enumerate(row):
            w = text_width(str(cell), font_bold) + COL_GAP * 2
            widths[i] = max(widths[i], w)
    if min_widths:
        for i, mw in enumerate(min_widths):
            widths[i] = max(widths[i], mw)
    return widths


# ── Player colors ─────────────────────────────────────────────────────────────

_PLAYER_PALETTE = [
    "#e74c3c",  # rouge vif
    "#2ecc71",  # vert émeraude
    "#3498db",  # bleu ciel
    "#f39c12",  # orange
    "#9b59b6",  # violet
    "#1abc9c",  # turquoise
    "#e67e22",  # citrouille
    "#e84393",  # rose vif
    "#00cec9",  # cyan
    "#fdcb6e",  # jaune doux
    "#6c5ce7",  # indigo
    "#55efc4",  # menthe
    "#fd79a8",  # rose bonbon
    "#74b9ff",  # bleu pastel
    "#a29bfe",  # lavande
    "#ffeaa7",  # jaune pâle
    "#d63031",  # rouge foncé
    "#00b894",  # vert marin
    "#0984e3",  # bleu roi
    "#b2bec3",  # gris clair
]

def _player_color(name: str) -> str:
    h = hashlib.md5(name.encode()).hexdigest()
    idx = int(h[:8], 16) % len(_PLAYER_PALETTE)
    return _PLAYER_PALETTE[idx]


# ── draw_panel ────────────────────────────────────────────────────────────────

def draw_panel(
    draw: ImageDraw.Draw,
    ox: int, oy: int,
    title: str,
    headers: list[str],
    rows: list[list[str]],
    aligns: list[str],
    highlights: list[dict] | None = None,
    footer: str = "",
    min_widths: list[int] | None = None,
    force_width: int | None = None,
    dim_header_cols: set[int] | None = None,
    highlight_header_cols: set[int] | None = None,
) -> tuple[int, int]:
    if dim_header_cols is None:
        dim_header_cols = set()
    if highlight_header_cols is None:
        highlight_header_cols = set()
    col_widths = compute_col_widths(headers, rows, min_widths)
    table_width = sum(col_widths)
    title_min_width = text_width(title, font_title) + PADDING_X * 4
    panel_width = max(table_width + PADDING_X * 2, title_min_width)
    if force_width and force_width > panel_width:
        panel_width = force_width

    available = panel_width - PADDING_X * 2
    extra = available - sum(col_widths)
    if extra > 0:
        per_col = extra // len(col_widths)
        remainder = extra % len(col_widths)
        for i in range(len(col_widths)):
            col_widths[i] += per_col + (1 if i < remainder else 0)

    has_multiline = any("\n" in h for h in headers)
    header_h = HEADER_HEIGHT * 2 if has_multiline else HEADER_HEIGHT

    n_rows = len(rows)
    panel_height = (
        PADDING_Y
        + TITLE_HEIGHT
        + header_h
        + n_rows * ROW_HEIGHT
        + (FOOTER_HEIGHT if footer else 0)
        + PADDING_Y
    )

    y = oy + PADDING_Y

    # ── Titre ──
    tw = text_width(title, font_title)
    draw.text((ox + (panel_width - tw) / 2, y + 6 * SCALE), title, fill=TEXT_TITLE, font=font_title)
    y += TITLE_HEIGHT

    draw.line(
        [(ox + PADDING_X, y - 3 * SCALE), (ox + panel_width - PADDING_X, y - 3 * SCALE)],
        fill=ACCENT_TITLE, width=SCALE,
    )

    # ── Header ──
    has_multiline = any("\n" in h for h in headers)
    header_h = HEADER_HEIGHT * 2 if has_multiline else HEADER_HEIGHT
    line_h = FONT_SIZE_HEADER + 4 * SCALE

    draw.rectangle(
        [(ox + PADDING_X, y), (ox + panel_width - PADDING_X, y + header_h)],
        fill=BG_HEADER,
    )
    x = ox + PADDING_X
    for i, h in enumerate(headers):
        cw = col_widths[i]
        lines = h.split("\n")
        if i in dim_header_cols:
            hdr_color = TEXT_DIM
        elif i in highlight_header_cols:
            hdr_color = TEXT_TITLE
        else:
            hdr_color = TEXT_HEADER
        block_h = len(lines) * line_h
        base_y = y + (header_h - block_h) / 2
        for li, line in enumerate(lines):
            lw = text_width(line, font_header)
            if aligns[i] == "right":
                tx = x + cw - lw - COL_GAP
            elif aligns[i] == "center":
                tx = x + (cw - lw) / 2
            else:
                tx = x + COL_GAP
            draw.text((tx, base_y + li * line_h), line, fill=hdr_color, font=font_header)
        x += cw
    y += header_h

    draw.line(
        [(ox + PADDING_X, y), (ox + panel_width - PADDING_X, y)],
        fill=ACCENT_LINE, width=1,
    )

    # ── Rows ──
    for ri, row in enumerate(rows):
        bg = BG_ROW_EVEN if ri % 2 == 0 else BG_ROW_ODD
        hl = highlights[ri] if highlights and ri < len(highlights) else {}
        if "row_bg" in hl:
            bg = hl["row_bg"]

        draw.rectangle(
            [(ox + PADDING_X, y), (ox + panel_width - PADDING_X, y + ROW_HEIGHT)],
            fill=bg,
        )

        x = ox + PADDING_X
        color_cols = hl.get("color_cols", {})
        for ci, cell in enumerate(row):
            cw = col_widths[ci]
            cell_str = str(cell)

            if ci in dim_header_cols:
                color = TEXT_DIM
                f = font_cell
            elif ci in hl.get("color_only_cols", {}):
                color = hl["color_only_cols"][ci]
                f = font_cell
            elif ci in color_cols:
                color = color_cols[ci]
                f = font_bold
            elif ci in hl.get("bold_cols", set()):
                color = TEXT_PRIMARY
                f = font_bold
            elif ci in hl.get("dim_cols", set()):
                color = TEXT_DIM
                f = font_cell
            else:
                color = TEXT_PRIMARY
                f = font_cell

            cw_text = text_width(cell_str, f)
            if aligns[ci] == "right":
                tx = x + cw - cw_text - COL_GAP
            elif aligns[ci] == "center":
                tx = x + (cw - cw_text) / 2
            else:
                tx = x + COL_GAP
            draw.text((tx, y + (ROW_HEIGHT - FONT_SIZE_CELL) / 2), cell_str, fill=color, font=f)
            x += cw

        draw.line(
            [(ox + PADDING_X, y + ROW_HEIGHT), (ox + panel_width - PADDING_X, y + ROW_HEIGHT)],
            fill=ACCENT_LINE, width=1,
        )
        y += ROW_HEIGHT

    # ── Footer ──
    if footer:
        y += 4 * SCALE
        fw = text_width(footer, font_footer)
        draw.text((ox + (panel_width - fw) / 2, y), footer, fill=TEXT_DIM, font=font_footer)

    return panel_width, panel_height


# ── Barème ────────────────────────────────────────────────────────────────────

BAREME_ITEMS = [
    ("Participation", f"+{PTS_PARTICIPATION} pts"),
    ("Victoires", f"+{PTS_VICTOIRE} pts/V (max {PTS_VICTOIRE_MAX})"),
    ("Parties", f"+{PTS_PARTIE} pt/partie (max {PTS_PARTIE_MAX})"),
    ("Recrutement", f"+{PTS_RECRUTEMENT} pts/recrue"),
]

def draw_bareme(draw: ImageDraw.Draw, ox: int, oy: int, width: int) -> int:
    y = oy + BAREME_PADDING

    draw.line(
        [(ox + PADDING_X, y), (ox + width - PADDING_X, y)],
        fill=ACCENT_TITLE, width=SCALE,
    )
    y += BAREME_PADDING + 4 * SCALE

    items_text = "   ·   ".join(f"{label}: {pts}" for label, pts in BAREME_ITEMS)
    iw = text_width(items_text, font_bareme)
    draw.text((ox + (width - iw) / 2, y), items_text, fill=TEXT_HEADER, font=font_bareme)
    y += BAREME_HEIGHT

    return y - oy


# ── Table data: ranking ──────────────────────────────────────────────────────

def _ranking_table_data(steps, ranking, shop_name: str, prev_ranking: list[dict] | None = None, current_step: int | None = None):
    all_steps = list(range(1, NUM_STEPS + 1))
    played = set(steps)

    prev_pos: dict[str, int] = {}
    prev_totals: dict[str, int] = {}
    if prev_ranking:
        for i, p in enumerate(prev_ranking, start=1):
            prev_pos[p["joueur"]] = i
            prev_totals[p["joueur"]] = p["total"]

    headers = ["#", "", "Joueur"] + [f"E{s}" for s in all_steps] + ["TOTAL", ""]
    aligns  = ["right", "left", "left"] + ["right"] * NUM_STEPS + ["right", "left"]
    min_ws  = [50 * SCALE, 46 * SCALE, 0] + [42 * SCALE] * NUM_STEPS + [56 * SCALE, 60 * SCALE]

    future_cols = {3 + i for i, s in enumerate(all_steps) if s not in played}

    highlight_col: int | None = None
    if current_step is not None and current_step in played:
        highlight_col = 3 + all_steps.index(current_step)

    rows = []
    highlights = []

    for rank, p in enumerate(ranking, start=1):
        name = p["joueur"]
        player_color = _player_color(name)

        if not prev_ranking:
            move_str = ""
            move_color = TEXT_DIM
        elif name not in prev_pos:
            move_str = "NEW"
            move_color = TEXT_NEW
        else:
            delta = prev_pos[name] - rank
            if delta > 0:
                move_str = f"▲{delta}"
                move_color = TEXT_UP
            elif delta < 0:
                move_str = f"▼{abs(delta)}"
                move_color = TEXT_DOWN
            else:
                move_str = "="
                move_color = TEXT_DIM

        prev_total = prev_totals.get(name, 0)
        score_diff = p["total"] - prev_total
        diff_str = f"(+{score_diff})" if score_diff > 0 else ""

        step_scores = []
        for s in all_steps:
            if s not in played:
                step_scores.append("")
            elif s in p["par_etape"]:
                step_scores.append(str(p["par_etape"][s]))
            else:
                step_scores.append("-")

        row = [f"{rank}.", move_str, name] + step_scores + [str(p["total"]), diff_str]
        rows.append(row)

        last_total = len(headers) - 2  # TOTAL column
        last_diff = last_total + 1     # diff column
        hl: dict = {"bold_cols": {last_total}, "color_cols": {1: move_color, 2: player_color}}

        if diff_str:
            hl.setdefault("color_only_cols", {})[last_diff] = TEXT_UP
        else:
            hl.setdefault("dim_cols", set()).add(last_diff)

        if rank == 1:
            hl["color_cols"].update({0: TEXT_GOLD, last_total: TEXT_GOLD})
            hl["row_bg"] = BG_GOLD
        elif rank == 2:
            hl["color_cols"].update({0: TEXT_SILVER, last_total: TEXT_SILVER})
            hl["row_bg"] = BG_SILVER
        elif rank == 3:
            hl["color_cols"].update({0: TEXT_BRONZE, last_total: TEXT_BRONZE})
            hl["row_bg"] = BG_BRONZE

        for si, s in enumerate(all_steps):
            if s in played and s not in p["par_etape"]:
                hl.setdefault("dim_cols", set()).add(3 + si)

        if highlight_col is not None and highlight_col not in hl.get("dim_cols", set()):
            hl.setdefault("color_cols", {}).setdefault(highlight_col, TEXT_HEADER)

        highlights.append(hl)

    footer = f"{len(ranking)} joueurs  ·  {len(steps)}/{NUM_STEPS} étapes jouées"
    title = "CLASSEMENT GÉNÉRAL"

    highlight_header_cols = {highlight_col} if highlight_col is not None else set()

    return title, headers, rows, aligns, highlights, footer, min_ws, future_cols, highlight_header_cols


# ── Table data: step ──────────────────────────────────────────────────────────

def _step_table_data(set_id: str, step: int, shop: str):
    results = load_step(set_id, step, shop)
    if not results:
        return None
    results = sorted(results, key=lambda r: (-r.total, -r.victoires, r.joueur))

    headers = ["#", "Joueur", "V", "D", "Particip.", "Victoires", "Parties", "Recrutem.", "TOTAL"]
    aligns  = ["right", "left", "right", "right", "right", "right", "right", "right", "right"]
    min_ws  = [30 * SCALE, 90 * SCALE, 28 * SCALE, 28 * SCALE,
               42 * SCALE, 42 * SCALE, 42 * SCALE, 42 * SCALE, 48 * SCALE]

    rows = []
    highlights = []
    for i, r in enumerate(results):
        rank = i + 1
        player_color = _player_color(r.joueur)
        last = len(headers) - 1
        rows.append([
            f"{rank}.", r.joueur,
            str(r.victoires), str(r.defaites),
            f"+{r.pts_participation}", f"+{r.pts_victoires}",
            f"+{r.pts_parties}", f"+{r.pts_recrutement}", str(r.total),
        ])
        hl: dict = {
            "bold_cols": {last},
            "color_cols": {1: player_color},
            "color_only_cols": {2: TEXT_UP, 3: TEXT_DOWN},
        }
        if r.pts_recrutement == 0:
            hl.setdefault("dim_cols", set()).add(7)
        highlights.append(hl)

    total_parties = sum(r.parties for r in results)
    footer = f"{len(results)} participants  ·  {total_parties} parties jouées"
    title = f"ÉTAPE {step} / {NUM_STEPS}"

    return title, headers, rows, aligns, highlights, footer, min_ws


# ── Image composition ────────────────────────────────────────────────────────

def generate_step_image(set_id: str, shop: str, step: int, out_dir: Path) -> tuple[Path, Path]:
    shop_name = SHOPS[shop]
    set_label = SETS[set_id]

    steps_used, ranking = build_ranking_up_to(set_id, shop, step)
    if not ranking:
        print(f"Aucune donnée disponible pour l'étape {step}.")
        sys.exit(1)

    all_steps = available_steps(set_id, shop)
    step_idx = all_steps.index(step) if step in all_steps else -1
    prev_ranking = None
    if step_idx > 0:
        prev_step = all_steps[step_idx - 1]
        _, prev_ranking = build_ranking_up_to(set_id, shop, prev_step)

    r_title, r_headers, r_rows, r_aligns, r_hl, r_footer, r_mw, r_future, r_highlight = _ranking_table_data(steps_used, ranking, shop_name, prev_ranking, current_step=step)
    step_data = _step_table_data(set_id, step, shop)
    if step_data is None:
        print(f"Aucune donnée pour l'étape {step}")
        sys.exit(1)
    s_title, s_headers, s_rows, s_aligns, s_hl, s_footer, s_mw = step_data

    r_col_widths = compute_col_widths(r_headers, r_rows, r_mw)
    r_panel_w = max(
        sum(r_col_widths) + PADDING_X * 2,
        text_width(r_title, font_title) + PADDING_X * 4,
    )
    r_header_h = HEADER_HEIGHT * 2 if any("\n" in h for h in r_headers) else HEADER_HEIGHT
    r_panel_h = (
        PADDING_Y + TITLE_HEIGHT + r_header_h
        + len(r_rows) * ROW_HEIGHT
        + (FOOTER_HEIGHT if r_footer else 0) + PADDING_Y
    )

    s_col_widths = compute_col_widths(s_headers, s_rows, s_mw)
    s_panel_w = max(
        sum(s_col_widths) + PADDING_X * 2,
        text_width(s_title, font_title) + PADDING_X * 4,
    )
    s_header_h = HEADER_HEIGHT * 2 if any("\n" in h for h in s_headers) else HEADER_HEIGHT
    s_panel_h = (
        PADDING_Y + TITLE_HEIGHT + s_header_h
        + len(s_rows) * ROW_HEIGHT
        + (FOOTER_HEIGHT if s_footer else 0) + PADDING_Y
    )

    shop_header_h = FONT_SIZE_SHOP + PADDING_Y * 3
    shop_min_w = text_width(f"{shop_name.upper()} — {set_label.upper()}", font_shop) + PADDING_X * 4
    img_width = max(PADDING_X + r_panel_w + PANEL_GAP + s_panel_w + PADDING_X, shop_min_w)
    panels_height = max(r_panel_h, s_panel_h) + PADDING_Y * 2 + shop_header_h
    bareme_height = BAREME_PADDING * 2 + BAREME_HEIGHT + 4 * SCALE + BAREME_PADDING
    img_height = panels_height + bareme_height

    img = Image.new("RGB", (img_width, img_height), BG)
    draw = ImageDraw.Draw(img)

    header_label = f"{shop_name.upper()} — {set_label.upper()}"
    sw = text_width(header_label, font_shop)
    draw.text(((img_width - sw) / 2, PADDING_Y + 4 * SCALE), header_label, fill=ACCENT_TITLE, font=font_shop)

    # Date de génération (heure de Paris) en haut à droite
    now = datetime.now(ZoneInfo("Europe/Paris"))
    date_str = f"Généré le {now.strftime('%d/%m/%Y %H:%M')}"
    dw = text_width(date_str, font_footer)
    draw.text((img_width - dw - PADDING_X, PADDING_Y + 4 * SCALE), date_str, fill=TEXT_DIM, font=font_footer)

    panels_y = PADDING_Y + shop_header_h

    draw_panel(
        draw, PADDING_X, panels_y,
        r_title, r_headers, r_rows, r_aligns, r_hl, r_footer, r_mw,
        dim_header_cols=r_future,
        highlight_header_cols=r_highlight,
    )

    draw_panel(
        draw, PADDING_X + r_panel_w + PANEL_GAP, panels_y,
        s_title, s_headers, s_rows, s_aligns, s_hl, s_footer, s_mw,
    )

    sep_x = PADDING_X + r_panel_w + PANEL_GAP // 2
    draw.line(
        [(sep_x, panels_y + PADDING_Y), (sep_x, panels_height - PADDING_Y * 2)],
        fill=ACCENT_LINE, width=SCALE,
    )

    draw_bareme(draw, 0, panels_height, img_width)

    out_dir.mkdir(parents=True, exist_ok=True)
    base = f"etape_{step:02d}"
    png_path = out_dir / f"{base}.png"
    webp_path = out_dir / f"{base}.webp"
    img.save(png_path, "PNG")
    img.save(webp_path, "WEBP", quality=90)
    return png_path, webp_path
