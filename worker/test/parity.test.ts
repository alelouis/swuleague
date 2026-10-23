// Contrôle de parité : le portage TypeScript du barème doit reproduire exactement
// les vues calculées par l'app Python sur les vraies données (test/fixtures.json).
//   npm test

import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { League, type LeagueData } from "../src/scoring.ts";
import { parsePaste } from "../src/melee.ts";
import { md5 } from "../src/md5.ts";

interface Fixture {
  set: string;
  shop: string;
  data: LeagueData;
  expected: { season: unknown; recruitments: unknown; top: { joueur: string; total: number }[] };
}

const fixtures: Fixture[] = JSON.parse(readFileSync(new URL("./fixtures.json", import.meta.url), "utf-8"));
const normalize = (v: unknown) => JSON.parse(JSON.stringify(v));

for (const f of fixtures) {
  test(`${f.set}/${f.shop} — classements, étapes et couleurs`, () => {
    const league = new League(f.data);
    assert.deepEqual(normalize(league.seasonView()), f.expected.season);
  });
  test(`${f.set}/${f.shop} — recrutement et podium`, () => {
    const league = new League(f.data);
    assert.deepEqual(normalize(league.recruitmentView()), f.expected.recruitments);
    assert.deepEqual(league.top().map((p) => ({ joueur: p.joueur, total: p.total })), f.expected.top);
  });
}

test("md5 identique à hashlib", () => {
  assert.equal(md5(""), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(md5("Sortilèges"), "de23ea3483eb0c572aef017cedcdd1f8"); // UTF-8 multi-octets
  assert.equal(md5("The quick brown fox jumps over the lazy dog"), "9e107d9d372bb6826bd81d3542a419d6");
});

test("copié-collé melee.gg", () => {
  const rows = parsePaste("Rang\tJoueur\n1\nFoo Il/Lui\n2-1-0\t6\n2\nBar\n1-2-0\t3");
  assert.deepEqual(rows, [
    { joueur: "Foo", victoires: 2, defaites: 1, nuls: 0, recrutement: 0 },
    { joueur: "Bar", victoires: 1, defaites: 2, nuls: 0, recrutement: 0 },
  ]);
});
