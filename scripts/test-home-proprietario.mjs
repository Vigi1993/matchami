/**
 * Test della Home del proprietario: la casa in grande, le tessere «Possibili inquilini» e «Candidature», dove porta ogni
 * parte, il conteggio ANONIMO dei possibili inquilini, e le regole di leggibilità per chi non è pratico. Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { caricaTs, radice } from "./carica-ts.mjs";

const richiedi = createRequire(import.meta.url);
const React = richiedi("react");
const { renderToStaticMarkup } = richiedi("react-dom/server");
const mp = caricaTs(path.join(radice, "src", "lib", "match", "possibili.ts"));
const mz = caricaTs(path.join(radice, "src", "lib", "match", "mazzo.ts"));
const lu = caricaTs(path.join(radice, "src", "lib", "luoghi.ts"));
const hm = caricaTs(path.join(radice, "src", "lib", "proprietario", "home.ts"));
const comp = caricaTs(path.join(radice, "src", "app", "(app)", "OwnerHomeClient.tsx"));
const inf = caricaTs(path.join(radice, "src", "content", "informativa.ts"));
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
/** I numeri a quattro cifre si scrivono con o senza punto secondo la versione di ICU («1250» o «1.250»): non è la nostra regola, quindi si confronta senza punto. */
const senzaPunti = (t) => t.replace(/(?<=\d)\.(?=\d{3}\b)/g, "");
const testoDi = (h) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// ============================================================ il conteggio dei possibili inquilini
const LUOGHI = [
  { id: "pMI", livello: "provincia", nome: "Milano", sigla: "MI", parent_id: null },
  { id: "cMI", livello: "comune", nome: "Milano", sigla: null, parent_id: "pMI" },
  { id: "qIsola", livello: "quartiere", nome: "Isola", sigla: null, parent_id: "cMI" },
  { id: "qNavigli", livello: "quartiere", nome: "Navigli", sigla: null, parent_id: "cMI" },
];
const mappa = lu.mappaLuoghi(LUOGHI);
const casa = (o = {}) => mp.annuncioDaRiga({ id: "a1", prezzo: 1250, zona: "Isola, Milano", locali: 2, mq: 55, attributi: { balcone: true }, luogo_id: "qIsola", tipologia: "appartamento", ...o }, mappa);
const ric = (id, riga = {}, zone = [], interessi = []) => ({ tenantId: id, riga: { budget_max: null, locali_min: null, mq_min: null, ...riga }, zone, interessi });
const conta = (annunci, ricerche, giaCandidati = new Map()) => mp.contaPossibiliInquilini({ annunci, ricerche, giaCandidati });
const uno = (ricerche, annuncio = casa(), giaCandidati = new Map()) => conta([annuncio], ricerche, giaCandidati).get("a1");

test("conteggio: conta chi ha una ricerca che la casa rispetta (budget, locali, metri quadri); non chi la sfora, anche di poco", () => {
  const r = [ric("t1", { budget_max: 1500 }), ric("t2", { budget_max: 1000 }), ric("t3", { budget_max: 1200 }), ric("t4", { budget_max: 1250, locali_min: 2, mq_min: 50 }), ric("t5", { budget_max: 1500, locali_min: 3 }), ric("t6", { budget_max: 1500, mq_min: 80 })];
  assert.equal(uno(r), 2, "t1 (budget 1500) e t4 (esatto) combaciano; t2 e t3 sforano, t5 vuole 3 locali, t6 80 metri");
});

test("conteggio: chi non ha impostato NESSUN criterio non conta (con una ricerca vuota ogni casa avrebbe il punteggio pieno)", () => {
  assert.equal(uno([ric("t1"), ric("t2", { budget_max: 0, locali_min: 0, mq_min: 0 }), ric("t3", { budget_max: 1500 })]), 1);
});

test("conteggio: chi si è già candidato a QUELLA casa non è un possibile inquilino (è una candidatura); una candidatura a un'altra casa non lo toglie", () => {
  const r = [ric("t1", { budget_max: 1500 }), ric("t2", { budget_max: 1500 }), ric("t3", { budget_max: 1500 })];
  assert.equal(uno(r, casa(), new Map([["a1", new Set(["t1"])]])), 2); assert.equal(uno(r, casa(), new Map([["a1", new Set(["t1", "t2", "t3"])]])), 0); assert.equal(uno(r, casa(), new Map([["altra", new Set(["t1", "t2"])]])), 3, "candidati a un'altra casa non contano");
});

