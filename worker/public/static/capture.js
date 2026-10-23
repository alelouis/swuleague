// capture.js — image de classement générée dans le navigateur.
// Portage de drawing.py / theme.py (mêmes dimensions, couleurs et polices) sur <canvas>.
(() => {
  const btn = document.getElementById("image-btn");
  if (!btn) return;
  const season = JSON.parse(document.getElementById("season-data").textContent);

  // ── theme.py ──
  const S = 2;
  const C = {
    BG: "#0b0e14", BG_HEADER: "#0f131a", BG_ROW_EVEN: "#0b0e14", BG_ROW_ODD: "#0d1017",
    BG_GOLD: "#1a1810", BG_SILVER: "#12151a", BG_BRONZE: "#1a1410",
    TEXT_PRIMARY: "#bfbdb6", TEXT_HEADER: "#39bae6", TEXT_GOLD: "#e6b450", TEXT_SILVER: "#b0b8bf",
    TEXT_BRONZE: "#ff8f40", TEXT_DIM: "#475266", TEXT_TITLE: "#d2d0cc", TEXT_UP: "#aad94c",
    TEXT_DOWN: "#f07178", TEXT_NEW: "#95e6cb", ACCENT_LINE: "#1c2028", ACCENT_TITLE: "#e6b450",
    DISCLAIMER_TEXT: "#8b3030", DISCLAIMER_BORDER: "#5c2020",
  };
  const SIZE = { SHOP: 36 * S, TITLE: 26 * S, HEADER: 14 * S, CELL: 14 * S, FOOTER: 12 * S, BAREME: 12 * S };
  const ROW_HEIGHT = 32 * S, HEADER_HEIGHT = 36 * S, TITLE_HEIGHT = 52 * S, FOOTER_HEIGHT = 34 * S;
  const PADDING_X = 20 * S, PADDING_Y = 14 * S, COL_GAP = 10 * S, PANEL_GAP = 16 * S;
  const BAREME_HEIGHT = 28 * S, BAREME_PADDING = 10 * S;
  const DISC_PAD_X = 16 * S, DISC_PAD_Y = 8 * S, DISC_RADIUS = 8 * S;
  const DISCLAIMER_HEIGHT = SIZE.BAREME + DISC_PAD_Y * 2 + BAREME_PADDING * 2;
  const DISCLAIMER = "Ce classement est indicatif et ne fait pas foi. Seul le classement officiel tenu par la boutique est valable. Ce document ne remplace pas les feuilles d'émargement.";
  const BAREME = "Participation: +2 pts   ·   Victoires: +2 pts/V (max 6)   ·   Parties: +1 pt/partie (max 3)   ·   Recrutement: +5 pts/recrue";
  const FAMILY = '"JetBrains Mono", monospace';
  const F = {
    shop: `700 ${SIZE.SHOP}px ${FAMILY}`, title: `700 ${SIZE.TITLE}px ${FAMILY}`, header: `700 ${SIZE.HEADER}px ${FAMILY}`,
    cell: `400 ${SIZE.CELL}px ${FAMILY}`, bold: `700 ${SIZE.CELL}px ${FAMILY}`,
    footer: `400 ${SIZE.FOOTER}px ${FAMILY}`, bareme: `400 ${SIZE.BAREME}px ${FAMILY}`,
  };

  let g; // contexte 2D
  const width = (text, font) => { g.font = font; return g.measureText(text).width; };
  // Pillow place le haut de la ligne (ascendante) en y ; le canvas attend la ligne de base
  function text(str, x, y, color, font) {
    g.font = font;
    g.fillStyle = color;
    g.fillText(str, x, y + g.measureText(str).fontBoundingBoxAscent);
  }
  const rect = (x0, y0, x1, y1, color) => { g.fillStyle = color; g.fillRect(x0, y0, x1 - x0, y1 - y0); };
  const hline = (x0, x1, y, color, w = 1) => rect(x0, y - (w > 1 ? w / 2 : 0), x1, y + (w > 1 ? w / 2 : 1), color);

  // ── draw_panel ──
  function colWidths(headers, rows, minWidths) {
    const w = headers.map((h) => width(h, F.header) + COL_GAP * 2);
    for (const row of rows) row.forEach((cell, i) => (w[i] = Math.max(w[i], width(String(cell), F.bold) + COL_GAP * 2)));
    return w.map((v, i) => Math.max(v, minWidths[i] ?? 0));
  }
  function panelSize(p) {
    const widths = colWidths(p.headers, p.rows, p.minWidths);
    return {
      w: Math.max(widths.reduce((a, b) => a + b, 0) + PADDING_X * 2, width(p.title, F.title) + PADDING_X * 4),
      h: PADDING_Y + TITLE_HEIGHT + HEADER_HEIGHT + p.rows.length * ROW_HEIGHT + (p.footer ? FOOTER_HEIGHT : 0) + PADDING_Y,
    };
  }
  function drawPanel(ox, oy, p) {
    const widths = colWidths(p.headers, p.rows, p.minWidths);
    const pw = panelSize(p).w;
    const extra = pw - PADDING_X * 2 - widths.reduce((a, b) => a + b, 0);
    if (extra > 0) {
      const per = Math.floor(extra / widths.length), rem = extra % widths.length;
      widths.forEach((_, i) => (widths[i] += per + (i < rem ? 1 : 0)));
    }
    const dimCols = p.dimHeaderCols ?? new Set(), hlCols = p.highlightHeaderCols ?? new Set();
    const cellX = (x, cw, w, align) => (align === "right" ? x + cw - w - COL_GAP : align === "center" ? x + (cw - w) / 2 : x + COL_GAP);

    let y = oy + PADDING_Y;
    text(p.title, ox + (pw - width(p.title, F.title)) / 2, y + 6 * S, C.TEXT_TITLE, F.title);
    y += TITLE_HEIGHT;
    hline(ox + PADDING_X, ox + pw - PADDING_X, y - 3 * S, C.ACCENT_TITLE, S);

    rect(ox + PADDING_X, y, ox + pw - PADDING_X, y + HEADER_HEIGHT, C.BG_HEADER);
    let x = ox + PADDING_X;
    const lineH = SIZE.HEADER + 4 * S;
    p.headers.forEach((h, i) => {
      const color = dimCols.has(i) ? C.TEXT_DIM : hlCols.has(i) ? C.TEXT_TITLE : C.TEXT_HEADER;
      text(h, cellX(x, widths[i], width(h, F.header), p.aligns[i]), y + (HEADER_HEIGHT - lineH) / 2, color, F.header);
      x += widths[i];
    });
    y += HEADER_HEIGHT;
    hline(ox + PADDING_X, ox + pw - PADDING_X, y, C.ACCENT_LINE);

    p.rows.forEach((row, ri) => {
      const hl = p.highlights[ri] ?? {};
      rect(ox + PADDING_X, y, ox + pw - PADDING_X, y + ROW_HEIGHT, hl.rowBg ?? (ri % 2 === 0 ? C.BG_ROW_EVEN : C.BG_ROW_ODD));
      let x = ox + PADDING_X;
      row.forEach((cell, ci) => {
        let color = C.TEXT_PRIMARY, font = F.cell;
        if (dimCols.has(ci)) color = C.TEXT_DIM;
        else if (hl.colorOnly && ci in hl.colorOnly) color = hl.colorOnly[ci];
        else if (hl.color && ci in hl.color) { color = hl.color[ci]; font = F.bold; }
        else if (hl.bold?.has(ci)) font = F.bold;
        else if (hl.dim?.has(ci)) color = C.TEXT_DIM;
        const s = String(cell);
        text(s, cellX(x, widths[ci], width(s, font), p.aligns[ci]), y + (ROW_HEIGHT - SIZE.CELL) / 2, color, font);
        x += widths[ci];
      });
      hline(ox + PADDING_X, ox + pw - PADDING_X, y + ROW_HEIGHT, C.ACCENT_LINE);
      y += ROW_HEIGHT;
    });

    if (p.footer) text(p.footer, ox + (pw - width(p.footer, F.footer)) / 2, y + 4 * S, C.TEXT_DIM, F.footer);
  }

  // ── _ranking_table_data ──
  function rankingPanel(step) {
    const snap = season.snapshots[step];
    const played = new Set(season.steps.filter((s) => s <= step));
    const all = Array.from({ length: season.numSteps }, (_, i) => i + 1);
    const lastTotal = 3 + all.length, lastDiff = lastTotal + 1;
    const highlightCol = played.has(step) ? 3 + all.indexOf(step) : null;
    const hasPrev = season.steps.some((s) => s < step);
    const rows = [], highlights = [];
    for (const p of snap.rows) {
      let move = "", moveColor = C.TEXT_DIM;
      if (hasPrev) {
        if (p.move === "new") { move = "NEW"; moveColor = C.TEXT_NEW; }
        else if (p.move === "up") { move = `▲${p.delta}`; moveColor = C.TEXT_UP; }
        else if (p.move === "down") { move = `▼${p.delta}`; moveColor = C.TEXT_DOWN; }
        else move = "=";
      }
      const diff = p.diff > 0 ? `(+${p.diff})` : "";
      const scores = all.map((s) => (!played.has(s) ? "" : p.par_etape[s] != null ? String(p.par_etape[s]) : "-"));
      rows.push([`${p.rank}.`, move, p.joueur, ...scores, String(p.total), diff]);

      const hl = { bold: new Set([lastTotal]), color: { 1: moveColor, 2: season.colors[p.joueur] }, dim: new Set() };
      if (diff) hl.colorOnly = { [lastDiff]: C.TEXT_UP }; else hl.dim.add(lastDiff);
      const medal = [[C.TEXT_GOLD, C.BG_GOLD], [C.TEXT_SILVER, C.BG_SILVER], [C.TEXT_BRONZE, C.BG_BRONZE]][p.rank - 1];
      if (medal) { hl.color[0] = medal[0]; hl.color[lastTotal] = medal[0]; hl.rowBg = medal[1]; }
      all.forEach((s, i) => { if (played.has(s) && p.par_etape[s] == null) hl.dim.add(3 + i); });
      if (highlightCol != null && !hl.dim.has(highlightCol) && !(highlightCol in hl.color)) hl.color[highlightCol] = C.TEXT_HEADER;
      highlights.push(hl);
    }
    return {
      title: "CLASSEMENT GÉNÉRAL",
      headers: ["#", "", "Joueur", ...all.map((s) => `E${s}`), "TOTAL", ""],
      aligns: ["right", "left", "left", ...all.map(() => "right"), "right", "left"],
      minWidths: [50 * S, 46 * S, 0, ...all.map(() => 42 * S), 56 * S, 60 * S],
      rows, highlights,
      footer: `${snap.rows.length} joueurs  ·  ${played.size}/${season.numSteps} étapes jouées`,
      dimHeaderCols: new Set(all.map((s, i) => (played.has(s) ? null : 3 + i)).filter((v) => v != null)),
      highlightHeaderCols: new Set(highlightCol != null ? [highlightCol] : []),
    };
  }

  // ── _step_table_data ──
  function stepPanel(step) {
    const d = season.snapshots[step].detail;
    const rows = [], highlights = [];
    d.rows.forEach((r, i) => {
      rows.push([`${i + 1}.`, r.joueur,
        d.forfait ? "-" : String(r.v), d.forfait ? "-" : String(r.d), d.forfait ? "-" : String(r.n),
        `+${r.participation}`, `+${r.victoires}`, `+${r.parties}`, `+${r.bonus}`, String(r.total)]);
      const hl = { bold: new Set([9]), color: { 1: season.colors[r.joueur] }, dim: new Set() };
      if (d.forfait) [2, 3, 4].forEach((c) => hl.dim.add(c));
      else hl.colorOnly = { 2: C.TEXT_UP, 3: C.TEXT_DOWN, 4: C.TEXT_DIM };
      if (!r.bonus) hl.dim.add(8);
      highlights.push(hl);
    });
    return {
      title: `ÉTAPE ${step} / ${season.numSteps}`,
      headers: ["#", "Joueur", "V", "D", "N", "Particip.", "Victoires", "Parties", "Recrutem.", "TOTAL"],
      aligns: ["right", "left", "right", "right", "right", "right", "right", "right", "right", "right"],
      minWidths: [30, 90, 28, 28, 28, 42, 42, 42, 42, 48].map((v) => v * S),
      rows, highlights,
      footer: d.forfait
        ? `${d.rows.length} participants  ·  Jeu libre — 11 pts forfait pour chaque participant`
        : `${d.rows.length} participants  ·  ${d.parties} parties jouées`,
    };
  }

  // ── generate_step_image ──
  function render(step) {
    const canvas = document.createElement("canvas");
    g = canvas.getContext("2d");
    const ranking = rankingPanel(step), detail = stepPanel(step);
    const r = panelSize(ranking), s = panelSize(detail);
    const label = `${btn.dataset.shop.toUpperCase()} — ${btn.dataset.set.toUpperCase()}`;
    const shopHeaderH = SIZE.SHOP + PADDING_Y * 3;
    const W = Math.ceil(Math.max(PADDING_X + r.w + PANEL_GAP + s.w + PADDING_X, width(label, F.shop) + PADDING_X * 4));
    const panelsH = Math.max(r.h, s.h) + PADDING_Y * 2 + shopHeaderH;
    const baremeH = BAREME_PADDING * 2 + BAREME_HEIGHT + 4 * S + BAREME_PADDING;
    canvas.width = W;
    canvas.height = panelsH + baremeH + DISCLAIMER_HEIGHT;
    g = canvas.getContext("2d");
    rect(0, 0, canvas.width, canvas.height, C.BG);

    text(label, (W - width(label, F.shop)) / 2, PADDING_Y + 4 * S, C.ACCENT_TITLE, F.shop);
    const now = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }).format(new Date());
    const date = `Généré le ${now}`;
    text(date, W - width(date, F.footer) - PADDING_X, PADDING_Y + 4 * S, C.TEXT_DIM, F.footer);

    const panelsY = PADDING_Y + shopHeaderH;
    drawPanel(PADDING_X, panelsY, ranking);
    drawPanel(PADDING_X + r.w + PANEL_GAP, panelsY, detail);
    const sepX = PADDING_X + r.w + PANEL_GAP / 2;
    rect(sepX - S / 2, panelsY + PADDING_Y, sepX + S / 2, panelsH - PADDING_Y * 2, C.ACCENT_LINE);

    // Barème
    let y = panelsH + BAREME_PADDING;
    hline(PADDING_X, W - PADDING_X, y, C.ACCENT_TITLE, S);
    y += BAREME_PADDING + 4 * S;
    text(BAREME, (W - width(BAREME, F.bareme)) / 2, y, C.TEXT_HEADER, F.bareme);
    const baremeBlock = BAREME_PADDING * 2 + 4 * S + BAREME_HEIGHT;

    // Avertissement
    const boxW = width(DISCLAIMER, F.bareme) + DISC_PAD_X * 2, boxH = SIZE.BAREME + DISC_PAD_Y * 2;
    const bx = (W - boxW) / 2, by = panelsH + baremeBlock + BAREME_PADDING;
    g.strokeStyle = C.DISCLAIMER_BORDER;
    g.lineWidth = S;
    g.beginPath();
    g.roundRect(bx, by, boxW, boxH, DISC_RADIUS);
    g.stroke();
    text(DISCLAIMER, bx + DISC_PAD_X, by + DISC_PAD_Y, C.DISCLAIMER_TEXT, F.bareme);
    return canvas;
  }

  async function download() {
    const step = Number(new URL(location.href).searchParams.get("etape")) || season.steps.at(-1);
    btn.disabled = true;
    try {
      await Promise.all(Object.values(F).map((f) => document.fonts.load(f)));
      const canvas = render(step);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", 0.9));
      const ext = blob.type === "image/webp" ? "webp" : "png"; // Safari n'encode pas le WebP
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${btn.dataset.file}_etape_${String(step).padStart(2, "0")}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } finally {
      btn.disabled = false;
    }
  }
  btn.addEventListener("click", download);
  window.swuleagueCapture = render; // utile pour vérifier le rendu
})();
