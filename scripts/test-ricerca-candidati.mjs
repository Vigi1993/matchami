/**
 * Test della ricerca e dei filtri nel Database inquilini
 * (src/lib/ricerca-candidati.ts). Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const r = caricaTs(path.join(radice, "src", "lib", "ricerca-candidati.ts"));
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8");

let n = 0;
/** Una candidatura con i soli campi che la ricerca guarda. */
const cand = (o = {}) => ({
  id: "c" + ++n, status: "in_attesa", listing_id: "L1", tenant_id: "t" + n,
  listings: { titolo: "Bilocale Isola", zona: "Isola, Milano", prezzo: 1500 },
  tenant_profiles: { professione: "Infermiera", verificato: false },
  nome: "Olga", cognome: "Bianchi",
  valutazione: { match: { bloccato: false, punteggio: 80 }, affidabilita: 70 },
  ...o,
});
const stato = (c) => c.status;
const f = (o = {}) => ({ ...r.FILTRI_VUOTI, ...o });
const trova = (elenco, filtri, st = stato) => r.filtraCandidature(elenco, filtri, st).map((c) => c.nome + " " + c.cognome);

// ------------------------------------------------------------
// Normalizzare ciò che si cerca
// ------------------------------------------------------------

test("normalizza: minuscole, accenti tolti, spazi ridotti", () => {
  assert.equal(r.normalizzaRicerca("  ÀLESSIA   D'Àmico \n"), "alessia d'amico");
  assert.equal(r.normalizzaRicerca("Città"), "citta");
  assert.equal(r.normalizzaRicerca("D’Amico"), "d'amico", "l'apostrofo tipografico vale quello normale");
});

test("normalizza: un valore che non è testo vale testo vuoto, mai un errore", () => {
  for (const x of [null, undefined, 42, {}, [], NaN, true]) assert.equal(r.normalizzaRicerca(x), "", String(x));
});

test("normalizza: si accorcia, e un testo enorme non rallenta niente", () => {
  assert.equal(r.normalizzaRicerca("a".repeat(500)).length, r.LUNGHEZZA_MASSIMA_RICERCA);
  const inizio = Date.now();
  r.normalizzaRicerca("àb ".repeat(1_000_000));
  assert.ok(Date.now() - inizio < 200, `troppo lento: ${Date.now() - inizio} ms`);
});

test("parole: separate da spazi, vuote se non c'è niente", () => {
  assert.deepEqual(r.paroleRicerca("  Olga   Bianchi "), ["olga", "bianchi"]);
  assert.deepEqual(r.paroleRicerca(""), []);
  assert.deepEqual(r.paroleRicerca("   "), []);
  assert.deepEqual(r.paroleRicerca(null), []);
});

// ------------------------------------------------------------
// La ricerca di testo
// ------------------------------------------------------------

const ELENCO = [
  cand({ nome: "Olga", cognome: "Bianchi" }),
  cand({ nome: "Teo", cognome: "Rossini", tenant_profiles: { professione: "Ingegnere", verificato: true } }),
  cand({ nome: "Àlessia", cognome: "D'Amico", listing_id: "L2", listings: { titolo: "Studio Navigli", zona: "Navigli, Milano", prezzo: 900 } }),
  cand({ nome: "Ugo", cognome: "Verdi", tenant_profiles: null }),
];

test("testo: per nome, per cognome, o per entrambi in qualunque ordine", () => {
  assert.deepEqual(trova(ELENCO, f({ testo: "olga" })), ["Olga Bianchi"]);
  assert.deepEqual(trova(ELENCO, f({ testo: "BIANCHI" })), ["Olga Bianchi"]);
  assert.deepEqual(trova(ELENCO, f({ testo: "olga bianchi" })), ["Olga Bianchi"]);
  assert.deepEqual(trova(ELENCO, f({ testo: "bianchi olga" })), ["Olga Bianchi"]);
});

