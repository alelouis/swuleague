// Récupération d'un classement melee.gg (portage de melee.py).
// Lit la dernière ronde terminée via l'endpoint JSON public /Standing/GetRoundStandings.

import type { RawResult } from "./scoring.ts";

const BASE_URL = "https://melee.gg";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
};

export class MeleeError extends Error {}

export interface Tournament {
  id: number;
  name: string;
  url: string;
  round: string;
  results: RawResult[];
}

export function parseTournamentId(input: string): number {
  const s = input.trim();
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/melee\.gg\/Tournament\/View\/(\d+)/i);
  if (!m) throw new MeleeError("Lien melee.gg invalide (attendu : https://melee.gg/Tournament/View/<id>)");
  return Number(m[1]);
}

export const tournamentUrl = (id: number) => `${BASE_URL}/Tournament/View/${id}`;

const unescapeHtml = (s: string) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

async function request(url: string, form?: Record<string, string>): Promise<string> {
  let resp: Response;
  try {
    resp = await fetch(url, form
      ? { method: "POST", body: new URLSearchParams(form), headers: { ...HEADERS, "X-Requested-With": "XMLHttpRequest" } }
      : { headers: { ...HEADERS, Accept: "text/html" } });
  } catch (e) {
    throw new MeleeError(`Impossible de joindre melee.gg : ${(e as Error).message}`);
  }
  if (!resp.ok) throw new MeleeError(`melee.gg a répondu ${resp.status} pour ${url}`);
  return resp.text();
}

function lastCompletedRound(page: string): [number, string] {
  const m = page.match(/id="standings-round-selector-container"([\s\S]*?)<\/div>/);
  if (!m) throw new MeleeError("Section « Standings » introuvable sur la page du tournoi");
  const rounds = [...m[1].matchAll(/<button[^>]*data-id="(\d+)"[^>]*data-name="([^"]*)"[^>]*data-is-completed="True"/g)];
  if (!rounds.length) throw new MeleeError("Aucune ronde terminée pour ce tournoi");
  const [, id, name] = rounds[rounds.length - 1];
  return [Number(id), unescapeHtml(name)];
}

// Paramètres DataTables attendus par l'endpoint côté serveur
const standingsPayload = (roundId: number): Record<string, string> => ({
  draw: "1",
  "columns[0][data]": "Rank", "columns[0][name]": "Rank",
  "columns[0][searchable]": "true", "columns[0][orderable]": "true",
  "columns[0][search][value]": "", "columns[0][search][regex]": "false",
  "order[0][column]": "0", "order[0][dir]": "asc",
  start: "0", length: "1000",
  "search[value]": "", "search[regex]": "false",
  roundId: String(roundId),
});

interface StandingRow {
  Rank?: number;
  MatchWins?: number;
  MatchLosses?: number;
  MatchDraws?: number;
  Team?: { Players?: { DisplayName?: string; Username?: string }[] };
}

const playerName = (row: StandingRow) => (row.Team?.Players ?? [])
  .map((p) => (p.DisplayName || p.Username || "").trim())
  .filter(Boolean)
  .join(" / ");

export async function fetchTournament(input: string): Promise<Tournament> {
  const id = parseTournamentId(input);
  const url = tournamentUrl(id);
  const page = await request(url);
  const title = page.match(/<title>([^<]*)<\/title>/);
  const name = title ? unescapeHtml(title[1]).replace(/\|[^|]*$/, "").trim() : `Tournoi ${id}`;
  const [roundId, round] = lastCompletedRound(page);

  let payload: { Error?: boolean; Message?: string; data?: StandingRow[] };
  try {
    payload = JSON.parse(await request(`${BASE_URL}/Standing/GetRoundStandings`, standingsPayload(roundId)));
  } catch (e) {
    if (e instanceof MeleeError) throw e;
    throw new MeleeError("Réponse inattendue de melee.gg pour le classement");
  }
  if (payload.Error || !payload.data) throw new MeleeError(payload.Message || "Classement indisponible sur melee.gg");

  const results = payload.data
    .sort((a, b) => (a.Rank ?? 0) - (b.Rank ?? 0))
    .map((row) => ({
      joueur: playerName(row),
      victoires: row.MatchWins ?? 0,
      defaites: row.MatchLosses ?? 0,
      nuls: row.MatchDraws ?? 0,
      recrutement: 0,
    }))
    .filter((r) => r.joueur);
  if (!results.length) throw new MeleeError("Aucun joueur dans le classement de ce tournoi");
  return { id, name, url, round, results };
}

// ── Copié-collé de la page de classement (portage de parse_melee.py) ──

export function parsePaste(text: string): RawResult[] {
  let lines = text.trim().split(/\r?\n/).map((l) => l.trim());
  if (lines[0]?.startsWith("Rang")) lines = lines.slice(1);
  const results: RawResult[] = [];
  let i = 0;
  while (i < lines.length) {
    if (/^\d+$/.test(lines[i])) {
      i++;
      if (i >= lines.length) break;
      const joueur = lines[i].trim().replace(/\s+(Il|Elle|Iel)\/(Il|Lui|Elle|Iel)$/, "");
      i++;
      if (i >= lines.length) break;
      const m = lines[i].trim().match(/^(\d+)-(\d+)-(\d+)\b/);
      if (m) results.push({ joueur, victoires: +m[1], defaites: +m[2], nuls: +m[3], recrutement: 0 });
      i++;
      while (i < lines.length && !/^\d+$/.test(lines[i])) i++;
    } else {
      i++;
    }
  }
  return results;
}
