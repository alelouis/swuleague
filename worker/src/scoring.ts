// Barème, classement et vues de saison — portage fidèle de data.py / app.py.
// Module pur : reçoit les données d'une ligue, ne lit pas la base.

import { md5 } from "./md5.ts";

export const NUM_STEPS = 10;
export const PTS_PARTICIPATION = 2;
export const PTS_VICTOIRE = 2;
export const PTS_VICTOIRE_MAX = 6;
export const PTS_PARTIE = 1;
export const PTS_PARTIE_MAX = 3;
export const PTS_RECRUTEMENT = 5;
export const PTS_FORFAIT_MAX = PTS_PARTICIPATION + PTS_VICTOIRE_MAX + PTS_PARTIE_MAX; // = 11
export const SEUIL_RECRUTEMENT = 15;

export interface RawResult {
  joueur: string;
  victoires: number;
  defaites: number;
  nuls: number;
  recrutement: number;
}

export interface StepData {
  step: number;
  forfait: boolean;
  source: string | null;
  results: RawResult[];
}

export interface LeagueData {
  steps: StepData[];                  // étapes enregistrées (ordre quelconque)
  recruitments: [string, string][];   // [recrue, recruteur] dans l'ordre d'enregistrement
  aliases: Record<string, string>;
}

// ── Résultat d'une étape ─────────────────────────────────────────────────────

export class StepResult {
  joueur: string;
  victoires: number;
  defaites: number;
  nuls: number;
  recrutement: number;
  forfait: boolean;
  constructor(joueur: string, victoires: number, defaites: number, nuls: number, recrutement: number, forfait: boolean) {
    this.joueur = joueur;
    this.victoires = victoires;
    this.defaites = defaites;
    this.nuls = nuls;
    this.recrutement = recrutement;
    this.forfait = forfait;
  }
  get parties() { return this.victoires + this.defaites + this.nuls; }
  get ptsParticipation() { return this.forfait || this.parties > 0 ? PTS_PARTICIPATION : 0; }
  get ptsVictoires() { return this.forfait ? PTS_VICTOIRE_MAX : Math.min(this.victoires * PTS_VICTOIRE, PTS_VICTOIRE_MAX); }
  get ptsParties() { return this.forfait ? PTS_PARTIE_MAX : Math.min(this.parties, PTS_PARTIE_MAX); }
  get ptsRecrutement() { return this.recrutement * PTS_RECRUTEMENT; }
  get total() {
    if (this.forfait) return PTS_FORFAIT_MAX + this.ptsRecrutement;
    return this.ptsParticipation + this.ptsVictoires + this.ptsParties + this.ptsRecrutement;
  }
}

// Comparaison de chaînes par point de code, comme Python
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ── Ligue chargée : étapes jouées avec noms canoniques ──────────────────────

export class League {
  readonly stepResults = new Map<number, StepResult[]>();
  readonly sources = new Map<number, string | null>();
  readonly recruitments: [string, string][];
  readonly steps: number[];

  constructor(data: LeagueData) {
    const canon = (n: string) => data.aliases[n] ?? n;
    for (const s of data.steps) {
      if (s.step < 1 || s.step > NUM_STEPS || s.results.length === 0) continue;
      this.stepResults.set(s.step, s.results.map((r) =>
        new StepResult(canon(r.joueur), r.victoires, r.defaites, r.nuls, r.recrutement, s.forfait)));
      this.sources.set(s.step, s.source);
    }
    this.steps = [...this.stepResults.keys()].sort((a, b) => a - b);
    // dict Python : une recrue n'a qu'un recruteur, la dernière ligne l'emporte
    const pairs = new Map<string, string>();
    for (const [recrue, recruteur] of data.recruitments) pairs.set(canon(recrue), canon(recruteur));
    this.recruitments = [...pairs];
  }

  // ── build_ranking_up_to ──
  rankingUpTo(upTo: number) {
    const stepsUsed = this.steps.filter((s) => s <= upTo);
    const players = new Map<string, Player>();
    const running = new Map<string, number>();
    const bonusGiven = new Set<string>();
    const bonusesByStep = new Map<number, Map<string, number>>();
    const ensure = (joueur: string) => {
      let p = players.get(joueur);
      if (!p) {
        p = { joueur, total: 0, etapes: 0, victoires: 0, parties: 0, recrutement: 0, par_etape: {} };
        players.set(joueur, p);
      }
      return p;
    };

    for (const step of stepsUsed) {
      for (const r of this.stepResults.get(step)!) {
        running.set(r.joueur, (running.get(r.joueur) ?? 0) + r.total);
        const p = ensure(r.joueur);
        p.total += r.total;
        p.etapes += 1;
        p.victoires += r.victoires;
        p.parties += r.parties;
        p.recrutement += r.ptsRecrutement;
        p.par_etape[step] = (p.par_etape[step] ?? 0) + r.total;
      }
      const stepBonuses = new Map<string, number>();
      for (const [recrue, recruteur] of this.recruitments) {
        if (bonusGiven.has(recrue)) continue;
        if ((running.get(recrue) ?? 0) >= SEUIL_RECRUTEMENT) {
          bonusGiven.add(recrue);
          stepBonuses.set(recruteur, (stepBonuses.get(recruteur) ?? 0) + PTS_RECRUTEMENT);
          const p = ensure(recruteur);
          p.total += PTS_RECRUTEMENT;
          p.recrutement += PTS_RECRUTEMENT;
          p.par_etape[step] = (p.par_etape[step] ?? 0) + PTS_RECRUTEMENT;
        }
      }
      bonusesByStep.set(step, stepBonuses);
    }

    const ranking = [...players.values()].sort((a, b) =>
      b.total - a.total || b.etapes - a.etapes || cmp(a.joueur, b.joueur));
    return { stepsUsed, ranking, bonusesByStep };
  }