test("conteggio: la zona vale per quartiere, città e provincia (chi cerca «Milano» trova l'Isola); un'altra zona non combacia", () => {
  const isola = { zona: "Isola, Milano", luogo_id: "qIsola" }, navigli = { zona: "Navigli, Milano", luogo_id: "qNavigli" }, milano = { zona: "Milano", luogo_id: "cMI" }, prov = { zona: "Milano (MI)", luogo_id: "pMI" };
  assert.equal(uno([ric("a", { budget_max: 2000 }, [isola]), ric("b", { budget_max: 2000 }, [navigli]), ric("c", { budget_max: 2000 }, [milano]), ric("d", { budget_max: 2000 }, [prov]), ric("e", { budget_max: 2000 }, [navigli, isola])]), 4, "a, c, d ed e (che cerca anche l'Isola); non b");
});

test("conteggio: la tipologia è un filtro netto (chi cerca una villa non conta per un appartamento) e una caratteristica NECESSARIA che manca esclude", () => {
  assert.equal(uno([ric("v", { budget_max: 2000, tipologia: "villa" }), ric("a", { budget_max: 2000, tipologia: "appartamento" }), ric("s", { budget_max: 2000 })]), 2, "la villa no; l'appartamento e chi non specifica sì");
  const balcone = (necessaria) => ric("t", { budget_max: 2000 }, [], [{ attributo_key: "balcone", peso: 8, necessaria }]);
  assert.equal(uno([balcone(true)], casa({ attributi: { balcone: true } })), 1); assert.equal(uno([balcone(true)], casa({ attributi: { balcone: false } })), 0, "balcone necessario e la casa non ce l'ha"); assert.equal(uno([balcone(false)], casa({ attributi: { balcone: false } })), 1, "opzionale: la casa resta in linea");
});

test("conteggio: più case insieme, ognuna con il suo numero e con i suoi candidati; nessuna casa o nessuna ricerca = zeri, mai errori", () => {
  const r = [ric("t1", { budget_max: 1500 }), ric("t2", { budget_max: 900 }), ric("t3", { budget_max: 1500 })];
  const m = conta([casa({ id: "a1", prezzo: 1250 }), casa({ id: "a2", prezzo: 800 }), casa({ id: "a3", prezzo: 3000 })], r, new Map([["a2", new Set(["t1"])]]));
  assert.deepEqual([...m.entries()], [["a1", 2], ["a2", 2], ["a3", 0]], "a2: t1 candidato (escluso); t2 e t3 combaciano"); assert.equal(conta([], r).size, 0); assert.deepEqual([...conta([casa()], []).entries()], [["a1", 0]]);
});

test("conteggio: dati rotti si ignorano senza far crollare niente (ricerche nulle, senza identificativo, senza zone né interessi)", () => {
  const r = [null, undefined, 5, "x", {}, { tenantId: 7 }, { tenantId: "t", riga: { budget_max: 1500 } }, ric("ok", { budget_max: 1500 })];
  assert.equal(uno(r.map((x) => (x && typeof x === "object" && "tenantId" in x && typeof x.tenantId === "string" ? { zone: [], interessi: [], ...x } : x))), 2);
});

test("conteggio: non modifica ciò che riceve, non dipende dall'ordine, e il risultato è fatto SOLO di numeri interi (nessun identificativo esce)", () => {
  const r = [ric("t1", { budget_max: 1500 }), ric("t2", { budget_max: 1100 }), ric("t3", { locali_min: 2 }), ric("t4", { budget_max: 1300, mq_min: 40 })]; const copia = JSON.stringify(r); const a = casa();
  const m = conta([a], r); assert.equal(JSON.stringify(r), copia); assert.equal(m.get("a1"), uno([...r].reverse())); assert.equal(m.get("a1"), uno([r[2], r[0], r[3], r[1]]));
  for (const [chiave, valore] of m) { assert.equal(typeof chiave, "string"); assert.ok(Number.isInteger(valore) && valore >= 0); assert.ok(!JSON.stringify([...m]).includes("t1"), "un identificativo è uscito dal conteggio"); }
});

