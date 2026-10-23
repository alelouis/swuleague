/** @jsxImportSource hono/jsx */
// Worker Cloudflare : site public des ligues SWU + espace organisateurs.

import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import {
  canEditShop, currentUser, devLogin, discordCallback, discordLogin, isOwner, listUsers, logout, updateUser,
  type Env, type Role, type User,
} from "./auth.ts";
import * as db from "./db.ts";
import { MeleeError, fetchTournament, parsePaste, type Tournament } from "./melee.ts";
import { League, NUM_STEPS, StepResult, type RawResult } from "./scoring.ts";
import {
  ImportPage, LoginPage, ManagePage, MessagePage, SetPage, ShopPage, type Ctx, type ImportForm,
} from "./views.tsx";

type App = { Bindings: Env; Variables: { user: User | null; config: db.Config } };
type C = Context<App>;
const app = new Hono<App>();

// ── Messages flash (cookie lu puis effacé à l'affichage suivant) ──

const FLASH = "flash";
function flash(c: C, kind: "success" | "error", msg: string) {
  const list: [string, string][] = JSON.parse(decodeURIComponent(getCookie(c, FLASH) ?? "%5B%5D"));
  list.push([kind, msg]);
  setCookie(c, FLASH, encodeURIComponent(JSON.stringify(list)), { path: "/", httpOnly: true, sameSite: "Lax", maxAge: 60 });
}
function ctx(c: C, extra: [string, string][] = []): Ctx {
  const raw = getCookie(c, FLASH);
  let flashes: [string, string][] = [];
  if (raw) {
    try { flashes = JSON.parse(decodeURIComponent(raw)); } catch { /* cookie corrompu */ }
    setCookie(c, FLASH, "", { path: "/", maxAge: 0 });
  }
  return { user: c.get("user"), config: c.get("config"), flashes: [...flashes, ...extra], path: new URL(c.req.url).pathname };
}

// ── Middlewares ──

// Les formulaires ne sont acceptés que depuis le site lui-même (protection CSRF,
// en complément du cookie de session SameSite=Lax).
app.use("*", async (c, next) => {
  if (c.req.method === "POST") {
    const origin = c.req.header("Origin");
    if (origin && origin !== new URL(c.req.url).origin) return c.text("Origine refusée", 403);
  }
  c.set("user", await currentUser(c));
  c.set("config", await db.getConfig(c.env.DB));
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
});

const notFound = async (c: C): Promise<Response> =>
  c.html(<MessagePage ctx={ctx(c)} title="Page introuvable" message="Cette ligue ou cette page n'existe pas." />, 404);

function requireLogin(c: C): Response | null {
  if (c.get("user")) return null;
  return c.redirect(`/login?next=${encodeURIComponent(new URL(c.req.url).pathname)}`);
}
async function forbidden(c: C): Promise<Response> {
  return c.html(<MessagePage ctx={ctx(c)} title="Accès réservé"
    message="Votre compte n'a pas les droits pour cette action. Demandez à l'administrateur de vous donner accès à cette boutique." />, 403);
}

/** Vérifie set + boutique existants et, si demandé, le droit d'édition. */
async function league(c: C, edit = false): Promise<{ set: string; shop: string } | Response> {
  const { set, shop } = c.req.param() as { set: string; shop: string };
  const { sets, shops } = c.get("config");
  if (!sets.has(set) || !shops.has(shop)) return notFound(c);
  if (edit) {
    const login = requireLogin(c);
    if (login) return login;
    if (!canEditShop(c.get("user"), shop)) return forbidden(c);
  }
  return { set, shop };
}
const ownerOnly = async (c: C) => requireLogin(c) ?? (isOwner(c.get("user")) ? null : await forbidden(c));
const by = (c: C) => c.get("user")?.display ?? "?";

// ── Authentification ──

app.get("/login", (c) => c.html(<LoginPage ctx={ctx(c)} next={c.req.query("next") ?? "/"}
  dev={c.env.DEV_LOGIN === "1" && ["localhost", "127.0.0.1"].includes(new URL(c.req.url).hostname)} />));
