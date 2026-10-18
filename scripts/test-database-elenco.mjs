/**
 * Test dell'ELENCO del Database inquilini: una lista di persone (candidati e possibili match) divisa per immobile, ordinabile per
 * affidabilità, match e recensioni (dal più alto o dal più basso) con il numerino accanto al nome, e filtrabile. Logica pura.
 * Le regole che contano: chi non ha il dato sta SEMPRE in fondo (anche ordinando dal più basso); toccare due volte lo stesso criterio inverte il verso.
 * Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { caricaTs, radice } from "./carica-ts.mjs";

const el = caricaTs(path.join(radice, "src", "lib", "database-elenco.ts"));

// ---------------------------------------------------------------- i dati di prova
const scheda = (nome, o = {}) => ({ nome, professione: "Impiegato", avatarUrl: null, affidabilita: 50, match: { tipo: "pct", valore: 70 }, raccomandato: false, recensioni: null, redditoVerificato: false, protestiVerificati: null, presentazione: null, incompleto: false, ...o });
const voce = (nome, o = {}, extra = {}) => ({ chiave: "c:" + nome, casaId: "A", stato: "da_valutare", scheda: scheda(nome, o), candidatura: null, possibile: null, ...extra });
const nomi = (l) => l.map((v) => v.scheda.nome);
const ord = (criterio, verso = "decrescente") => ({ criterio, verso });

let n = 0;
const cand = (listing, status, nome, o = {}) => ({ id: "c" + ++n, status, match_pct: null, created_at: `2026-10-${String(10 + (n % 15)).padStart(2, "0")}T10:00:00Z`, tenant_id: "t" + n, listing_id: listing, listings: { titolo: "Bilocale luminoso", zona: "Isola, Milano", prezzo: 1250 }, nome, cognome: "Verdi", tenant_profiles: { professione: "Cuoco", reddito_mensile: 2000, reddito_nucleo: null, verificato: false, presentazione: null, avatar_url: null }, valutazione: { match: { punteggio: 80, etichetta: "Ottima compatibilità", bloccato: false, mancanti: [], criteri: [], incompleto: false }, affidabilita: 60, recensioni: { numero: 0, media: null }, raccomandato: false, congelata: false }, ...o });
const casa = (id, o = {}) => ({ id, titolo: "Casa " + id, zona: "Isola, Milano", prezzo: 1000, foto: null, pubblicata: true, verificata: true, ...o });
const poss = (id, disponibili = []) => ({ id, titolo: "Casa " + id, zona: "Isola", possibili: disponibili.length, disponibili, richieste: [{ id: "r1", stato: "inviata", nome: "Marco" }] });
const sch = (id, o = {}) => ({ tenantId: id, nome: "Dario R.", professione: "Ingegnere", avatarUrl: null, presentazione: null, affidabilita: 80, etichettaAffidabilita: "Eccellente", raccomandato: false, recensioni: { numero: 0, media: null }, redditoVerificato: true, protestiVerificati: null, compatibilita: 90, ...o });
const gruppo = (c, o = {}) => ({ casa: c, spontanei: [], match: [], scartati: [], ritirati: [], possibili: null, ...o });

// ============================================================ i criteri e il verso
test("criteri: sono tre, nell'ordine affidabilità, match, recensioni; si parte dal match dal più alto", () => {
  assert.deepEqual([...el.CRITERI_ORDINE], ["affidabilita", "match", "recensioni"]); assert.deepEqual({ ...el.ORDINE_INIZIALE }, { criterio: "match", verso: "decrescente" });
  assert.deepEqual(el.NOMI_CRITERI, { affidabilita: "Affidabilità", match: "Match", recensioni: "Recensioni" });
});

test("criteri: toccare lo stesso criterio inverte il verso; toccarne un altro cambia criterio e TIENE il verso", () => {
  assert.deepEqual(el.scegliCriterio(ord("match", "decrescente"), "match"), ord("match", "crescente")); assert.deepEqual(el.scegliCriterio(ord("match", "crescente"), "match"), ord("match", "decrescente"));
  assert.deepEqual(el.scegliCriterio(ord("match", "crescente"), "affidabilita"), ord("affidabilita", "crescente"), "chi ordina dal più basso continua dal più basso");
  assert.deepEqual(el.invertiVerso(ord("recensioni", "decrescente")), ord("recensioni", "crescente"));
  const o = ord("match"); el.scegliCriterio(o, "match"); assert.deepEqual(o, ord("match"), "non modifica ciò che riceve");
});

test("criteri: un valore che arriva da fuori è valido solo se è uno dei tre", () => {
  for (const ok of ["affidabilita", "match", "recensioni"]) assert.equal(el.criterioValido(ok), true);
  for (const no of ["", "Match", "prezzo", null, undefined, 5, {}, ["match"]]) assert.equal(el.criterioValido(no), false, String(no));
});

// ============================================================ il valore di un criterio
test("valore: affidabilità = il punteggio, senza dato = null; match = la percentuale, «bloccato» = −1, nessun criterio = null", () => {
  assert.equal(el.valoreCriterio(scheda("A", { affidabilita: 85 }), "affidabilita"), 85); assert.equal(el.valoreCriterio(scheda("A", { affidabilita: 0 }), "affidabilita"), 0, "zero è un dato");
  assert.equal(el.valoreCriterio(scheda("A", { affidabilita: null }), "affidabilita"), null); assert.equal(el.valoreCriterio(scheda("A", { affidabilita: NaN }), "affidabilita"), null);
  assert.equal(el.valoreCriterio(scheda("A", { match: { tipo: "pct", valore: 0 } }), "match"), 0); assert.equal(el.valoreCriterio(scheda("A", { match: { tipo: "bloccato", mancanti: ["x"] } }), "match"), -1); assert.equal(el.valoreCriterio(scheda("A", { match: { tipo: "nessuno" } }), "match"), null);
});

test("valore: recensioni = media, con più peso a chi ne ha di più a parità di media; nessuna recensione = null", () => {
  const r = (numero, media) => scheda("A", { recensioni: { numero, media } }); const v = (s) => el.valoreCriterio(s, "recensioni");
  assert.equal(v(r(0, null)), null); assert.equal(v(scheda("A", { recensioni: null })), null); assert.equal(v(r(2, null)), null, "senza media non c'è dato");
  assert.ok(v(r(4, 4.5)) > v(r(1, 4.5)), "a parità di media, più recensioni"); assert.ok(v(r(1, 4.6)) > v(r(50, 4.5)), "la media conta più del numero");
  assert.ok(v(r(5000, 4.5)) < v(r(1, 4.6)), "il numero non scavalca mai un decimo di media");
});

// ============================================================ l'ordine
test("ordine: decrescente = dal più alto, crescente = dal più basso, per ognuno dei tre criteri", () => {
  const l = [voce("B", { affidabilita: 30, match: { tipo: "pct", valore: 38 }, recensioni: { numero: 1, media: 3 } }), voce("A", { affidabilita: 100, match: { tipo: "pct", valore: 99 }, recensioni: { numero: 2, media: 4.5 } }), voce("C", { affidabilita: 70, match: { tipo: "pct", valore: 80 }, recensioni: { numero: 3, media: 4 } })];
  assert.deepEqual(nomi(el.ordinaVoci(l, ord("affidabilita"))), ["A", "C", "B"]); assert.deepEqual(nomi(el.ordinaVoci(l, ord("affidabilita", "crescente"))), ["B", "C", "A"]);
  assert.deepEqual(nomi(el.ordinaVoci(l, ord("match"))), ["A", "C", "B"]); assert.deepEqual(nomi(el.ordinaVoci(l, ord("match", "crescente"))), ["B", "C", "A"]);
  assert.deepEqual(nomi(el.ordinaVoci(l, ord("recensioni"))), ["A", "C", "B"]); assert.deepEqual(nomi(el.ordinaVoci(l, ord("recensioni", "crescente"))), ["B", "C", "A"]);
});

test("ordine: chi NON ha il dato sta SEMPRE in fondo, dal più alto e dal più basso (non sale in cima ordinando dal più basso)", () => {
  const l = [voce("Senza", { recensioni: null }), voce("Bassa", { recensioni: { numero: 1, media: 2 } }), voce("Alta", { recensioni: { numero: 2, media: 5 } }), voce("Zero", { recensioni: { numero: 0, media: null } })];
  assert.deepEqual(nomi(el.ordinaVoci(l, ord("recensioni", "decrescente"))), ["Alta", "Bassa", "Senza", "Zero"]); assert.deepEqual(nomi(el.ordinaVoci(l, ord("recensioni", "crescente"))), ["Bassa", "Alta", "Senza", "Zero"]);
  const m = [voce("Nessun", { match: { tipo: "nessuno" } }), voce("Basso", { match: { tipo: "pct", valore: 0 } }), voce("Alto", { match: { tipo: "pct", valore: 90 } })];
  assert.equal(nomi(el.ordinaVoci(m, ord("match", "crescente"))).at(-1), "Nessun"); assert.equal(nomi(el.ordinaVoci(m, ord("match", "decrescente"))).at(-1), "Nessun");
  const a = [voce("Senza", { affidabilita: null }), voce("Zero", { affidabilita: 0 }), voce("Piena", { affidabilita: 100 })];
  assert.deepEqual(nomi(el.ordinaVoci(a, ord("affidabilita", "crescente"))), ["Zero", "Piena", "Senza"], "zero è un dato: viene prima di chi non ha niente");
});

test("ordine: chi non soddisfa un requisito obbligatorio vale meno di qualunque percentuale (0% compreso) ma più di chi non ha il dato", () => {
  const l = [voce("Bloccato", { match: { tipo: "bloccato", mancanti: ["Garante"] } }), voce("Zero", { match: { tipo: "pct", valore: 0 } }), voce("Nessun", { match: { tipo: "nessuno" } }), voce("Medio", { match: { tipo: "pct", valore: 50 } })];
  assert.deepEqual(nomi(el.ordinaVoci(l, ord("match", "decrescente"))), ["Medio", "Zero", "Bloccato", "Nessun"]); assert.deepEqual(nomi(el.ordinaVoci(l, ord("match", "crescente"))), ["Bloccato", "Zero", "Medio", "Nessun"]);
});

test("ordine: a parità di valore decide lo spareggio, sempre il migliore prima (raccomandato, poi gli altri due criteri, poi chi ha il dato), anche dal più basso", () => {
  const m = (o) => ({ match: { tipo: "pct", valore: 80 }, ...o });
  const l = [voce("Zeta", m({ affidabilita: 40 })), voce("Alfa", m({ affidabilita: 90 })), voce("Racc", m({ affidabilita: 10, raccomandato: true })), voce("SenzaAff", m({ affidabilita: null })), voce("Rec", m({ affidabilita: 90, recensioni: { numero: 2, media: 4.5 } }))];
  assert.deepEqual(nomi(el.ordinaVoci(l, ord("match"))), ["Racc", "Rec", "Alfa", "Zeta", "SenzaAff"], "pari a 80%: il raccomandato, poi più affidabilità (a pari, chi ha recensioni), chi non ha il dato in fondo");
  assert.deepEqual(nomi(el.ordinaVoci(l, ord("match", "crescente"))), ["Racc", "Rec", "Alfa", "Zeta", "SenzaAff"], "dal più basso, a parità, è lo stesso: il migliore prima");
  const r = [voce("A", { raccomandato: false, match: { tipo: "pct", valore: 60 }, recensioni: { numero: 1, media: 4 }, affidabilita: 50 }), voce("B", { raccomandato: false, match: { tipo: "pct", valore: 90 }, recensioni: { numero: 1, media: 4 }, affidabilita: 50 })];
  assert.deepEqual(nomi(el.ordinaVoci(r, ord("recensioni"))), ["B", "A"], "a pari recensioni decide il match");
  assert.deepEqual(nomi(el.ordinaVoci([voce("Nessuno", { affidabilita: null, match: { tipo: "nessuno" }, recensioni: null }), voce("Rac", { affidabilita: null, match: { tipo: "nessuno" }, recensioni: null, raccomandato: true })], ord("affidabilita"))), ["Rac", "Nessuno"], "anche tra chi non ha il dato conta il raccomandato");
});

test("ordine: a parità di valore, per le recensioni chi ne ha di più; poi in ordine alfabetico (l'ordine non balla); non modifica la lista", () => {
  const l = [voce("Zeta", { recensioni: { numero: 1, media: 4.5 } }), voce("Alfa", { recensioni: { numero: 1, media: 4.5 } }), voce("Molte", { recensioni: { numero: 4, media: 4.5 } })];
  assert.deepEqual(nomi(el.ordinaVoci(l, ord("recensioni"))), ["Molte", "Alfa", "Zeta"]); assert.deepEqual(nomi(el.ordinaVoci([...l].reverse(), ord("recensioni"))), ["Molte", "Alfa", "Zeta"], "stesso ordine da qualunque partenza");
  assert.deepEqual(nomi(l), ["Zeta", "Alfa", "Molte"], "la lista di partenza non cambia");
  assert.deepEqual(nomi(el.ordinaVoci([voce("Bruno"), voce("Anna"), voce("Élodie")], ord("match"))), ["Anna", "Bruno", "Élodie"], "alfabetico all'italiana");
});

// ============================================================ il numerino accanto al nome
test("numerino: «99%» per il match, «100» per l'affidabilità, «★ 4,5» per le recensioni; «No» se manca un requisito; «—» se non c'è il dato", () => {
  const s = scheda("A", { affidabilita: 100, match: { tipo: "pct", valore: 99 }, recensioni: { numero: 2, media: 4.5 } });
  assert.equal(el.testoNumerino(s, "match"), "99%"); assert.equal(el.testoNumerino(s, "affidabilita"), "100"); assert.equal(el.testoNumerino(s, "recensioni"), "★ 4,5");
  assert.equal(el.testoNumerino(scheda("A", { recensioni: { numero: 1, media: 5 } }), "recensioni"), "★ 5,0", "sempre un decimale, con la virgola");
  assert.equal(el.testoNumerino(scheda("A", { match: { tipo: "bloccato", mancanti: [] } }), "match"), "No");
  assert.equal(el.testoNumerino(scheda("A", { match: { tipo: "nessuno" } }), "match"), "—"); assert.equal(el.testoNumerino(scheda("A", { affidabilita: null }), "affidabilita"), "—"); assert.equal(el.testoNumerino(scheda("A"), "recensioni"), "—");
  assert.equal(el.testoNumerino(scheda("A", { affidabilita: 0, match: { tipo: "pct", valore: 0 } }), "affidabilita"), "0", "zero si scrive"); assert.equal(el.testoNumerino(scheda("A", { match: { tipo: "pct", valore: 0 } }), "match"), "0%");
});

test("numerino: cambia quando cambia il criterio, sulla stessa persona", () => {
  const s = scheda("A", { affidabilita: 30, match: { tipo: "pct", valore: 38 }, recensioni: { numero: 3, media: 4 } });
  assert.deepEqual(el.CRITERI_ORDINE.map((c) => el.testoNumerino(s, c)), ["30", "38%", "★ 4,0"]);
});

test("cifra nel cerchio del riquadro: senza il segno di percentuale; «–» se non c'è il dato; «No» se manca un requisito", () => {
  const s = scheda("A", { affidabilita: 100, match: { tipo: "pct", valore: 99 }, recensioni: { numero: 2, media: 4.5 } });
  assert.deepEqual(el.CRITERI_ORDINE.map((c) => el.cifraCriterio(s, c)), ["100", "99", "4,5"]);
  assert.deepEqual(el.CRITERI_ORDINE.map((c) => el.cifraCriterio(scheda("A", { affidabilita: null, match: { tipo: "nessuno" }, recensioni: null }), c)), ["–", "–", "–"]); assert.equal(el.cifraCriterio(scheda("A", { match: { tipo: "bloccato", mancanti: [] } }), "match"), "No");
  assert.equal(el.cifraCriterio(scheda("A", { affidabilita: 0 }), "affidabilita"), "0", "zero è un dato");
});

test("parole e corona del riquadro: le parole sono quelle delle fasce, la corona va da 0 a 100 (recensioni su 5 stelle)", () => {
  const s = scheda("A", { affidabilita: 100, match: { tipo: "pct", valore: 99 }, recensioni: { numero: 2, media: 4.5 } });
  assert.equal(el.parolaCriterio(s, "affidabilita"), "Eccellente"); assert.equal(el.parolaCriterio(s, "match"), "Ottima compatibilità"); assert.equal(el.parolaCriterio(s, "recensioni"), "2 recensioni");
  assert.equal(el.parolaCriterio(scheda("A", { recensioni: { numero: 1, media: 5 } }), "recensioni"), "1 recensione"); assert.equal(el.parolaCriterio(scheda("A"), "recensioni"), "Nessuna ancora");
  assert.equal(el.parolaCriterio(scheda("A", { match: { tipo: "bloccato", mancanti: [] } }), "match"), "Manca un requisito"); assert.equal(el.parolaCriterio(scheda("A", { match: { tipo: "nessuno" } }), "match"), "Nessun criterio scelto");
  assert.deepEqual(el.CRITERI_ORDINE.map((c) => el.pienezzaCriterio(s, c)), [100, 99, 90]); assert.equal(el.pienezzaCriterio(scheda("A", { affidabilita: 250 }), "affidabilita"), 100, "mai oltre 100");
  assert.deepEqual(el.CRITERI_ORDINE.map((c) => el.pienezzaCriterio(scheda("A", { affidabilita: null, match: { tipo: "nessuno" }, recensioni: null }), c)), [0, 0, 0]);
  assert.equal(el.frasaOrdine(ord("match")), "Ordinati per Match · dal più alto."); assert.equal(el.frasaOrdine(ord("recensioni", "crescente")), "Ordinati per Recensioni · dal più basso.");
});

// ============================================================ dalle case alle persone
test("persone: ogni persona è una voce sola, con lo stato giusto; i possibili entrano, le richieste già mandate no", () => {
  const g = gruppo(casa("A"), { spontanei: [cand("A", "in_attesa", "Anna")], match: [cand("A", "accettata", "Bruno")], scartati: [cand("A", "rifiutata", "Carla")], ritirati: [cand("A", "ritirata", "Dario")], possibili: poss("A", [sch("t9", { nome: "Elena B." })]) });
  const v = el.vociDaGruppi([g]); assert.deepEqual(v.map((x) => x.stato), ["da_valutare", "match", "scartato", "ritirato", "possibile"]); assert.equal(v.length, 5, "la richiesta già mandata non è una persona");
  assert.equal(new Set(v.map((x) => x.chiave)).size, 5, "chiavi tutte diverse"); assert.ok(v[0].candidatura && !v[0].possibile); assert.ok(v[4].possibile && !v[4].candidatura); assert.match(v[4].chiave, /^p:A:t9$/); assert.ok(v.every((x) => x.casaId === "A"));
  assert.equal(v[4].scheda.nome, "Elena B."); assert.equal(v[0].scheda.nome, "Anna V.");
});

test("persone: la stessa persona in due immobili è due voci diverse (il match cambia da una casa all'altra)", () => {
  const s1 = sch("t1", { compatibilita: 93 }), s2 = sch("t1", { compatibilita: 88 }); const v = el.vociDaGruppi([gruppo(casa("A"), { possibili: poss("A", [s1]) }), gruppo(casa("B"), { possibili: poss("B", [s2]) })]);
  assert.equal(v.length, 2); assert.notEqual(v[0].chiave, v[1].chiave); assert.deepEqual(v.map((x) => x.scheda.match.valore), [93, 88]);
});

test("persone: le schede in alto raggruppano gli stati (valutati = match, scartati e chi ha ritirato); i conteggi tornano", () => {
  assert.deepEqual(["da_valutare", "possibile", "match", "scartato", "ritirato"].map(el.schedaDi), ["da_valutare", "possibili", "valutati", "valutati", "valutati"]);
  assert.deepEqual([...el.SCHEDE_ELENCO], ["tutti", "da_valutare", "possibili", "valutati"]);
  const l = [voce("A"), voce("B", {}, { stato: "possibile" }), voce("C", {}, { stato: "match" }), voce("D", {}, { stato: "scartato" })]; assert.deepEqual(el.conteggiSchede(l), { tutti: 4, da_valutare: 1, possibili: 1, valutati: 2 });
  for (const s of el.SCHEDE_ELENCO) assert.ok(el.NOMI_SCHEDE[s].length > 2);
  for (const s of ["da_valutare", "possibile", "match", "scartato", "ritirato"]) assert.ok(el.ETICHETTE_STATO_VOCE[s]);
});

// ============================================================ ricerca e filtri
const casePer = new Map([["A", { titolo: "Bilocale luminoso", zona: "Isola, Milano" }], ["B", { titolo: "Attico", zona: "Brera" }]]);
const f = (o = {}) => ({ ...el.FILTRI_ELENCO_VUOTI, ...o });

test("filtri: senza filtri tutti passano; i filtri accesi si contano (la ricerca e le schede a parte)", () => {
  assert.equal(el.ceFiltriAttivi(el.FILTRI_ELENCO_VUOTI), false); assert.equal(el.numeroFiltriAvanzati(el.FILTRI_ELENCO_VUOTI), 0);
  assert.equal(el.numeroFiltriAvanzati(f({ soloVerificati: true, soloRaccomandati: true, senzaBlocchi: true, minimo: 70 })), 4); assert.equal(el.numeroFiltriAvanzati(f({ testo: "anna", scheda: "da_valutare" })), 0);
  for (const x of [f({ testo: "anna" }), f({ scheda: "possibili" }), f({ minimo: 50 }), f({ soloVerificati: true })]) assert.equal(el.ceFiltriAttivi(x), true); assert.equal(el.ceFiltriAttivi(f({ testo: "   " })), false, "spazi = nessuna ricerca");
});

test("filtri: la ricerca guarda nome, lavoro, titolo e zona dell'immobile, senza maiuscole né accenti, con tutte le parole", () => {
  const c = voce("Anna", {}, { candidatura: cand("A", "in_attesa", "Anna", { cognome: "Bianchi", tenant_profiles: { professione: "Architetta", reddito_mensile: 1, reddito_nucleo: null, verificato: false, presentazione: null, avatar_url: null } }) });
  const p = voce("Dario R.", { professione: "Ingegnere" }, { stato: "possibile", possibile: sch("t1"), casaId: "B" });
  const trova = (v, t) => el.corrispondeVoce(v, f({ testo: t }), casePer.get(v.casaId));
  for (const t of ["anna", "ANNA", "architetta", "bilocale", "isola", "anna architetta", "  anna  "]) assert.equal(trova(c, t), true, "candidato: " + t);
  for (const t of ["dario", "ingegnere", "attico", "brera", "dario brera"]) assert.equal(trova(p, t), true, "possibile: " + t);
  for (const t of ["anna dario", "xyz", "attico"]) assert.equal(trova(c, t), false, "candidato: " + t); assert.equal(trova(p, "bilocale"), false);
  assert.equal(trova(voce("É", { nome: "Élodie", professione: "Cuoca" }), "elodie"), true, "gli accenti non contano");
});

test("filtri: reddito verificato, raccomandati, senza blocchi e compatibilità minima valgono per i candidati (come sempre) e per i possibili", () => {
  const cV = voce("A", {}, { candidatura: cand("A", "in_attesa", "A", { tenant_profiles: { professione: "x", reddito_mensile: 1, reddito_nucleo: null, verificato: true, presentazione: null, avatar_url: null } }) }), cN = voce("B", {}, { candidatura: cand("A", "in_attesa", "B") });
  assert.deepEqual([cV, cN].map((v) => el.corrispondeVoce(v, f({ soloVerificati: true }), casePer.get("A"))), [true, false]);
  const cR = voce("R", {}, { candidatura: cand("A", "in_attesa", "R", { valutazione: { ...cand("A", "x", "x").valutazione, raccomandato: true } }) }); assert.deepEqual([cR, cN].map((v) => el.corrispondeVoce(v, f({ soloRaccomandati: true }), casePer.get("A"))), [true, false]);
  const cB = voce("Bl", {}, { candidatura: cand("A", "in_attesa", "Bl", { valutazione: { ...cand("A", "x", "x").valutazione, match: { punteggio: 90, etichetta: "x", bloccato: true, mancanti: ["Garante"], criteri: [], incompleto: false } } }) }); assert.deepEqual([cB, cN].map((v) => el.corrispondeVoce(v, f({ senzaBlocchi: true }), casePer.get("A"))), [false, true]);
  assert.deepEqual([cN, cV].map((v) => el.corrispondeVoce(v, f({ minimo: 70 }), casePer.get("A"))), [true, true], "80% ≥ 70");
  const pV = voce("P1", { redditoVerificato: true, raccomandato: true, match: { tipo: "pct", valore: 90 } }, { stato: "possibile", possibile: sch("t1") }), pN = voce("P2", { redditoVerificato: false, raccomandato: false, match: { tipo: "nessuno" } }, { stato: "possibile", possibile: sch("t2") });
  for (const o of [{ soloVerificati: true }, { soloRaccomandati: true }, { minimo: 70 }]) assert.deepEqual([pV, pN].map((v) => el.corrispondeVoce(v, f(o), casePer.get("A"))), [true, false], JSON.stringify(o));
  assert.equal(el.corrispondeVoce(pN, f({ senzaBlocchi: true }), casePer.get("A")), true, "un possibile non è mai bloccato: i requisiti obbligatori li ha già superati");
  assert.equal(el.corrispondeVoce(voce("P3", { match: { tipo: "pct", valore: 50 } }, { stato: "possibile", possibile: sch("t3") }), f({ minimo: 70 }), casePer.get("A")), false, "50% < 70");
});

// ============================================================ i box degli immobili
const G = () => [gruppo(casa("A"), { spontanei: [cand("A", "in_attesa", "Anna", { valutazione: { ...cand("A", "x", "x").valutazione, affidabilita: 100, match: { punteggio: 99, etichetta: "x", bloccato: false, mancanti: [], criteri: [], incompleto: false } } }), cand("A", "in_attesa", "Bruno", { valutazione: { ...cand("A", "x", "x").valutazione, affidabilita: 30, match: { punteggio: 38, etichetta: "x", bloccato: false, mancanti: [], criteri: [], incompleto: false } } })], possibili: poss("A", [sch("t9", { nome: "Dario R.", compatibilita: 97, affidabilita: 100 })]) }), gruppo(casa("B", { titolo: "Attico" }), {})];
const box = (o = {}) => { const gruppi = G(); return el.costruisciBox({ gruppi, voci: el.vociDaGruppi(gruppi), filtri: el.FILTRI_ELENCO_VUOTI, ordine: el.ORDINE_INIZIALE, ...o }); };

test("box: uno per immobile, nell'ordine dei gruppi, con le persone nell'ordine scelto; senza filtri resta anche l'immobile vuoto", () => {
  const b = box(); assert.deepEqual(b.map((x) => x.gruppo.casa.id), ["A", "B"]); assert.deepEqual(nomi(b[0].voci), ["Anna V.", "Dario R.", "Bruno V."], "match dal più alto: 99, 97, 38"); assert.equal(b[1].voci.length, 0); assert.equal(b[1].riepilogo, "Nessuno ancora"); assert.equal(b[0].totale, 3);
  assert.deepEqual(nomi(box({ ordine: ord("affidabilita", "crescente") })[0].voci), ["Bruno V.", "Anna V.", "Dario R."], "affidabilità dal più basso: 30, 100, 100 (a parità, alfabetico)");
});

test("box: ricerca e schede nascondono le persone e gli immobili senza nessuna; il totale non cambia", () => {
  const gruppi = G(), voci = el.vociDaGruppi(gruppi); const b = el.costruisciBox({ gruppi, voci, filtri: f({ testo: "bruno" }), ordine: el.ORDINE_INIZIALE });
  assert.deepEqual(b.map((x) => x.gruppo.casa.id), ["A"], "l'immobile senza risultati sparisce"); assert.deepEqual(nomi(b[0].voci), ["Bruno V."]); assert.equal(b[0].totale, 3, "il totale è quello senza filtri"); assert.equal(b[0].riepilogo, "1 da valutare");
  const p = el.costruisciBox({ gruppi, voci, filtri: f({ scheda: "possibili" }), ordine: el.ORDINE_INIZIALE }); assert.deepEqual(nomi(p[0].voci), ["Dario R."]);
  assert.deepEqual(el.costruisciBox({ gruppi, voci, filtri: f({ testo: "nessunocosì" }), ordine: el.ORDINE_INIZIALE }), [], "nessun risultato: nessun box");
});

test("box: i conteggi delle schede si fanno dopo ricerca e filtri avanzati, prima della scheda scelta", () => {
  const gruppi = G(), voci = el.vociDaGruppi(gruppi); const dopo = el.vociFiltrate(voci, f({ testo: "isola", scheda: "possibili" }), casePer); assert.deepEqual(el.conteggiSchede(dopo), { tutti: 3, da_valutare: 2, possibili: 1, valutati: 0 }, "la scheda scelta non svuota i conteggi delle altre");
});

test("riepilogo dell'immobile: solo le parti con qualcuno, con il plurale giusto, in un ordine fisso", () => {
  const r = (...s) => el.riepilogoImmobile(s.map((stato) => ({ stato })));
  assert.equal(r("da_valutare", "da_valutare", "possibile", "possibile", "possibile", "match"), "2 da valutare · 3 possibili · 1 match"); assert.equal(r("possibile"), "1 possibile"); assert.equal(r("scartato", "scartato", "ritirato"), "2 scartati · 1 ritirato"); assert.equal(r("scartato"), "1 scartato"); assert.equal(r(), "Nessuno ancora");
  assert.equal(r("match", "da_valutare"), "1 da valutare · 1 match", "l'ordine non dipende da come arrivano");
});

test("dettaglio: si mostra la persona scelta se si vede ancora, altrimenti la prima; nessuna persona = nessun dettaglio", () => {
  const b = box(); assert.equal(el.vocePerDettaglio(b, null).scheda.nome, "Anna V."); assert.equal(el.vocePerDettaglio(b, b[0].voci[2].chiave).scheda.nome, "Bruno V."); assert.equal(el.vocePerDettaglio(b, "c:inesistente").scheda.nome, "Anna V.", "una persona che non si vede più: la prima");
  assert.equal(el.vocePerDettaglio([], null), null);
});

test("miniature e conteggio degli immobili", () => {
  const l = [voce("A"), voce("B"), voce("C"), voce("D"), voce("E")]; assert.deepEqual({ p: nomi(el.miniature(l).prime), a: el.miniature(l).altre }, { p: ["A", "B", "C"], a: 2 }); assert.equal(el.miniature(l.slice(0, 2)).altre, 0); assert.equal(el.miniature([]).prime.length, 0);
  assert.equal(el.testoImmobili(1), "1 immobile"); assert.equal(el.testoImmobili(3), "3 immobili"); assert.equal(el.testoImmobili(0), "0 immobili");
});

// ============================================================ lo stile: due difetti trovati a vista, da non far tornare
import fs from "node:fs";
test("stile: il dettaglio a tutto schermo sta SOPRA la barra di navigazione e SOTTO le schede di conferma; la colonna dell'elenco non schiaccia i suoi comandi", () => {
  const css = fs.readFileSync(path.join(radice, "src", "app", "globals.css"), "utf8"); const z = (re) => Number((css.match(re) ?? [])[1]);
  const barra = z(/\.tabbar \{[^}]*z-index:\s*(\d+)/), scheda = z(/\.sheet-backdrop \{[^}]*z-index:\s*(\d+)/), finestra = z(/\.db-dettaglio\.modale \{[^}]*z-index:\s*(\d+)/);
  assert.ok(barra > 0 && scheda > 0 && finestra > 0, `z-index non trovati: ${barra}, ${scheda}, ${finestra}`); assert.ok(finestra > barra, `la finestra (${finestra}) deve stare sopra la barra (${barra}), altrimenti la copre a sinistra`); assert.ok(finestra < scheda, `le conferme (${scheda}) devono stare sopra la finestra (${finestra})`);
  assert.match(css, /\.db-elenco > :not\(\.db-lista\) \{\s+flex-shrink: 0;/, "nella colonna con altezza massima solo la lista scorre: ricerca, ordine e schede restano interi");
  assert.match(css, /@media \(max-width: 1279px\) \{\s+\.db-dettaglio,\s+\.db-dettaglio-vuoto \{\s+display: none;/, "sotto i 1280 px il dettaglio sta nascosto finché non si tocca una persona");
});

test("stile: i tre criteri hanno tre colori diversi (verde, oro, terracotta), gli stessi per pulsante, numerino e riquadro", () => {
  const css = fs.readFileSync(path.join(radice, "src", "app", "globals.css"), "utf8"); const m = css.slice(css.indexOf("/* ---- Database: l'elenco per immobile e il dettaglio della persona ---- */"));
  assert.match(m, /--db-aff: var\(--moss\);/); assert.match(m, /--db-mat: var\(--gold\);/); assert.match(m, /--db-rec: var\(--clay\);/);
  for (const [k, v] of [["affidabilita", "aff"], ["match", "mat"], ["recensioni", "rec"]]) assert.match(m, new RegExp(`\\.db-crit-${k},\\s+\\.db-numerino-${k},\\s+\\.db-tessera-${k} \\{\\s+--c: var\\(--db-${v}\\);\\s+--bg: var\\(--db-${v}-bg\\);\\s+--tx: var\\(--db-${v}-tx\\);`), `${k}: stessa terna di colori per pulsante, numerino e riquadro`);
  const tinte = [...m.matchAll(/--db-(aff|mat|rec)-bg: ([^;]+);/g)].map((x) => x[2]); assert.equal(new Set(tinte).size, 3, "tre tinte diverse");
});

