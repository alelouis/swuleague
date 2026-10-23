// Accès D1 : configuration des ligues, résultats, recrutement, alias.

import type { LeagueData, RawResult } from "./scoring.ts";

export interface Config {
  sets: Map<string, string>;   // slug → nom, dans l'ordre de création
  shops: Map<string, string>;
  currentSet: string;
}

export async function getConfig(db: D1Database): Promise<Config> {
  const [sets, shops, current] = await db.batch([
    db.prepare("SELECT slug, name FROM sets ORDER BY position, slug"),
    db.prepare("SELECT slug, name FROM shops ORDER BY position, slug"),
    db.prepare("SELECT value FROM settings WHERE key = 'current_set'"),
  ]);
  const setMap = new Map((sets.results as { slug: string; name: string }[]).map((r) => [r.slug, r.name]));
  const value = (current.results[0] as { value: string } | undefined)?.value;
  return {
    sets: setMap,
    shops: new Map((shops.results as { slug: string; name: string }[]).map((r) => [r.slug, r.name])),
    currentSet: value && setMap.has(value) ? value : [...setMap.keys()].at(-1) ?? "",
  };
}

export async function getAliases(db: D1Database): Promise<Record<string, string>> {
  const { results } = await db.prepare("SELECT alias, canonical FROM aliases ORDER BY alias").all<{ alias: string; canonical: string }>();
  return Object.fromEntries(results.map((r) => [r.alias, r.canonical]));
}

export async function loadLeague(db: D1Database, set: string, shop: string): Promise<LeagueData> {
  const [steps, results, recruits, aliases] = await db.batch([
    db.prepare("SELECT step, forfait, source FROM steps WHERE set_slug = ? AND shop_slug = ? ORDER BY step").bind(set, shop),
    db.prepare("SELECT step, joueur, victoires, defaites, nuls, recrutement FROM results WHERE set_slug = ? AND shop_slug = ? ORDER BY step, position").bind(set, shop),
    db.prepare("SELECT recrue, recruteur FROM recruitments WHERE set_slug = ? AND shop_slug = ? ORDER BY position, rowid").bind(set, shop),
    db.prepare("SELECT alias, canonical FROM aliases"),
  ]);
  const byStep = new Map<number, RawResult[]>();
  for (const r of results.results as (RawResult & { step: number })[]) {
    const { step, ...rest } = r;
    if (!byStep.has(step)) byStep.set(step, []);
    byStep.get(step)!.push(rest);
  }
  return {
    steps: (steps.results as { step: number; forfait: number; source: string | null }[]).map((s) => ({
      step: s.step, forfait: !!s.forfait, source: s.source, results: byStep.get(s.step) ?? [],
    })),
    recruitments: (recruits.results as { recrue: string; recruteur: string }[]).map((r) => [r.recrue, r.recruteur]),
    aliases: Object.fromEntries((aliases.results as { alias: string; canonical: string }[]).map((a) => [a.alias, a.canonical])),
  };
}

/** Nombre d'étapes jouées par (set, boutique). */
export async function stepCounts(db: D1Database): Promise<Map<string, number>> {
  const { results } = await db.prepare(
    "SELECT s.set_slug, s.shop_slug, COUNT(*) AS n FROM steps s WHERE EXISTS (SELECT 1 FROM results r WHERE r.set_slug = s.set_slug AND r.shop_slug = s.shop_slug AND r.step = s.step) GROUP BY s.set_slug, s.shop_slug",
  ).all<{ set_slug: string; shop_slug: string; n: number }>();
  return new Map(results.map((r) => [`${r.set_slug}/${r.shop_slug}`, r.n]));
}

// ── Écritures ────────────────────────────────────────────────────────────────

