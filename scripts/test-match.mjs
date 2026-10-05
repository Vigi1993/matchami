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
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---- piccolo caricatore: traduce i .ts al volo e risolve gli import relativi
const cache = new Map();
function carica(file) {
  const assoluto = path.resolve(file);
  if (cache.has(assoluto)) return cache.get(assoluto).exports;

  const sorgente = fs.readFileSync(assoluto, "utf8");
  const { outputText } = ts.transpileModule(sorgente, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });

  const modulo = { exports: {} };
  cache.set(assoluto, modulo);

  const richiedi = (spec) => {
    if (!spec.startsWith(".")) return require(spec);
    let p = path.resolve(path.dirname(assoluto), spec);
    if (fs.existsSync(p + ".ts")) p += ".ts";
    else if (fs.existsSync(path.join(p, "index.ts"))) p = path.join(p, "index.ts");
    return carica(p);
  };

  new Function("require", "module", "exports", outputText)(
    richiedi,
    modulo,
    modulo.exports
  );
  return modulo.exports;
}

const m = carica(path.join(radice, "src", "lib", "match", "index.ts"));
const {
  calcolaMatchInquilino,
  ordinaAnnunci,
  calcolaMatchProprietario,
  ordinaCandidati,
  etichettaPer,
  CHIAVI_CRITERI,
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

test("lo sforamento entro tolleranza genera un avviso leggibile", () => {
  const r = calcolaMatchInquilino(casa({ prezzo: 1590 }), profilo());
  assert.equal(r.fascia, "oltre_ricerca");
  assert.deepEqual(r.avvisi, ["Oltre il tuo budget del 6%"]);
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
