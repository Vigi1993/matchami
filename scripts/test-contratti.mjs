/**
 * Test della separazione tra contratti in corso e storico (src/lib/contratti.ts).
 * Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const c = caricaTs(path.join(radice, "src", "lib", "contratti.ts"));
const migrazioni = path.join(radice, "supabase", "migrations");
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8");

const k = (id, stato) => ({ id, stato });

// ------------------------------------------------------------
// Gli stati
// ------------------------------------------------------------

function statiDelDatabase() {
  const m = leggi("supabase", "migrations", "0001_init.sql").match(/create type stato_contratto as enum \(([^)]*)\)/);
  assert.ok(m, "non trovo l'enumerato nella 0001");
  const stati = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  for (const f of fs.readdirSync(migrazioni).filter((x) => /^\d{4}_.*\.sql$/.test(x)).sort()) {
    for (const a of fs.readFileSync(path.join(migrazioni, f), "utf8").matchAll(/alter type stato_contratto add value (?:if not exists )?'([^']+)'/g)) stati.push(a[1]);
  }
  return stati;
}

test("stati: quelli dell'app sono quelli del database, nello stesso ordine", () => {
  assert.deepEqual([...c.STATI_CONTRATTO], statiDelDatabase());
  const tipo = leggi("src", "lib", "types.ts").match(/export type StatoContratto = ([^;]+);/);
  assert.ok(tipo, "non trovo il tipo nell'app");
  assert.deepEqual([...tipo[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]), statiDelDatabase());
});

test("stati: ognuno ha un'etichetta e un aspetto, e le etichette sono diverse", () => {
  assert.deepEqual(Object.keys(c.STATO_LABEL), [...c.STATI_CONTRATTO]);
  assert.deepEqual(Object.keys(c.STATO_BADGE), [...c.STATI_CONTRATTO]);
  const e = Object.values(c.STATO_LABEL);
  assert.equal(new Set(e).size, e.length, "due stati con la stessa etichetta");
  assert.equal(c.STATO_LABEL.concluso, "Concluso");
});

test("stati: uno sconosciuto non produce «undefined»", () => {
  assert.equal(c.etichettaStato("sospeso"), "sospeso");
  assert.equal(c.badgeStato("sospeso"), "is-off");
  assert.equal(c.etichettaStato("firmato"), "Firmato");
  assert.equal(c.badgeStato("in_firma"), "is-wait");
});

// ------------------------------------------------------------
// Storico
// ------------------------------------------------------------

test("storico: solo un contratto concluso, nessun altro stato", () => {
  assert.equal(c.inStorico("concluso"), true);
  for (const s of ["bozza", "in_firma", "firmato", "", "CONCLUSO", "sospeso", null, undefined, 0]) assert.equal(c.inStorico(s), false, String(s));
});

test("gruppi: ogni contratto sta in uno e un solo gruppo, e l'ordine di arrivo si mantiene", () => {
  const e = [k(1, "bozza"), k(2, "concluso"), k(3, "firmato"), k(4, "concluso"), k(5, "in_firma"), k(6, "firmato")];
  const g = c.raggruppaContratti(e);
  assert.deepEqual(g.inCorso.map((x) => x.id), [1, 3, 5, 6]);
  assert.deepEqual(g.storico.map((x) => x.id), [2, 4]);
  assert.equal(g.inCorso.length + g.storico.length, e.length);
});

test("gruppi: elenco vuoto, solo in corso, solo storico", () => {
  assert.deepEqual(c.raggruppaContratti([]), { inCorso: [], storico: [] });
  assert.equal(c.raggruppaContratti([k(1, "firmato")]).storico.length, 0);
  assert.equal(c.raggruppaContratti([k(1, "concluso")]).inCorso.length, 0);
});

test("gruppi: uno stato mai visto resta tra quelli in corso, la scheda non sparisce", () => {
  const g = c.raggruppaContratti([k(1, "stato_di_domani"), k(2, "concluso")]);
  assert.deepEqual(g.inCorso.map((x) => x.id), [1]);
  assert.deepEqual(g.storico.map((x) => x.id), [2]);
});

test("gruppi: l'elenco di partenza non viene modificato, e i campi restano quelli", () => {
  const e = [{ id: 1, stato: "concluso", canone: 900, nome: "Olga" }, { id: 2, stato: "bozza", canone: null, nome: null }];
  const copia = JSON.parse(JSON.stringify(e));
  const g = c.raggruppaContratti(e);
  assert.deepEqual(e, copia);
  assert.equal(g.storico[0], e[0], "restituisce gli stessi oggetti, non copie alterate");
});

test("gruppi: quattrocento contratti si dividono senza perderne nessuno", () => {
  const e = Array.from({ length: 400 }, (_, i) => k(i, c.STATI_CONTRATTO[i % 4]));
  const g = c.raggruppaContratti(e);
  assert.equal(g.inCorso.length, 300); assert.equal(g.storico.length, 100);
});

test("testo: nessun contratto in corso", () => {
  assert.equal(c.NESSUN_CONTRATTO_IN_CORSO, "Nessun contratto in corso.");
  assert.ok(!/\b(lui|lei)\b/i.test(c.NESSUN_CONTRATTO_IN_CORSO));
});

// ------------------------------------------------------------
// Le due schermate usano la stessa logica (non più una copia ciascuna)
// ------------------------------------------------------------

test("le due schermate importano gli stati da lib/contratti e non ne hanno una copia propria", () => {
  for (const f of [["src", "app", "(app)", "gestione", "GestioneClient.tsx"], ["src", "app", "(app)", "gestione-affitti", "GestioneAffittiClient.tsx"]]) {
    const codice = leggi(...f);
    assert.match(codice, /from "@\/lib\/contratti"/, `${f.at(-1)} non usa lib/contratti`);
    assert.ok(!/const STATO_LABEL\b|const STATO_BADGE\b|const STATI\b/.test(codice), `${f.at(-1)} ha ancora una copia propria degli stati`);
    assert.match(codice, /\braggruppaContratti\(/, `${f.at(-1)} non separa i contratti: manca la chiamata`);
    assert.match(codice, /Storico — \{storico\.length\}/, `${f.at(-1)} non mostra il gruppo Storico`);
  }
});
