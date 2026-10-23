/** @jsxImportSource hono/jsx */
// Pages HTML (rendu serveur) — même balisage que les gabarits Jinja d'origine.

import type { Child, FC } from "hono/jsx";
import { raw } from "hono/html";
import { avatarUrl, canEditShop, isOwner, type User, type UserRow } from "./auth.ts";
import type { Config } from "./db.ts";
import type { Tournament } from "./melee.ts";
import {
  NUM_STEPS, PTS_FORFAIT_MAX, PTS_PARTICIPATION, PTS_PARTIE, PTS_PARTIE_MAX, PTS_RECRUTEMENT,
  PTS_VICTOIRE, PTS_VICTOIRE_MAX, SEUIL_RECRUTEMENT, playerColor, type Player,
} from "./scoring.ts";

export interface Ctx {
  user: User | null;
  config: Config;
  flashes: [string, string][];
  path: string;
}

const DISCLAIMER = "Ce classement est indicatif et ne fait pas foi. Seul le classement officiel tenu par la boutique est valable. Ce document ne remplace pas les feuilles d'émargement.";
const BAREME = [
  ["Participation", `+${PTS_PARTICIPATION} pts`],
  ["Victoires", `+${PTS_VICTOIRE} pts/V (max ${PTS_VICTOIRE_MAX})`],
  ["Parties", `+${PTS_PARTIE} pt/partie (max ${PTS_PARTIE_MAX})`],
  ["Recrutement", `+${PTS_RECRUTEMENT} pts/recrue (${SEUIL_RECRUTEMENT} pts)`],
  ["Jeu libre", `${PTS_FORFAIT_MAX} pts forfait`],
];
const THEME_INIT = `try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}`;
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** JSON sûr à l'intérieur d'une balise <script> (comme le filtre tojson de Jinja). */
export const scriptJson = (v: unknown) =>
  raw(JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028|\u2029/g, ""));

// ── Gabarit commun ──────────────────────────────────────────────────────────

export const Layout: FC<{ ctx: Ctx; title: string; nav?: Child; children?: Child }> = ({ ctx, title, nav, children }) => (
  <html lang="fr">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="dark light" />
      {/* Thème appliqué avant le premier rendu : choix enregistré, sinon celui du système */}
      <script>{raw(THEME_INIT)}</script>
      <title>{title}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Orbitron:wght@600;800&display=swap" />
      <link rel="stylesheet" href="/static/style.css" />
      <link rel="icon" href="/static/favicon.svg" type="image/svg+xml" />
      <script src="/static/theme.js" defer></script>
    </head>
    <body>
      <header class="topbar"><div class="topbar-inner">
        <span class="header-logo" aria-hidden="true" />
        <a class="brand" href="/"><img src="/static/favicon.svg" alt="" />SWU<span>league</span></a>
        <nav>
          {nav}
          {isOwner(ctx.user) && <a href="/gestion" aria-current={ctx.path === "/gestion" ? "page" : undefined}>Gestion</a>}
          {ctx.user ? (
            <span class="account">
              {ctx.user.role === "pending" && <span class="muted">Accès en attente</span>}
              <span class="who">{ctx.user.display}</span>
              <form method="post" action="/logout" class="inline"><button class="link">Déconnexion</button></form>
            </span>
          ) : (
            <a href={`/login?next=${encodeURIComponent(ctx.path)}`}>Organisateurs</a>
          )}
          <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Changer de thème" title="Changer de thème">
            <svg class="i-sun" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
            <svg class="i-moon" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
          </button>
        </nav>
      </div></header>
      <main>
        {ctx.flashes.map(([kind, msg]) => <div class={`flash flash-${kind}`} role="status">{msg}</div>)}
        {children}
      </main>
      <footer>
        <ul class="bareme">{BAREME.map(([l, p]) => <li><b>{l}</b> {p}</li>)}</ul>
        <p class="disclaimer">{DISCLAIMER}</p>
      </footer>
    </body>
  </html>
);