app.get("/auth/discord", (c) => discordLogin(c));
app.get("/auth/callback", async (c) => {
  if (c.req.query("error")) { flash(c, "error", "Connexion Discord annulée."); return c.redirect("/login"); }
  const result = await discordCallback(c);
  if (typeof result === "string") { flash(c, "error", result); return c.redirect("/login"); }
  return redirectAfterLogin(c, result.role, result.next);
});
app.get("/auth/dev", async (c) => {
  const next = await devLogin(c);
  if (next == null) return notFound(c);
  const user = await c.env.DB.prepare("SELECT role FROM users WHERE discord_id = ?").bind(`dev-${(c.req.query("as") ?? "owner").split(":")[0]}`).first<{ role: Role }>();
  return redirectAfterLogin(c, user?.role ?? "pending", next);
});
function redirectAfterLogin(c: C, role: Role, next: string) {
  if (role === "pending" || role === "refused") return c.redirect("/login");
  flash(c, "success", "Connecté.");
  return c.redirect(next);
}
app.post("/logout", async (c) => { await logout(c); return c.redirect("/"); });

// ── Pages publiques ──

app.get("/", (c) => c.redirect(`/${c.get("config").currentSet}/`));

app.get("/gestion", async (c) => {
  const denied = await ownerOnly(c);
  if (denied) return denied;
  const [counts, users, aliases] = await Promise.all([db.stepCounts(c.env.DB), listUsers(c.env.DB), db.getAliases(c.env.DB)]);
  return c.html(<ManagePage ctx={ctx(c)} counts={counts} users={users} aliases={aliases} ownerId={c.env.OWNER_DISCORD_ID} />);
});

app.get("/:set", async (c) => (c.get("config").sets.has(c.req.param("set")) ? c.redirect(`/${c.req.param("set")}/`) : notFound(c)));
app.get("/:set/", async (c) => {
  const set = c.req.param("set");
  const { sets, shops } = c.get("config");
  if (!sets.has(set)) return notFound(c);
  const leagues = await Promise.all([...shops].map(async ([slug, name]) => {
    const l = new League(await db.loadLeague(c.env.DB, set, slug));
    return { slug, name, steps: l.steps, top: l.top() };
  }));
  leagues.sort((a, b) => Number(!a.steps.length) - Number(!b.steps.length));
  return c.html(<SetPage ctx={ctx(c)} setId={set} leagues={leagues} />);
});

app.get("/:set/:shop", async (c) => {
  const l = await league(c);
  return l instanceof Response ? l : c.redirect(`/${l.set}/${l.shop}/`);
});
app.get("/:set/:shop/", async (c) => {
  const l = await league(c);
  if (l instanceof Response) return l;
  const lg = new League(await db.loadLeague(c.env.DB, l.set, l.shop));
  const asked = Number(c.req.query("etape"));
  const current = lg.steps.includes(asked) ? asked : lg.steps.at(-1) ?? null;
  return c.html(<ShopPage ctx={ctx(c)} setId={l.set} shop={l.shop} steps={lg.steps} current={current}
    season={lg.seasonView()} recruitments={lg.recruitmentView()}
    players={[...lg.knownPlayers()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))} />);
});

// ── Import d'une étape ──

app.get("/:set/:shop/import", async (c) => {
  const l = await league(c, true);
  if (l instanceof Response) return l;
  const lg = new League(await db.loadLeague(c.env.DB, l.set, l.shop));
  const form: ImportForm = { url: "", paste: "", step: Math.min((lg.steps.at(-1) ?? 0) + 1, NUM_STEPS), forfait: false };
  return c.html(<ImportPage ctx={ctx(c)} setId={l.set} shop={l.shop} steps={lg.steps} form={form} />);
});

