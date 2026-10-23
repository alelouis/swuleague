// Connexion Discord (OAuth2), sessions en base et droits.
//   owner   : tout (sets, boutiques, alias, comptes) — OWNER_DISCORD_ID l'est toujours
//   admin   : import / suppression d'étapes et recrutement pour ses boutiques
//   pending : demande d'accès en attente de validation ; refused : demande refusée

import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

export interface Env {
  DB: D1Database;
  OWNER_DISCORD_ID: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DEV_LOGIN?: string;
}

export type Role = "pending" | "admin" | "owner" | "refused";

export interface User {
  discord_id: string;
  username: string;
  display: string;
  avatar: string | null;
  role: Role;
  shops: string[];
}

const SESSION_COOKIE = "sid";
const STATE_COOKIE = "oauth_state";
const SESSION_DAYS = 30;

const randomId = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
const isLocal = (c: Context<any>) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(c.req.url).hostname);

export const isOwner = (u: User | null) => u?.role === "owner";
export const canEditShop = (u: User | null, shop: string) =>
  u?.role === "owner" || (u?.role === "admin" && u.shops.includes(shop));
export const avatarUrl = (u: Pick<User, "discord_id" | "avatar">) =>
  u.avatar ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.avatar}.png?size=64` : null;

export async function currentUser<E extends { Bindings: Env }>(c: Context<E>): Promise<User | null> {
  const sid = getCookie(c, SESSION_COOKIE);
  if (!sid) return null;
  const db = c.env.DB;
  const row = await db.prepare(
    "SELECT u.discord_id, u.username, u.display, u.avatar, u.role FROM sessions s JOIN users u USING (discord_id) WHERE s.id = ? AND s.expires_at > ?",
  ).bind(sid, Date.now()).first<Omit<User, "shops">>();
  if (!row) return null;
  const { results } = await db.prepare("SELECT shop_slug FROM user_shops WHERE discord_id = ?").bind(row.discord_id).all<{ shop_slug: string }>();
  return { ...row, shops: results.map((r) => r.shop_slug) };
}

async function startSession<E extends { Bindings: Env }>(c: Context<E>, discordId: string) {
  const id = randomId();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(Date.now()),
    c.env.DB.prepare("INSERT INTO sessions (id, discord_id, expires_at) VALUES (?, ?, ?)").bind(id, discordId, Date.now() + SESSION_DAYS * 864e5),
    c.env.DB.prepare("UPDATE users SET last_login = datetime('now') WHERE discord_id = ?").bind(discordId),
  ]);
  setCookie(c, SESSION_COOKIE, id, {
    httpOnly: true, secure: !isLocal(c), sameSite: "Lax", path: "/", maxAge: SESSION_DAYS * 86400,
  });
}

/** Crée ou met à jour le compte ; le propriétaire configuré est toujours owner. */
async function upsertUser(env: Env, u: { id: string; username: string; display: string; avatar: string | null }): Promise<Role> {
  const forced = env.OWNER_DISCORD_ID && u.id === env.OWNER_DISCORD_ID ? "owner" : null;
  await env.DB.prepare(
    "INSERT INTO users (discord_id, username, display, avatar, role) VALUES (?, ?, ?, ?, ?) " +
    "ON CONFLICT (discord_id) DO UPDATE SET username = excluded.username, display = excluded.display, avatar = excluded.avatar" +
    (forced ? ", role = 'owner'" : ""),
  ).bind(u.id, u.username, u.display, u.avatar, forced ?? "pending").run();
  const row = await env.DB.prepare("SELECT role FROM users WHERE discord_id = ?").bind(u.id).first<{ role: Role }>();
  return row!.role;
}

const safeNext = (next: string | undefined) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/");

// ── Routes OAuth ────────────────────────────────────────────────────────────

export function redirectUri(c: Context<any>) {
  return `${new URL(c.req.url).origin}/auth/callback`;
}

export function discordLogin<E extends { Bindings: Env }>(c: Context<E>) {
  if (!c.env.DISCORD_CLIENT_ID) return c.text("Connexion Discord non configurée (DISCORD_CLIENT_ID).", 500);
  const state = randomId();
  setCookie(c, STATE_COOKIE, `${state}|${safeNext(c.req.query("next"))}`, {
    httpOnly: true, secure: !isLocal(c), sameSite: "Lax", path: "/auth", maxAge: 600,
  });
  const url = new URL("https://discord.com/oauth2/authorize");
  url.search = new URLSearchParams({
    client_id: c.env.DISCORD_CLIENT_ID, response_type: "code", scope: "identify",
    redirect_uri: redirectUri(c), state, prompt: "none",
  }).toString();
  return c.redirect(url.toString());
}

export async function discordCallback<E extends { Bindings: Env }>(c: Context<E>): Promise<{ role: Role; next: string } | string> {
  const [expected, next] = (getCookie(c, STATE_COOKIE) ?? "").split("|");
  deleteCookie(c, STATE_COOKIE, { path: "/auth" });
  const code = c.req.query("code");
  if (!code || !expected || c.req.query("state") !== expected) return "Connexion expirée ou invalide, réessayez.";

  const tokenResp = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.env.DISCORD_CLIENT_ID, client_secret: c.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code", code, redirect_uri: redirectUri(c),
    }),
  });
  if (!tokenResp.ok) {
    // Corps d'erreur OAuth (ex. invalid_client, invalid_grant) — ne contient aucun secret
    console.error("Échange de code Discord refusé", tokenResp.status, await tokenResp.text());
    return "Discord a refusé la connexion.";
  }
  const { access_token } = await tokenResp.json<{ access_token: string }>();
  const meResp = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${access_token}` } });
  if (!meResp.ok) return "Impossible de lire le profil Discord.";
  const me = await meResp.json<{ id: string; username: string; global_name: string | null; avatar: string | null }>();

  const role = await upsertUser(c.env, { id: me.id, username: me.username, display: me.global_name || me.username, avatar: me.avatar });
  await startSession(c, me.id);
  return { role, next: safeNext(next) };
}

