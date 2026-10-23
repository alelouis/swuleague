// league.js — classement animé en continu : le curseur interpole rangs et totaux
// entre deux étapes jouées, puis se cale sur l'étape la plus proche au relâchement.
(() => {
  const season = JSON.parse(document.getElementById("season-data").textContent);
  const { numSteps, steps, snapshots, colors } = season;
  const STEP_MAX_PTS = 16;   // échelle des mini-barres par étape
  const RIPPLE = 0.3;        // décalage de départ entre le haut et le bas du tableau
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  const slider = document.getElementById("step-slider");
  const ticks = document.getElementById("ticks");
  const board = document.getElementById("leaderboard");
  const playBtn = document.getElementById("play");
  const search = document.getElementById("player-search");
  const resultsBody = document.getElementById("results-body");
  const sourceLink = document.getElementById("source-link");
  const deleteForm = document.getElementById("delete-form");
  const imageLink = document.getElementById("image-link");

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  };
  const PIN_KEY = "swuleague:pin";
  let pinned = store.get(PIN_KEY);

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // Index joueur → ligne pour chaque étape ; une étape « vide » sert de point de départ
  const EMPTY = { rows: [], byName: new Map() };
  const snap = {};
  for (const s of steps) {
    snap[s] = { ...snapshots[s], byName: new Map(snapshots[s].rows.map((r) => [r.joueur, r])) };
  }

  // ── Lignes du classement (une par joueur de la saison, jamais recréées) ──
  const rows = new Map();
  for (const name of Object.keys(colors)) {
    const li = el("li", "lb-row");
    li.style.setProperty("--c", colors[name]);
    const glow = el("span", "lb-glow");
    const rank = el("span", "c-rank");
    const move = el("span", "c-move");
    const nameCell = el("span", "c-name", name);
    const stepsCell = el("span", "c-steps");
    const stepCells = [];
    for (let s = 1; s <= numSteps; s++) {
      const c = el("span", "sc");
      stepsCell.append(c);
      stepCells.push(c);
    }
    const total = el("span", "c-total");
    const diff = el("span", "c-diff");
    li.append(glow, rank, move, nameCell, stepsCell, total, diff);
    li.addEventListener("click", () => setPinned(pinned === name ? null : name));
    board.append(li);
    rows.set(name, { li, glow, rank, move, total, diff, stepCells });
  }
  const datalist = document.getElementById("board-players");
  for (const name of rows.keys()) datalist.append(new Option(name));

  // ── Position continue v → segment [a, b] entre deux étapes jouées ──
  const first = steps[0], last = steps[steps.length - 1];
  function segment(v) {
    if (v <= first - 1) return { a: null, b: first, t: 0 };
    if (v < first) return { a: null, b: first, t: v - (first - 1) };
    if (v >= last) return { a: last, b: last, t: 0 };
    let i = 0;
    while (steps[i + 1] <= v) i++;
    const a = steps[i], b = steps[i + 1];
    return { a, b, t: (v - a) / (b - a) };
  }
  const nearestPlayed = (v) => steps.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), first);

  let value = null;      // position continue affichée
  let shownStep = null;  // étape « discrète » affichée (stats, détail, badges)

  function renderAt(v) {
    value = v;
    const { a, b, t } = segment(v);
    const A = a == null ? EMPTY : snap[a], B = snap[b];
    const maxCount = Math.max(A.rows.length, B.rows.length, 1);
    board.style.setProperty("--count", lerp(A.rows.length, B.rows.length, t));

    for (const [name, row] of rows) {
      const rA = A.byName.get(name), rB = B.byName.get(name);
      const posA = rA ? rA.rank - 1 : A.rows.length;
      const posB = rB ? rB.rank - 1 : B.rows.length;
      // Effet de vague : les lignes du haut partent un peu avant celles du bas
      const k = (Math.min(posA, posB) / maxCount) * RIPPLE;
      const tt = easeInOut(clamp01((t - k) / (1 - RIPPLE)));
      const { li } = row;
      li.style.setProperty("--pos", lerp(posA, posB, tt));
      const op = lerp(rA ? 1 : 0, rB ? 1 : 0, tt);
      li.style.opacity = op;
      li.inert = op < 0.5;
      li.style.zIndex = posB < posA ? 3 : 1;
      row.total.textContent = Math.round(lerp(rA?.total ?? 0, rB?.total ?? 0, tt));

      // Mini-barres : l'étape b se remplit au fil de la progression
      const par = (rB ?? rA)?.par_etape ?? {};
      row.stepCells.forEach((c, i) => {
        const s = i + 1;
        const pts = par[s];
        let fill = 0;
        if (pts != null && steps.includes(s)) {
          if (a != null && s <= a) fill = 1;
          else if (s === b) fill = tt;
        }
        c.style.setProperty("--h", (pts ?? 0) / STEP_MAX_PTS * fill);
      });
    }

    const pct = clamp01((Math.max(v, 1) - 1) / (numSteps - 1)) * 100;
    slider.style.setProperty("--fill", `${pct}%`);
    if (!dragging) slider.value = Math.max(v, 1);

    const step = a == null ? b : t < 0.5 ? a : b;
    if (step !== shownStep) showStep(step);
  }

  // ── Tout ce qui est propre à une étape précise ──
  function showStep(step) {
    const prev = shownStep;
    shownStep = step;
    const S = snap[step];
    const P = prev != null ? snap[prev] : null;

    for (const [name, row] of rows) {
      const r = S.byName.get(name);
      const { li } = row;
      li.dataset.medal = r && r.rank <= 3 ? r.rank : "";
      li.toggleAttribute("data-odd", !!r && r.rank % 2 === 0);
      row.rank.textContent = r ? `${r.rank}.` : "";
      row.move.className = "c-move " + (r?.move || "");
      row.move.textContent = !r ? "" :
        r.move === "up" ? `▲${r.delta}` : r.move === "down" ? `▼${r.delta}` :
        r.move === "new" ? "NEW" : r.move === "same" ? "=" : "";
      row.diff.textContent = r && r.diff > 0 ? `(+${r.diff})` : "";
      row.stepCells.forEach((c, i) => {
        const s = i + 1;
        const played = steps.includes(s) && s <= step;
        const pts = r?.par_etape[s];
        c.textContent = !played || !r ? "" : pts != null ? pts : "-";
        c.classList.toggle("absent", played && pts == null);
        c.classList.toggle("current", s === step);
      });
      // Flash quand le rang change d'une étape à l'autre
      if (P && r && !reducedMotion.matches) {
        const before = P.byName.get(name);
        const kind = !before ? "new" : r.rank < before.rank ? "up" : r.rank > before.rank ? "down" : null;
        if (kind) {
          row.glow.dataset.kind = kind;
          row.glow.getAnimations().forEach((x) => x.cancel());
          row.glow.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 1200, easing: "ease-out" });
        }
      }
    }

    document.querySelectorAll(".lb-header [data-col]").forEach((h) => {
      const s = +h.dataset.col;
      h.classList.toggle("current", s === step);
      h.classList.toggle("future", !(steps.includes(s) && s <= step));
    });
    ticks.querySelectorAll("button").forEach((btn) => {
      const s = +btn.dataset.step;
      btn.classList.toggle("active", s === step);
      btn.classList.toggle("passed", s < step && steps.includes(s));
    });
    slider.setAttribute("aria-valuetext", `Étape ${step} sur ${numSteps}`);

    renderStats(step, S);
    renderDetail(S.detail);
    applyPin();
    bind("step", String(step));
    bind("board-foot", `${plural(S.rows.length, "joueur")}  ·  ${steps.filter((s) => s <= step).length}/${numSteps} étapes jouées`);
  }

  function swap(node, text) {
    if (node.textContent === text) return;
    node.textContent = text;
    if (node.classList.contains("stat-sub")) node.title = text; // texte complet si tronqué
    if (!reducedMotion.matches && node.classList.contains("swap")) {
      node.animate([{ opacity: 0, translate: "0 4px" }, { opacity: 1, translate: "0 0" }], { duration: 260, easing: "ease-out" });
    }
  }
  const bind = (key, text) => document.querySelectorAll(`[data-bind="${key}"]`).forEach((n) => swap(n, text));

  function renderStats(step, S) {
    const [leader, second] = S.rows;
    bind("leader", leader.joueur);
    const lead = second ? leader.total - second.total : null;
    bind("leader-sub", `${leader.total} pts` + (lead == null ? "" : lead === 0 ? ` · à égalité avec ${second.joueur}` : ` · ${lead} d'avance`));

    const best = S.rows.filter((r) => r.move === "up").sort((x, y) => y.delta - x.delta || x.rank - y.rank)[0];
    bind("climber", best ? best.joueur : "—");
    bind("climber-sub", best ? `▲${best.delta} · ${best.rank}e place` : "Première étape jouée");

    const d = S.detail;
    const topPts = Math.max(...d.rows.map((r) => r.total));
    const tops = d.rows.filter((r) => r.total === topPts).map((r) => r.joueur);
    const others = tops.length > 4 ? `${tops.slice(0, 3).join(", ")} +${tops.length - 3}` : tops.join(", ");
    bind("top", d.forfait ? "Jeu libre" : tops.length > 2 ? `${tops.length} joueurs` : tops.join(" & "));
    bind("top-sub", d.forfait ? `${topPts} pts pour tous` : `${topPts} pts${tops.length > 2 ? " · " + others : ""}`);

    const fresh = S.rows.filter((r) => r.move === "new").length;
    bind("players", String(d.rows.length));
    bind("players-sub", d.forfait ? "Jeu libre" : `${plural(d.parties, "partie")}${fresh ? ` · ${plural(fresh, "nouveau")}` : ""}`);
  }

  const staggerFallback = !CSS.supports("animation-delay: calc(sibling-index() * 0.1s)");

  function renderDetail(d) {
    document.querySelectorAll(".results .col-vdn").forEach((th) => (th.hidden = d.forfait));
    const frag = document.createDocumentFragment();
    d.rows.forEach((r, i) => {
      const tr = el("tr", "enter");
      if (staggerFallback) tr.style.setProperty("--sibling-index", i + 1);
      const name = el("td", "player", r.joueur);
      name.style.setProperty("--c", colors[r.joueur]);
      tr.append(el("td", "num rank", `${i + 1}.`), name);
      if (!d.forfait) {
        tr.append(el("td", "num up", r.v), el("td", "num down", r.d), el("td", "num dim", r.n));
      }
      tr.append(
        el("td", "num", `+${r.participation}`),
        el("td", "num", `+${r.victoires}`),
        el("td", "num", `+${r.parties}`),
        el("td", "num" + (r.bonus ? " bonus" : " dim"), `+${r.bonus}`),
        el("td", "num total", r.total),
      );
      frag.append(tr);
    });
    resultsBody.replaceChildren(frag);
    bind("detail-foot", d.forfait
      ? `${plural(d.rows.length, "participant")}  ·  Jeu libre — 11 pts forfait pour chaque participant`
      : `${plural(d.rows.length, "participant")}  ·  ${plural(d.parties, "partie")} jouées`);
    sourceLink.hidden = !d.source;
    if (d.source) sourceLink.href = d.source;
  }

  // ── Animation vers une position ──
  let tween = null;
  function animateTo(target, { duration } = {}) {
    cancelAnimationFrame(tween);
    const from = value;
    const dist = Math.abs(target - from);
    const dur = reducedMotion.matches ? 0 : duration ?? Math.min(350 + dist * 450, 1600);
    return new Promise((resolve) => {
      if (dur === 0 || dist < 1e-3) { renderAt(target); settle(); return resolve(); }
      const start = performance.now();
      const frame = (now) => {
        const p = clamp01((now - start) / dur);
        renderAt(lerp(from, target, p));
        if (p < 1) tween = requestAnimationFrame(frame);
        else { settle(); resolve(); }
      };
      tween = requestAnimationFrame(frame);
    });
  }

  // Une fois calé : URL et liens suivent l'étape affichée
  function settle() {
    const url = new URL(location.href);
    url.searchParams.set("etape", shownStep);
    history.replaceState(null, "", url);
    if (imageLink) imageLink.href = imageLink.dataset.href.replace("/etape/0", `/etape/${shownStep}`);
    if (deleteForm) deleteForm.action = deleteForm.dataset.action.replace("/etape/0/", `/etape/${shownStep}/`);
  }

  // ── Curseur : glisser en continu, se caler au relâchement ──
  let dragging = false;
  slider.addEventListener("pointerdown", () => { dragging = true; stopPlay(); cancelAnimationFrame(tween); });
  slider.addEventListener("input", () => {
    stopPlay();
    cancelAnimationFrame(tween);
    // Au-delà de la dernière étape jouée, le curseur reste en butée
    const v = Math.min(+slider.value, last);
    if (+slider.value > last) slider.value = last;
    renderAt(v);
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    animateTo(nearestPlayed(value), { duration: 320 });
  };
  slider.addEventListener("change", release);
  slider.addEventListener("pointerup", release);
  slider.addEventListener("keydown", (e) => {
    const i = steps.indexOf(shownStep);
    const to = {
      ArrowLeft: steps[i - 1], ArrowDown: steps[i - 1], PageDown: steps[i - 1],
      ArrowRight: steps[i + 1], ArrowUp: steps[i + 1], PageUp: steps[i + 1],
      Home: first, End: last,
    }[e.key];
    if (e.key in { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, PageUp: 1, PageDown: 1, Home: 1, End: 1 }) {
      e.preventDefault();
      if (to != null) { stopPlay(); animateTo(to); }
    }
  });
  ticks.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-step]");
    if (b && !b.disabled) { stopPlay(); animateTo(+b.dataset.step); }
  });

  // ── Lecture : la saison défile en continu, courte pause sur chaque étape ──
  let playToken = 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function stopPlay() {
    playToken++;
    playBtn.classList.remove("playing");
    playBtn.setAttribute("aria-label", "Rejouer la saison");
  }
  async function play() {
    const token = ++playToken;
    playBtn.classList.add("playing");
    playBtn.setAttribute("aria-label", "Mettre en pause");
    if (value >= last) renderAt(first - 1); // repart d'un tableau vide
    while (token === playToken) {
      const next = value < first ? first : steps.find((s) => s > value + 1e-3);
      if (next == null) break;
      await animateTo(next, { duration: 1100 });
      if (token !== playToken) return;
      await wait(500);
    }
    if (token === playToken) stopPlay();
  }
  playBtn.addEventListener("click", () => (playBtn.classList.contains("playing") ? stopPlay() : play()));
  if (steps.length < 2) playBtn.hidden = true;

  // ── Suivi d'un joueur ──
  function applyPin() {
    for (const [name, row] of rows) row.li.toggleAttribute("data-pinned", name === pinned);
  }
  function setPinned(name, { scroll = false } = {}) {
    pinned = name;
    store.set(PIN_KEY, name);
    applyPin();
    const row = name && rows.get(name);
    if (scroll && row && !row.li.inert) {
      row.li.scrollIntoView({ block: "center", behavior: reducedMotion.matches ? "auto" : "smooth" });
    }
  }
  search.addEventListener("change", () => {
    const q = search.value.trim().toLowerCase();
    const name = [...rows.keys()].find((n) => n.toLowerCase() === q) ||
                 [...rows.keys()].find((n) => n.toLowerCase().includes(q));
    if (q && name) setPinned(name, { scroll: true });
    if (!q) setPinned(null);
  });

  deleteForm?.addEventListener("submit", (e) => {
    if (!confirm(`Supprimer l'étape ${shownStep} ? Cette action est définitive.`)) e.preventDefault();
  });

  // ── Démarrage ──
  renderAt(nearestPlayed(+slider.value || last));
  settle();
})();