test("conteggio: coincide con il motore della Home dell'inquilino («in linea con la tua ricerca») su 600 ricerche casuali", () => {
  let seme = 21; const rnd = () => (seme = (seme * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const scegli = (a) => a[Math.floor(rnd() * a.length)];
  for (let i = 0; i < 600; i++) {
    const riga = { budget_max: scegli([null, 900, 1100, 1250, 1300, 1500, 2000]), locali_min: scegli([null, 1, 2, 3]), mq_min: scegli([null, 40, 55, 70]), tipologia: scegli([null, "appartamento", "villa"]) };
    const zone = scegli([[], [{ zona: "Isola, Milano", luogo_id: "qIsola" }], [{ zona: "Navigli, Milano", luogo_id: "qNavigli" }], [{ zona: "Milano", luogo_id: "cMI" }]]);
    const interessi = scegli([[], [{ attributo_key: "balcone", peso: 6, necessaria: true }], [{ attributo_key: "balcone", peso: 6, necessaria: false }]]);
    const annuncio = casa({ prezzo: scegli([800, 1250, 1400, 3000]), locali: scegli([1, 2, 3]), mq: scegli([35, 55, 90]), attributi: scegli([{ balcone: true }, { balcone: false }]) });
    const profilo = mz.profiloRicercaDaRighe({ ...riga }, zone, interessi); const atteso = mz.haCriteriDiRicerca(profilo) && mz.preparaMazzo([annuncio.annuncio], profilo).inRicerca === 1;
    assert.equal(uno([ric("t", riga, zone, interessi)], annuncio), atteso ? 1 : 0, JSON.stringify({ riga, zone, interessi, a: annuncio.annuncio }));
  }
});

test("conteggio: regge duemila inquilini e dieci case in tempi da pagina web", () => {
  const r = Array.from({ length: 2000 }, (_, i) => ric("t" + i, { budget_max: 800 + (i % 20) * 100, locali_min: 1 + (i % 3) }, [{ zona: "Milano", luogo_id: "cMI" }])); const a = Array.from({ length: 10 }, (_, i) => casa({ id: "a" + i, prezzo: 900 + i * 100 }));
  const t0 = Date.now(); const m = conta(a, r); assert.equal(m.size, 10); assert.ok(Date.now() - t0 < 4000, `troppo lento: ${Date.now() - t0} ms`);
});

test("annuncioDaRiga: porta con sé i luoghi che contengono la casa (quartiere, città, provincia), e i dati mancanti diventano «non so», non errori", () => {
  const a = casa(); assert.deepEqual(a.annuncio.antenati, ["qIsola", "cMI", "pMI"]); assert.equal(a.id, "a1"); assert.equal(a.annuncio.prezzo, 1250);
  const v = mp.annuncioDaRiga({ id: "x", prezzo: 900, zona: "Altrove" }, mappa); assert.deepEqual([v.annuncio.locali, v.annuncio.mq, v.annuncio.attributi, v.annuncio.bagni, v.annuncio.piano], [null, null, null, null, null]);
});

// ============================================================ le frasi
test("saluto: «Buongiorno» dalle 5 alle 12, «Buon pomeriggio» dalle 13 alle 17, «Buonasera» dalle 18 alle 4; un'ora strana non rompe niente", () => {
  const s = hm.salutoPerOra; assert.deepEqual([5, 9, 12].map(s), ["Buongiorno", "Buongiorno", "Buongiorno"]); assert.deepEqual([13, 15, 17].map(s), ["Buon pomeriggio", "Buon pomeriggio", "Buon pomeriggio"]); assert.deepEqual([18, 22, 23, 0, 3, 4].map(s), ["Buonasera", "Buonasera", "Buonasera", "Buonasera", "Buonasera", "Buonasera"]);
  for (const x of [NaN, Infinity, -1, 24, 25, 99.7, undefined, null, "9"]) assert.ok(["Buongiorno", "Buon pomeriggio", "Buonasera"].includes(s(x)), String(x)); assert.equal(s(24), "Buonasera"); assert.equal(s(-19), "Buongiorno");
});

test("saluto con nome: «Buongiorno, Mario»; spazi ripuliti; senza nome (vuoto, nullo, non testo) solo il saluto", () => {
  assert.equal(hm.saluto("Mario", 9), "Buongiorno, Mario"); assert.equal(hm.saluto("  Maria   Luisa ", 15), "Buon pomeriggio, Maria Luisa"); for (const x of [null, undefined, "", "   ", 5, {}]) assert.equal(hm.saluto(x, 20), "Buonasera", String(x));
});

test("ora in Italia: la dà giusta qualunque sia il fuso del server, con l'ora legale e senza, e la mezzanotte è 0 (mai 24)", () => {
  assert.equal(hm.oraInItalia(new Date("2026-10-15T10:00:00Z")), 12, "ora legale (UTC+2)"); assert.equal(hm.oraInItalia(new Date("2026-12-15T10:00:00Z")), 11, "ora solare (UTC+1)"); assert.equal(hm.oraInItalia(new Date("2026-12-15T23:30:00Z")), 0); assert.equal(hm.oraInItalia(new Date("2026-07-15T22:00:00Z")), 0);
  for (let h = 0; h < 24; h++) { const v = hm.oraInItalia(new Date(Date.UTC(2026, 5, 1, h))); assert.ok(Number.isInteger(v) && v >= 0 && v <= 23, String(v)); }
});

test("stato della casa: prima la verifica, poi la pubblicazione; ogni stato ha le sue parole", () => {
  const s = hm.statoCasa; assert.deepEqual([s({ verificata: true, pubblicato: true }).chiave, s({ verificata: true, pubblicato: false }).chiave, s({ verificata: false, pubblicato: true }).chiave, s({ verificata: false, pubblicato: false }).chiave], ["pubblicata", "non_pubblicata", "in_verifica", "in_verifica"]);
  assert.equal(s({ verificata: true, pubblicato: true }).testo, "Pubblicata"); assert.equal(s({ verificata: true, pubblicato: false }).testo, "Non pubblicata"); assert.equal(s({ verificata: false, pubblicato: true }).testo, "In verifica"); assert.match(s({ verificata: true, pubblicato: false }).spiegazione, /non la vedono ancora/);
});

test("frasi dei numeri: singolare e plurale giusti, zero detto bene, valori strani trattati come zero", () => {
  assert.deepEqual(hm.frasePossibili(1), { numero: "1", frase: "inquilino cerca una casa come la tua" }); assert.deepEqual(hm.frasePossibili(12), { numero: "12", frase: "inquilini cercano una casa come la tua" }); assert.deepEqual(hm.frasePossibili(0), { numero: "0", frase: "Per ora nessun inquilino cerca una casa come la tua" });
  assert.deepEqual(hm.fraseCandidature(1), { numero: "1", frase: "persona ha chiesto di vedere la tua casa" }); assert.deepEqual(hm.fraseCandidature(3), { numero: "3", frase: "persone hanno chiesto di vedere la tua casa" }); assert.deepEqual(hm.fraseCandidature(0), { numero: "0", frase: "Nessuno ha ancora chiesto di vedere la tua casa" });
  for (const x of [-4, NaN, undefined, null, "x"]) { assert.equal(hm.frasePossibili(x).numero, "0"); assert.equal(hm.fraseCandidature(x).numero, "0"); assert.equal(hm.inviteDaValutare(x), null); } assert.equal(hm.frasePossibili(2.9).numero, "2");
  assert.equal(hm.inviteDaValutare(1), "Hai 1 candidatura da guardare"); assert.equal(hm.inviteDaValutare(5), "Hai 5 candidature da guardare"); assert.equal(hm.inviteDaValutare(0), null);
});

test("prezzo e dettagli: «€ 1.250 al mese», «2 locali», «55 m²»; solo ciò che si sa", () => {
  const p = (n) => senzaPunti(hm.testoPrezzo(n)); assert.equal(p(1250), "€ 1250 al mese"); assert.equal(p(900), "€ 900 al mese"); assert.equal(p(1250.6), "€ 1251 al mese"); assert.equal(p(NaN), "€ 0 al mese"); assert.equal(p(12500), "€ 12500 al mese"); assert.match(hm.testoPrezzo(1250), /^€ 1\.?250 al mese$/);
  assert.deepEqual(hm.dettagliCasa({ locali: 2, mq: 55 }), ["2 locali", "55 m²"]); assert.deepEqual(hm.dettagliCasa({ locali: 1, mq: null }), ["1 locale"]); assert.deepEqual(hm.dettagliCasa({ locali: null, mq: null }), []); assert.deepEqual(hm.dettagliCasa({ locali: 0, mq: -3 }), []);
});

// ============================================================ la pagina, disegnata davvero
const CASA = { id: "c1", titolo: "Bilocale luminoso", zona: "Isola, Milano", prezzo: 1250, locali: 2, mq: 55, pubblicato: true, verificata: true, foto: "https://esempio.it/foto.jpg", nCandidature: 3, daValutare: 2, possibili: 12 };
const pagina = (o = {}) => renderToStaticMarkup(React.createElement(comp.OwnerHomeClient, { case_: [CASA], nome: "Mario", ora: 9, ...o }));
const ancore = (h) => [...h.matchAll(/<a ([^>]*)>/g)].map((m) => Object.fromEntries([...m[1].matchAll(/([a-z-]+)="([^"]*)"/g)].map((x) => [x[1], x[2]])));
const link = (h) => ancore(h).map((a) => a.href);

test("Home con UNA casa: saluto, «La tua casa», la casa in grande con i suoi dati, e le due tessere con i numeri", () => {
  const h = pagina(); const t = senzaPunti(testoDi(h));
  for (const x of ["Buongiorno, Mario", "La tua casa", "Bilocale luminoso", "Isola, Milano", "€ 1250 al mese · 2 locali · 55 m²", "Pubblicata", "Vedi o modifica ›", "Possibili inquilini", "12 inquilini cercano una casa come la tua", "Candidature", "3 persone hanno chiesto di vedere la tua casa", "2 da valutare"]) assert.ok(t.includes(x), `manca «${x}»: ${t}`);
  assert.match(h, /<img src="https:\/\/esempio\.it\/foto\.jpg" alt=""/); assert.equal((h.match(/<article/g) ?? []).length, 1); assert.ok(!/class="casa compatta"/.test(h), "con una sola casa non è la versione compatta");
});

test("DOVE PORTA OGNI PARTE: la casa → Immobili; «Possibili inquilini» e «Candidature» → Database; il pulsante per le candidature da guardare → Database", () => {
  const h = pagina(); const a = ancore(h); assert.deepEqual(a.map((x) => x.href), ["/database", "/immobili", "/database#possibili", "/database"], "ordine: invito, casa, possibili, candidature");
  assert.deepEqual(a.map((x) => x.class), ["casa-invito", "casa-hero", "tessera", "tessera"]);
  const hero = h.slice(h.indexOf('class="casa-hero"'), h.indexOf("</a>", h.indexOf('class="casa-hero"'))); assert.ok(hero.includes("Bilocale luminoso") && hero.includes("Vedi o modifica") && hero.includes("<img"), "la foto, il titolo e «Vedi o modifica» stanno TUTTI nel link verso Immobili");
  const tessera = (href) => h.slice(h.indexOf(`href="${href}"`, h.indexOf("casa-tessere")), h.indexOf("</a>", h.indexOf(`href="${href}"`, h.indexOf("casa-tessere")))); assert.ok(tessera("/database#possibili").includes("Possibili inquilini") && !tessera("/database#possibili").includes("Candidature"));
  assert.ok(testoDi(tessera("/database")).includes("Candidature") && !testoDi(tessera("/database")).includes("Possibili inquilini"));
  assert.deepEqual(hm.DESTINAZIONI_HOME, { immobili: "/immobili", candidature: "/database", possibili: "/database#possibili" });
});

test("nessun link dentro un altro link (non si capirebbe dove si tocca), e la casa e le tessere hanno un nome per chi usa un lettore di schermo", () => {
  const h = pagina(); assert.ok(!/<a [^>]*>(?:(?!<\/a>)[\s\S])*<a /.test(h), "un link dentro un altro link"); for (const scenario of [pagina(), pagina({ case_: [] }), pagina({ case_: [{ ...CASA, pubblicato: false }] }), pagina({ case_: [{ ...CASA, possibili: null }] })]) assert.ok(!/\shidden(=|\s|>)/.test(scenario), "una parte della Home è nascosta (hidden)"); for (const x of ancore(h)) if (x.class === "tessera" || x.class === "casa-hero") assert.ok((x["aria-label"] ?? "").length >= 20, JSON.stringify(x));
  const nomi = ancore(h).map((x) => x["aria-label"]).filter(Boolean); assert.ok(nomi.includes("Possibili inquilini: 12 inquilini cercano una casa come la tua. Tocca per guardare")); assert.ok(nomi.includes("Candidature: 3 persone hanno chiesto di vedere la tua casa, 2 da valutare. Tocca per guardare")); assert.ok(nomi.includes("Bilocale luminoso, Isola, Milano. Pubblicata. Tocca per vedere o modificare la casa"));
});

test("il pulsante «Hai N candidature da guardare» compare solo se c'è qualcosa da guardare, in cima, e somma tutte le case", () => {
  assert.match(testoDi(pagina()), /Hai 2 candidature da guardare Guarda ›/); assert.ok(!testoDi(pagina({ case_: [{ ...CASA, daValutare: 0 }] })).includes("da guardare"), "niente da guardare: niente pulsante");
  const due = pagina({ case_: [CASA, { ...CASA, id: "c2", titolo: "Trilocale", daValutare: 3 }] }); assert.match(testoDi(due), /Hai 5 candidature da guardare/); assert.ok(due.indexOf("casa-invito") < due.indexOf("<article"), "il pulsante sta sopra le case");
  assert.match(testoDi(pagina({ case_: [{ ...CASA, daValutare: 1 }] })), /Hai 1 candidatura da guardare/);
});

test("senza il numero dei possibili inquilini (non si riesce a calcolare) si mostra solo la tessera delle candidature, larga, senza numeri inventati", () => {
  const h = pagina({ case_: [{ ...CASA, possibili: null }] }); assert.match(h, /class="casa-tessere una"/); assert.ok(!h.includes("Possibili inquilini") && !h.includes("#possibili")); assert.ok(h.includes("Candidature"));
  const z = pagina({ case_: [{ ...CASA, possibili: 0, nCandidature: 0, daValutare: 0 }] }); const t = testoDi(z); assert.ok(t.includes("Per ora nessun inquilino cerca una casa come la tua") && t.includes("Nessuno ha ancora chiesto di vedere la tua casa")); assert.ok(!t.includes("da valutare"));
});

test("casa non pubblicata o in verifica: niente tessere (non avrebbero senso), ma una frase chiara e un pulsante per andare alla casa", () => {
  for (const [o, stato, frase] of [[{ pubblicato: false }, "Non pubblicata", "Gli inquilini non la vedono ancora."], [{ verificata: false }, "In verifica", "La stiamo controllando"]]) {
    const h = pagina({ case_: [{ ...CASA, ...o }] }); const t = testoDi(h); assert.ok(t.includes(stato) && t.includes(frase), t); assert.ok(!h.includes("tessera") && !h.includes("#possibili"), "le tessere non devono comparire"); assert.ok(ancore(h).some((x) => x.class === "casa-attesa" && x.href === "/immobili")); assert.ok(t.includes("Vai alla casa ›"));
  }
});

test("più case: «Le tue case», ognuna nella sua scheda compatta, con le sue tessere; nessuna foto = un disegno al suo posto", () => {
  const h = pagina({ case_: [CASA, { ...CASA, id: "c2", titolo: "Trilocale", foto: null, nCandidature: 0, daValutare: 0, possibili: 4 }] }); const t = testoDi(h);
  assert.ok(t.includes("Le tue case") && !t.includes("La tua casa")); assert.equal((h.match(/<article class="casa compatta"/g) ?? []).length, 2); assert.equal((h.match(/class="casa-tessere/g) ?? []).length, 2); assert.equal((h.match(/<img /g) ?? []).length, 1, "una foto sola: l'altra casa ha il disegno"); assert.match(h, /casa-foto casa-foto-vuota/);
  assert.ok(t.includes("4 inquilini cercano una casa come la tua") && t.includes("12 inquilini cercano una casa come la tua"));
});

test("nessuna casa: lo si dice con parole semplici e c'è un pulsante grande per aggiungerla (verso Immobili)", () => {
  const h = pagina({ case_: [] }); const t = testoDi(h); assert.ok(t.includes("Non hai ancora nessuna casa") && t.includes("Aggiungi la tua casa") && t.includes("Le tue case")); assert.deepEqual(link(h), ["/immobili"]); assert.ok(!h.includes("<article"));
});

test("saluto e titolo: senza nome solo il saluto; l'ora cambia il saluto", () => {
  assert.ok(testoDi(pagina({ nome: null })).startsWith("Buongiorno La tua casa")); assert.ok(testoDi(pagina({ ora: 15 })).startsWith("Buon pomeriggio, Mario")); assert.ok(testoDi(pagina({ ora: 21 })).startsWith("Buonasera, Mario"));
});

// ============================================================ per chi non è pratico
function bloccoCss() {
  const css = leggi("src", "app", "globals.css"); const a = css.indexOf("Home del proprietario: la casa in grande e due tessere grandi."); const fineHome = css.indexOf("/* ---- «Richieste dei proprietari» (inquilino) ---- */"); const schede = css.indexOf("/* ---- Database: le schede dei possibili inquilini e la richiesta ---- */");
  assert.ok(a > 0 && fineHome > a && schede > fineHome, "blocchi di stile non trovati");
  // la Home e la sezione del Database, poi le schede dei possibili inquilini e la richiesta: tutto ciò che legge il proprietario. Le richieste dell'inquilino stanno in mezzo e restano fuori.
  return css.slice(a, fineHome) + css.slice(schede);
}

test("leggibilità: nessun carattere sotto i 15 px nella Home e nella sezione del Database; i testi di lettura da 16 px in su", () => {
  const css = bloccoCss(); const misure = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])); assert.ok(misure.length >= 20, "pochi caratteri trovati: " + misure.length); assert.ok(Math.min(...misure) >= 15, `un carattere è troppo piccolo: ${Math.min(...misure)} px`);
  for (const [classe, minimo] of [[".casa-frase", 0], [".tessera-frase", 17], [".casa-invito", 19], [".casa-dati", 18], [".casa-titolo", 24], [".tessera-numero", 56], [".possibili-testo", 16], [".possibili-frase", 17]]) { if (!minimo) continue; const m = css.match(new RegExp(`${classe.replace(".", "\\.")} \\{[^}]*font-size:\\s*(\\d+)px`)); assert.ok(m && Number(m[1]) >= minimo, `${classe}: serve almeno ${minimo}px`); }
});

test("leggibilità: i bersagli da toccare sono larghi (pulsante delle candidature e frase d'attesa almeno 64 px, tessere almeno 180 px) e c'è un contorno quando si naviga da tastiera", () => {
  const css = bloccoCss(); const alt = (c) => Number((css.match(new RegExp(`${c.replace(".", "\\.")} \\{[^}]*min-height:\\s*(\\d+)px`)) ?? [])[1]);
  assert.ok(alt(".casa-invito") >= 64 && alt(".casa-attesa") >= 64 && alt(".tessera") >= 180, `${alt(".casa-invito")}, ${alt(".casa-attesa")}, ${alt(".tessera")}`);
  for (const c of [".tessera:focus-visible", ".casa-hero:focus-visible", ".casa-invito:focus-visible"]) assert.ok(css.includes(c), `manca il contorno per la tastiera: ${c}`); assert.match(css, /outline: 3px solid var\(--moss\)/);
  assert.match(css, /\.casa-tessere \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/, "le due tessere devono avere sempre la stessa larghezza"); assert.match(css, /\.tessera \{[^}]*min-width: 0;/);
  assert.match(css, /\.casa-hero \{[^}]*height: 300px;/); assert.match(css, /\.casa\.compatta \.casa-hero \{\s+height: 210px;/);
});

test("leggibilità: il testo sulla foto sta sopra una sfumatura scura (leggibile con qualunque foto) e le etichette dello stato hanno uno sfondo proprio", () => {
  const css = bloccoCss(); assert.match(css, /\.casa-sfumatura \{[^}]*linear-gradient\(to top, rgba\(16, 21, 26, 0\.9\)/); assert.match(css, /\.casa-stato \{[^}]*background: rgba\(16, 21, 26, 0\.74\)/); assert.match(css, /\.casa-modifica \{[^}]*background: rgba\(247, 244, 236, 0\.96\)/);
});

test("parole semplici: nella Home niente inglesismi né sigle (match, badge, database, dashboard, lead)", () => {
  const t = testoDi(pagina({ case_: [CASA, { ...CASA, id: "c2", pubblicato: false }] })) + " " + testoDi(pagina({ case_: [] })); for (const p of ["match", "badge", "dashboard", "lead", "feedback", "online", "click", "tap"]) assert.ok(!new RegExp(`\\b${p}\\b`, "i").test(t), `parola difficile: ${p}`);
});

// ============================================================ i collegamenti nel codice e la sicurezza dei dati
test("pagina Home: per ogni casa conta candidature e da valutare, calcola i possibili solo per le case che gli inquilini vedono (verificate e pubblicate) e passa solo numeri al componente", () => {
  const p = leggi("src", "app", "(app)", "page.tsx"); const o = p.slice(p.indexOf("async function OwnerHome"));
  assert.match(o, /\.select\("id, status, listing_id, tenant_id, listings!inner\(owner_id\)"\)\s+\.eq\("listings\.owner_id", userId\)/); assert.match(o, /if \(c\.status === "in_attesa"\) daValutarePer\.set/); assert.match(o, /l\.pubblicato === true && l\.verifica_stato === "verificato"/); assert.match(o, /possibiliPerAnnuncio\(\s+visibili\.map/);
  assert.match(o, /possibili: conteggi\?\.get\(l\.id as string\) \?\? null,/); assert.match(o, /<OwnerHomeClient case_=\{case_\} nome=\{\(profilo\?\.nome as string \| null\) \?\? null\} ora=\{oraInItalia\(\)\} \/>/); const datiCase = o.slice(o.indexOf("const case_"), o.indexOf("return <OwnerHomeClient")); assert.ok(!/tenant/i.test(datiCase), "un identificativo di inquilino finisce nei dati della Home"); assert.ok(!/tenant/i.test(leggi("src", "lib", "proprietario", "home.ts")), "i tipi della Home non devono poter contenere un inquilino");
});

test("SICUREZZA: la chiave di servizio è solo in un file del server, legge solo i criteri di ricerca (mai nomi, email, reddito, foto) e restituisce solo numeri; i componenti del browser non la importano", () => {
  const s = leggi("src", "lib", "proprietario", "possibili-server.ts"); const soloAmministratore = s.slice(0, s.indexOf("export type PossibiliPerCasa")); const codice = soloAmministratore.replace(/\/\*[\s\S]*?\*\//g, ""); const selezioni = [...codice.matchAll(/\.select\("([^"]+)"\)/g)].map((m) => m[1]).join(" ");
  assert.ok(selezioni.includes("budget_max") && selezioni.includes("attributo_key") && selezioni.includes("luogo_id"), "non legge i criteri di ricerca"); for (const vietato of ["nome", "cognome", "email", "avatar", "reddito", "professione", "presentazione", "protestato", "telefono"]) assert.ok(!selezioni.includes(vietato), `la chiave di servizio legge «${vietato}»`);
  assert.match(s, /export async function possibiliPerAnnuncio\([\s\S]*?\): Promise<Map<string, number> \| null>/); assert.match(s, /export async function possibiliPerCasaDelProprietario/); assert.ok(!/NEXT_PUBLIC/.test(s));
  for (const f of ["app/(app)/database/DatabaseClient.tsx", "app/(app)/OwnerHomeClient.tsx"]) { const t = leggi("src", ...f.split("/")); for (const riga of t.split("\n").filter((r) => /possibili-server/.test(r))) assert.match(riga, /^import type /, `${f} importa codice del server: ${riga}`); }
  for (const f of ["app/(app)/database/DatabaseClient.tsx", "app/(app)/OwnerHomeClient.tsx"]) assert.ok(!/clienteAmministratore/.test(leggi("src", ...f.split("/"))), f);
});

test("la chiave di servizio manca: la Home non crolla e non mostra numeri inventati (possibili = null)", () => {
  const s = leggi("src", "lib", "proprietario", "possibili-server.ts"); assert.match(s, /const admin = clienteAmministratore\(\);\s+if \(!admin\) return null;/); assert.match(s, /if \(tenant\.error \|\| zone\.error \|\| interessi\.error\) \{[\s\S]*?return null;/); assert.match(s, /if \(annunci\.length === 0\) return new Map\(\);/);
});

test("Database: la sezione «Possibili inquilini» c'è, ha l'ancora a cui porta la tessera, dice che non si vede chi sono, e funziona anche senza numeri", () => {
  const d = leggi("src", "app", "(app)", "database", "DatabaseClient.tsx"); const c = leggi("src", "components", "PossibiliInquilini.tsx"); assert.match(d, /<PossibiliInquilini possibili=\{possibili\} \/>/); assert.match(c, /<section id="possibili" className="possibili" aria-labelledby="possibili-titolo">/); assert.match(c, /Chi ha scelto di non farsi trovare non compare, e i contatti di nessuno sono/); assert.match(c, /Il numero non è disponibile in questo momento/); assert.match(c, /Quando la tua casa sarà pubblicata vedrai qui quanti inquilini cercano una casa come la tua\./);
  assert.ok(d.indexOf("<PossibiliInquilini") > 0 && d.indexOf("<PossibiliInquilini") < d.indexOf("<RicercaCandidati"), "la sezione sta prima della ricerca delle candidature"); const p = leggi("src", "app", "(app)", "database", "page.tsx"); assert.match(p, /const possibili = await possibiliPerCasaDelProprietario\(supabase, user!\.id\);/); assert.match(p, /<DatabaseClient\s+possibili=\{possibili\}/);
  assert.match(leggi("src", "app", "globals.css"), /\.possibili \{[^}]*scroll-margin-top: 16px;/);
});

test("informativa: dice che ai proprietari si mostra solo un NUMERO anonimo di inquilini compatibili, con la nuova versione; chi aveva le precedenti non deve riaccettare", () => {
  const testo = JSON.stringify(inf.INFORMATIVA); assert.ok(testo.includes("QUANTI inquilini hanno una ricerca compatibile con il loro immobile")); assert.ok(testo.includes("è un numero anonimo, non vedono chi sono né nessun loro dato")); assert.ok(testo.includes("Se uno di loro si candida, il proprietario vede la candidatura come tutte le altre"));
  const vN = Number(inf.INFORMATIVA.versione.match(/^2026-10-provvisoria-(\d+)$/)?.[1]); assert.ok(vN >= 20, "versione: " + inf.INFORMATIVA.versione); for (let v = 20; v < vN; v++) assert.ok(inf.INFORMATIVA.equivalenti.includes(`2026-10-provvisoria-${v}`), `la ${v} deve restare equivalente`); assert.ok(inf.INFORMATIVA.equivalenti.every((e) => Number(e.split("-").pop()) >= 20), "le versioni prima della 20 non sono equivalenti: cambia chi vede il profilo"); assert.ok(!inf.INFORMATIVA.equivalenti.includes(inf.INFORMATIVA.versione));
});