export async function saveStep(
  db: D1Database, set: string, shop: string, step: number,
  results: RawResult[], forfait: boolean, source: string | null, by: string,
): Promise<boolean> {
  const existing = await db.prepare("SELECT 1 FROM steps WHERE set_slug = ? AND shop_slug = ? AND step = ?").bind(set, shop, step).first();
  await db.batch([
    db.prepare("DELETE FROM results WHERE set_slug = ? AND shop_slug = ? AND step = ?").bind(set, shop, step),
    db.prepare("DELETE FROM steps WHERE set_slug = ? AND shop_slug = ? AND step = ?").bind(set, shop, step),
    db.prepare("INSERT INTO steps (set_slug, shop_slug, step, forfait, source, imported_by) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(set, shop, step, forfait ? 1 : 0, source, by),
    ...results.map((r, i) => db.prepare(
      "INSERT INTO results (set_slug, shop_slug, step, position, joueur, victoires, defaites, nuls, recrutement) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(set, shop, step, i, r.joueur, r.victoires, r.defaites, r.nuls, r.recrutement)),
  ]);
  return !!existing;
}

export async function deleteStep(db: D1Database, set: string, shop: string, step: number) {
  await db.batch([
    db.prepare("DELETE FROM results WHERE set_slug = ? AND shop_slug = ? AND step = ?").bind(set, shop, step),
    db.prepare("DELETE FROM steps WHERE set_slug = ? AND shop_slug = ? AND step = ?").bind(set, shop, step),
  ]);
}

export async function addRecruitment(db: D1Database, set: string, shop: string, recrue: string, recruteur: string) {
  await db.prepare(
    "INSERT INTO recruitments (set_slug, shop_slug, recrue, recruteur, position) VALUES (?, ?, ?, ?, " +
    "(SELECT COALESCE(MAX(position), -1) + 1 FROM recruitments WHERE set_slug = ? AND shop_slug = ?)) " +
    "ON CONFLICT (set_slug, shop_slug, recrue) DO UPDATE SET recruteur = excluded.recruteur",
  ).bind(set, shop, recrue, recruteur, set, shop).run();
}

export async function deleteRecruitment(db: D1Database, set: string, shop: string, recrue: string) {
  const r = await db.prepare("DELETE FROM recruitments WHERE set_slug = ? AND shop_slug = ? AND recrue = ?").bind(set, shop, recrue).run();
  return r.meta.changes > 0;
}

// ── Sets, boutiques, alias ───────────────────────────────────────────────────

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(name: string): string {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function addEntry(db: D1Database, table: "sets" | "shops", slug: string, name: string) {
  if (!name.trim()) throw new Error("Le nom est obligatoire.");
  if (!SLUG_RE.test(slug)) throw new Error(`Identifiant invalide « ${slug} » (minuscules, chiffres et tirets).`);
  if (await db.prepare(`SELECT 1 FROM ${table} WHERE slug = ?`).bind(slug).first()) {
    throw new Error(`L'identifiant « ${slug} » existe déjà.`);
  }
  await db.prepare(`INSERT INTO ${table} (slug, name, position) VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM ${table}))`)
    .bind(slug, name.trim()).run();
}

export async function renameEntry(db: D1Database, table: "sets" | "shops", slug: string, name: string) {
  if (!name.trim()) throw new Error("Nom invalide.");
  const r = await db.prepare(`UPDATE ${table} SET name = ? WHERE slug = ?`).bind(name.trim(), slug).run();
  if (!r.meta.changes) throw new Error("Introuvable.");
}

export async function setCurrentSet(db: D1Database, slug: string) {
  await db.prepare("INSERT INTO settings (key, value) VALUES ('current_set', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .bind(slug).run();
}

export async function addAlias(db: D1Database, alias: string, canonical: string) {
  await db.prepare("INSERT INTO aliases (alias, canonical) VALUES (?, ?) ON CONFLICT (alias) DO UPDATE SET canonical = excluded.canonical")
    .bind(alias, canonical).run();
}

export async function deleteAlias(db: D1Database, alias: string) {
  await db.prepare("DELETE FROM aliases WHERE alias = ?").bind(alias).run();
}