  // ── ranking_view ──
  rankingView(step: number) {
    const { stepsUsed, ranking, bonusesByStep } = this.rankingUpTo(step);
    const prevSteps = stepsUsed.filter((s) => s < step);
    const prev = prevSteps.length ? this.rankingUpTo(prevSteps[prevSteps.length - 1]).ranking : null;
    const prevPos = new Map(prev?.map((p, i) => [p.joueur, i + 1]));
    const prevTot = new Map(prev?.map((p) => [p.joueur, p.total]));
    const rows = ranking.map((p, i) => {
      const rank = i + 1;
      let move: [string, number] | null = null;
      if (prev) {
        if (!prevPos.has(p.joueur)) move = ["new", 0];
        else {
          const delta = prevPos.get(p.joueur)! - rank;
          move = delta > 0 ? ["up", delta] : delta < 0 ? ["down", -delta] : ["same", 0];
        }
      }
      return { ...p, rank, move, diff: p.total - (prevTot.get(p.joueur) ?? 0) };
    });
    return { steps: stepsUsed, rows, bonuses: bonusesByStep };
  }

  // ── step_view ──
  stepView(step: number, bonuses: Map<string, number>) {
    const results = this.stepResults.get(step);
    if (!results) return null;
    const forfait = results.some((r) => r.forfait);
    const rows = results.map((r) => {
      const bonus = bonuses.get(r.joueur) ?? 0;
      return { r, bonus, total: r.total - r.ptsRecrutement + bonus };
    });
    if (forfait) rows.sort((a, b) => cmp(a.r.joueur.toLowerCase(), b.r.joueur.toLowerCase()));
    else rows.sort((a, b) => b.total - a.total || b.r.victoires - a.r.victoires || cmp(a.r.joueur, b.r.joueur));
    return {
      step, rows, forfait,
      parties: results.reduce((n, r) => n + r.parties, 0),
      source: this.sources.get(step) ?? null,
    };
  }

  // ── season_view : données JSON consommées par league.js ──
  seasonView() {
    const snapshots: Record<number, unknown> = {};
    const players = new Set<string>();
    for (const step of this.steps) {
      const ranking = this.rankingView(step);
      const detail = this.stepView(step, ranking.bonuses.get(step) ?? new Map())!;
      snapshots[step] = {
        rows: ranking.rows.map((p) => {
          players.add(p.joueur);
          return {
            joueur: p.joueur, rank: p.rank, total: p.total, diff: p.diff, etapes: p.etapes,
            move: p.move ? p.move[0] : null,
            delta: p.move && (p.move[0] === "up" || p.move[0] === "down") ? p.move[1] : 0,
            par_etape: Object.fromEntries(Object.entries(p.par_etape).map(([s, v]) => [String(s), v])),
          };
        }),
        detail: {
          forfait: detail.forfait, parties: detail.parties, source: detail.source,
          rows: detail.rows.map((d) => ({
            joueur: d.r.joueur, v: d.r.victoires, d: d.r.defaites, n: d.r.nuls,
            participation: d.r.ptsParticipation, victoires: d.r.ptsVictoires, parties: d.r.ptsParties,
            bonus: d.bonus, total: d.total,
          })),
        },
      };
    }
    const sorted = [...players].sort((a, b) => cmp(a.toLowerCase(), b.toLowerCase()));
    return {
      numSteps: NUM_STEPS,
      steps: this.steps,
      snapshots,
      colors: Object.fromEntries(sorted.map((p) => [p, playerColor(p)])),
    };
  }

  // ── recruitment_view ──
  recruitmentView() {
    const totals = new Map<string, number>();
    const reached = new Map<string, number>();
    for (const step of this.steps) {
      for (const r of this.stepResults.get(step)!) {
        totals.set(r.joueur, (totals.get(r.joueur) ?? 0) + r.total);
        if (totals.get(r.joueur)! >= SEUIL_RECRUTEMENT && !reached.has(r.joueur)) reached.set(r.joueur, step);
      }
    }
    return [...this.recruitments]
      .sort((a, b) => cmp(a[0].toLowerCase(), b[0].toLowerCase()))
      .map(([recrue, recruteur]) => ({
        recrue, recruteur, points: totals.get(recrue) ?? 0, bonus_step: reached.get(recrue) ?? null,
      }));
  }

  knownPlayers(): Set<string> {
    const s = new Set<string>();
    for (const results of this.stepResults.values()) for (const r of results) s.add(r.joueur);
    return s;
  }

  top(n = 3) {
    if (!this.steps.length) return [];
    return this.rankingUpTo(this.steps[this.steps.length - 1]).ranking.slice(0, n);
  }
}

export interface Player {
  joueur: string;
  total: number;
  etapes: number;
  victoires: number;
  parties: number;
  recrutement: number;
  par_etape: Record<number, number>;
}

// ── Couleurs joueurs (identiques à drawing._player_color) ────────────────────

const PLAYER_PALETTE = [
  "#e74c3c", "#2ecc71", "#3498db", "#f39c12", "#9b59b6", "#1abc9c", "#e67e22",
  "#e84393", "#00cec9", "#fdcb6e", "#6c5ce7", "#55efc4", "#fd79a8", "#74b9ff",
  "#a29bfe", "#ffeaa7", "#d63031", "#00b894", "#0984e3", "#b2bec3",
];

export function playerColor(name: string): string {
  return PLAYER_PALETTE[parseInt(md5(name).slice(0, 8), 16) % PLAYER_PALETTE.length];
}