// ============================================================ l'elenco disegnato: il numerino segue il criterio (la funzione richiesta)
import { createRequire } from "node:module";
const richiedi = createRequire(import.meta.url);
const React = richiedi("react"); const { renderToStaticMarkup } = richiedi("react-dom/server");
const elencoComp = caricaTs(path.join(radice, "src", "components", "database", "ElencoDatabase.tsx"));

const disegna = (ordine, o = {}) => {
  const gruppi = [gruppo(casa("A"), { spontanei: [cand("A", "in_attesa", "Anna", { valutazione: { ...cand("A", "x", "x").valutazione, affidabilita: 100, match: { punteggio: 99, etichetta: "x", bloccato: false, mancanti: [], criteri: [], incompleto: false }, recensioni: { numero: 2, media: 4.5 } } }), cand("A", "in_attesa", "Bruno", { valutazione: { ...cand("A", "x", "x").valutazione, affidabilita: 30, match: { punteggio: 38, etichetta: "x", bloccato: false, mancanti: [], criteri: [], incompleto: false }, recensioni: { numero: 0, media: null } } })] })];
  const voci = el.vociDaGruppi(gruppi); const box = el.costruisciBox({ gruppi, voci, filtri: el.FILTRI_ELENCO_VUOTI, ordine });
  const props = { box, ordine, onOrdine() {}, filtri: el.FILTRI_ELENCO_VUOTI, onFiltri() {}, conteggi: el.conteggiSchede(voci), conPunteggi: true, selezionata: null, onSeleziona() {}, chiusi: {}, onCommuta() {}, onTutti() {}, idPossibili: null, persone: voci.length, totalePersone: voci.length, ...o };
  return renderToStaticMarkup(React.createElement(elencoComp.ElencoDatabase, props));
};
const numeriniDi = (html) => [...html.matchAll(/<span class="db-numerino ([^"]*)"><span class="solo-lettori">([^<]*): <\/span>([^<]*)<\/span>/g)].map((m) => ({ classe: m[1], criterio: m[2], valore: m[3] }));

