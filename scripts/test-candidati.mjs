/**
 * Test dell'assemblaggio di ciò che il proprietario vede dei candidati
 * (src/lib/candidati.ts). Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

// candidati.ts importa "@/lib/match" e "@/lib/types": il caricatore non conosce l'alias,
// quindi si legge il file sostituendo gli import con percorsi relativi.
const sorgente = fs.readFileSync(path.join(radice, "src", "lib", "candidati.ts"), "utf8")
  .replace('from "@/lib/match"', 'from "./match"').replace('from "@/lib/types"', 'from "./types"');
const copia = path.join(radice, "src", "lib", "__candidati_test.ts");
fs.writeFileSync(copia, sorgente);
const c = caricaTs(copia);
fs.unlinkSync(copia);
const { assemblaCandidature, profiloDaVista, COLONNE_VISTA_CANDIDATI } = c;
const { valutaCandidato } = caricaTs(path.join(radice, "src", "lib", "match", "index.ts"));

const riga = (id, o = {}) => ({ id, status: "in_attesa", match_pct: null, created_at: "2026-10-01", tenant_id: "t" + id, listing_id: "L1",
  listings: { titolo: "Casa", zona: "Isola", prezzo: 1500 }, ...o });
const vista = (id, o = {}) => ({ candidatura_id: id, nome: "Tina", cognome: "Rossi", professione: "Dipendente", reddito_mensile: 1800, reddito_nucleo: 4800,
  garante: true, fideiussione: false, protestato: false, verificato: false, presentazione: "Una presentazione lunga.", avatar_url: "http://a/x.jpg",
  animali_compilato: true, nucleo_compilato: true, ...o });
const criteri = new Map([["L1", [{ chiave: "redditoCanone", peso: 8, modo: "obbligatorio", sogliaPct: 33 }, { chiave: "garante", peso: 5, modo: "preferenziale" }]]]);
const base = { criteriPerListing: criteri, recensioniPerTenant: new Map(), valutazioni: [] };
/** le recensioni come arrivano dal database: voto, chi l'ha scritta, quando */
const rec = (voto, autore, quando = "2026-06-01T10:00:00Z") => ({ voto, autore_id: autore, created_at: quando });
const ORA = Date.parse("2026-10-15T12:00:00Z");
const assembla = (candidature, v, extra = {}) => assemblaCandidature({ ...base, candidature, vista: v, ...extra });

test("profiloDaVista: animali e nucleo arrivano solo come 'compilato', mai come valore", () => {
  const p = profiloDaVista(vista("1"));
  assert.equal(p.animali_compilato, true);
  assert.equal(p.nucleo_compilato, true);
  assert.ok(!("animali" in p) && !("nucleo" in p) && !("figli" in p), "il profilo contiene un campo che il proprietario non deve vedere");
});

test("profiloDaVista: una riga vuota, nulla o parziale non fa mai crollare", () => {
  for (const x of [null, undefined, {}, { nome: "x" }]) {
    const p = profiloDaVista(x);
    assert.equal(p.animali_compilato, false); assert.equal(p.verificato, false); assert.equal(p.reddito_nucleo, null);
  }
});

test("profiloDaVista: 'compilato' vale solo se è davvero true (null e stringhe no)", () => {
  assert.equal(profiloDaVista({ animali_compilato: null }).animali_compilato, false);
  assert.equal(profiloDaVista({ animali_compilato: "true" }).animali_compilato, false);
  assert.equal(profiloDaVista({ verificato: null }).verificato, false);
});

test("la richiesta alla vista non nomina colonne che il proprietario non deve leggere", () => {
  // nomi di colonna interi: "nucleo" è vietato, "reddito_nucleo" e "nucleo_compilato" no
  const colonne = COLONNE_VISTA_CANDIDATI.split(",").map((x) => x.trim());
  for (const vietata of ["figli", "animali", "nucleo", "consenso_marketing", "consenso_terzi", "privacy_accettata", "redditi_nucleo", "verifica_stato", "onboarding_completato"]) {
    assert.ok(!colonne.includes(vietata), `chiede "${vietata}"`);
  }
  for (const serve of ["candidatura_id", "nome", "cognome", "reddito_nucleo", "animali_compilato", "nucleo_compilato"]) {
    assert.ok(colonne.includes(serve), `manca "${serve}"`);
  }
  assert.equal(new Set(colonne).size, colonne.length, "una colonna è nominata due volte");
});

