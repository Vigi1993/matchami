/**
 * Test del modulo di calcolo del match (src/lib/match).
 *
 * Si lancia con:   npm test
 *
 * Non serve nessuna dipendenza in più: usa il test runner incluso in
 * Node e il compilatore TypeScript già presente nel progetto, che qui
 * serve solo a leggere i file .ts del modulo senza prima compilare l'app.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { caricaTs, radice } from "./carica-ts.mjs";

const m = caricaTs(path.join(radice, "src", "lib", "match", "index.ts"));
const {
  calcolaMatchInquilino,
  ordinaAnnunci,
  calcolaMatchProprietario,
  ordinaCandidati,
  etichettaPer,
  CHIAVI_CRITERI,
  preparaMazzo,
  haCriteriDiRicerca,
  statoMazzo,
  normalizzaCriteri,
  criteriDaRighe,
  righeDaCriteri,
  profiloRicercaDaRighe,
  completezzaProfiloPersonale,
  datiCandidatoDaProfilo,
  valutaCandidato,
  leggiFotografia,
} = m;

// ---- dati di prova
const profilo = (o = {}) => ({
  budgetMax: 1500,
  localiMin: 2,
  mqMin: 50,
  zone: ["Isola, Milano"],
  interessi: {},
  ...o,
});
const casa = (o = {}) => ({
  prezzo: 1500,
  zona: "Isola, Milano",
  locali: 2,
  mq: 50,
  attributi: {},
  ...o,
});
const candidato = (o = {}) => ({
  redditoMensileNucleo: 3000,
  garante: true,
  fideiussione: null,
  verificato: true,
  completezza: 90,
  protestato: false,
  ...o,
});
const req = (chiave, peso, modo = "preferenziale", extra = {}) => ({
  chiave,
  peso,
  modo,
  ...extra,
});

// ============================================================
// Lato inquilino
// ============================================================

test("difetto 1: il budget non premia lo sforamento", () => {
  const prezzi = [1200, 1400, 1500, 1515, 1575, 1650];
  const punteggi = prezzi.map((prezzo) =>
    calcolaMatchInquilino(casa({ prezzo }), profilo()).punteggio
  );
  for (let i = 1; i < punteggi.length; i++) {
    assert.ok(
      punteggi[i] <= punteggi[i - 1],
      `a ${prezzi[i]} il punteggio (${punteggi[i]}) supera quello a ${prezzi[i - 1]} (${punteggi[i - 1]})`
    );
  }
  // il caso preciso del prototipo: a budget 89, appena sopra 99
  const aBudget = calcolaMatchInquilino(casa({ prezzo: 1500 }), profilo());
  const appenaSopra = calcolaMatchInquilino(casa({ prezzo: 1515 }), profilo());
  assert.ok(aBudget.punteggio > appenaSopra.punteggio);
});

test("D1: fasce del budget con tolleranza del 10%", () => {
  const f = (prezzo) => calcolaMatchInquilino(casa({ prezzo }), profilo()).fascia;
  assert.equal(f(1200), "in_ricerca");
  assert.equal(f(1500), "in_ricerca");
  assert.equal(f(1501), "oltre_ricerca");
  assert.equal(f(1650), "oltre_ricerca"); // esattamente +10%
  assert.equal(f(1651), "escluso");
  assert.equal(f(2200), "escluso");
});

test("lo sforamento entro tolleranza ha un motivo leggibile, non un avviso", () => {
  const r = calcolaMatchInquilino(casa({ prezzo: 1590 }), profilo());
  assert.equal(r.fascia, "oltre_ricerca");
  assert.deepEqual(r.motivi, ["Oltre il tuo budget del 6%"]);
  assert.deepEqual(r.avvisi, [], "gli avvisi sono solo per i dati mancanti");
});

test("ogni motivo di fuori-ricerca è spiegato, e in ricerca non ne ha", () => {
  const motivi = (a) => calcolaMatchInquilino(a, profilo()).motivi;
  assert.deepEqual(motivi(casa()), []);
  assert.deepEqual(motivi(casa({ zona: "Bicocca, Milano" })), ["Fuori dalle tue zone"]);
  assert.deepEqual(motivi(casa({ locali: 1 })), ["Meno locali del tuo minimo"]);
  assert.deepEqual(motivi(casa({ mq: 40 })), ["Sotto la tua metratura minima"]);
  // più motivi insieme
  assert.equal(motivi(casa({ prezzo: 1560, locali: 1, zona: "Bicocca, Milano" })).length, 3);
});

test("lo sforamento del budget è esposto come numero, per chi deve contarlo", () => {
  const sforo = (prezzo) => calcolaMatchInquilino(casa({ prezzo }), profilo()).sforoBudgetPct;
  assert.equal(sforo(1400), null);
  assert.equal(sforo(1500), null);
  assert.equal(sforo(1590), 6);
  assert.equal(sforo(1650), 10);
  assert.equal(sforo(2000), 33, "anche gli esclusi lo riportano");
});

test("senza budget impostato non c'è limite e nessuna fascia penalizzante", () => {
  const r = calcolaMatchInquilino(casa({ prezzo: 9000 }), profilo({ budgetMax: null }));
  assert.equal(r.fascia, "in_ricerca");
  assert.ok(!r.criteri.some((c) => c.chiave === "budget"));
});

test("zone vuote = nessuna preferenza, non un malus per tutti", () => {
  const senzaZone = calcolaMatchInquilino(casa({ zona: "Bicocca, Milano" }), profilo({ zone: [] }));
  const inZona = calcolaMatchInquilino(casa(), profilo());
  assert.equal(senzaZone.fascia, "in_ricerca");
  assert.equal(senzaZone.punteggio, inZona.punteggio);
});

test("una zona non scelta porta l'annuncio oltre la ricerca e abbassa il punteggio", () => {
  const fuori = calcolaMatchInquilino(casa({ zona: "Bicocca, Milano" }), profilo());
  const dentro = calcolaMatchInquilino(casa(), profilo());
  assert.equal(fuori.fascia, "oltre_ricerca");
  assert.ok(fuori.punteggio < dentro.punteggio);
});

test("P4: un dato mancante nell'annuncio non punisce l'inquilino", () => {
  const mancante = calcolaMatchInquilino(casa({ locali: null, mq: null }), profilo());
  const sottoMinimo = calcolaMatchInquilino(casa({ locali: 1, mq: 40 }), profilo());
  const completo = calcolaMatchInquilino(casa(), profilo());

  assert.equal(mancante.fascia, "in_ricerca", "non deve cambiare fascia");
  assert.equal(mancante.avvisi.length, 2);
  assert.ok(mancante.punteggio < completo.punteggio);
  assert.ok(mancante.punteggio > sottoMinimo.punteggio, "meglio di una casa troppo piccola");
  assert.equal(mancante.criteri.find((c) => c.chiave === "locali").stato, "non_indicato");
});

test("le caratteristiche contano in proporzione al peso scelto", () => {
  const p = profilo({ interessi: { balcone: 8, ascensore: 2 } });
  const soloBalcone = calcolaMatchInquilino(casa({ attributi: { balcone: true } }), p);
  const soloAscensore = calcolaMatchInquilino(casa({ attributi: { ascensore: true } }), p);
  assert.equal(soloBalcone.punteggio, 87);
  assert.equal(soloAscensore.punteggio, 75);
  assert.equal(soloBalcone.criteri.find((c) => c.chiave === "balcone").stato, "ok");
  assert.equal(soloBalcone.criteri.find((c) => c.chiave === "ascensore").stato, "no");
});

test("D8: nessun punteggio arriva a 100 e il minimo di 28 non esiste più", () => {
  const perfetta = calcolaMatchInquilino(
    casa({ prezzo: 1000, attributi: { balcone: true, ascensore: true } }),
    profilo({ interessi: { balcone: 8, ascensore: 2 } })
  );
  assert.equal(perfetta.punteggio, 99);

  const pessima = calcolaMatchInquilino(
    casa({ prezzo: 1650, zona: "Bicocca, Milano", locali: 1, mq: 10 }),
    profilo()
  );
  assert.ok(pessima.punteggio < 28, `atteso sotto 28, trovato ${pessima.punteggio}`);
});

test("D8: soglie delle etichette", () => {
  assert.equal(etichettaPer(99), "Ottima compatibilità");
  assert.equal(etichettaPer(88), "Ottima compatibilità");
  assert.equal(etichettaPer(87), "Buona compatibilità");
  assert.equal(etichettaPer(70), "Buona compatibilità");
  assert.equal(etichettaPer(69), "Compatibilità parziale");
  assert.equal(etichettaPer(50), "Compatibilità parziale");
  assert.equal(etichettaPer(49), "Compatibilità bassa");
});

test("D2: il mazzo mette prima gli annunci in ricerca, toglie gli esclusi, ordina per punteggio", () => {
  const voci = [
    { id: "a", match: { fascia: "oltre_ricerca", punteggio: 90 } },
    { id: "b", match: { fascia: "in_ricerca", punteggio: 60 } },
    { id: "c", match: { fascia: "escluso", punteggio: 95 } },
    { id: "d", match: { fascia: "in_ricerca", punteggio: 80 } },
    { id: "e", match: { fascia: "in_ricerca", punteggio: 80 } },
  ];
  assert.deepEqual(ordinaAnnunci(voci).map((v) => v.id), ["d", "e", "b", "a"]);
});

// ============================================================
// Lato proprietario
// ============================================================

test("difetto 2: il reddito si confronta con il canone, non con una soglia fissa", () => {
  const richiesti = [req("redditoCanone", 5)];
  const c = candidato({ redditoMensileNucleo: 2500 });

  const stato = (canone) =>
    calcolaMatchProprietario(richiesti, c, canone).criteri[0].stato;

  assert.equal(stato(800), "ok"); // 32%
  assert.equal(stato(1500), "no"); // 60%
  assert.equal(stato(2200), "no"); // 88%
});

test("la soglia del reddito è scelta dal proprietario ed è limitata", () => {
  const c = candidato({ redditoMensileNucleo: 2500 });
  const r = (soglia) =>
    calcolaMatchProprietario([req("redditoCanone", 5, "preferenziale", { sogliaPct: soglia })], c, 1500)
      .criteri[0].stato;

  assert.equal(r(60), "ok"); // 1500/2500 = 60%
  assert.equal(r(50), "no");
  // fuori scala: 90 viene riportato al massimo consentito (60)
  const alto = calcolaMatchProprietario(
    [req("redditoCanone", 5, "preferenziale", { sogliaPct: 90 })],
    candidato({ redditoMensileNucleo: 1000 }),
    700
  );
  assert.equal(alto.criteri[0].stato, "no"); // 70% > 60%
});

test("difetto 3: 'non indicato' si distingue da 'no' anche se pesa uguale", () => {
  const richiesti = [req("nessunProtesto", 5), req("garante", 5)];
  const r = (protestato) =>
    calcolaMatchProprietario(richiesti, candidato({ protestato }), 1000);

  const no = r(true);
  const nonIndicato = r(null);

  assert.equal(no.punteggio, nonIndicato.punteggio);
  assert.equal(no.criteri[0].stato, "no");
  assert.equal(nonIndicato.criteri[0].stato, "non_indicato");
  assert.equal(no.incompleto, false);
  assert.equal(nonIndicato.incompleto, true);
  assert.equal(r(false).punteggio, 99);
});

test("tutti i criteri richiesti pesano, ciascuno col suo peso", () => {
  // garante (peso 8) soddisfatto, profilo completo (peso 2) no: 80%
  const r = calcolaMatchProprietario(
    [req("garante", 8), req("profiloCompleto", 2)],
    candidato({ completezza: 40 }),
    1000
  );
  assert.equal(r.punteggio, 80);
});

test("un criterio obbligatorio non soddisfatto blocca ma la percentuale resta visibile", () => {
  const r = calcolaMatchProprietario(
    [req("garante", 8, "obbligatorio"), req("profiloCompleto", 2)],
    candidato({ garante: false, fideiussione: false }),
    1000
  );
  assert.equal(r.bloccato, true);
  assert.deepEqual(r.mancanti, ["Garante o fideiussione disponibile"]);
  assert.equal(r.punteggio, 20);
  assert.equal(r.criteri[0].obbligatorio, true);
});

test("un obbligatorio non indicato blocca, ma si legge come 'non indicato'", () => {
  const r = calcolaMatchProprietario(
    [req("nessunProtesto", 5, "obbligatorio")],
    candidato({ protestato: null }),
    1000
  );
  assert.equal(r.bloccato, true);
  assert.equal(r.criteri[0].stato, "non_indicato");
});

test("un criterio preferenziale non soddisfatto non blocca", () => {
  const r = calcolaMatchProprietario(
    [req("garante", 5, "preferenziale")],
    candidato({ garante: false, fideiussione: false }),
    1000
  );
  assert.equal(r.bloccato, false);
  assert.equal(r.punteggio, 0);
});

test("senza criteri la percentuale è null; chiavi sconosciute e ripetute si ignorano", () => {
  assert.equal(calcolaMatchProprietario([], candidato(), 1000).punteggio, null);
  assert.equal(
    calcolaMatchProprietario([req("inesistente", 5)], candidato(), 1000).punteggio,
    null
  );
  const doppio = calcolaMatchProprietario(
    [req("garante", 5), req("garante", 1, "obbligatorio")],
    candidato(),
    1000
  );
  assert.equal(doppio.criteri.length, 1);
  assert.equal(doppio.bloccato, false, "vale la prima occorrenza");
});

test("i pesi fuori scala vengono riportati a 1-10", () => {
  // garante peso 99 -> 10 (soddisfatto), protesto peso 0 -> 1 (non soddisfatto): 10/11
  const r = calcolaMatchProprietario(
    [req("garante", 99), req("nessunProtesto", 0)],
    candidato({ protestato: true }),
    1000
  );
  assert.equal(r.punteggio, 91);
});

test("difetto 4: nessun criterio disponibile riguarda la composizione familiare", () => {
  assert.equal(CHIAVI_CRITERI.length, 5);
  for (const k of CHIAVI_CRITERI) {
    assert.ok(!/nucle|figli|famigli|anim|coppia|single/i.test(k), `criterio sospetto: ${k}`);
  }
});

test("D4: i candidati si ordinano per blocco, percentuale e, a parità, affidabilità", () => {
  const v = (id, punteggio, bloccato, affidabilita) => ({
    id,
    affidabilita,
    match: { punteggio, bloccato },
  });
  const ordinati = ordinaCandidati([
    v("bloccato-alto", 90, true, 99),
    v("sessanta-affidabile-50", 60, false, 50),
    v("sessanta-affidabile-80", 60, false, 80),
    v("settanta", 70, false, 10),
  ]);
  assert.deepEqual(ordinati.map((x) => x.id), [
    "settanta",
    "sessanta-affidabile-80",
    "sessanta-affidabile-50",
    "bloccato-alto",
  ]);
});

// ============================================================
// Il mazzo dell'inquilino (quello che la pagina Home passa al deck)
// ============================================================

// annunci con campi in più rispetto al calcolo, come arrivano dal database
const riga = (id, o = {}) => ({ id, titolo: `Casa ${id}`, ...casa(o) });

test("preparaMazzo: ordina per fascia, toglie gli esclusi e li conta", () => {
  const { mazzo, inRicerca, esclusi } = preparaMazzo(
    [
      riga("fuoriZona", { zona: "Bicocca, Milano" }), // oltre_ricerca
      riga("perfetta", { prezzo: 1200 }), // in_ricerca, punteggio alto
      riga("troppoCara", { prezzo: 2000 }), // escluso
      riga("ok", { prezzo: 1500 }), // in_ricerca
    ],
    profilo()
  );

  assert.deepEqual(mazzo.map((v) => v.id), ["perfetta", "ok", "fuoriZona"]);
  assert.equal(inRicerca, 2);
  assert.equal(esclusi, 1);
});

test("preparaMazzo conserva i campi dell'annuncio e aggiunge il match", () => {
  const { mazzo } = preparaMazzo([riga("x")], profilo());
  assert.equal(mazzo[0].id, "x");
  assert.equal(mazzo[0].titolo, "Casa x");
  assert.equal(typeof mazzo[0].match.punteggio, "number");
});

test("preparaMazzo: i primi `inRicerca` annunci sono davvero quelli in ricerca", () => {
  // il deck si fida di questo per decidere dove mettere il separatore
  const { mazzo, inRicerca } = preparaMazzo(
    [
      riga("a", { zona: "Bicocca, Milano", prezzo: 1000 }),
      riga("b", { prezzo: 1500 }),
      riga("c", { prezzo: 1580 }),
      riga("d", { prezzo: 1100 }),
    ],
    profilo()
  );
  mazzo.forEach((v, i) => {
    assert.equal(
      v.match.fascia === "in_ricerca",
      i < inRicerca,
      `posizione ${i} (${v.id}) è ${v.match.fascia}`
    );
  });
});

test("preparaMazzo: mazzo vuoto e tutti esclusi", () => {
  assert.deepEqual(preparaMazzo([], profilo()), { mazzo: [], inRicerca: 0, esclusi: 0 });
  const r = preparaMazzo([riga("a", { prezzo: 9000 }), riga("b", { prezzo: 8000 })], profilo());
  assert.equal(r.mazzo.length, 0);
  assert.equal(r.esclusi, 2);
});

test("senza criteri di ricerca nessuna percentuale è significativa e l'ordine resta quello d'arrivo", () => {
  const vuoto = { budgetMax: null, localiMin: null, mqMin: null, zone: [], interessi: {} };
  assert.equal(haCriteriDiRicerca(vuoto), false);

  const { mazzo, inRicerca } = preparaMazzo(
    [riga("1", { prezzo: 3000 }), riga("2", { zona: "Bicocca, Milano" }), riga("3")],
    vuoto
  );
  assert.deepEqual(mazzo.map((v) => v.id), ["1", "2", "3"]);
  assert.equal(inRicerca, 3);
  assert.equal(new Set(mazzo.map((v) => v.match.punteggio)).size, 1, "tutti lo stesso punteggio");
});

test("haCriteriDiRicerca: basta un criterio qualsiasi", () => {
  const base = { budgetMax: null, localiMin: null, mqMin: null, zone: [], interessi: {} };
  assert.equal(haCriteriDiRicerca({ ...base, budgetMax: 1500 }), true);
  assert.equal(haCriteriDiRicerca({ ...base, localiMin: 2 }), true);
  assert.equal(haCriteriDiRicerca({ ...base, mqMin: 50 }), true);
  assert.equal(haCriteriDiRicerca({ ...base, zone: ["Isola, Milano"] }), true);
  assert.equal(haCriteriDiRicerca({ ...base, interessi: { balcone: 5 } }), true);
});

// ============================================================
// Il separatore tra "in linea" e "oltre la ricerca"
// ============================================================

const IN = "in_ricerca";
const OLTRE = "oltre_ricerca";
const opz = (o = {}) => ({ mostraMatch: true, separatoreVisto: false, ...o });

test("il separatore compare esattamente al primo annuncio della seconda fascia", () => {
  const fasce = [IN, IN, OLTRE, OLTRE];
  const compare = (i, o) => statoMazzo(fasce, i, opz(o)).mostraSeparatore;

  assert.equal(compare(0), false);
  assert.equal(compare(1), false);
  assert.equal(compare(2), true, "dopo i due in ricerca");
  assert.equal(compare(3), false);
  assert.equal(compare(4), false, "mazzo finito");
});

test("il separatore sparisce dopo che l'inquilino lo ha superato", () => {
  const fasce = [IN, OLTRE];
  assert.equal(statoMazzo(fasce, 1, opz()).mostraSeparatore, true);
  assert.equal(statoMazzo(fasce, 1, opz({ separatoreVisto: true })).mostraSeparatore, false);
});

test("se nessun annuncio è in ricerca il separatore apre il mazzo", () => {
  const s = statoMazzo([OLTRE, OLTRE], 0, opz());
  assert.equal(s.mostraSeparatore, true);
  assert.equal(s.inRicerca, 0);
  assert.equal(s.oltre, 2);
});

test("senza fascia 'oltre' o senza criteri non c'è mai separatore", () => {
  for (let i = 0; i <= 3; i++) {
    assert.equal(statoMazzo([IN, IN, IN], i, opz()).mostraSeparatore, false);
    assert.equal(statoMazzo([IN, OLTRE], i, opz({ mostraMatch: false })).mostraSeparatore, false);
  }
});

test("sequenza completa di swipe: il separatore compare una volta sola", () => {
  const fasce = [IN, IN, OLTRE, OLTRE, OLTRE];
  let visto = false;
  const comparse = [];
  for (let indice = 0; indice < fasce.length; indice++) {
    if (statoMazzo(fasce, indice, opz({ separatoreVisto: visto })).mostraSeparatore) {
      comparse.push(indice);
      visto = true; // l'inquilino preme "Vedi le altre case"
    }
  }
  assert.deepEqual(comparse, [2]);
  assert.equal(statoMazzo(fasce, 5, opz({ separatoreVisto: visto })).finito, true);
});

test("il separatore cade dove preparaMazzo mette il primo annuncio fuori ricerca", () => {
  const { mazzo } = preparaMazzo(
    [riga("a", { zona: "Bicocca, Milano" }), riga("b", { prezzo: 1200 }), riga("c", { prezzo: 1590 }), riga("d")],
    profilo()
  );
  const fasce = mazzo.map((v) => v.match.fascia);
  const i = fasce.findIndex((f) => f === "oltre_ricerca");
  assert.ok(i > 0);
  assert.equal(statoMazzo(fasce, i, opz()).mostraSeparatore, true);
  assert.equal(statoMazzo(fasce, i - 1, opz()).mostraSeparatore, false);
});

// ============================================================
// Criteri del proprietario: validazione di ciò che arriva dal modulo
// ============================================================

test("normalizzaCriteri: riporta tutto a valori validi e scarta il resto", () => {
  const r = normalizzaCriteri(JSON.stringify([
    { chiave: "garante", peso: 99, modo: "obbligatorio" },
    { chiave: "redditoCanone", peso: 0, modo: "preferenziale", sogliaPct: 90 },
    { chiave: "nessunProtesto", peso: "7", modo: "boh" },
    { chiave: "criterioInventato", peso: 5, modo: "obbligatorio" },
    { chiave: "garante", peso: 1, modo: "preferenziale" }, // doppione
    "stringa", null, 42,
  ]));
  assert.deepEqual(r, [
    { chiave: "garante", peso: 10, modo: "obbligatorio" },
    { chiave: "redditoCanone", peso: 1, modo: "preferenziale", sogliaPct: 60 },
    { chiave: "nessunProtesto", peso: 7, modo: "preferenziale" },
  ]);
});

test("normalizzaCriteri: chiavi del prototipo di JavaScript non passano per criteri validi", () => {
  const r = normalizzaCriteri([
    { chiave: "constructor", peso: 5, modo: "obbligatorio" },
    { chiave: "toString", peso: 5, modo: "obbligatorio" },
    { chiave: "__proto__", peso: 5, modo: "obbligatorio" },
    { chiave: "hasOwnProperty", peso: 5, modo: "obbligatorio" },
  ]);
  assert.deepEqual(r, []);
});

test("normalizzaCriteri: input rovinato non fa mai fallire", () => {
  for (const x of [undefined, null, "", "{non json", "42", 42, {}, "[]", [[]], [{}]]) {
    assert.deepEqual(normalizzaCriteri(x), []);
  }
});

test("normalizzaCriteri: un modo sconosciuto diventa il più prudente, preferenziale", () => {
  const r = normalizzaCriteri([{ chiave: "garante", peso: 5, modo: "OBBLIGATORIO" }]);
  assert.equal(r[0].modo, "preferenziale");
});

test("normalizzaCriteri: peso mancante prende il valore proposto, la soglia solo dove serve", () => {
  const r = normalizzaCriteri([{ chiave: "garante" }, { chiave: "redditoCanone" }]);
  assert.equal(r[0].peso, 5);
  assert.equal(r[0].sogliaPct, undefined, "garante non ha soglia");
  assert.equal(r[1].sogliaPct, 33, "soglia predefinita");
});

test("criteri: andata e ritorno col database non perde nulla", () => {
  const criteri = [
    { chiave: "redditoCanone", peso: 8, modo: "obbligatorio", sogliaPct: 40 },
    { chiave: "garante", peso: 3, modo: "preferenziale" },
  ];
  const righe = righeDaCriteri("L1", criteri);
  assert.deepEqual(righe[0], { listing_id: "L1", chiave: "redditoCanone", peso: 8, modo: "obbligatorio", soglia_pct: 40 });
  assert.equal(righe[1].soglia_pct, null, "solo il reddito ha una soglia");
  assert.deepEqual(criteriDaRighe(righe), criteri);
});

test("criteriDaRighe: righe di criteri non più nel catalogo si ignorano", () => {
  const r = criteriDaRighe([
    { chiave: "garante", peso: 5, modo: "preferenziale", soglia_pct: null },
    { chiave: "nessunAnimale", peso: 5, modo: "obbligatorio", soglia_pct: null },
  ]);
  assert.deepEqual(r.map((c) => c.chiave), ["garante"]);
  assert.deepEqual(criteriDaRighe(null), []);
});

// ============================================================
// Il candidato visto dal proprietario
// ============================================================

const profiloDb = (o = {}) => ({
  professione: "Dipendente indeterminato",
  reddito_mensile: 1800,
  reddito_nucleo: 3200,
  garante: true,
  fideiussione: false,
  protestato: false,
  animali_compilato: true,
  nucleo_compilato: true,
  presentazione: "Una presentazione abbastanza lunga.",
  verificato: false,
  ...o,
});

test("reddito del nucleo a zero vale 'non indicato', non 'nessun reddito'", () => {
  assert.equal(datiCandidatoDaProfilo(profiloDb({ reddito_nucleo: 0 })).redditoMensileNucleo, null);
  assert.equal(datiCandidatoDaProfilo(profiloDb({ reddito_nucleo: null })).redditoMensileNucleo, null);
  assert.equal(datiCandidatoDaProfilo(profiloDb({ reddito_nucleo: 3200 })).redditoMensileNucleo, 3200);
});

test("senza reddito del nucleo il criterio sul reddito risulta 'non indicato'", () => {
  const r = valutaCandidato({
    criteri: [{ chiave: "redditoCanone", peso: 5, modo: "obbligatorio" }],
    canone: 900,
    profilo: profiloDb({ reddito_nucleo: 0 }),
    mediaRecensioni: null,
    numeroRecensioni: 0,
  }).match;
  assert.equal(r.criteri[0].stato, "non_indicato");
  assert.equal(r.bloccato, true);
  assert.equal(r.incompleto, true);
});

test("completezza del profilo personale: otto campi, nessuna zona, e animali e nucleo contano solo se compilati", () => {
  assert.equal(completezzaProfiloPersonale(profiloDb()), 100);
  assert.equal(completezzaProfiloPersonale(profiloDb({ reddito_nucleo: null })), 88);
  // sei su otto = 75: sotto la soglia del 'profilo completo'
  assert.equal(completezzaProfiloPersonale(profiloDb({ reddito_nucleo: null, animali_compilato: false })), 75);
  assert.equal(completezzaProfiloPersonale(profiloDb({ presentazione: "corta" })), 88);
});

test("valutaCandidato: affidabilità accanto al match, mai dentro", () => {
  const criteri = [{ chiave: "garante", peso: 5, modo: "preferenziale" }];
  const base = { criteri, canone: 1000, mediaRecensioni: null, numeroRecensioni: 0 };
  const senza = valutaCandidato({ ...base, profilo: profiloDb({ verificato: false }) });
  const con = valutaCandidato({ ...base, profilo: profiloDb({ verificato: true }) });

  assert.ok(con.affidabilita > senza.affidabilita, "la verifica alza l'affidabilità");
  assert.equal(con.match.punteggio, senza.match.punteggio, "ma non il match, che non la chiede");
});

test("il canone reale dell'annuncio decide il criterio sul reddito", () => {
  const val = (canone) => valutaCandidato({
    criteri: [{ chiave: "redditoCanone", peso: 5, modo: "preferenziale" }],
    canone,
    profilo: profiloDb({ reddito_nucleo: 3000 }),
    mediaRecensioni: null,
    numeroRecensioni: 0,
  }).match.criteri[0].stato;
  assert.equal(val(900), "ok");   // 30%
  assert.equal(val(1500), "no");  // 50%
});

test("leggiFotografia: accetta quella salvata, rifiuta forme rovinate", () => {
  const v = valutaCandidato({
    criteri: [{ chiave: "garante", peso: 5, modo: "obbligatorio" }],
    canone: 1000, profilo: profiloDb(), mediaRecensioni: null, numeroRecensioni: 0,
  });
  // come esce dal database: serializzata e riletta. JSON toglie le chiavi
  // `undefined`, quindi il confronto è con la versione già serializzata.
  const salvata = JSON.parse(JSON.stringify(v));
  assert.deepEqual(leggiFotografia(salvata), salvata);

  for (const x of [null, undefined, 5, "x", {}, { match: null, affidabilita: 5 },
                   { match: { punteggio: "80" }, affidabilita: 5 },
                   { match: { punteggio: 80, bloccato: false, incompleto: false, criteri: [], mancanti: [] } }]) {
    assert.equal(leggiFotografia(x), null);
  }
});

test("profiloRicercaDaRighe: 0 e vuoto valgono 'nessuna preferenza'", () => {
  const p = profiloRicercaDaRighe(
    { budget_max: 0, locali_min: null, mq_min: 60 },
    [{ zona: "Isola, Milano" }],
    [{ attributo_key: "balcone", peso: 8 }]
  );
  assert.deepEqual(p, { budgetMax: null, localiMin: null, mqMin: 60, zone: ["Isola, Milano"], interessi: { balcone: 8 } });
  assert.equal(profiloRicercaDaRighe({ budget_max: null, locali_min: null, mq_min: null }, null, undefined).zone.length, 0);
});