test("elenco disegnato: accanto a ogni nome c'è il numerino del criterio scelto, nel colore di quel criterio, e cambia scegliendo un altro criterio", () => {
  for (const [criterio, nome, classe, attesi] of [["match", "Match", "db-numerino-match", ["99%", "38%"]], ["affidabilita", "Affidabilità", "db-numerino-affidabilita", ["100", "30"]], ["recensioni", "Recensioni", "db-numerino-recensioni", ["★ 4,5", "—"]]]) {
    const n = numeriniDi(disegna(ord(criterio))); assert.equal(n.length, 2, criterio); assert.deepEqual(n.map((x) => x.valore), attesi, `${criterio}: i valori`); assert.ok(n.every((x) => x.criterio === nome), `${criterio}: il nome del criterio per chi usa un lettore di schermo`);
    assert.ok(n[0].classe.includes(classe), `${criterio}: il colore del criterio (${classe})`); assert.ok(!n[0].classe.includes("vuoto"));
  }
  const rec = numeriniDi(disegna(ord("recensioni"))); assert.ok(rec[1].classe.includes("vuoto"), "chi non ha recensioni ha il numerino «vuoto» (grigio), non il colore del criterio");
});

test("elenco disegnato: l'ordine dei nomi segue il criterio e il verso, e il criterio scelto è l'unico premuto", () => {
  const ordineNomi = (html) => [...html.matchAll(/<span class="db-riga-nome">([^<]*)</g)].map((m) => m[1].trim());
  assert.deepEqual(ordineNomi(disegna(ord("match", "decrescente"))), ["Anna V.", "Bruno V."]); assert.deepEqual(ordineNomi(disegna(ord("match", "crescente"))), ["Bruno V.", "Anna V."]); assert.deepEqual(ordineNomi(disegna(ord("recensioni", "crescente"))), ["Anna V.", "Bruno V."], "Bruno non ha recensioni: in fondo anche dal più basso");
  const premuti = (html) => [...html.matchAll(/class="db-crit db-crit-(\w+) (on)?"[^>]*aria-pressed="(true|false)"/g)].map((m) => `${m[1]}:${m[3]}`);
  assert.deepEqual(premuti(disegna(ord("match"))), ["affidabilita:false", "match:true", "recensioni:false"]); assert.deepEqual(premuti(disegna(ord("recensioni"))), ["affidabilita:false", "match:false", "recensioni:true"]);
  const html = disegna(ord("match", "crescente")); assert.match(html, /Ordinati per Match · dal più basso\./); assert.match(html, /aria-label="Ordine dal più basso\. Tocca per invertirlo"/);
});

test("elenco disegnato: un immobile chiuso ha il contenuto inert e la freccia; con più immobili ognuno ha il suo box e l'ancora dei possibili è solo sul primo indicato", () => {
  const html = disegna(ord("match"), { chiusi: { A: true }, idPossibili: "A" }); assert.match(html, /<section id="possibili" class="db-box chiuso"/); assert.match(html, /aria-expanded="false"/); assert.match(html, /class="db-box-corpo" inert=""/);
  assert.match(html, /class="db-riepilogo">2 da valutare</, "chiuso: il riepilogo"); assert.match(html, /Espandi tutti/); const aperto = disegna(ord("match")); assert.match(aperto, /aria-expanded="true"/); assert.ok(!/inert=""/.test(aperto)); assert.match(aperto, /Comprimi tutti/);
  assert.ok(!/id="possibili"/.test(aperto), "senza idPossibili nessuna ancora");
});
