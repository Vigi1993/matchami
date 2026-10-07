/**
 * Test del ritiro di una candidatura (src/lib/candidature.ts). Si lancia con:   npm test
 *
 * Oltre alla logica, tengono allineati l'app e la migrazione 0020: gli stati,
 * il momento in cui si può ritirare, i codici di errore. E controllano la
 * regola di PostgreSQL che su Supabase si scoprirebbe solo eseguendo la
 * migrazione: un valore aggiunto a un enumerato non si può usare nella stessa
 * transazione.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const c = caricaTs(path.join(radice, "src", "lib", "candidature.ts"));
const v = caricaTs(path.join(radice, "src", "lib", "verifica.ts"));
const migrazioni = path.join(radice, "supabase", "migrations");
const sql = fs.readFileSync(path.join(migrazioni, "0020_ritira_candidatura.sql"), "utf8");
const sql0001 = fs.readFileSync(path.join(migrazioni, "0001_init.sql"), "utf8");
const tipi = fs.readFileSync(path.join(radice, "src", "lib", "types.ts"), "utf8");

// ------------------------------------------------------------
// Gli stati
// ------------------------------------------------------------

/** Gli stati di una candidatura nel database: quelli della 0001 più quelli aggiunti dopo. */
function statiDelDatabase() {
  const m = sql0001.match(/create type stato_candidatura as enum \(([^)]*)\)/);
  assert.ok(m, "non trovo l'enumerato nella 0001");
  const stati = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  for (const f of fs.readdirSync(migrazioni).filter((x) => /^\d{4}_.*\.sql$/.test(x)).sort()) {
    const testo = fs.readFileSync(path.join(migrazioni, f), "utf8");
    for (const a of testo.matchAll(/alter type stato_candidatura add value (?:if not exists )?'([^']+)'/g)) stati.push(a[1]);
  }
  return stati;
}

test("stati: quelli dell'app sono quelli del database", () => {
  const m = tipi.match(/export type StatoCandidatura = ([^;]+);/);
  assert.ok(m, "non trovo il tipo nell'app");
  const nellApp = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
  assert.deepEqual(nellApp, [...new Set(statiDelDatabase())].sort());
});

test("stati: ognuno ha un'etichetta e un aspetto, e «ritirata» non si confonde con gli altri", () => {
  const stati = [...new Set(statiDelDatabase())];
  assert.deepEqual(Object.keys(c.STATO_LABEL).sort(), [...stati].sort());
  assert.deepEqual(Object.keys(c.STATO_BADGE).sort(), [...stati].sort());
  const etichette = Object.values(c.STATO_LABEL);
  assert.equal(new Set(etichette).size, etichette.length, "due stati con la stessa etichetta");
  assert.equal(c.STATO_LABEL.ritirata, "Ritirata");
});

// ------------------------------------------------------------
// Quando si può ritirare
// ------------------------------------------------------------

test("ritiro: si può solo da «in attesa», come nel database", () => {
  assert.ok(sql.includes("if v_stato <> 'in_attesa' then"), "la funzione del database è cambiata");
  assert.equal(c.puoRitirare("in_attesa"), true);
  for (const s of ["accettata", "rifiutata", "ritirata"]) assert.equal(c.puoRitirare(s), false, s);
});

// ------------------------------------------------------------
// I gruppi e il riepilogo
// ------------------------------------------------------------

const cand = (id, status) => ({ id, status });

test("gruppi: ogni candidatura sta in uno e un solo gruppo", () => {
  const e = [cand(1, "in_attesa"), cand(2, "accettata"), cand(3, "rifiutata"), cand(4, "ritirata"), cand(5, "in_attesa"), cand(6, "ritirata")];
  const g = c.raggruppaCandidature(e);
  assert.equal(g.accettate.length + g.inAttesa.length + g.rifiutate.length + g.ritirate.length, e.length);
  assert.deepEqual(g.ritirate.map((x) => x.id), [4, 6]);
  assert.deepEqual(g.inAttesa.map((x) => x.id), [1, 5]);
  assert.deepEqual(g.accettate.map((x) => x.id), [2]);
  assert.deepEqual(g.rifiutate.map((x) => x.id), [3]);
});

