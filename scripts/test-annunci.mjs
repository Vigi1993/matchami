/**
 * Test dei dati obbligatori dell'annuncio e della classe energetica
 * (src/lib/annunci). Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const en = caricaTs(path.join(radice, "src", "lib", "annunci", "energia.ts"));
const ob = caricaTs(path.join(radice, "src", "lib", "annunci", "obbligatori.ts"));
const v = caricaTs(path.join(radice, "src", "lib", "verifica.ts"));
const { INFORMATIVA } = caricaTs(path.join(radice, "src", "content", "informativa.ts"));
const sql = fs.readFileSync(path.join(radice, "supabase", "migrations", "0026_dati_obbligatori_annuncio.sql"), "utf8");
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8");

// ============================================================ la classe
test("classi: le dieci, dalla migliore alla peggiore", () => {
  assert.deepEqual([...en.CLASSI_ENERGETICHE], ["A4", "A3", "A2", "A1", "B", "C", "D", "E", "F", "G"]);
});

test("classe valida: solo le dieci, scritte esattamente così", () => {
  for (const c of en.CLASSI_ENERGETICHE) assert.equal(en.classeValida(c), true, c);
  for (const x of ["a4", "A", "H", "A5", "B+", " B", "B ", "", "AA", "1", null, undefined, 4, {}, ["B"], "B\n", "Ｂ"]) assert.equal(en.classeValida(x), false, JSON.stringify(x));
});

test("leggere la classe da un modulo: vuota = non indicata; fuori lista = errore", () => {
  for (const x of ["", "  ", null, undefined]) assert.deepEqual(en.leggiClasse(x), { ok: true, valore: null }, JSON.stringify(x));
  assert.deepEqual(en.leggiClasse(" C "), { ok: true, valore: "C" }, "gli spazi ai lati si tolgono");
  for (const x of ["H", "a4", "B+", "A", "DROP TABLE"]) { const r = en.leggiClasse(x); assert.equal(r.ok, false, x); assert.match(r.errore, /non è valida/); }
});

test("giudizio a parole: ogni classe ha un tono, e la scala è coerente", () => {
  const t = Object.fromEntries(en.CLASSI_ENERGETICHE.map((c) => [c, en.tonoClasse(c)]));
  assert.deepEqual(t, { A4: "ottima", A3: "ottima", A2: "ottima", A1: "ottima", B: "buona", C: "buona", D: "media", E: "media", F: "scarsa", G: "scarsa" });
});

// ============================================================ l'indice
test("indice: vuoto = non indicato; virgola o punto; arrotonda a due decimali", () => {
  for (const x of ["", "   ", null, undefined]) assert.deepEqual(en.leggiEp(x), { ok: true, valore: null }, JSON.stringify(x));
  assert.deepEqual(en.leggiEp("95,5"), { ok: true, valore: 95.5 }); assert.deepEqual(en.leggiEp("95.5"), { ok: true, valore: 95.5 });
  assert.deepEqual(en.leggiEp("123,456"), { ok: true, valore: 123.46 }); assert.deepEqual(en.leggiEp("0,001"), { ok: true, valore: 0 });
  assert.deepEqual(en.leggiEp("000012"), { ok: true, valore: 12 }); assert.deepEqual(en.leggiEp(95.5), { ok: true, valore: 95.5 }); assert.deepEqual(en.leggiEp(" 120 "), { ok: true, valore: 120 });
});

test("indice: i bordi, 0 e 999,99 sì; negativo, 1000 e oltre no", () => {
  assert.deepEqual(en.leggiEp("0"), { ok: true, valore: 0 }); assert.deepEqual(en.leggiEp("999,99"), { ok: true, valore: 999.99 });
  for (const x of ["1000", "1000,01", "99999", "-1", "-0,5", "999,995"]) assert.equal(en.leggiEp(x).ok, false, x);
  assert.match(en.leggiEp("1000").errore, /da 0 a 999,99/);
});

test("indice: ciò che non è un numero è un errore che dice come scriverlo", () => {
  for (const x of ["alto", "1e3", "9 5", "95,5,3", ",5", "5,", "٩٥", "95,5 kWh", "NaN", "Infinity", "0x10", "+5", "--5", "5-", "1_000", "<script>"]) { const r = en.leggiEp(x); assert.equal(r.ok, false, x); assert.match(r.errore, /è un numero/); }
  assert.equal(en.leggiEp("9".repeat(5000)).ok, false, "un testo enorme non si accetta (e non rallenta)");
});

test("testo mostrato: classe e indice, solo classe, o «Non indicata»", () => {
  assert.equal(en.testoClasse("B", 95.5), "B · 95,5 kWh/m²·anno"); assert.equal(en.testoClasse("A4", 999.99), "A4 · 999,99 kWh/m²·anno", "il massimo ammesso"); assert.equal(en.testoClasse("G", 120), "G · 120 kWh/m²·anno");
  assert.equal(en.testoClasse("B"), "B"); assert.equal(en.testoClasse("B", null), "B"); assert.equal(en.testoClasse("B", ""), "B"); assert.equal(en.testoClasse("B", "boh"), "B");
  assert.equal(en.testoClasse("B", 0), "B · 0 kWh/m²·anno", "lo zero è un valore, non «assente»"); assert.equal(en.testoClasse("B", "95.5"), "B · 95,5 kWh/m²·anno", "un numero arrivato come testo");
  for (const x of [null, undefined, "", "H", "b"]) assert.equal(en.testoClasse(x, 95.5), "Non indicata", JSON.stringify(x));
});

// ============================================================ i dati obbligatori
const COMPLETI = { classe_energetica: "C", luogo_id: "q1", bagni: 1, piano: 0, riscaldamento: "autonomo", tipo_contratto: "libero_4_4", disponibile_dal: "2026-12-01" };

test("obbligatori: sette dati (classe energetica, luogo, bagni, piano, riscaldamento, contratto, disponibilità), e l'elenco è dichiarato provvisorio", () => {
  assert.deepEqual(ob.DATI_OBBLIGATORI.map((d) => d.chiave), ["classe_energetica", "luogo_id", "bagni", "piano", "riscaldamento", "tipo_contratto", "disponibile_dal"]);
  assert.equal(ob.ELENCO_DATI_OBBLIGATORI_PROVVISORIO, true, "se l'elenco è stato confermato da un legale va tolto il «provvisorio» e aggiornato il punto 37");
  for (const d of ob.DATI_OBBLIGATORI) { assert.ok(d.etichetta && d.perche && d.frase); assert.ok(!/\b(lui|lei)\b/i.test(d.frase)); }
});

test("obbligatori: un valore nullo, assente o vuoto vale «manca», per ognuno dei sette; lo zero NO (il piano 0 è il piano terra)", () => {
  assert.deepEqual(ob.datiMancanti(COMPLETI), []); assert.equal(ob.datiMancanti({}).length, 7);
  for (const chiave of Object.keys(COMPLETI)) for (const x of [null, undefined, "", "   "]) assert.deepEqual(ob.datiMancanti({ ...COMPLETI, [chiave]: x }).map((d) => d.chiave), [chiave], `${chiave}=${JSON.stringify(x)}`);
  assert.deepEqual(ob.datiMancanti({ ...COMPLETI, piano: 0 }), [], "il piano terra non è «manca»"); assert.deepEqual(ob.datiMancanti({ ...COMPLETI, piano: -1 }), []);
  for (const c of en.CLASSI_ENERGETICHE) assert.equal(ob.datiMancanti({ ...COMPLETI, classe_energetica: c }).length, 0, c);
  assert.deepEqual(ob.datiMancanti({ ...COMPLETI, bagni: null, piano: null }).map((d) => d.chiave), ["bagni", "piano"], "tutto ciò che manca si dice insieme, nell'ordine dell'elenco");
});

test("obbligatori: ciò che l'app chiede e ciò che il database fa rispettare coincidono", () => {
  // ogni dato obbligatorio dell'app deve essere controllato anche dalla funzione del database:
  // se si aggiunge un dato all'elenco e non alla migrazione, un annuncio incompleto passerebbe
  // vale la versione PIÙ RECENTE della funzione (le migrazioni successive la riscrivono)
  const cartella = path.join(radice, "supabase", "migrations"); const ultima = fs.readdirSync(cartella).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort().filter((f) => fs.readFileSync(path.join(cartella, f), "utf8").includes("create or replace function public.richiedi_verifica_immobile")).pop();
  const testoUltima = fs.readFileSync(path.join(cartella, ultima), "utf8"); assert.equal(ultima, "0031_dati_obbligatori_annuncio_2.sql", "la funzione è stata riscritta di nuovo: aggiorna questo test");
  const funzione = testoUltima.slice(testoUltima.indexOf("create or replace function public.richiedi_verifica_immobile"));
  for (const d of ob.DATI_OBBLIGATORI) assert.match(funzione, new RegExp(`v_listing\\.${d.chiave} is null`), `${d.chiave} non è controllato dal database`);
  // e viceversa: il database non chiede di più di ciò che l'app sa spiegare
  const controlli = [...funzione.matchAll(/v_listing\.(\w+) is null/g)].map((m) => m[1]);
  assert.deepEqual(controlli.sort(), ob.DATI_OBBLIGATORI.map((d) => d.chiave).sort());
});

// ============================================================ coerenza con la migrazione
test("migrazione: le classi e l'intervallo dell'indice sono quelli dell'app", () => {
  const classi = sql.match(/classe_energetica in \(([^)]*)\)/)[1].match(/'([^']+)'/g).map((x) => x.replaceAll("'", ""));
  assert.deepEqual(classi, [...en.CLASSI_ENERGETICHE], "le classi del database e dell'app sono diverse");
  assert.match(sql, /ep_globale >= 0 and ep_globale <= 999\.99/); assert.equal(en.LIMITI_EP.min, 0); assert.equal(en.LIMITI_EP.max, 999.99); assert.match(sql, /numeric\(6, 2\)/);
});

test("migrazione: la richiesta di verifica controlla i dati PRIMA dei documenti, dopo lo stato", () => {
  const f = sql.slice(sql.indexOf("create or replace function public.richiedi_verifica_immobile"));
  const i = (s) => f.indexOf(s);
  assert.ok(i("GIA_IN_VERIFICA") < i("DATI_OBBLIGATORI_MANCANTI") && i("DATI_OBBLIGATORI_MANCANTI") < i("DOCUMENTI_MANCANTI"), "l'ordine dei controlli non è quello previsto");
});

test("errori: ogni codice che la migrazione può sollevare ha una frase sua", () => {
  const G = v.messaggioErroreVerifica("qualcosa di sconosciuto");
  const codici = [...new Set([...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]))]; assert.ok(codici.includes("DATI_OBBLIGATORI_MANCANTI"));
  for (const c of codici) { const f = v.messaggioErroreVerifica(`ERROR: ${c} (P0001)`); assert.notEqual(f, G, `${c} non ha un messaggio`); assert.ok(!f.includes(c), c); }
});

// ============================================================ collegamenti
test("azioni: creare e aggiornare leggono la classe e l'indice, li controllano e li scrivono", () => {
  const a = leggi("src", "app", "(app)", "immobili", "actions.ts");
  assert.equal([...a.matchAll(/leggiClasse\(formData\.get\("classe_energetica"\)\)/g)].length, 2, "la classe va letta in creazione e in aggiornamento");
  assert.equal([...a.matchAll(/leggiEp\(formData\.get\("ep_globale"\)\)/g)].length, 2);
  assert.equal([...a.matchAll(/classe_energetica: classe\.valore/g)].length, 2); assert.equal([...a.matchAll(/ep_globale: ep\.valore/g)].length, 2);
  assert.equal([...a.matchAll(/if \(!classe\.ok\) return \{ error: classe\.errore \}/g)].length, 2); assert.equal([...a.matchAll(/if \(!ep\.ok\) return \{ error: ep\.errore \}/g)].length, 2);
});

test("letture: la pagina degli immobili e la home leggono i dati, e la scheda li mostra", () => {
  assert.match(leggi("src", "app", "(app)", "immobili", "page.tsx"), /classe_energetica, ep_globale/);
  const home = leggi("src", "app", "(app)", "page.tsx"); assert.equal([...home.matchAll(/classe_energetica/g)].length >= 3, true, "la home non legge la classe per le due liste");
  assert.match(leggi("src", "app", "(app)", "SchedaImmobile.tsx"), /testoClasse\(listing\.classe_energetica, listing\.ep_globale\)/);
});

test("privacy: la classe è un dato pubblico dell'annuncio, e l'informativa lo dice", () => {
  assert.match(JSON.stringify(INFORMATIVA), /caratteristiche, classe energetica e foto/);
  assert.ok(!/classe_energetica/.test(sql.replace(/--[^\n]*/g, "").match(/create policy[^;]*;/g)?.join("") ?? ""), "il dato è pubblico: nessuna policy lo nasconde");
});

test("la logica pura non ha accesso alla rete né al browser", () => {
  for (const f of ["energia.ts", "obbligatori.ts"]) {
    const c = leggi("src", "lib", "annunci", f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const vietato of [/\bfetch\(/, /localStorage/, /supabase/i, /console\./, /\bimport\s+(?!type)/]) assert.ok(!vietato.test(c), `${f} usa ${vietato}`);
  }
});