app.post("/:set/:shop/import", async (c) => {
  const l = await league(c, true);
  if (l instanceof Response) return l;
  const body = await c.req.parseBody({ all: true });
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const lg = new League(await db.loadLeague(c.env.DB, l.set, l.shop));
  const form: ImportForm = {
    url: str("url").trim(), paste: str("paste"),
    step: Number(str("step")) || Math.min((lg.steps.at(-1) ?? 0) + 1, NUM_STEPS),
    forfait: str("forfait") === "on",
  };
  const render = (status: 200 | 400, extra: Partial<Parameters<typeof ImportPage>[0]> = {}, errors: string[] = []) =>
    c.html(<ImportPage ctx={ctx(c, errors.map((e) => ["error", e]))} setId={l.set} shop={l.shop} steps={lg.steps} form={form} {...extra} />, status);

  if (!Number.isInteger(form.step) || form.step < 1 || form.step > NUM_STEPS) return render(400, {}, [`Numéro d'étape invalide (1 à ${NUM_STEPS}).`]);

  if (str("action") === "save") {
    const keep = ([] as unknown[]).concat(body.keep ?? []).map(Number);
    const results: RawResult[] = [];
    for (const i of keep) {
      const joueur = str(`joueur-${i}`).trim();
      if (!joueur) continue;
      const n = (k: string) => Math.max(0, Math.floor(Number(str(`${k}-${i}`)) || 0));
      results.push({ joueur, victoires: n("victoires"), defaites: n("defaites"), nuls: n("nuls"), recrutement: 0 });
    }
    if (!results.length) {
      flash(c, "error", "Aucun joueur sélectionné : rien n'a été enregistré.");
      return c.redirect(`/${l.set}/${l.shop}/import`);
    }
    const source = str("source") || null;
    const replaced = await db.saveStep(c.env.DB, l.set, l.shop, form.step, results, form.forfait,
      source && /^https:\/\/melee\.gg\//.test(source) ? source : null, by(c));
    flash(c, "success", `Étape ${form.step} ${replaced ? "remplacée" : "ajoutée"} (${results.length} joueurs).`);
    return c.redirect(`/${l.set}/${l.shop}/?etape=${form.step}`);
  }

  // Aperçu : depuis le lien melee.gg, sinon depuis le copié-collé
  let results: RawResult[];
  let tournament: Tournament | undefined;
  try {
    if (form.url) {
      tournament = await fetchTournament(form.url);
      results = tournament.results;
    } else if (form.paste.trim()) {
      results = parsePaste(form.paste);
      if (!results.length) throw new MeleeError("Aucun résultat reconnu dans le copié-collé.");
    } else {
      throw new MeleeError("Indiquez un lien melee.gg ou collez le classement.");
    }
  } catch (e) {
    if (!(e instanceof MeleeError)) throw e;
    return render(400, {}, [e.message]);
  }
  const aliases = await db.getAliases(c.env.DB);
  const known = lg.knownPlayers();
  const preview = results.map((r) => {
    const canon = aliases[r.joueur] ?? r.joueur;
    const points = new StepResult(canon, r.victoires, r.defaites, r.nuls, 0, form.forfait).total;
    return { ...r, canon, known: known.has(canon), points };
  });
  return render(200, { preview, source: tournament?.url ?? null, tournament });
});

app.post("/:set/:shop/etape/:step/delete", async (c) => {
  const l = await league(c, true);
  if (l instanceof Response) return l;
  const step = Number(c.req.param("step"));
  await db.deleteStep(c.env.DB, l.set, l.shop, step);
  flash(c, "success", `Étape ${step} supprimée.`);
  return c.redirect(`/${l.set}/${l.shop}/`);
});

// ── Recrutement ──

app.post("/:set/:shop/recrutement", async (c) => {
  const l = await league(c, true);
  if (l instanceof Response) return l;
  const body = await c.req.parseBody();
  const aliases = await db.getAliases(c.env.DB);
  const canon = (k: string) => { const v = String(body[k] ?? "").trim(); return aliases[v] ?? v; };
  const recrue = canon("recrue"), recruteur = canon("recruteur");
  if (!recrue || !recruteur || recrue === recruteur) {
    flash(c, "error", "Recrue et recruteur doivent être deux joueurs différents.");
  } else {
    await db.addRecruitment(c.env.DB, l.set, l.shop, recrue, recruteur);
    flash(c, "success", `${recrue} enregistré(e) comme recrue de ${recruteur}.`);
  }
  return c.redirect(`/${l.set}/${l.shop}/#recrutement`);
});

app.post("/:set/:shop/recrutement/delete", async (c) => {
  const l = await league(c, true);
  if (l instanceof Response) return l;
  const recrue = String((await c.req.parseBody()).recrue ?? "");
  if (await db.deleteRecruitment(c.env.DB, l.set, l.shop, recrue)) flash(c, "success", `Recrutement de ${recrue} retiré.`);
  return c.redirect(`/${l.set}/${l.shop}/#recrutement`);
});

// ── Gestion (propriétaire) ──

async function manageAction(c: C, action: (body: Record<string, string | File | (string | File)[]>) => Promise<string>) {
  const denied = await ownerOnly(c);
  if (denied) return denied;
  try {
    flash(c, "success", await action(await c.req.parseBody({ all: true })));
  } catch (e) {
    flash(c, "error", (e as Error).message);
  }
  return c.redirect(c.req.path.startsWith("/gestion/users") ? "/gestion#comptes" : "/gestion");
}
const field = (b: Record<string, unknown>, k: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : "");

app.post("/gestion/sets", (c) => manageAction(c, async (b) => {
  const name = field(b, "name");
  const slug = field(b, "slug").toLowerCase() || db.slugify(name);
  await db.addEntry(c.env.DB, "sets", slug, name);
  const current = field(b, "current") === "on";
  if (current) await db.setCurrentSet(c.env.DB, slug);
  return `Set « ${name} » créé${current ? " et défini comme set en cours" : ""}.`;
}));
app.post("/gestion/shops", (c) => manageAction(c, async (b) => {
  const name = field(b, "name");
  await db.addEntry(c.env.DB, "shops", field(b, "slug").toLowerCase() || db.slugify(name), name);
  return `Boutique « ${name} » ajoutée.`;
}));
app.post("/gestion/:kind/:slug/rename", (c) => manageAction(c, async (b) => {
  const kind = c.req.param("kind");
  if (kind !== "set" && kind !== "shop") throw new Error("Type inconnu.");
  await db.renameEntry(c.env.DB, kind === "set" ? "sets" : "shops", c.req.param("slug"), field(b, "name"));
  return "Nom mis à jour.";
}));
app.post("/gestion/sets/:slug/current", (c) => manageAction(c, async () => {
  const slug = c.req.param("slug");
  const name = c.get("config").sets.get(slug);
  if (!name) throw new Error(`Set inconnu : ${slug}`);
  await db.setCurrentSet(c.env.DB, slug);
  return `${name} est maintenant le set en cours.`;
}));
app.post("/gestion/aliases", (c) => manageAction(c, async (b) => {
  const alias = field(b, "alias"), canonical = field(b, "canonical");
  if (!alias || !canonical || alias === canonical) throw new Error("Indiquez deux pseudos différents.");
  await db.addAlias(c.env.DB, alias, canonical);
  return `« ${alias} » est désormais compté comme ${canonical}.`;
}));
app.post("/gestion/aliases/delete", (c) => manageAction(c, async (b) => {
  await db.deleteAlias(c.env.DB, field(b, "alias"));
  return "Alias supprimé.";
}));
app.post("/gestion/users/:id", (c) => manageAction(c, async (b) => {
  const role = field(b, "role") as Role;
  if (!["pending", "admin", "owner", "refused"].includes(role)) throw new Error("Rôle invalide.");
  const shops = ([] as unknown[]).concat(b.shops ?? []).map(String).filter((s) => c.get("config").shops.has(s));
  if (role === "admin" && !shops.length) throw new Error("Cochez au moins une boutique pour un organisateur.");
  if (c.req.param("id") === c.get("user")!.discord_id && role !== "owner") {
    throw new Error("Vous ne pouvez pas retirer vos propres droits d'administrateur.");
  }
  await updateUser(c.env, c.req.param("id"), role, shops);
  return "Droits mis à jour.";
}));

app.notFound((c) => notFound(c));
app.onError((err, c) => {
  console.error(err);
  return c.html(<MessagePage ctx={{ user: null, config: { sets: new Map(), shops: new Map(), currentSet: "" }, flashes: [], path: "/" }}
    title="Erreur" message="Une erreur est survenue. Réessayez dans un instant." />, 500);
});

export default app;