test("testo: una parte di parola basta, e non conta l'accento", () => {
  assert.deepEqual(trova(ELENCO, f({ testo: "ross" })), ["Teo Rossini"]);
  assert.deepEqual(trova(ELENCO, f({ testo: "alessia" })), ["Àlessia D'Amico"]);
  assert.deepEqual(trova(ELENCO, f({ testo: "ÀLESSIA" })), ["Àlessia D'Amico"]);
  assert.deepEqual(trova(ELENCO, f({ testo: "d'amico" })), ["Àlessia D'Amico"]);
});

test("testo: cerca anche nel lavoro, nel titolo e nella zona dell'annuncio", () => {
  assert.deepEqual(trova(ELENCO, f({ testo: "ingegnere" })), ["Teo Rossini"]);
  assert.deepEqual(trova(ELENCO, f({ testo: "navigli" })), ["Àlessia D'Amico"]);
  assert.deepEqual(trova(ELENCO, f({ testo: "studio" })), ["Àlessia D'Amico"]);
  assert.equal(trova(ELENCO, f({ testo: "isola" })).length, 3);
});

test("testo: tutte le parole devono comparire (non basta una)", () => {
  assert.deepEqual(trova(ELENCO, f({ testo: "olga ingegnere" })), []);
  assert.deepEqual(trova(ELENCO, f({ testo: "teo ingegnere isola" })), ["Teo Rossini"]);
});

test("testo: niente che corrisponda, vuoto, solo spazi", () => {
  assert.deepEqual(trova(ELENCO, f({ testo: "zzzz" })), []);
  assert.equal(trova(ELENCO, f({ testo: "" })).length, 4);
  assert.equal(trova(ELENCO, f({ testo: "    " })).length, 4);
});

test("testo: un profilo mascherato dopo un rifiuto (nessun lavoro) si trova ancora per nome, non per lavoro", () => {
  assert.deepEqual(trova(ELENCO, f({ testo: "ugo" })), ["Ugo Verdi"]);
  assert.deepEqual(trova(ELENCO, f({ testo: "infermiera" })).includes("Ugo Verdi"), false);
});

test("testo: dati mancanti o strani non rompono niente", () => {
  const strane = [cand({ nome: null, cognome: null }), cand({ listings: null }), cand({ tenant_profiles: null, valutazione: undefined })];
  assert.doesNotThrow(() => r.filtraCandidature(strane, f({ testo: "olga" }), stato));
  assert.equal(r.filtraCandidature(strane, f(), stato).length, 3);
});

test("testo: un titolo o un nome con codice dentro si cerca come testo", () => {
  const x = cand({ nome: '<img src=x onerror="alert(1)">' });
  assert.equal(r.filtraCandidature([x], f({ testo: "<img" }), stato).length, 1);
});

// ------------------------------------------------------------
// I filtri, uno alla volta
// ------------------------------------------------------------

test("stato: da valutare, già valutate, tutte", () => {
  const e = [cand({ nome: "A", status: "in_attesa" }), cand({ nome: "B", status: "accettata" }), cand({ nome: "C", status: "rifiutata" })];
  assert.deepEqual(trova(e, f({ stato: "da_valutare" })), ["A Bianchi"]);
  assert.deepEqual(trova(e, f({ stato: "valutate" })), ["B Bianchi", "C Bianchi"]);
  assert.equal(trova(e, f({ stato: "tutte" })).length, 3);
});

test("stato: conta quello EFFETTIVO, anche se la decisione non è ancora stata ricaricata dal server", () => {
  const e = [cand({ nome: "A", status: "in_attesa" }), cand({ nome: "B", status: "in_attesa" })];
  const effettivo = (c) => (c.nome === "A" ? "accettata" : c.status); // A appena accettata
  assert.deepEqual(trova(e, f({ stato: "da_valutare" }), effettivo), ["B Bianchi"]);
  assert.deepEqual(trova(e, f({ stato: "valutate" }), effettivo), ["A Bianchi"]);
});