test("in attesa: il match si ricalcola sui dati attuali, non congelato", () => {
  const [r] = assembla([riga("1")], [vista("1")]);
  assert.equal(r.valutazione.congelata, false);
  assert.equal(r.valutazione.match.punteggio, 99, "reddito 4800 su canone 1500 (31%) e garante: tutto soddisfatto");
});

test("decisa con una valutazione registrata: si mostra quella, anche se i dati sono cambiati", () => {
  const registrata = JSON.parse(JSON.stringify(valutaCandidato({ criteri: criteri.get("L1"), canone: 1500, profilo: profiloDaVista(vista("1", { reddito_nucleo: 2000 })), recensioni: { numero: 0, media: null } })));
  const [r] = assembla([riga("1", { status: "accettata" })], [vista("1", { reddito_nucleo: 9999 })], { valutazioni: [{ candidatura_id: "1", valutazione: registrata }] });
  assert.equal(r.valutazione.congelata, true);
  assert.equal(r.valutazione.match.bloccato, true, "la valutazione registrata aveva il reddito troppo basso");
});

test("RIFIUTATA: la vista dà solo il nome, e la valutazione registrata si legge comunque", () => {
  const vuota = vista("1", { professione: null, reddito_mensile: null, reddito_nucleo: null, garante: null, fideiussione: null, protestato: null, verificato: null, presentazione: null, avatar_url: null, animali_compilato: null, nucleo_compilato: null });
  const registrata = JSON.parse(JSON.stringify(valutaCandidato({ criteri: criteri.get("L1"), canone: 1500, profilo: profiloDaVista(vista("1")), recensioni: { numero: 0, media: null } })));
  const [r] = assembla([riga("1", { status: "rifiutata" })], [vuota], { valutazioni: [{ candidatura_id: "1", valutazione: registrata }] });
  assert.equal(r.nome, "Tina"); assert.equal(r.cognome, "Rossi");
  assert.equal(r.valutazione.congelata, true);
  assert.equal(r.tenant_profiles.reddito_nucleo, null); assert.equal(r.tenant_profiles.avatar_url, null);
  assert.equal(r.tenant_profiles.verificato, false);
});

test("RIFIUTATA senza valutazione registrata (decisa prima): non crolla, si ricalcola sui dati vuoti", () => {
  const vuota = vista("1", { professione: null, reddito_nucleo: null, garante: null, protestato: null, verificato: null });
  const [r] = assembla([riga("1", { status: "rifiutata" })], [vuota]);
  assert.equal(r.valutazione.congelata, false);
  assert.equal(typeof r.valutazione.match.punteggio, "number");
});

test("valutazione registrata rovinata: si ricalcola invece di mostrare spazzatura", () => {
  for (const x of [null, "x", {}, { match: null }, { affidabilita: 5 }]) {
    const [r] = assembla([riga("1", { status: "accettata" })], [vista("1")], { valutazioni: [{ candidatura_id: "1", valutazione: x }] });
    assert.equal(r.valutazione.congelata, false, JSON.stringify(x));
  }
});

test("manca la riga della vista (non dovrebbe): niente crollo, nome vuoto", () => {
  const [r] = assembla([riga("1")], []);
  assert.equal(r.nome, null); assert.equal(r.tenant_profiles.reddito_nucleo, null);
  assert.equal(typeof r.valutazione.match.punteggio, "number");
});

test("la valutazione di una candidatura non finisce mai su un'altra", () => {
  const a = JSON.parse(JSON.stringify(valutaCandidato({ criteri: criteri.get("L1"), canone: 1500, profilo: profiloDaVista(vista("1", { reddito_nucleo: 1000 })), recensioni: { numero: 0, media: null } })));
  const risultati = assembla([riga("1", { status: "accettata" }), riga("2", { status: "accettata" })], [vista("1"), vista("2")], { valutazioni: [{ candidatura_id: "1", valutazione: a }] });
  assert.equal(risultati[0].valutazione.congelata, true);
  assert.equal(risultati[1].valutazione.congelata, false, "la seconda non ha valutazione registrata");
  assert.equal(risultati[0].valutazione.match.bloccato, true); assert.equal(risultati[1].valutazione.match.bloccato, false);
});