test("gruppi: l'elenco vuoto e uno stato mai visto non fanno crollare niente", () => {
  const g = c.raggruppaCandidature([]);
  assert.deepEqual([g.accettate, g.inAttesa, g.rifiutate, g.ritirate], [[], [], [], []]);
  const strano = c.raggruppaCandidature([cand(1, "stato_di_domani")]);
  assert.equal(strano.accettate.length + strano.inAttesa.length + strano.rifiutate.length + strano.ritirate.length, 0);
});

test("riepilogo: nessuna, una, più, con match e con ritirate", () => {
  assert.equal(c.riepilogoCandidature([]), "Gli annunci a cui ti candidi arrivano qui.");
  assert.equal(c.riepilogoCandidature([cand(1, "in_attesa")]), "1 candidatura inviata.");
  assert.equal(c.riepilogoCandidature([cand(1, "in_attesa"), cand(2, "rifiutata")]), "2 candidature inviate.");
  assert.equal(c.riepilogoCandidature([cand(1, "accettata"), cand(2, "in_attesa")]), "2 candidature inviate · 1 match.");
  assert.equal(c.riepilogoCandidature([cand(1, "in_attesa"), cand(2, "ritirata")]), "2 candidature inviate · 1 ritirata.");
  assert.equal(c.riepilogoCandidature([cand(1, "accettata"), cand(2, "ritirata"), cand(3, "ritirata")]), "3 candidature inviate · 1 match · 2 ritirate.");
  assert.equal(c.riepilogoCandidature([cand(1, "ritirata")]), "1 candidatura inviata · 1 ritirata.");
});

// ------------------------------------------------------------
// Cosa si dice prima di ritirare
// ------------------------------------------------------------

test("conferma: dice le due conseguenze, con il titolo se c'è", () => {
  const t = c.testoConfermaRitiro("Bilocale Isola");
  assert.match(t, /«Bilocale Isola»/);
  assert.match(t, /il proprietario non la vedrà più/);
  assert.match(t, /non potrai candidarti di nuovo a questo annuncio/);
  assert.match(t, /Puoi comunque candidarti ad altri/);
});

test("conferma: senza titolo usa una formula neutra, mai «undefined» o «null»", () => {
  for (const x of [null, undefined, "", "   "]) {
    const t = c.testoConfermaRitiro(x);
    assert.match(t, /questo annuncio/);
    assert.ok(!/undefined|null|«»/.test(t), t);
  }
});

test("conferma: un titolo con codice dentro resta testo", () => {
  const titolo = '<img src=x onerror="alert(1)">';
  assert.ok(c.testoConfermaRitiro(titolo).includes(titolo));
});

test("testi: non presumono il genere di nessuno", () => {
  for (const t of [c.testoConfermaRitiro("Casa"), c.NOTA_RITIRATA]) {
    assert.ok(!/\b(lui|lei|candidato|iscritto|iscritta)\b/i.test(t), t);
  }
});

test("la nota di una ritirata dice le stesse cose della conferma", () => {
  assert.match(c.NOTA_RITIRATA, /il proprietario non la vede più/);
  assert.match(c.NOTA_RITIRATA, /non puoi ricandidarti a questo annuncio/);
});

// ------------------------------------------------------------
// Gli errori
// ------------------------------------------------------------

const GENERICO = v.messaggioErroreVerifica("qualcosa di sconosciuto");

test("errori: ogni codice che la migrazione può sollevare ha una frase sua", () => {
  const codici = [...new Set([...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]))];
  assert.ok(codici.length >= 7, `trovati solo ${codici.length} codici`);
  for (const cod of codici) {
    const frase = v.messaggioErroreVerifica(`ERROR: ${cod} (P0001)`);
    assert.notEqual(frase, GENERICO, `il codice ${cod} non ha un messaggio: la persona vedrebbe «Riprova»`);
    assert.ok(!frase.includes(cod), `${cod} compare nella frase`);
  }
});

