/**
 * Test dei parametri di ricerca: il motore di match esteso (budget e metratura «da – a», tipologia, luoghi, caratteristiche
 * necessarie e con valore), i luoghi con il completamento automatico e la coerenza con la migrazione 0030.
 * Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const eng = caricaTs(path.join(radice, "src", "lib", "match", "inquilino.ts"));
const mz = caricaTs(path.join(radice, "src", "lib", "match", "mazzo.ts"));
const cr = caricaTs(path.join(radice, "src", "lib", "match", "criteri-ricerca.ts"));
const lg = caricaTs(path.join(radice, "src", "lib", "luoghi.ts"));
const co = caricaTs(path.join(radice, "src", "lib", "constants.ts"));
const en = caricaTs(path.join(radice, "src", "lib", "annunci", "energia.ts"));
const vf = caricaTs(path.join(radice, "src", "lib", "verifica.ts"));
// con i ritorni a capo di Windows normalizzati
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const sql = leggi("supabase", "migrations", "0030_parametri_ricerca.sql");

// ============================================================ nessun risultato di prima è cambiato
const g = JSON.parse(fs.readFileSync(path.join(radice, "scripts", "fixtures", "match-v1.json"), "utf8"));

test("riferimento: per OGNI ricerca di prima (318 casi) il risultato è identico, punto per punto", () => {
  assert.equal(g.casi.length, 318);
  for (const [i, c] of g.casi.entries()) {
    const { motiviEsclusione, ...senza } = eng.calcolaMatchInquilino(c.annuncio, c.profilo);
    assert.deepEqual(senza, c.risultato, `caso ${i}: ${JSON.stringify({ a: c.annuncio, p: c.profilo })}`);
    // prima si poteva uscire dal mazzo solo per il budget
    assert.deepEqual(motiviEsclusione, senza.fascia === "escluso" ? ["budget"] : [], `caso ${i}`);
  }
});

test("riferimento: i 12 mazzi interi di prima hanno lo stesso ordine, le stesse fasce e gli stessi punteggi", () => {
  for (const [i, x] of g.mazzi.entries()) {
    const r = mz.preparaMazzo(x.annunci, x.profilo);
    assert.deepEqual(r.mazzo.map((v) => v.id), x.ordine, `mazzo ${i}`); assert.deepEqual(r.mazzo.map((v) => v.match.punteggio), x.punteggi, `mazzo ${i}`); assert.deepEqual(r.mazzo.map((v) => v.match.fascia), x.fasce, `mazzo ${i}`);
    assert.equal(r.inRicerca, x.inRicerca); assert.equal(r.esclusi, x.esclusi); assert.equal(r.nascostiPerNecessarie, 0, "nessuna caratteristica necessaria nei casi di prima");
  }
});

test("riferimento: i parametri nuovi esplicitamente vuoti non cambiano niente (null, [] e undefined sono «nessuna preferenza»)", () => {
  const neutri = { budgetMin: null, localiMax: null, mqMax: null, tipologia: null, luoghi: [] };
  for (const c of g.casi.slice(0, 120)) { const r = eng.calcolaMatchInquilino(c.annuncio, { ...c.profilo, ...neutri }); delete r.motiviEsclusione; assert.deepEqual(r, c.risultato); }
});

// ============================================================ dati di prova
const casa = (o = {}) => ({ prezzo: 1000, zona: "Isola, Milano", locali: 2, mq: 60, attributi: {}, ...o });
const ric = (o = {}) => ({ budgetMax: null, localiMin: null, mqMin: null, zone: [], interessi: {}, ...o });
const calcola = (a, p) => eng.calcolaMatchInquilino(a, p);
const crit = (chiave, o = {}) => ({ chiave, necessaria: false, peso: 5, valore: null, ...o });
const nec = (chiave, valore = null) => crit(chiave, { necessaria: true, valore });
const riga = (r, chiave) => r.criteri.find((x) => x.chiave === chiave);

// ============================================================ tipologia
test("tipologia: un filtro netto; l'annuncio senza tipologia vale «appartamento»; senza richiesta nessun filtro", () => {
  assert.equal(calcola(casa({ tipologia: "villa" }), ric({ tipologia: "appartamento" })).fascia, "escluso"); assert.deepEqual(calcola(casa({ tipologia: "villa" }), ric({ tipologia: "appartamento" })).motiviEsclusione, ["tipologia"]);
  assert.equal(calcola(casa({ tipologia: "villa" }), ric({ tipologia: "villa" })).fascia, "in_ricerca");
  for (const t of [undefined, null, "appartamento"]) assert.equal(calcola(casa({ tipologia: t }), ric({ tipologia: "appartamento" })).fascia, "in_ricerca", String(t));
  assert.equal(calcola(casa({ tipologia: "villa" }), ric()).fascia, "in_ricerca"); assert.equal(calcola(casa({ tipologia: "villa" }), ric({ tipologia: null })).fascia, "in_ricerca");
  assert.equal(calcola(casa({ tipologia: "posto_letto" }), ric({ tipologia: "appartamento" })).fascia, "escluso");
});

test("tipologia: un annuncio escluso per tipologia e per budget ha entrambi i motivi, una sola volta ciascuno", () => {
  const r = calcola(casa({ tipologia: "villa", prezzo: 2000 }), ric({ tipologia: "appartamento", budgetMax: 1000 })); assert.deepEqual(r.motiviEsclusione.sort(), ["budget", "tipologia"]);
});

// ============================================================ budget, locali, metratura: «da – a»
test("budget minimo: sotto il minimo la casa resta ma «oltre la ricerca»; nel range è in ricerca; solo il minimo vale come «da»", () => {
  const p = ric({ budgetMin: 900, budgetMax: 1400 });
  const sotto = calcola(casa({ prezzo: 700 }), p); assert.equal(sotto.fascia, "oltre_ricerca"); assert.deepEqual(sotto.motivi, ["Sotto il tuo budget minimo"]); assert.equal(riga(sotto, "budget").stato, "no"); assert.equal(riga(sotto, "budget").etichetta, "Budget €900 – €1.400".replace("€1.400", "€" + (1400).toLocaleString("it-IT")));
  assert.equal(calcola(casa({ prezzo: 900 }), p).fascia, "in_ricerca"); assert.equal(calcola(casa({ prezzo: 1400 }), p).fascia, "in_ricerca"); assert.equal(calcola(casa({ prezzo: 899 }), p).fascia, "oltre_ricerca");
  const soloMin = ric({ budgetMin: 900 }); assert.equal(calcola(casa({ prezzo: 5000 }), soloMin).fascia, "in_ricerca", "senza massimo, niente tetto"); assert.equal(calcola(casa({ prezzo: 899 }), soloMin).fascia, "oltre_ricerca"); assert.match(riga(calcola(casa({ prezzo: 1200 }), soloMin), "budget").etichetta, /^Budget da €/);
});

test("budget minimo: oltre il massimo + 10% la casa resta ESCLUSA (come prima); sotto il minimo non è mai «esclusa per budget»", () => {
  const p = ric({ budgetMin: 900, budgetMax: 1000 }); assert.deepEqual(calcola(casa({ prezzo: 1200 }), p).motiviEsclusione, ["budget"]); assert.equal(calcola(casa({ prezzo: 1100 }), p).fascia, "oltre_ricerca");
  assert.deepEqual(calcola(casa({ prezzo: 100 }), p).motiviEsclusione, []);
  assert.ok(calcola(casa({ prezzo: 700 }), p).punteggio < calcola(casa({ prezzo: 950 }), p).punteggio, "sotto il minimo vale meno che nel range");
});

test("locali e metratura «da – a»: sopra il massimo la casa resta ma «oltre la ricerca»; le etichette dicono l'intervallo", () => {
  const p = ric({ localiMin: 2, localiMax: 3, mqMin: 50, mqMax: 90 });
  assert.equal(calcola(casa({ locali: 3, mq: 90 }), p).fascia, "in_ricerca"); assert.equal(calcola(casa({ locali: 2, mq: 50 }), p).fascia, "in_ricerca");
  const troppi = calcola(casa({ locali: 4 }), p); assert.equal(troppi.fascia, "oltre_ricerca"); assert.deepEqual(troppi.motivi, ["Più locali del tuo massimo"]); assert.equal(riga(troppi, "locali").etichetta, "2–3 locali");
  const grande = calcola(casa({ mq: 120 }), p); assert.deepEqual(grande.motivi, ["Sopra la tua metratura massima"]); assert.equal(riga(grande, "mq").etichetta, "50–90 m²");
  assert.deepEqual(calcola(casa({ locali: 1 }), p).motivi, ["Meno locali del tuo minimo"]);
  assert.equal(riga(calcola(casa(), ric({ localiMax: 3 })), "locali").etichetta, "fino a 3 locali"); assert.equal(riga(calcola(casa(), ric({ mqMax: 80 })), "mq").etichetta, "fino a 80 m²"); assert.equal(riga(calcola(casa({ locali: 2 }), ric({ localiMin: 2, localiMax: 2 })), "locali").etichetta, "2 locali");
  assert.equal(calcola(casa({ locali: 9 }), ric({ localiMax: 3 })).fascia, "oltre_ricerca", "solo il massimo");
});

test("locali e metratura: il dato mancante dell'annuncio non punisce (punti neutri e un avviso), anche con il massimo", () => {
  const r = calcola(casa({ locali: null, mq: null }), ric({ localiMin: 2, localiMax: 3, mqMax: 80 })); assert.equal(r.fascia, "in_ricerca"); assert.equal(riga(r, "locali").stato, "non_indicato"); assert.equal(riga(r, "mq").stato, "non_indicato"); assert.equal(r.avvisi.length, 2);
});

test("punteggi: i nuovi parametri non fanno mai uscire il punteggio dall'intervallo 0-99, qualunque combinazione", () => {
  let seme = 99; const rnd = () => (seme = (seme * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const n = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  for (let i = 0; i < 1500; i++) {
    const p = ric({ budgetMin: rnd() < 0.5 ? n(300, 1200) : null, budgetMax: rnd() < 0.7 ? n(600, 2000) : null, localiMin: rnd() < 0.5 ? n(1, 3) : null, localiMax: rnd() < 0.5 ? n(2, 6) : null, mqMin: rnd() < 0.5 ? n(30, 80) : null, mqMax: rnd() < 0.5 ? n(60, 200) : null, criteri: rnd() < 0.6 ? [crit("balcone", { peso: n(1, 10) }), nec("ascensore")] : [] });
    const r = calcola(casa({ prezzo: n(300, 3000), locali: rnd() < 0.2 ? null : n(1, 7), mq: rnd() < 0.2 ? null : n(20, 250) }), p); assert.ok(r.punteggio >= 0 && r.punteggio <= 99, `${r.punteggio} per ${JSON.stringify(p)}`);
  }
});

// ============================================================ luoghi nel match
const U = { prov: "p-mi", cit: "c-mi", isola: "q-isola", navigli: "q-navigli", provBg: "p-bg", citBg: "c-bg", alta: "q-alta" };
const antMi = (q) => [q, U.cit, U.prov];

test("luoghi: scegliere un quartiere, una città o una provincia: la casa è «in zona» se sta dentro", () => {
  const dentro = casa({ antenati: antMi(U.isola) });
  for (const scelto of [U.isola, U.cit, U.prov]) assert.equal(calcola(dentro, ric({ luoghi: [scelto] })).fascia, "in_ricerca", scelto);
  for (const scelto of [U.navigli, U.citBg, U.provBg, U.alta]) { const r = calcola(dentro, ric({ luoghi: [scelto] })); assert.equal(r.fascia, "oltre_ricerca", scelto); assert.deepEqual(r.motivi, ["Fuori dalle tue zone"]); }
  assert.equal(calcola(dentro, ric({ luoghi: [U.navigli, U.isola] })).fascia, "in_ricerca", "basta uno dei luoghi scelti");
});

test("luoghi: un annuncio senza luogo si confronta con le etichette; se non c'è nemmeno quella, «non indicato» (mai un sì né un no inventato)", () => {
  const senza = casa({ antenati: [] });
  assert.equal(calcola(senza, ric({ luoghi: [U.isola], zone: ["Isola, Milano"] })).fascia, "in_ricerca"); assert.equal(calcola(senza, ric({ luoghi: [U.isola], zone: ["Navigli, Milano"] })).fascia, "oltre_ricerca");
  const r = calcola(senza, ric({ luoghi: [U.isola] })); assert.equal(riga(r, "zona").stato, "non_indicato"); assert.deepEqual(r.avvisi, ["Zona dell'annuncio non riconosciuta"]); assert.equal(r.fascia, "in_ricerca", "non si punisce l'inquilino per un annuncio non collegato");
  assert.equal(calcola(casa(), ric({ luoghi: [U.isola] })).fascia, "in_ricerca", "antenati assenti");
});

test("luoghi: senza luoghi scelti vale il confronto per etichetta di sempre", () => {
  assert.equal(calcola(casa({ antenati: antMi(U.isola) }), ric({ zone: ["Isola, Milano"] })).fascia, "in_ricerca"); assert.equal(calcola(casa({ antenati: antMi(U.isola) }), ric({ zone: ["Navigli, Milano"] })).fascia, "oltre_ricerca");
  assert.equal(calcola(casa(), ric({ luoghi: [] })).fascia, "in_ricerca");
});

// ============================================================ caratteristiche necessarie e opzionali
test("necessaria sì/no: se la casa non ce l'ha SPARISCE (esclusa per «necessaria»); se ce l'ha resta, e il cancello non dà punti", () => {
  const p = ric({ criteri: [nec("ascensore")] });
  const no = calcola(casa({ attributi: {} }), p); assert.equal(no.fascia, "escluso"); assert.deepEqual(no.motiviEsclusione, ["necessaria"]);
  const si = calcola(casa({ attributi: { ascensore: true } }), p); assert.equal(si.fascia, "in_ricerca"); assert.deepEqual(si.motiviEsclusione, []);
  assert.equal(calcola(casa({ attributi: null }), p).fascia, "escluso"); assert.equal(calcola(casa({ attributi: { ascensore: false } }), p).fascia, "escluso");
  assert.equal(riga(si, "ascensore").obbligatorio, true, "la riga dice che era necessaria"); assert.equal(riga(si, "ascensore").etichetta, "Ascensore");
});

test("necessaria: solo caratteristiche necessarie = come nessuna caratteristica per i pesi (non tolgono punti alle altre voci)", () => {
  // a budget esatto il punteggio non è al tetto: la differenza dei pesi si vede
  const a = casa({ attributi: { ascensore: true } }); const base = calcola(a, ric({ budgetMax: 1000, criteri: [] })).punteggio;
  assert.ok(base < 99, "il caso di prova non deve essere al tetto: " + base);
  assert.equal(calcola(a, ric({ budgetMax: 1000, criteri: [nec("ascensore")] })).punteggio, base);
  assert.notEqual(calcola(a, ric({ budgetMax: 1000, criteri: [crit("ascensore")] })).punteggio, base, "un'opzionale cambia i pesi");
});

test("necessaria + opzionale insieme: la necessaria soddisfatta NON diluisce il punteggio dell'opzionale (non ne cambia il peso)", () => {
  const a = casa({ attributi: { balcone: true, ascensore: true } }); const solo = calcola(a, ric({ budgetMax: 1000, criteri: [crit("balcone", { peso: 5 })] })).punteggio;
  assert.ok(solo < 99, "il caso di prova non deve essere al tetto"); assert.equal(calcola(a, ric({ budgetMax: 1000, criteri: [crit("balcone", { peso: 5 }), nec("ascensore")] })).punteggio, solo);
  assert.equal(calcola(a, ric({ budgetMax: 1000, criteri: [crit("balcone", { peso: 5 }), nec("bagni", { min: 2 })] })).punteggio, solo, "nemmeno una necessaria con dato mancante");
});

test("opzionali: pesano sul punteggio col loro peso, come le caratteristiche di sempre", () => {
  const a = casa({ attributi: { balcone: true } }); const pieno = calcola(a, ric({ criteri: [crit("balcone", { peso: 8 })] })); const meta = calcola(a, ric({ criteri: [crit("balcone", { peso: 5 }), crit("cantina", { peso: 5 })] })); const zero = calcola(casa(), ric({ criteri: [crit("balcone", { peso: 8 })] }));
  assert.ok(pieno.punteggio > meta.punteggio && meta.punteggio > zero.punteggio, `${pieno.punteggio} ${meta.punteggio} ${zero.punteggio}`); assert.equal(zero.fascia, "in_ricerca", "un'opzionale mancante non toglie la casa dal mazzo");
});

test("l'elenco nuovo è l'unico che si legge: gli interessi vecchi si ignorano se c'è `criteri`", () => {
  const a = casa({ attributi: { balcone: true } });
  assert.deepEqual(calcola(a, ric({ interessi: { terrazzo: 10 }, criteri: [crit("balcone")] })).criteri.map((x) => x.chiave), ["balcone"]);
  assert.deepEqual(calcola(a, ric({ interessi: { terrazzo: 10, balcone: 3 } })).criteri.map((x) => x.chiave), ["balcone", "terrazzo"], "senza `criteri`: i vecchi interessi, nell'ordine del vocabolario");
});

// ---- con valore
const conValore = [
  ["bagni", { min: 2 }, { bagni: 2 }, { bagni: 1 }, "Almeno 2 bagni"],
  ["piano", { min: 0, max: 3 }, { piano: 2 }, { piano: 5 }, "Piano da terra a 3°"],
  ["riscaldamento", { tipi: ["autonomo", "centralizzato"] }, { riscaldamento: "autonomo" }, { riscaldamento: "pompa_di_calore" }, "Riscaldamento autonomo o centralizzato"],
  ["contratto", { tipi: ["libero_4_4"] }, { tipoContratto: "libero_4_4" }, { tipoContratto: "transitorio" }, "Contratto 4+4 libero"],
  ["ingresso", { entro: "2026-12-01" }, { disponibileDal: "2026-11-15" }, { disponibileDal: "2027-01-10" }, "Disponibile entro il 1 dicembre 2026"],
  ["classeEnergetica", { classe: "C" }, { classeEnergetica: "B" }, { classeEnergetica: "E" }, "Classe energetica almeno C"],
];
for (const [chiave, valore, bene, male, etichetta] of conValore) {
  test(`criterio «${chiave}»: ok se rispettato, no se no, «non indicato» se manca; etichetta in italiano; necessario esclude solo se NON rispettato`, () => {
    const c = crit(chiave, { valore }); const okR = calcola(casa(bene), ric({ criteri: [c] })); assert.equal(riga(okR, chiave).stato, "ok"); assert.equal(riga(okR, chiave).etichetta, etichetta);
    assert.equal(riga(calcola(casa(male), ric({ criteri: [c] })), chiave).stato, "no"); assert.equal(riga(calcola(casa(), ric({ criteri: [c] })), chiave).stato, "non_indicato");
    const n = crit(chiave, { valore, necessaria: true });
    assert.equal(calcola(casa(bene), ric({ criteri: [n] })).fascia, "in_ricerca", "rispettato"); assert.equal(calcola(casa(male), ric({ criteri: [n] })).fascia, "escluso", "non rispettato: sparisce"); assert.deepEqual(calcola(casa(male), ric({ criteri: [n] })).motiviEsclusione, ["necessaria"]);
    const mancante = calcola(casa(), ric({ criteri: [n] })); assert.equal(mancante.fascia, "oltre_ricerca", "dato mancante su una necessaria: la casa RESTA, segnata (non si nasconde per una dimenticanza del proprietario)"); assert.ok(mancante.motivi[0].includes("non indicato dal proprietario")); assert.equal(mancante.motiviEsclusione.length, 0);
  });
}

test("criteri con valore: i bordi (bagni 2 = 2, piano esatto, stessa data, stessa classe) valgono come rispettati", () => {
  assert.equal(valuta("bagni", { min: 2 }, { bagni: 2 }), "ok"); assert.equal(valuta("piano", { min: 2, max: 2 }, { piano: 2 }), "ok"); assert.equal(valuta("piano", { min: 2, max: 2 }, { piano: 3 }), "no"); assert.equal(valuta("piano", { max: 1 }, { piano: -1 }), "ok", "seminterrato sotto il limite"); assert.equal(valuta("piano", { min: 1 }, { piano: 0 }), "no");
  assert.equal(valuta("ingresso", { entro: "2026-12-01" }, { disponibileDal: "2026-12-01" }), "ok"); assert.equal(valuta("ingresso", { entro: "2026-12-01" }, { disponibileDal: "2026-12-02" }), "no"); assert.equal(valuta("classeEnergetica", { classe: "C" }, { classeEnergetica: "C" }), "ok"); assert.equal(valuta("classeEnergetica", { classe: "A1" }, { classeEnergetica: "A2" }), "ok"); assert.equal(valuta("classeEnergetica", { classe: "A4" }, { classeEnergetica: "A3" }), "no"); assert.equal(valuta("classeEnergetica", { classe: "G" }, { classeEnergetica: "G" }), "ok");
  assert.equal(valuta("classeEnergetica", { classe: "C" }, { classeEnergetica: "Z" }), "non_indicato", "una classe sconosciuta non si inventa");
  function valuta(chiave, valore, dati) { return cr.valutaCriterio(crit(chiave, { valore }), { attributi: null, ...dati }).stato; }
});

test("opzionale con valore e dato mancante: mezzo punteggio e un avviso, la casa resta in ricerca", () => {
  const r = calcola(casa(), ric({ criteri: [crit("bagni", { valore: { min: 2 }, peso: 10 })] })); assert.equal(r.fascia, "in_ricerca"); assert.ok(r.avvisi.some((a) => a.includes("Almeno 2 bagni")));
  const ok = calcola(casa({ bagni: 2 }), ric({ criteri: [crit("bagni", { valore: { min: 2 }, peso: 10 })] })); const no = calcola(casa({ bagni: 1 }), ric({ criteri: [crit("bagni", { valore: { min: 2 }, peso: 10 })] }));
  assert.ok(ok.punteggio > r.punteggio && r.punteggio > no.punteggio, `${ok.punteggio} > ${r.punteggio} > ${no.punteggio}`);
});

test("più necessarie insieme: basta UNA non rispettata per far sparire la casa, e i motivi non si ripetono", () => {
  const p = ric({ criteri: [nec("ascensore"), nec("balcone"), nec("bagni", { min: 2 })] });
  assert.equal(calcola(casa({ attributi: { ascensore: true, balcone: true }, bagni: 2 }), p).fascia, "in_ricerca"); const r = calcola(casa({ attributi: { ascensore: true }, bagni: 1 }), p); assert.equal(r.fascia, "escluso"); assert.deepEqual(r.motiviEsclusione, ["necessaria"]);
});

// ============================================================ il mazzo e i conteggi
test("mazzo: le case che non rispettano una necessaria non compaiono, e si contano (la Home dice quante ne ha nascoste)", () => {
  const p = ric({ criteri: [nec("ascensore")] });
  const annunci = [{ id: "a", ...casa({ attributi: { ascensore: true } }) }, { id: "b", ...casa() }, { id: "c", ...casa({ attributi: {} }) }, { id: "d", ...casa({ attributi: { ascensore: true } }) }];
  const r = mz.preparaMazzo(annunci, p); assert.deepEqual(r.mazzo.map((v) => v.id), ["a", "d"]); assert.equal(r.esclusi, 2); assert.equal(r.nascostiPerNecessarie, 2); assert.equal(r.inRicerca, 2);
});

test("mazzo: nascosti per tipologia o per budget non contano come «nascosti per una necessaria»; una casa nascosta per più motivi sì", () => {
  const p = ric({ tipologia: "appartamento", budgetMax: 1000, criteri: [nec("ascensore")] });
  const annunci = [{ id: "ville", ...casa({ tipologia: "villa", attributi: { ascensore: true } }) }, { id: "cara", ...casa({ prezzo: 2000, attributi: { ascensore: true } }) }, { id: "senza", ...casa({ attributi: {} }) }, { id: "cara-e-senza", ...casa({ prezzo: 2000, attributi: {} }) }];
  const r = mz.preparaMazzo(annunci, p); assert.equal(r.mazzo.length, 0); assert.equal(r.esclusi, 4); assert.equal(r.nascostiPerNecessarie, 2);
});

test("haCriteriDiRicerca: ogni parametro nuovo conta (la tipologia da sola no: c'è sempre)", () => {
  const v = ric(); assert.equal(mz.haCriteriDiRicerca(v), false); assert.equal(mz.haCriteriDiRicerca({ ...v, tipologia: "appartamento" }), false, "la tipologia c'è sempre: non è un criterio");
  for (const x of [{ budgetMin: 500 }, { localiMax: 3 }, { mqMax: 90 }, { luoghi: ["x"] }, { criteri: [crit("balcone")] }]) assert.equal(mz.haCriteriDiRicerca({ ...v, ...x }), true, JSON.stringify(x));
});

// ============================================================ dalle righe del database
test("profiloRicercaDaRighe: colonne nuove, zone con luogo, caratteristiche con valore e «necessaria»; le righe rotte si scartano", () => {
  const p = mz.profiloRicercaDaRighe({ budget_max: 1400, locali_min: 2, mq_min: 50, budget_min: 900, locali_max: 3, mq_max: 90, tipologia: "villa" },
    [{ zona: "Isola, Milano", luogo_id: "q1" }, { zona: "Bergamo", luogo_id: "c2" }, { zona: "Vecchia" }],
    [{ attributo_key: "balcone", peso: 7 }, { attributo_key: "ascensore", peso: 5, necessaria: true }, { attributo_key: "bagni", peso: 5, necessaria: true, valore: { min: 2 } }, { attributo_key: "bagni", peso: 5, valore: { min: 3 } }, { attributo_key: "piano", peso: 5, valore: { min: 9, max: 2 } }, { attributo_key: "x; drop", peso: 5 }, { attributo_key: "riscaldamento", peso: 5, valore: { tipi: ["gas"] } }]);
  assert.equal(p.budgetMin, 900); assert.equal(p.localiMax, 3); assert.equal(p.mqMax, 90); assert.equal(p.tipologia, "villa"); assert.deepEqual(p.zone, ["Isola, Milano", "Bergamo", "Vecchia"]); assert.deepEqual(p.luoghi, ["q1", "c2"], "solo le zone collegate a un luogo");
  assert.deepEqual(p.criteri.map((c) => [c.chiave, c.necessaria]), [["balcone", false], ["ascensore", true], ["bagni", true]], "il doppione, il piano rovesciato, la chiave ostile e il riscaldamento inventato sono scartati");
  assert.deepEqual(p.interessi, { balcone: 7 }, "gli interessi vecchi: solo le opzionali sì/no");
});

test("profiloRicercaDaRighe: una tipologia sconosciuta o vuota non filtra niente; 0 e vuoto valgono «nessuna preferenza»", () => {
  for (const t of ["castello", "", null, undefined]) assert.equal(mz.profiloRicercaDaRighe({ budget_max: null, locali_min: null, mq_min: null, tipologia: t }, [], []).tipologia, null, String(t));
  const p = mz.profiloRicercaDaRighe({ budget_max: 0, locali_min: 0, mq_min: 0, budget_min: 0, locali_max: 0, mq_max: 0 }, null, undefined); assert.deepEqual([p.budgetMax, p.localiMin, p.mqMin, p.budgetMin, p.localiMax, p.mqMax, p.zone, p.luoghi, p.criteri], [null, null, null, null, null, null, [], [], []]);
});

test("campiMatchDaRiga: i campi dell'annuncio e i luoghi che lo contengono; il dato mancante resta null", () => {
  const mappa = lg.mappaLuoghi([{ id: "p", livello: "provincia", nome: "Milano", sigla: "MI", parent_id: null }, { id: "c", livello: "comune", nome: "Milano", sigla: null, parent_id: "p" }, { id: "q", livello: "quartiere", nome: "Isola", sigla: null, parent_id: "c" }]);
  assert.deepEqual(mz.campiMatchDaRiga({ luogo_id: "q", tipologia: "villa", bagni: 2, piano: 0, riscaldamento: "autonomo", tipo_contratto: "studenti", disponibile_dal: "2026-12-01", classe_energetica: "B" }, mappa), { antenati: ["q", "c", "p"], tipologia: "villa", bagni: 2, piano: 0, riscaldamento: "autonomo", tipoContratto: "studenti", disponibileDal: "2026-12-01", classeEnergetica: "B" });
  assert.deepEqual(mz.campiMatchDaRiga({}, mappa), { antenati: [], tipologia: null, bagni: null, piano: 0 === 1 ? 0 : null, riscaldamento: null, tipoContratto: null, disponibileDal: null, classeEnergetica: null }); assert.equal(mz.campiMatchDaRiga({ tipologia: "castello" }, mappa).tipologia, null);
});

// ============================================================ criteri: validazione
test("criteri: i valori che arrivano da fuori si controllano; quelli sbagliati si scartano senza errori", () => {
  const n = (c) => cr.normalizzaCriterioRicerca(c);
  assert.deepEqual(n({ chiave: "balcone", necessaria: true, peso: 7 }), { chiave: "balcone", necessaria: true, peso: 7, valore: null }); assert.deepEqual(n({ chiave: "balcone" }), { chiave: "balcone", necessaria: false, peso: 5, valore: null });
  assert.equal(n({ chiave: "balcone", necessaria: "true" }).necessaria, false, "«necessaria» deve essere proprio vero"); assert.equal(n({ chiave: "balcone", peso: 99 }).peso, 10); assert.equal(n({ chiave: "balcone", peso: -3 }).peso, 1); assert.equal(n({ chiave: "balcone", peso: "x" }).peso, 5); assert.equal(n({ chiave: "balcone", peso: 6.6 }).peso, 7);
  assert.equal(n({ chiave: "balcone", valore: { min: 3 } }).valore, null, "un sì/no non ha valore");
  for (const brutto of [null, undefined, 5, "balcone", [], {}, { chiave: 5 }, { chiave: "" }, { chiave: "a" }, { chiave: "1abc" }, { chiave: "con spazio" }, { chiave: "x".repeat(40) }, { chiave: "__proto__" }]) assert.equal(n(brutto), null, JSON.stringify(brutto));
  const v = (chiave, valore) => n({ chiave, valore });
  assert.deepEqual(v("bagni", { min: 2 }).valore, { min: 2 }); for (const x of [{ min: 0 }, { min: 7 }, { min: 1.5 }, { min: "2" }, {}, null, 3]) assert.equal(v("bagni", x), null, JSON.stringify(x));
  assert.deepEqual(v("piano", { min: -2, max: 60 }).valore, { min: -2, max: 60 }); assert.deepEqual(v("piano", { max: 3 }).valore, { min: null, max: 3 }); for (const x of [{}, { min: 5, max: 2 }, { min: -3 }, { max: 61 }, { min: 1.5 }]) assert.equal(v("piano", x), null, JSON.stringify(x));
  assert.deepEqual(v("riscaldamento", { tipi: ["autonomo", "autonomo", "gas", 5] }).valore, { tipi: ["autonomo"] }); for (const x of [{ tipi: [] }, { tipi: ["gas"] }, { tipi: "autonomo" }, {}]) assert.equal(v("riscaldamento", x), null, JSON.stringify(x));
  assert.deepEqual(v("contratto", { tipi: ["studenti", "transitorio"] }).valore, { tipi: ["studenti", "transitorio"] }); assert.equal(v("contratto", { tipi: ["boh"] }), null);
  assert.deepEqual(v("ingresso", { entro: "2026-12-01" }).valore, { entro: "2026-12-01" }); for (const x of ["2026-02-31", "domani", "2026-1-1", "2026-12-01T00:00", "", 5]) assert.equal(v("ingresso", { entro: x }), null, String(x));
  assert.deepEqual(v("classeEnergetica", { classe: "A3" }).valore, { classe: "A3" }); for (const x of ["Z", "a3", "", 5]) assert.equal(v("classeEnergetica", { classe: x }), null, String(x));
});

test("criteri: dateValida non accetta date inesistenti; l'elenco si ripulisce, si ordina e ha un tetto", () => {
  for (const [d, atteso] of [["2026-02-28", true], ["2024-02-29", true], ["2026-02-29", false], ["2026-04-31", false], ["2026-13-01", false], ["2026-00-10", false], ["20261201", false]]) assert.equal(cr.dataValida(d), atteso, d);
  const lista = cr.normalizzaCriteriRicerca([crit("bagni", { valore: { min: 2 } }), crit("cantina"), { chiave: "x; drop" }, crit("balcone"), crit("balcone", { necessaria: true }), crit("altraChiave"), crit("ascensore")]);
  assert.deepEqual(lista.map((c) => c.chiave), ["balcone", "ascensore", "cantina", "altraChiave", "bagni"], "vocabolario, poi sconosciute, poi con valore; senza doppioni né righe rotte"); assert.equal(lista.find((c) => c.chiave === "balcone").necessaria, false, "vince la prima");
  assert.equal(cr.normalizzaCriteriRicerca(Array.from({ length: 100 }, (_, i) => crit("k" + String(i).padStart(2, "0")))).length, 40); assert.deepEqual(cr.normalizzaCriteriRicerca("boh"), []); assert.deepEqual(cr.normalizzaCriteriRicerca(null), []);
});

test("criteri: etichette in italiano per ogni forma di piano e di bagni", () => {
  const e = (chiave, valore) => cr.etichettaCriterio(crit(chiave, { valore }));
  assert.equal(e("bagni", { min: 1 }), "Almeno 1 bagno"); assert.equal(e("bagni", { min: 3 }), "Almeno 3 bagni"); assert.equal(e("piano", { min: 2, max: 2 }), "Piano 2°"); assert.equal(e("piano", { min: 0, max: 0 }), "Piano terra"); assert.equal(e("piano", { min: 2 }), "Dal piano 2°"); assert.equal(e("piano", { max: 3 }), "Fino al piano 3°"); assert.equal(e("piano", { min: -1, max: 1 }), "Piano da seminterrato a 1°");
  assert.equal(e("contratto", { tipi: ["libero_4_4", "concordato_3_2"] }), "Contratto 4+4 libero o 3+2 concordato"); assert.equal(e("riscaldamento", { tipi: ["pompa_di_calore"] }), "Riscaldamento pompa di calore"); assert.equal(cr.etichettaCriterio(crit("animaliAmmessi")), "Animali ammessi"); assert.equal(cr.etichettaCriterio(crit("sconosciuta")), "sconosciuta");
});

// ============================================================ luoghi
const L = (id, livello, nome, parent_id = null, sigla = null) => ({ id, livello, nome, sigla, parent_id });
const LUOGHI = [L("pMI", "provincia", "Milano", null, "MI"), L("pBG", "provincia", "Bergamo", null, "BG"), L("cMI", "comune", "Milano", "pMI"), L("cBG", "comune", "Bergamo", "pBG"),
  L("qIsola", "quartiere", "Isola", "cMI"), L("qNavigli", "quartiere", "Navigli", "cMI"), L("qCittaStudi", "quartiere", "Città Studi", "cMI"), L("qLoretoMI", "quartiere", "Loreto", "cMI"), L("qLoretoBG", "quartiere", "Loreto", "cBG"), L("qAlta", "quartiere", "Città Alta", "cBG"), L("qBassa", "quartiere", "Città Bassa", "cBG"), L("qNoLo", "quartiere", "NoLo", "cMI")];
const M = lg.mappaLuoghi(LUOGHI);
const trova = (q, o) => lg.cercaLuoghi(q, LUOGHI, o).map((x) => x.luogo.id);

test("luoghi: antenati dal più piccolo al più grande, e dati rotti (giri, genitori che mancano) non bloccano niente", () => {
  assert.deepEqual(lg.antenati("qIsola", M), ["qIsola", "cMI", "pMI"]); assert.deepEqual(lg.antenati("cBG", M), ["cBG", "pBG"]); assert.deepEqual(lg.antenati("pMI", M), ["pMI"]); for (const x of [null, undefined, "boh", ""]) assert.deepEqual(lg.antenati(x, M), []);
  const giro = lg.mappaLuoghi([L("a", "comune", "A", "b"), L("b", "comune", "B", "a")]); assert.deepEqual(lg.antenati("a", giro), ["a", "b"]); const orfano = lg.mappaLuoghi([L("x", "quartiere", "X", "assente")]); assert.deepEqual(lg.antenati("x", orfano), ["x"]);
});

test("luoghi: etichette e percorsi", () => {
  assert.equal(lg.etichettaLuogo(M.get("qIsola"), M), "Isola, Milano"); assert.equal(lg.etichettaLuogo(M.get("cMI"), M), "Milano"); assert.equal(lg.etichettaLuogo(M.get("pBG"), M), "Provincia di Bergamo"); assert.equal(lg.etichettaLuogo(M.get("qLoretoBG"), M), "Loreto, Bergamo"); assert.equal(lg.etichettaLuogo(L("o", "quartiere", "Solo", "assente"), M), "Solo");
  assert.equal(lg.percorsoLuogo(M.get("qIsola"), M), "Isola · Milano · MI"); assert.equal(lg.percorsoLuogo(M.get("pBG"), M), "BG");
});

test("luoghi: normalizza toglie accenti, maiuscole e segni (anche con apostrofi e trattini)", () => {
  assert.equal(lg.normalizza("  Città   STUDI "), "citta studi"); assert.equal(lg.normalizza("Sant'Ambrogio-Brera"), "sant ambrogio brera"); assert.equal(lg.normalizza("Più"), "piu"); for (const x of [null, undefined, 5, {}, []]) assert.equal(lg.normalizza(x), "");
});

test("completamento: si trova scrivendo l'inizio, senza accenti, e con più parole; prima i nomi che cominciano come scritto", () => {
  assert.deepEqual(trova("iso"), ["qIsola"]); assert.deepEqual(trova("citta"), ["qAlta", "qBassa", "qCittaStudi"].sort((a, b) => a.localeCompare(b)).length ? trova("citta") : []); assert.ok(trova("città a").includes("qAlta") && !trova("città a").includes("qBassa"), "«città a» trova solo Città Alta");
  assert.deepEqual(trova("CITTA STUDI"), ["qCittaStudi"]); assert.deepEqual(trova("isola mil"), ["qIsola"], "il nome del quartiere e l'inizio della città"); assert.deepEqual(trova("isola bergamo"), [], "il quartiere non sta a Bergamo"); assert.deepEqual(trova("nolo"), ["qNoLo"]);
});

test("completamento: scrivendo il nome di una città si trova la città prima dei suoi quartieri e della provincia; la sigla trova la provincia", () => {
  assert.equal(trova("milano")[0], "cMI"); assert.deepEqual(trova("bergamo").slice(0, 2), ["cBG", "pBG"]); assert.ok(trova("bergamo").includes("qAlta"), "i quartieri di Bergamo compaiono dopo"); assert.deepEqual(trova("bg").slice(0, 1), ["pBG"], "la sigla"); assert.ok(trova("mi").includes("pMI"));
});

test("completamento: lo stesso nome in due città dà due suggerimenti distinti, con il percorso per distinguerli", () => {
  const r = lg.cercaLuoghi("loreto", LUOGHI); assert.equal(r.length, 2); assert.deepEqual(r.map((x) => x.etichetta).sort(), ["Loreto, Bergamo", "Loreto, Milano"]); assert.deepEqual(r.map((x) => x.percorso).sort(), ["Loreto · Bergamo · BG", "Loreto · Milano · MI"]); assert.deepEqual(trova("loreto milano"), ["qLoretoMI"]);
});

test("completamento: esclude quelli già scelti, rispetta il massimo, e con testo vuoto o strano non dà errori", () => {
  assert.deepEqual(trova("loreto", { esclusi: ["qLoretoMI"] }), ["qLoretoBG"]); assert.equal(trova("citta").length, 3, "tre quartieri cominciano con «città»"); assert.equal(trova("citta", { max: 2 }).length, 2); assert.equal(lg.cercaLuoghi("a", LUOGHI, { max: 1000 }).length <= 20, true, "mai più di 20");
  for (const x of ["", "   ", null, undefined, 5, {}, "%%%", "'; drop table", "a".repeat(5000), "\u0000", "💥"]) assert.doesNotThrow(() => lg.cercaLuoghi(x, LUOGHI), String(x).slice(0, 12)); assert.deepEqual(lg.cercaLuoghi("", LUOGHI), []); assert.deepEqual(lg.cercaLuoghi("iso", null), []); assert.deepEqual(lg.cercaLuoghi("iso", undefined), []);
});

test("completamento: 2000 testi casuali non danno mai errori né più di 8 suggerimenti, e ogni suggerimento contiene davvero ciò che si è scritto", () => {
  let seme = 31; const rnd = () => (seme = (seme * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const alfabeto = "abcdefghilmnopqrstuvz àèéìòù'-. 12";
  for (let i = 0; i < 2000; i++) {
    const t = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => alfabeto[Math.floor(rnd() * alfabeto.length)]).join(""); const r = lg.cercaLuoghi(t, LUOGHI); assert.ok(r.length <= 8);
    for (const x of r) { const tutto = lg.normalizza(`${x.luogo.nome} ${x.percorso} ${x.etichetta}`); for (const parola of lg.normalizza(t).split(" ").filter(Boolean)) assert.ok(tutto.split(" ").some((w) => w.startsWith(parola)), `«${t}» -> ${x.etichetta}`); }
  }
});

test("scelte: scegliere una città toglie i suoi quartieri già scelti; i doppioni, gli sconosciuti e l'eccesso si tolgono", () => {
  assert.deepEqual(lg.semplificaScelte(["qIsola", "cMI", "qAlta"], M).sort(), ["cMI", "qAlta"]); assert.deepEqual(lg.semplificaScelte(["qIsola", "pMI"], M), ["pMI"]); assert.deepEqual(lg.semplificaScelte(["qIsola", "qIsola", "boh"], M), ["qIsola"]); assert.deepEqual(lg.semplificaScelte(["cMI", "cBG"], M).sort(), ["cBG", "cMI"]);
  assert.deepEqual(lg.semplificaScelte(null, M), []); assert.deepEqual(lg.semplificaScelte([], M), []);
  const molti = Array.from({ length: 30 }, (_, i) => L("x" + i, "provincia", "P" + i, null, "XX")); assert.equal(lg.semplificaScelte(molti.map((m) => m.id), lg.mappaLuoghi(molti)).length, 20);
});

// ============================================================ coerenza con la migrazione e il resto dell'app
test("migrazione: le liste di opzioni dell'app sono quelle del database (tipologie, contratti, riscaldamenti, classi, caratteristiche sì/no)", () => {
  const lista = (re) => [...sql.match(re)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(co.TIPOLOGIE.map((t) => t.id), lista(/listings_tipologia_check check \(tipologia in \(([^)]*)\)/)); assert.deepEqual(co.TIPI_CONTRATTO.map((t) => t.id), lista(/listings_tipo_contratto_check check \(tipo_contratto is null or tipo_contratto in \(([^)]*)\)/));
  assert.deepEqual(co.RISCALDAMENTI.map((t) => t.id), lista(/listings_riscaldamento_check check \(riscaldamento is null or riscaldamento in \(([^)]*)\)/)); assert.deepEqual(en.CLASSI_ENERGETICHE.slice(), lista(/v_classi constant text\[\] := array\[([^\]]*)\]/));
  assert.deepEqual(co.ATTR_VOCAB.map((a) => a.key).sort(), lista(/v_booleani constant text\[\] := array\[([^\]]*)\]/).sort(), "le caratteristiche sì/no dell'app e del database sono diverse"); assert.deepEqual(co.RISCALDAMENTI.map((t) => t.id), lista(/v_riscaldamenti constant text\[\] := array\[([^\]]*)\]/)); assert.deepEqual(co.TIPI_CONTRATTO.map((t) => t.id), lista(/v_contratti constant text\[\] := array\[([^\]]*)\]/));
  assert.equal(co.TIPOLOGIE.find((t) => t.id === "posto_letto").disponibile, false); assert.match(sql, /if v_tipologia = 'posto_letto' then\s+raise exception 'TIPOLOGIA_NON_DISPONIBILE'/);
});

test("migrazione: i limiti dell'app sono quelli del database (bagni 1-6, piano -2..60, 20 luoghi, 40 criteri, budget, locali, metratura)", () => {
  assert.equal(cr.LIMITI_CRITERI.bagni.min, 1); assert.equal(cr.LIMITI_CRITERI.bagni.max, 6); assert.match(sql, /ricerca_intero\(v_valore, 'min', 1, 6\)/); assert.equal(cr.LIMITI_CRITERI.piano.min, -2); assert.equal(cr.LIMITI_CRITERI.piano.max, 60); assert.match(sql, /ricerca_intero\(v_valore, 'min', -2, 60\)/);
  assert.equal(lg.MAX_LUOGHI_SCELTI, 20); assert.match(sql, /jsonb_array_length\(p_ricerca -> 'luoghi'\) > 20/); assert.equal(cr.LIMITI_CRITERI.maxCriteri, 40); assert.match(sql, /jsonb_array_length\(v_criteri\) > 40/);
  assert.match(sql, /'budget_min', 0, 20000/); assert.match(sql, /'budget_max', 1, 20000/); assert.match(sql, /'locali_min', 1, 10/); assert.match(sql, /'mq_min', 10, 1000/); assert.match(sql, /bagni between 1 and 10/); assert.match(sql, /piano between -2 and 60/);
});

test("migrazione: ogni codice di errore ha una frase sua, e nessuno prende la frase di un altro", () => {
  const G = vf.messaggioErroreVerifica("qualcosa di sconosciuto"); const codici = [...new Set([...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]))];
  for (const c of ["RICERCA_NON_VALIDA", "TIPOLOGIA_NON_DISPONIBILE", "INTERVALLO_NON_VALIDO", "LUOGO_NON_VALIDO", "TROPPI_LUOGHI", "CRITERIO_NON_VALIDO", "TROPPI_CRITERI", "NON_SEI_UN_INQUILINO"]) assert.ok(codici.includes(c), c);
  const frasi = new Set(); for (const c of codici) { const f = vf.messaggioErroreVerifica(`ERROR: ${c} (P0001)`); assert.notEqual(f, G, `${c} non ha un messaggio`); assert.ok(!f.includes(c)); frasi.add(f); }
  assert.match(vf.messaggioErroreVerifica("TROPPI_LUOGHI"), /20 luoghi/); assert.match(vf.messaggioErroreVerifica("TIPOLOGIA_NON_DISPONIBILE"), /appartamenti e ville/); assert.ok(frasi.size >= codici.length - 1, "troppe frasi uguali");
});

test("migrazione: i luoghi si leggono ma non si scrivono; le funzioni interne non si chiamano; la ricerca si salva solo come sé stessi", () => {
  assert.match(sql, /alter table luoghi enable row level security;/); assert.match(sql, /revoke all on luoghi from anon, authenticated;\s+grant select on luoghi to authenticated;/); assert.ok(!/create policy "luoghi: [^"]*" on luoghi for (insert|update|delete|all)/.test(sql), "una regola di scrittura sui luoghi");
  assert.match(sql, /revoke all on function public\.ricerca_intero\(jsonb, text, integer, integer\) from public, anon, authenticated;/); assert.match(sql, /revoke all on function public\.listings_imposta_luogo\(\) from public, anon, authenticated;/); assert.match(sql, /revoke all on function public\.salva_ricerca_inquilino\(jsonb\) from public, anon;\s+grant execute on function public\.salva_ricerca_inquilino\(jsonb\) to authenticated;/);
  const f = sql.slice(sql.indexOf("create or replace function public.salva_ricerca_inquilino"), sql.indexOf("-- Permessi")); assert.ok(!/\bexecute\b/i.test(f.replace(/grant execute/gi, "")), "SQL dinamico nella funzione"); assert.match(f, /v_uid uuid := auth\.uid\(\)/); assert.ok(!/where [a-z_]*(tenant_id|profile_id) = [^v]/.test(f.replace(/where profile_id = v_uid/g, "").replace(/where tenant_id = v_uid/g, "")), "una scrittura non legata all'utente che chiama");
});

test("migrazione: i dati di prima non si toccano (nessuna cancellazione di righe esistenti, nessuna colonna tolta)", () => {
  const pulito = sql.replace(/--[^\n]*/g, ""); assert.ok(!/drop (table|column)/i.test(pulito), "la migrazione cancella tabelle o colonne"); assert.ok(!/truncate/i.test(pulito)); const cancella = [...pulito.matchAll(/delete from (\w+)/gi)].map((m) => m[1]); assert.deepEqual([...new Set(cancella)].sort(), ["tenant_interessi", "tenant_zone_interesse"], "cancella solo dentro la funzione che riscrive la ricerca");
  assert.match(pulito, /update listings l\s+set luogo_id = q\.id/); assert.ok(!/update listings[^;]*set[^;]*(zona|prezzo|verifica_stato)/i.test(pulito.replace(/update listings l\s+set luogo_id/g, "")), "la migrazione aggiorna altre colonne degli annunci");
});