test("l'ordine delle candidature e i loro dati restano quelli di arrivo", () => {
  const out = assembla([riga("3"), riga("1"), riga("2")], [vista("1", { nome: "Uno" }), vista("2", { nome: "Due" }), vista("3", { nome: "Tre" })]);
  assert.deepEqual(out.map((x) => [x.id, x.nome]), [["3", "Tre"], ["1", "Uno"], ["2", "Due"]]);
});

test("le recensioni sono quelle dell'inquilino giusto, e NON cambiano il punteggio di affidabilità", () => {
  const voti = new Map([["t1", [rec(5, "o1"), rec(5, "o2"), rec(5, "o3")]], ["t2", [rec(1, "o1")]]]);
  const out = assembla([riga("1"), riga("2")], [vista("1"), vista("2")], { recensioniPerTenant: voti, ora: ORA });
  assert.deepEqual(out[0].valutazione.recensioni, { numero: 3, media: 5 }); assert.deepEqual(out[1].valutazione.recensioni, { numero: 1, media: 1 });
  assert.equal(out[0].valutazione.affidabilita, out[1].valutazione.affidabilita, "due persone con gli stessi dati hanno lo stesso punteggio, qualunque recensione abbiano");
  const senza = assembla([riga("1")], [vista("1")]); assert.deepEqual(senza[0].valutazione.recensioni, { numero: 0, media: null });
});

test("l'output non contiene nessun campo che il proprietario non deve vedere", () => {
  const [r] = assembla([riga("1")], [vista("1")]);
  const testo = JSON.stringify(r);
  for (const vietato of ["figli", "\"animali\"", "\"nucleo\"", "consenso", "privacy_accettata", "redditi_nucleo", "match_proprietario"]) {
    assert.ok(!testo.includes(vietato), `compare "${vietato}"`);
  }
});

test("badge «Inquilino raccomandato»: due recensioni positive da due proprietari DIVERSI; lo stesso proprietario due volte non basta; una negativa lo toglie", () => {
  const raccomandato = (recensioni) => assembla([riga("1")], [vista("1")], { recensioniPerTenant: new Map([["t1", recensioni]]), ora: ORA })[0].valutazione.raccomandato;
  assert.equal(raccomandato([rec(5, "o1"), rec(4, "o2")]), true); assert.equal(raccomandato([rec(5, "o1"), rec(5, "o1")]), false, "lo stesso proprietario due volte conta una"); assert.equal(raccomandato([rec(5, "o1")]), false);
  assert.equal(raccomandato([rec(5, "o1"), rec(5, "o2"), rec(2, "o3")]), false, "una negativa recente lo toglie"); assert.equal(raccomandato([rec(5, "o1"), rec(5, "o2"), rec(3, "o3")]), true, "3 stelle è neutra"); assert.equal(raccomandato([]), false);
  assert.equal(assembla([riga("1")], [vista("1")])[0].valutazione.raccomandato, false, "senza recensioni non c'è badge, e il campo c'è comunque");
});

test("badge: la fotografia lo conserva dopo la decisione e non lo ricalcola; quelle vecchie (senza) non lo mostrano", () => {
  const dec = (valutazione) => assembla([{ ...riga("1"), status: "accettata" }], [vista("1")], { valutazioni: [{ candidatura_id: "1", valutazione }], recensioniPerTenant: new Map([["t1", [rec(5, "o1"), rec(5, "o2")]]]), ora: ORA })[0].valutazione;
  const viva = assembla([riga("1")], [vista("1")], { recensioniPerTenant: new Map([["t1", [rec(5, "o1"), rec(5, "o2")]]]), ora: ORA })[0].valutazione;
  const foto = JSON.parse(JSON.stringify({ match: viva.match, affidabilita: viva.affidabilita, recensioni: viva.recensioni, raccomandato: false }));
  assert.equal(viva.raccomandato, true); assert.equal(dec(foto).raccomandato, false, "decisa quando non lo era: resta come allora, anche se oggi lo è"); assert.equal(dec(foto).congelata, true);
  const vecchia = { match: viva.match, affidabilita: viva.affidabilita }; assert.equal("raccomandato" in dec(vecchia), false, "una fotografia senza il dato non lo inventa");
});