const SetNav: FC<{ ctx: Ctx; setId: string }> = ({ ctx, setId }) => (
  <>{ctx.config.sets.size > 1 && [...ctx.config.sets].map(([sid, label]) => (
    <a href={`/${sid}/`} aria-current={sid === setId ? "page" : undefined}>{label}</a>
  ))}</>
);

// ── Accueil d'un set ────────────────────────────────────────────────────────

export const SetPage: FC<{ ctx: Ctx; setId: string; leagues: { slug: string; name: string; steps: number[]; top: Player[] }[] }> = ({ ctx, setId, leagues }) => (
  <Layout ctx={ctx} title={`${ctx.config.sets.get(setId)} — Ligues SWU`} nav={<SetNav ctx={ctx} setId={setId} />}>
    <header class="hero">
      <p class="eyebrow">Star Wars Unlimited{setId !== ctx.config.currentSet && " · set terminé"}</p>
      <h1>Ligues locales <span class="sep">—</span> {ctx.config.sets.get(setId)}</h1>
    </header>
    <div class="cards">
      {leagues.map((l) => (
        <a class="card" href={`/${setId}/${l.slug}/`}>
          <h2>{l.name}</h2>
          <div class="meta">
            <span>{l.steps.length}/{NUM_STEPS} étapes jouées</span>
            <span class="progress" aria-hidden="true">{range(1, NUM_STEPS).map((s) => <i class={l.steps.includes(s) ? "on" : ""} />)}</span>
          </div>
          {l.top.length ? (
            <ol class="podium">
              {l.top.map((p, i) => (
                <li class={`rank-${i + 1}`} style={`--c: ${playerColor(p.joueur)}`}>
                  <span class="medal">{i + 1}.</span><span class="n">{p.joueur}</span><b>{p.total}</b>
                </li>
              ))}
            </ol>
          ) : <p class="empty-note">La saison n'a pas encore commencé.</p>}
        </a>
      ))}
    </div>
  </Layout>
);

// ── Page d'une ligue ────────────────────────────────────────────────────────

interface Recruit { recrue: string; recruteur: string; points: number; bonus_step: number | null }

export const ShopPage: FC<{
  ctx: Ctx; setId: string; shop: string; steps: number[]; current: number | null;
  season: unknown; recruitments: Recruit[]; players: string[];
}> = ({ ctx, setId, shop, steps, current, season, recruitments, players }) => {
  const shopName = ctx.config.shops.get(shop)!;
  const setName = ctx.config.sets.get(setId)!;
  const base = `/${setId}/${shop}`;
  const edit = canEditShop(ctx.user, shop);
  return (
    <Layout ctx={ctx} title={`${shopName} — ${setName}`} nav={<a href={`/${setId}/`}>← Toutes les ligues</a>}>
      <header class="hero">
        <h1>{shopName} <span class="sep">—</span> {setName}</h1>
        <div class="actions">
          {steps.length > 0 && (
            <button class="btn ghost" id="image-btn" type="button" data-shop={shopName} data-set={setName} data-file={`${setId}_${shop}`}>
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" /></svg>
              Image étape <span data-bind="step">{current}</span>
            </button>
          )}
          {edit && (
            <a class="btn primary" href={`${base}/import`}>
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
              Importer une étape
            </a>
          )}
        </div>
      </header>

      {!steps.length ? (
        <div class="empty">
          <p class="empty-title">La saison n'a pas encore commencé</p>
          <p class="muted">Aucune étape enregistrée pour cette ligue.</p>
          {edit && <a class="btn primary" href={`${base}/import`}>Importer la première étape</a>}
        </div>
      ) : (
        <>
          <section class="timeline" aria-label="Choix de l'étape">
            <div class="timeline-head">
              <button class="btn square" id="play" type="button" aria-label="Rejouer la saison" title="Rejouer la saison">
                <svg class="i-play" aria-hidden="true" viewBox="0 0 24 24"><path d="M7 4v16l13-8z" /></svg>
                <svg class="i-pause" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
              </button>
              <p class="timeline-title">Étape <b data-bind="step">{current}</b> / {NUM_STEPS}</p>
            </div>
            <div class="slider-wrap">
              <input type="range" id="step-slider" min="1" max={NUM_STEPS} step="0.01" value={current ?? 1}
                aria-label="Étape" aria-valuetext={`Étape ${current} sur ${NUM_STEPS}`} />
              <div class="ticks" id="ticks">
                {range(1, NUM_STEPS).map((s) => (
                  <button type="button" data-step={s} disabled={!steps.includes(s)} tabindex={-1}>E{s}</button>
                ))}
              </div>
            </div>
          </section>

          <section class="stats" aria-live="polite">
            {[["leader", "En tête", "stat-leader"], ["climber", "Meilleure remontée", ""], ["top", "Top score de l'étape", ""], ["players", "Participants", ""]].map(([k, label, cls]) => (
              <article class={`stat ${cls}`}>
                <p class="stat-label">{label}</p>
                <p class="stat-value swap" data-bind={k}>—</p>
                <p class="stat-sub" data-bind={`${k}-sub`}></p>
              </article>
            ))}
          </section>

          <div class="columns">
            <section class="panel board" aria-labelledby="board-title">
              <h2 class="panel-title" id="board-title">Classement général</h2>
              <div class="panel-tools">
                <label class="search">
                  <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
                  <input type="search" id="player-search" placeholder="Suivre un joueur…" list="board-players" autocomplete="off" aria-label="Suivre un joueur" />
                  <datalist id="board-players"></datalist>
                </label>
              </div>
              <div class="lb-header" aria-hidden="true">
                <span class="c-rank">#</span><span class="c-move"></span><span class="c-name">Joueur</span>
                <span class="c-steps">{range(1, NUM_STEPS).map((s) => <span data-col={s}>E{s}</span>)}</span>
                <span class="c-total">TOTAL</span><span class="c-diff"></span>
              </div>
              <ol class="lb" id="leaderboard" aria-label="Classement"></ol>
              <p class="foot" data-bind="board-foot"></p>
              <noscript><p class="muted">Activez JavaScript pour afficher le classement animé.</p></noscript>
            </section>

            <section class="panel detail" aria-labelledby="detail-title">
              <h2 class="panel-title" id="detail-title">Étape <span data-bind="step">{current}</span> / {NUM_STEPS}</h2>
              <div class="panel-tools">
                <a id="source-link" href="#" target="_blank" rel="noopener" hidden>Voir sur melee.gg ↗</a>
                {edit && (
                  <form method="post" id="delete-form" class="inline" action={`${base}/etape/${current}/delete`} data-action={`${base}/etape/0/delete`}>
                    <button class="btn danger small">Supprimer l'étape</button>
                  </form>
                )}
              </div>
              <div class="scroll">
                <table class="results">
                  <thead>
                    <tr>
                      <th class="num">#</th><th>Joueur</th>
                      <th class="num col-vdn">V</th><th class="num col-vdn">D</th><th class="num col-vdn">N</th>
                      <th class="num">Particip.</th><th class="num">Victoires</th><th class="num">Parties</th>
                      <th class="num">Recrutem.</th><th class="num">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody id="results-body"></tbody>
                </table>
              </div>
              <p class="foot" data-bind="detail-foot"></p>
            </section>
          </div>

          <script type="application/json" id="season-data">{scriptJson(season)}</script>
          <script src="/static/league.js" defer></script>
          <script src="/static/capture.js" defer></script>
        </>
      )}

      <section class="panel" id="recrutement" aria-labelledby="recrut-title">
        <h2 class="panel-title" id="recrut-title">Recrutement <small>+5 pts au recruteur quand la recrue atteint {SEUIL_RECRUTEMENT} pts</small></h2>
        {recruitments.length ? (
          <ul class="recruits">
            {recruitments.map((r) => {
              const v = Math.min(r.points, SEUIL_RECRUTEMENT);
              return (
                <li class="recruit">
                  <div class="recruit-names">
                    <span class="player" style={`--c: ${playerColor(r.recrue)}`}>{r.recrue}</span>
                    <span class="muted">recruté·e par</span>
                    <span class="player" style={`--c: ${playerColor(r.recruteur)}`}>{r.recruteur}</span>
                  </div>
                  <div class="meter" role="meter" aria-valuemin="0" aria-valuemax={SEUIL_RECRUTEMENT} aria-valuenow={v}
                    aria-label={`Points de ${r.recrue}`} style={`--v: ${v / SEUIL_RECRUTEMENT}`}><span></span></div>
                  <div class="recruit-status">
                    {r.bonus_step ? <span class="chip up">✓ +5 à l'étape {r.bonus_step}</span> : <span class="chip">{r.points}/{SEUIL_RECRUTEMENT} pts</span>}
                    {edit && (
                      <form method="post" action={`${base}/recrutement/delete`} class="inline">
                        <input type="hidden" name="recrue" value={r.recrue} />
                        <button class="icon-btn" aria-label={`Retirer le recrutement de ${r.recrue}`} title="Retirer">×</button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <p class="foot">Aucun recrutement enregistré.</p>}
        {edit && (
          <form method="post" action={`${base}/recrutement`} class="row-form">
            <label>Recrue <input name="recrue" list="players" required autocomplete="off" /></label>
            <label>Recruteur <input name="recruteur" list="players" required autocomplete="off" /></label>
            <button class="btn">Ajouter</button>
            <datalist id="players">{players.map((p) => <option value={p} />)}</datalist>
          </form>
        )}
      </section>
    </Layout>
  );
};

// ── Import d'une étape ──────────────────────────────────────────────────────

export interface ImportForm { url: string; paste: string; step: number; forfait: boolean }
export interface PreviewRow { joueur: string; victoires: number; defaites: number; nuls: number; canon: string; known: boolean; points: number }

export const ImportPage: FC<{
  ctx: Ctx; setId: string; shop: string; steps: number[]; form: ImportForm;
  preview?: PreviewRow[]; source?: string | null; tournament?: Tournament;
}> = ({ ctx, setId, shop, steps, form, preview, source, tournament }) => {
  const shopName = ctx.config.shops.get(shop)!;
  return (
    <Layout ctx={ctx} title={`Importer une étape — ${shopName}`} nav={<a href={`/${setId}/${shop}/`}>← {shopName}</a>}>
      <header class="hero">
        <p class="eyebrow">{shopName} · {ctx.config.sets.get(setId)}</p>
        <h1>Importer une étape</h1>
      </header>
      <form method="post" class="form-panel import-form">
        <input type="hidden" name="action" value="preview" />
        <label class="block">
          Lien du tournoi melee.gg
          <input type="url" name="url" value={form.url} placeholder="https://melee.gg/Tournament/View/123456" autofocus />
        </label>
        <details open={!!form.paste && !form.url}>
          <summary>…ou coller le classement copié depuis melee.gg</summary>
          <textarea name="paste" rows={8} placeholder="Rang	Joueur	Score…">{form.paste}</textarea>
        </details>
        <div class="row-form">
          <label>Étape
            <select name="step">
              {range(1, NUM_STEPS).map((s) => (
                <option value={s} selected={s === form.step}>Étape {s}{steps.includes(s) ? " (remplace l'existante)" : ""}</option>
              ))}
            </select>
          </label>
          <label class="check"><input type="checkbox" name="forfait" checked={form.forfait} /> Jeu libre (11 pts forfait)</label>
          <button class="btn primary">Prévisualiser</button>
        </div>
      </form>

      {preview && (
        <form method="post" class="panel">
          <input type="hidden" name="action" value="save" />
          <input type="hidden" name="url" value={form.url} />
          <input type="hidden" name="step" value={form.step} />
          <input type="hidden" name="source" value={source ?? ""} />
          {form.forfait && <input type="hidden" name="forfait" value="on" />}
          <h2 class="panel-title">Aperçu — étape {form.step}
            {tournament && <small><a href={tournament.url} target="_blank" rel="noopener">{tournament.name}</a> · {tournament.round}</small>}
          </h2>
          {steps.includes(form.step) && <p class="flash flash-error">L'étape {form.step} existe déjà : elle sera remplacée.</p>}
          <p class="muted">Corrigez un pseudo si besoin, décochez les joueurs à exclure. Les joueurs marqués <span class="badge">nouveau</span> n'ont encore joué aucune étape de cette ligue — vérifiez qu'il ne s'agit pas d'un changement de pseudo.</p>
          <div class="scroll">
            <table class="preview">
              <thead><tr><th></th><th>Joueur</th><th class="num">V</th><th class="num">D</th><th class="num">N</th><th class="num">Pts</th></tr></thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr>
                    <td><input type="checkbox" name="keep" value={i} checked aria-label={`Inclure ${r.joueur}`} /></td>
                    <td>
                      <input name={`joueur-${i}`} value={r.joueur} class="name" aria-label="Pseudo" />
                      {r.canon !== r.joueur && <span class="muted"> → {r.canon}</span>}
                      {!r.known && <span class="badge">nouveau</span>}
                    </td>
                    <td class="num"><input type="number" min="0" name={`victoires-${i}`} value={r.victoires} aria-label="Victoires" /></td>
                    <td class="num"><input type="number" min="0" name={`defaites-${i}`} value={r.defaites} aria-label="Défaites" /></td>
                    <td class="num"><input type="number" min="0" name={`nuls-${i}`} value={r.nuls} aria-label="Nuls" /></td>
                    <td class="num total">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div class="row-form end">
            <button class="btn primary">Enregistrer l'étape {form.step} ({preview.length} joueurs)</button>
          </div>
        </form>
      )}
    </Layout>
  );
};

// ── Connexion ───────────────────────────────────────────────────────────────

export const LoginPage: FC<{ ctx: Ctx; next: string; dev: boolean }> = ({ ctx, next, dev }) => (
  <Layout ctx={ctx} title="Connexion — Ligues SWU">
    <div class="form-panel narrow">
      <h2 class="panel-title">Espace organisateurs</h2>
      <p class="muted">Les joueurs n'ont pas besoin de compte. Les organisateurs se connectent avec Discord, puis l'administrateur leur donne accès à leurs boutiques.</p>
      {ctx.user?.role === "pending" && <p class="flash flash-success">Votre demande d'accès est enregistrée : l'administrateur doit la valider.</p>}
      {ctx.user?.role === "refused" && <p class="flash flash-error">Votre demande d'accès a été refusée.</p>}
      <a class="btn primary discord" href={`/auth/discord?next=${encodeURIComponent(next)}`}>Se connecter avec Discord</a>
      {dev && (
        <p class="hint">Développement local :{" "}
          <a href={`/auth/dev?as=owner&next=${encodeURIComponent(next)}`}>propriétaire</a> ·{" "}
          <a href={`/auth/dev?as=admin:all4play&next=${encodeURIComponent(next)}`}>admin All4Play</a> ·{" "}
          <a href={`/auth/dev?as=pending&next=${encodeURIComponent(next)}`}>en attente</a>
        </p>
      )}
    </div>
  </Layout>
);

export const MessagePage: FC<{ ctx: Ctx; title: string; message: string }> = ({ ctx, title, message }) => (
  <Layout ctx={ctx} title={title}>
    <div class="empty"><p class="empty-title">{title}</p><p class="muted">{message}</p><a class="btn" href="/">Retour à l'accueil</a></div>
  </Layout>
);

// ── Gestion (propriétaire) ──────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = { pending: "En attente", admin: "Organisateur", owner: "Administrateur", refused: "Refusé" };

export const ManagePage: FC<{
  ctx: Ctx; counts: Map<string, number>; users: UserRow[]; aliases: Record<string, string>; ownerId: string;
}> = ({ ctx, counts, users, aliases, ownerId }) => {
  const { sets, shops, currentSet } = ctx.config;
  const setTotal = (sid: string) => [...shops.keys()].reduce((n, s) => n + (counts.get(`${sid}/${s}`) ?? 0), 0);
  const pending = users.filter((u) => u.role === "pending").length;
  return (
    <Layout ctx={ctx} title="Gestion des ligues — Ligues SWU">
      <header class="hero">
        <p class="eyebrow">Administration</p>
        <h1>Gestion des ligues</h1>
      </header>

      <section class="panel" id="comptes" aria-labelledby="users-title">
        <h2 class="panel-title" id="users-title">Organisateurs
          <small>{pending ? `${pending} demande${pending > 1 ? "s" : ""} en attente · ` : ""}Chaque organisateur se connecte une fois avec Discord, puis apparaît ici.</small>
        </h2>
        {users.length ? (
          <div class="scroll">
            <table class="manage users">
              <thead><tr><th>Compte</th><th>Rôle</th><th>Boutiques</th><th></th></tr></thead>
              <tbody>
                {users.map((u) => {
                  const fixed = u.discord_id === ownerId;
                  const formId = `user-${u.discord_id}`;
                  return (
                    <tr class={u.role === "pending" ? "is-pending" : ""}>
                      <td>
                        <span class="user">
                          {avatarUrl(u) ? <img src={avatarUrl(u)!} alt="" width="24" height="24" /> : <span class="avatar-ph" aria-hidden="true" />}
                          <span><b>{u.display}</b> <span class="dim">@{u.username}</span></span>
                        </span>
                      </td>
                      <td>
                        <select name="role" form={formId} disabled={fixed} aria-label={`Rôle de ${u.display}`}>
                          {Object.entries(ROLE_LABELS).map(([r, label]) => <option value={r} selected={u.role === r}>{label}</option>)}
                        </select>
                      </td>
                      <td>
                        <span class="shop-checks">
                          {[...shops].map(([slug, name]) => (
                            <label class="check"><input type="checkbox" name="shops" value={slug} form={formId} checked={u.shops.includes(slug)} disabled={fixed} /> {name}</label>
                          ))}
                        </span>
                      </td>
                      <td class="num">
                        {fixed ? <span class="tag">PROPRIÉTAIRE</span> : (
                          <form method="post" action={`/gestion/users/${encodeURIComponent(u.discord_id)}`} id={formId} class="inline">
                            <button class="btn small">Enregistrer</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p class="foot">Aucun compte pour l'instant.</p>}
        <p class="hint">« Organisateur » : import d'étapes et recrutement pour les boutiques cochées. « Administrateur » : tout, y compris cette page.</p>
      </section>

      <div class="columns">
        <section class="panel" aria-labelledby="sets-title">
          <h2 class="panel-title" id="sets-title">Sets <small>Le set en cours est celui affiché par défaut.</small></h2>
          <table class="manage">
            <thead><tr><th>Nom</th><th>Identifiant</th><th class="num">Étapes</th><th></th></tr></thead>
            <tbody>
              {[...sets].map(([sid, label]) => (
                <tr class={sid === currentSet ? "is-current" : ""}>
                  <td>
                    <form method="post" action={`/gestion/set/${sid}/rename`} class="rename">
                      <input name="name" value={label} required aria-label={`Nom du set ${sid}`} />
                      <button class="btn small" title="Renommer">OK</button>
                    </form>
                  </td>
                  <td class="dim">{sid}</td>
                  <td class="num">{setTotal(sid)}</td>
                  <td class="num">
                    {sid === currentSet ? <span class="tag">EN COURS</span> : (
                      <form method="post" action={`/gestion/sets/${sid}/current`} class="inline"><button class="btn small">Définir en cours</button></form>
                    )}
                    <a href={`/${sid}/`} class="go-link">Voir →</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form method="post" action="/gestion/sets" class="form-panel add-form" data-slugify>
            <h3>Nouveau set</h3>
            <div class="row-form">
              <label>Nom <input name="name" required placeholder="Set 8" autocomplete="off" /></label>
              <label>Identifiant <input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="set-8" autocomplete="off" /></label>
            </div>
            <div class="row-form">
              <label class="check"><input type="checkbox" name="current" checked /> Définir comme set en cours</label>
              <button class="btn primary">Créer le set</button>
            </div>
            <p class="hint">Toutes les boutiques démarrent une nouvelle ligue vide pour ce set (étapes et recrutement repartent de zéro).</p>
          </form>
        </section>

        <section class="panel" aria-labelledby="shops-title">
          <h2 class="panel-title" id="shops-title">Boutiques <small>Étapes jouées dans {sets.get(currentSet)}</small></h2>
          <table class="manage">
            <thead><tr><th>Nom</th><th>Identifiant</th><th class="num">Étapes</th><th></th></tr></thead>
            <tbody>
              {[...shops].map(([slug, label]) => (
                <tr>
                  <td>
                    <form method="post" action={`/gestion/shop/${slug}/rename`} class="rename">
                      <input name="name" value={label} required aria-label={`Nom de la boutique ${slug}`} />
                      <button class="btn small" title="Renommer">OK</button>
                    </form>
                  </td>
                  <td class="dim">{slug}</td>
                  <td class="num">{counts.get(`${currentSet}/${slug}`) ?? 0}/{NUM_STEPS}</td>
                  <td class="num"><a href={`/${currentSet}/${slug}/`} class="go-link">Voir →</a></td>
                </tr>
              ))}
            </tbody>
          </table>
          <form method="post" action="/gestion/shops" class="form-panel add-form" data-slugify>
            <h3>Nouvelle boutique</h3>
            <div class="row-form">
              <label>Nom <input name="name" required placeholder="Ma Boutique Toulouse" autocomplete="off" /></label>
              <label>Identifiant <input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="ma-boutique-toulouse" autocomplete="off" /></label>
              <button class="btn primary">Ajouter</button>
            </div>
            <p class="hint">L'identifiant sert dans les liens ; il est déduit du nom si vous le laissez vide et ne peut plus changer ensuite.</p>
          </form>
        </section>
      </div>

      <section class="panel" aria-labelledby="alias-title">
        <h2 class="panel-title" id="alias-title">Alias de joueurs <small>Quand un joueur change de pseudo melee.gg, ses deux pseudos sont regroupés.</small></h2>
        <table class="manage">
          <thead><tr><th>Ancien pseudo</th><th>Pseudo retenu</th><th></th></tr></thead>
          <tbody>
            {Object.entries(aliases).map(([alias, canonical]) => (
              <tr>
                <td>{alias}</td>
                <td class="player" style={`--c: ${playerColor(canonical)}`}>{canonical}</td>
                <td class="num">
                  <form method="post" action="/gestion/aliases/delete" class="inline">
                    <input type="hidden" name="alias" value={alias} />
                    <button class="icon-btn" aria-label={`Supprimer l'alias ${alias}`} title="Supprimer">×</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form method="post" action="/gestion/aliases" class="row-form">
          <label>Ancien pseudo <input name="alias" required autocomplete="off" /></label>
          <label>Pseudo retenu <input name="canonical" required autocomplete="off" /></label>
          <button class="btn">Ajouter</button>
        </form>
      </section>

      <script>{raw(`
        for (const form of document.querySelectorAll("[data-slugify]")) {
          const name = form.elements.name, slug = form.elements.slug;
          name.addEventListener("input", () => {
            slug.placeholder = name.value.normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "")
              .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || slug.defaultValue;
          });
        }`)}</script>
    </Layout>
  );
};