test("errori: la candidatura ritirata e quella non ritirabile non si confondono con «già valutata»", () => {
  const ritirata = v.messaggioErroreVerifica("CANDIDATURA_RITIRATA");
  const valutata = v.messaggioErroreVerifica("CANDIDATURA_GIA_VALUTATA");
  const nonRitirabile = v.messaggioErroreVerifica("CANDIDATURA_NON_RITIRABILE");
  assert.notEqual(ritirata, valutata);
  assert.notEqual(nonRitirabile, valutata);
  assert.match(ritirata, /ritirato la candidatura/);
  assert.match(nonRitirabile, /non si può più ritirare/);
  assert.ok(!/[A-Z_]{8,}/.test(ritirata + nonRitirabile), "codice tecnico nella frase");
});

// ------------------------------------------------------------
// La regola di PostgreSQL sull'enumerato (la insidia di questa migrazione)
// ------------------------------------------------------------

/** La migrazione senza commenti e senza i corpi delle funzioni (si compilano alla prima esecuzione). */
function partiCheSiCompilanoSubito(testo) {
  return testo
    .replace(/--[^\n]*/g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, "$$$$");
}

test("migrazione: il valore nuovo si aggiunge con «if not exists» (si può rilanciare)", () => {
  assert.match(sql, /alter type stato_candidatura add value if not exists 'ritirata';/);
});

test("migrazione: dove si compila subito, «ritirata» si confronta come TESTO, mai come enumerato", () => {
  const subito = partiCheSiCompilanoSubito(sql);
  const usi = [...subito.matchAll(/'ritirata'/g)];
  assert.ok(usi.length >= 4, `attesi almeno 4 usi (policy, vista), trovati ${usi.length}`);
  for (const m of usi) {
    const prima = subito.slice(Math.max(0, m.index - 90), m.index);
    const ammesso = /alter type stato_candidatura add value (if not exists )?$/.test(prima) || /::text\s*(<>|=)\s*$/.test(prima);
    assert.ok(ammesso, `uso non sicuro di 'ritirata' fuori da una funzione: «…${prima.trim().slice(-30)} 'ritirata'»`);
  }
});

test("migrazione: il controllo sa fermare un confronto diretto con l'enumerato", () => {
  const cattiva = "create policy x on t using (status <> 'ritirata');";
  const subito = partiCheSiCompilanoSubito(cattiva);
  const m = [...subito.matchAll(/'ritirata'/g)][0];
  const prima = subito.slice(Math.max(0, m.index - 90), m.index);
  assert.ok(!(/alter type stato_candidatura add value (if not exists )?$/.test(prima) || /::text\s*(<>|=)\s*$/.test(prima)));
  // e uno corretto passa
  const buona = partiCheSiCompilanoSubito("create policy x on t using (status::text <> 'ritirata');");
  const m2 = [...buona.matchAll(/'ritirata'/g)][0];
  assert.ok(/::text\s*(<>|=)\s*$/.test(buona.slice(Math.max(0, m2.index - 90), m2.index)));
});

test("migrazione: i corpi delle funzioni non vengono scambiati per parti che si compilano subito", () => {
  const subito = partiCheSiCompilanoSubito("create function f() returns void as $$ begin update t set status = 'ritirata'; end; $$ language plpgsql;");
  assert.ok(!subito.includes("'ritirata'"));
});

test("migrazione: la vista mantiene le opzioni di sicurezza e i permessi della 0016", () => {
  assert.match(sql, /create or replace view public\.candidati_del_proprietario\s+with \(security_barrier = true\)/);
  assert.match(sql, /revoke all on public\.candidati_del_proprietario from public, anon;/);
  assert.match(sql, /grant select on public\.candidati_del_proprietario to authenticated;/);
});

test("migrazione: il ritiro non è chiamabile da chi non ha un account", () => {
  assert.match(sql, /grant execute on function public\.ritira_candidatura\(uuid\) to authenticated;/);
  assert.ok(!/ritira_candidatura\(uuid\) to anon/.test(sql));
});
