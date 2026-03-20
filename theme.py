"""
theme.py — Palette couleurs, scale, fonts, constantes layout
"""

from pathlib import Path

from PIL import ImageFont

# ── Output ────────────────────────────────────────────────────────────────────

OUTPUT_DIR = Path("output")

# ── Palette Ayu Dark ──────────────────────────────────────────────────────────

BG           = "#0b0e14"
BG_HEADER    = "#0f131a"
BG_ROW_EVEN  = "#0b0e14"
BG_ROW_ODD   = "#0d1017"
BG_GOLD      = "#1a1810"
BG_SILVER    = "#12151a"
BG_BRONZE    = "#1a1410"
BG_HIGHLIGHT = "#0d1a20"

TEXT_PRIMARY  = "#bfbdb6"
TEXT_HEADER   = "#39bae6"
TEXT_GOLD     = "#e6b450"
TEXT_SILVER   = "#b0b8bf"
TEXT_BRONZE   = "#ff8f40"
TEXT_DIM      = "#475266"
TEXT_TITLE    = "#d2d0cc"
TEXT_UP       = "#aad94c"
TEXT_DOWN     = "#f07178"
TEXT_NEW      = "#95e6cb"
ACCENT_LINE   = "#1c2028"
ACCENT_TITLE  = "#e6b450"

# ── Scale & tailles ──────────────────────────────────────────────────────────

SCALE = 2

FONT_SIZE_SHOP   = 36 * SCALE
FONT_SIZE_TITLE  = 26 * SCALE
FONT_SIZE_HEADER = 14 * SCALE
FONT_SIZE_CELL   = 14 * SCALE
FONT_SIZE_FOOTER = 12 * SCALE

ROW_HEIGHT    = 32 * SCALE
HEADER_HEIGHT = 36 * SCALE
TITLE_HEIGHT  = 52 * SCALE
FOOTER_HEIGHT = 34 * SCALE
PADDING_X     = 20 * SCALE
PADDING_Y     = 14 * SCALE
COL_GAP       = 10 * SCALE
PANEL_GAP     = 16 * SCALE

# ── Barème ────────────────────────────────────────────────────────────────────

BAREME_HEIGHT  = 28 * SCALE
BAREME_PADDING = 10 * SCALE
FONT_SIZE_BAREME = 12 * SCALE

# ── Fonts ─────────────────────────────────────────────────────────────────────

FONT_DIR = Path(__file__).resolve().parent / "fonts"

def _load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    names = (
        ["JetBrainsMono-Bold.ttf", "JetBrainsMono-SemiBold.ttf", "JetBrainsMono-Regular.ttf"]
        if bold else
        ["JetBrainsMono-Regular.ttf", "JetBrainsMono-Light.ttf"]
    )
    for name in names:
        path = FONT_DIR / name
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size)
            except Exception:
                continue
    return ImageFont.load_default()

font_shop   = _load_font(FONT_SIZE_SHOP, bold=True)
font_title  = _load_font(FONT_SIZE_TITLE, bold=True)
font_header = _load_font(FONT_SIZE_HEADER, bold=True)
font_cell   = _load_font(FONT_SIZE_CELL)
font_bold   = _load_font(FONT_SIZE_CELL, bold=True)
font_footer = _load_font(FONT_SIZE_FOOTER)
font_bareme = _load_font(FONT_SIZE_BAREME)
font_bareme_bold = _load_font(FONT_SIZE_BAREME, bold=True)