test("reddito verificato: solo chi lo è; senza profilo non lo è", () => {
  assert.deepEqual(trova(ELENCO, f({ soloVerificati: true })), ["Teo Rossini"]);
  assert.equal(r.filtraCandidature([cand({ tenant_profiles: { verificato: "true" } })], f({ soloVerificati: true }), stato).length, 0, "solo il vero valore vero");
});

test("senza blocchi: toglie chi non soddisfa un criterio obbligatorio, tiene chi non ha una valutazione", () => {
  const e = [
    cand({ nome: "Libero", valutazione: { match: { bloccato: false, punteggio: 60 }, affidabilita: 50 } }),
    cand({ nome: "Bloccato", valutazione: { match: { bloccato: true, punteggio: 90 }, affidabilita: 50 } }),
    cand({ nome: "Senza", valutazione: undefined }),
  ];
  assert.deepEqual(trova(e, f({ senzaBlocchi: true })), ["Libero Bianchi", "Senza Bianchi"]);
});

test("compatibilità minima: la soglia esatta passa, un punto sotto no", () => {
  const e = [69, 70, 71, 100, 0].map((p) => cand({ nome: String(p), valutazione: { match: { bloccato: false, punteggio: p }, affidabilita: 50 } }));
  assert.deepEqual(trova(e, f({ minimo: 70 })).map((x) => x.split(" ")[0]), ["70", "71", "100"]);
  assert.deepEqual(trova(e, f({ minimo: 50 })).map((x) => x.split(" ")[0]), ["69", "70", "71", "100"]);
  assert.equal(trova(e, f({ minimo: 0 })).length, 5, "senza soglia passano tutti, anche lo zero");
});

test("compatibilità minima: chi non ha una percentuale non la raggiunge, ma senza soglia resta", () => {
  const e = [cand({ nome: "Nulla", valutazione: { match: { bloccato: false, punteggio: null }, affidabilita: 50 } }), cand({ nome: "Nessuna", valutazione: undefined })];
  assert.deepEqual(trova(e, f({ minimo: 50 })), []);
  assert.equal(trova(e, f({ minimo: 0 })).length, 2);
});

test("annuncio: solo i candidati di quell'annuncio", () => {
  assert.deepEqual(trova(ELENCO, f({ annuncioId: "L2" })), ["Àlessia D'Amico"]);
  assert.equal(trova(ELENCO, f({ annuncioId: "L1" })).length, 3);
  assert.deepEqual(trova(ELENCO, f({ annuncioId: "inesistente" })), []);
});

// ------------------------------------------------------------
// Insieme
// ------------------------------------------------------------

test("i filtri si sommano: devono valere tutti", () => {
  assert.deepEqual(trova(ELENCO, f({ soloVerificati: true, stato: "da_valutare", annuncioId: "L1", minimo: 70, testo: "teo" })), ["Teo Rossini"]);
  assert.deepEqual(trova(ELENCO, f({ soloVerificati: true, testo: "olga" })), []);
});

test("senza filtri passano tutte, nello stesso ordine e con gli stessi oggetti", () => {
  const risultato = r.filtraCandidature(ELENCO, r.FILTRI_VUOTI, stato);
  assert.equal(risultato.length, ELENCO.length);
  risultato.forEach((c, i) => assert.equal(c, ELENCO[i]));
});

test("filtrare non modifica l'elenco di partenza e mantiene l'ordine di arrivo", () => {
  const copia = JSON.parse(JSON.stringify(ELENCO));
  const e = r.filtraCandidature(ELENCO, f({ annuncioId: "L1" }), stato);
  assert.deepEqual(ELENCO, copia);
  assert.deepEqual(e.map((c) => c.nome), ["Olga", "Teo", "Ugo"]);
});