/** Connexion de test sans Discord : seulement si DEV_LOGIN=1 ET en localhost. */
export async function devLogin<E extends { Bindings: Env }>(c: Context<E>) {
  if (c.env.DEV_LOGIN !== "1" || !isLocal(c)) return null;
  const as = c.req.query("as") ?? "owner";                 // owner | admin:<shop>,<shop> | pending
  const [role, shops = ""] = as.split(":") as [Role, string];
  const id = `dev-${role}`;
  await c.env.DB.prepare(
    "INSERT INTO users (discord_id, username, display, role) VALUES (?, ?, ?, ?) ON CONFLICT (discord_id) DO UPDATE SET role = excluded.role",
  ).bind(id, id, `Dev ${role}`, role).run();
  await c.env.DB.prepare("DELETE FROM user_shops WHERE discord_id = ?").bind(id).run();
  for (const s of shops.split(",").filter(Boolean)) {
    await c.env.DB.prepare("INSERT OR IGNORE INTO user_shops (discord_id, shop_slug) VALUES (?, ?)").bind(id, s).run();
  }
  await startSession(c, id);
  return safeNext(c.req.query("next"));
}

export async function logout<E extends { Bindings: Env }>(c: Context<E>) {
  const sid = getCookie(c, SESSION_COOKIE);
  if (sid) await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sid).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

// ── Gestion des comptes (propriétaire) ──────────────────────────────────────

export interface UserRow extends User { created_at: string; last_login: string | null }

export async function listUsers(db: D1Database): Promise<UserRow[]> {
  const [users, shops] = await db.batch([
    db.prepare("SELECT discord_id, username, display, avatar, role, created_at, last_login FROM users ORDER BY CASE role WHEN 'pending' THEN 0 WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, display"),
    db.prepare("SELECT discord_id, shop_slug FROM user_shops"),
  ]);
  const byUser = new Map<string, string[]>();
  for (const r of shops.results as { discord_id: string; shop_slug: string }[]) {
    byUser.set(r.discord_id, [...(byUser.get(r.discord_id) ?? []), r.shop_slug]);
  }
  return (users.results as UserRow[]).map((u) => ({ ...u, shops: byUser.get(u.discord_id) ?? [] }));
}

export async function updateUser(env: Env, discordId: string, role: Role, shops: string[]) {
  if (discordId === env.OWNER_DISCORD_ID && role !== "owner") throw new Error("Le propriétaire configuré reste administrateur principal.");
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET role = ? WHERE discord_id = ?").bind(role, discordId),
    env.DB.prepare("DELETE FROM user_shops WHERE discord_id = ?").bind(discordId),
    ...(role === "admin" ? shops : []).map((s) => env.DB.prepare("INSERT INTO user_shops (discord_id, shop_slug) VALUES (?, ?)").bind(discordId, s)),
    // Retrait des droits : on ferme aussi les sessions ouvertes
    ...(role === "refused" || role === "pending" ? [env.DB.prepare("DELETE FROM sessions WHERE discord_id = ?").bind(discordId)] : []),
  ]);
}