test("i filtri vuoti non si possono alterare per sbaglio da una schermata", () => {
  assert.ok(Object.isFrozen(r.FILTRI_VUOTI), "FILTRI_VUOTI dovrebbe essere congelato");
});

test("quattromila candidature si filtrano in un battito", () => {
  const tante = Array.from({ length: 4000 }, (_, i) => cand({ nome: "Nome" + i, cognome: "Cognome" + (i % 50) }));
  const inizio = Date.now();
  r.filtraCandidature(tante, f({ testo: "cognome7 nome12", soloVerificati: false, minimo: 50, senzaBlocchi: true }), stato);
  assert.ok(Date.now() - inizio < 300, `troppo lento: ${Date.now() - inizio} ms`);
});

// ------------------------------------------------------------
// Conteggi, opzioni, testi
// ------------------------------------------------------------

test("filtri attivi: ognuno conta uno, una ricerca di soli spazi no", () => {
  assert.equal(r.numeroFiltriAttivi(r.FILTRI_VUOTI), 0);
  assert.equal(r.numeroFiltriAttivi(f({ testo: "   " })), 0);
  assert.equal(r.numeroFiltriAttivi(f({ testo: "olga" })), 1);
  assert.equal(r.numeroFiltriAttivi(f({ stato: "valutate", soloVerificati: true, senzaBlocchi: true, minimo: 50, annuncioId: "L1", testo: "x" })), 6);
});

test("percentuali: si offre il filtro solo se almeno un candidato ne ha una", () => {
  assert.equal(r.haPunteggi([cand({ valutazione: { match: { bloccato: false, punteggio: null }, affidabilita: 1 } }), cand({ valutazione: undefined })]), false);
  assert.equal(r.haPunteggi([cand({ valutazione: { match: { bloccato: false, punteggio: null }, affidabilita: 1 } }), cand()]), true);
  assert.equal(r.haPunteggi([]), false);
  assert.equal(r.haPunteggi([cand({ valutazione: { match: { bloccato: false, punteggio: 0 }, affidabilita: 1 } })]), true, "lo zero è una percentuale");
});

test("annunci: senza doppioni, in ordine alfabetico, con un nome anche se manca", () => {
  const e = [cand({ listing_id: "B", listings: { titolo: "Zeta" } }), cand({ listing_id: "A", listings: { titolo: "Èra" } }), cand({ listing_id: "B", listings: { titolo: "Zeta" } }), cand({ listing_id: "C", listings: null })];
  assert.deepEqual(r.opzioniAnnunci(e), [{ id: "C", titolo: "Annuncio" }, { id: "A", titolo: "Èra" }, { id: "B", titolo: "Zeta" }].sort((a, b) => a.titolo.localeCompare(b.titolo, "it")));
  assert.equal(r.opzioniAnnunci([]).length, 0);
});

test("filtri non più validi: un annuncio sparito, una soglia senza percentuali", () => {
  const e = [cand({ listing_id: "L1" }), cand({ listing_id: "L2" })];
  assert.equal(r.filtriValidi(f({ annuncioId: "L9" }), e).annuncioId, null, "annuncio che non c'è più");
  assert.equal(r.filtriValidi(f({ annuncioId: "L2" }), e).annuncioId, "L2", "annuncio che c'è");
  const senza = [cand({ valutazione: { match: { bloccato: false, punteggio: null }, affidabilita: 1 } })];
  assert.equal(r.filtriValidi(f({ minimo: 70 }), senza).minimo, 0, "nessuno ha più una percentuale");
  assert.equal(r.filtriValidi(f({ minimo: 70 }), e).minimo, 70, "ce ne sono");
  // il resto dei filtri non cambia
  const x = r.filtriValidi(f({ testo: "olga", stato: "valutate", soloVerificati: true, senzaBlocchi: true }), e);
  assert.deepEqual([x.testo, x.stato, x.soloVerificati, x.senzaBlocchi], ["olga", "valutate", true, true]);
  // e non altera l'oggetto di partenza
  const orig = f({ annuncioId: "L9", minimo: 50 }); r.filtriValidi(orig, senza); assert.equal(orig.annuncioId, "L9"); assert.equal(orig.minimo, 50);
});

test("filtri non più validi: così l'elenco non resta vuoto per un filtro dimenticato", () => {
  const e = [cand({ listing_id: "L1", nome: "Olga" })];
  const dimenticato = f({ annuncioId: "L9" });
  assert.equal(r.filtraCandidature(e, dimenticato, stato).length, 0, "senza la pulizia sparirebbe tutto");
  assert.equal(r.filtraCandidature(e, r.filtriValidi(dimenticato, e), stato).length, 1, "con la pulizia no");
});

test("riepilogo: nessuna, una, più", () => {
  assert.equal(r.riepilogoRicerca(0, 12), "Nessuna candidatura su 12");
  assert.equal(r.riepilogoRicerca(1, 12), "1 candidatura su 12");
  assert.equal(r.riepilogoRicerca(3, 12), "3 candidature su 12");
});

test("testi: etichette dei filtri e della soglia", () => {
  assert.deepEqual(Object.keys(r.ETICHETTE_STATO), ["tutte", "da_valutare", "valutate"]);
  assert.equal(r.etichettaMinimo(0), "Qualsiasi compatibilità");
  assert.equal(r.etichettaMinimo(70), "Almeno 70%");
  assert.deepEqual([...r.SOGLIE_COMPATIBILITA], [0, 50, 70]);
  const tutto = [r.TESTO_NESSUN_RISULTATO, ...Object.values(r.ETICHETTE_STATO), r.etichettaMinimo(50), r.riepilogoRicerca(1, 2)].join(" ");
  assert.ok(!/\b(lui|lei)\b/i.test(tutto), tutto);
});

// ------------------------------------------------------------
// Coerenza e principi
// ------------------------------------------------------------

test("le soglie sono quelle con cui la schermata colora le percentuali (70 e 50)", () => {
  const schermata = leggi("src", "app", "(app)", "database", "DatabaseClient.tsx");
  assert.match(schermata, /pct >= 70/);
  assert.match(schermata, /pct >= 50/);
  assert.deepEqual([...r.SOGLIE_COMPATIBILITA].filter((x) => x > 0), [50, 70]);
});

/** Il codice senza i commenti: le guardie guardano ciò che fa, non ciò che dice. */
const codice = () => leggi("src", "lib", "ricerca-candidati.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

test("principio: nessun filtro né ricerca su caratteristiche personali (nucleo, figli, animali, età, origine, genere)", () => {
  const c = codice();
  for (const vietato of [/\bfigli\b/i, /\bnucleo\b/i, /\banimali\b/i, /nazional/i, /\betà\b|\beta\b/i, /\breligi/i, /\bgenere\b|\bsesso\b/i, /\bcittadinan/i]) {
    assert.ok(!vietato.test(c), `la ricerca usa ${vietato}`);
  }
  // e i campi su cui cerca sono solo questi
  assert.match(c, /\[c\.nome, c\.cognome, c\.tenant_profiles\?\.professione, c\.listings\?\.titolo, c\.listings\?\.zona\]/);
});

test("privacy: la ricerca non ha accesso alla rete, e ciò che si cerca non si salva", () => {
  const c = codice();
  for (const vietato of [/\bimport\s+(?!type)/, /\bfetch\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/, /supabase/i, /console\./]) {
    assert.ok(!vietato.test(c), `la ricerca usa ${vietato}`);
  }
});

test("principio: i controlli sanno fermare un filtro per nucleo o una chiamata alla rete", () => {
  assert.ok(/\bnucleo\b/i.test("if (c.tenant_profiles?.nucleo === 'coppia') return false;"));
  assert.ok(/\bfetch\(/.test('fetch("/api/ricerche", { body: f.testo })'));
});
