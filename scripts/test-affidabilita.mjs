/**
 * Test del punteggio di affidabilità (reddito verificato +60, nessun protesto +25, garante o fideiussione +15; da 0 a 100,
 * niente numeri negativi) e delle recensioni, che stanno a parte. Si lancia con:   npm test
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

const af = caricaTs(path.join(radice, "src", "lib", "affidabilita.ts"));
const rc = caricaTs(path.join(radice, "src", "lib", "recensioni.ts"));
const riepilogo = caricaTs(path.join(radice, "src", "components", "RiepilogoAffidabilita.tsx"));
const come = caricaTs(path.join(radice, "src", "components", "ComeSiCalcola.tsx"));
const cd = caricaTs(path.join(radice, "src", "lib", "match", "candidato.ts"));
const pr = caricaTs(path.join(radice, "src", "lib", "match", "proprietario.ts"));
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");

const tri = [null, false, true];
function* tutte() { for (const verificato of [false, true]) for (const protestato of tri) for (const garante of tri) for (const fideiussione of tri) yield { verificato, protestato, garante, fideiussione }; }
/** La regola, riscritta a parte: reddito +50, nessun protesto +30, protesti o NON INDICATO −30, garante o fideiussione +20; da 0 a 100. */
const grezzoAtteso = (p) => (p.verificato ? 50 : 0) + (p.protestato === false ? 30 : -30) + (p.garante === true || p.fideiussione === true ? 20 : 0);
const oracolo = (p) => Math.max(0, Math.min(100, grezzoAtteso(p)));
const calcola = (o = {}) => af.computeAffidabilita({ verificato: false, protestato: null, garante: null, fideiussione: null, ...o });
const ORDINE = ["Scarsa", "Buona", "Molto buona", "Eccellente"];

// ============================================================ il punteggio
test("punteggio: per OGNI combinazione (54 casi) coincide con la regola riscritta a parte, è intero e sta tra 0 e 100; «grezzo» è la somma vera delle voci", () => {
  let n = 0;
  for (const p of tutte()) { n++; const r = af.computeAffidabilita(p); assert.equal(r.punteggio, oracolo(p), JSON.stringify(p)); assert.equal(r.grezzo, grezzoAtteso(p), JSON.stringify(p)); assert.ok(Number.isInteger(r.punteggio) && r.punteggio >= 0 && r.punteggio <= 100, String(r.punteggio)); assert.equal(r.grezzo, r.voci.reduce((s, v) => s + v.punti, 0), "la somma delle voci è il totale vero"); }
  assert.equal(n, 54); assert.equal(af.PUNTEGGIO_MINIMO, 0); assert.equal(af.PUNTEGGIO_MASSIMO, 100); assert.deepEqual(af.PUNTI_AFFIDABILITA, { reddito: 50, protesti: 30, garanzia: 20 });
});

test("LA TABELLA DEI CASI: reddito verificato (R), protesti (P) e garante o fideiussione (G) → punteggio ed etichetta (tutti gli otto casi, con protesti dichiarati)", () => {
  const caso = (R, P, G) => calcola({ verificato: !!R, protestato: !!P, garante: G ? true : null });
  const matrice = [
    // R  P  G   punti etichetta
    [1, 0, 1, 100, "Eccellente"],   // reddito verificato + nessun protesto + garante
    [1, 0, 0, 80, "Molto buona"],   // reddito verificato + nessun protesto
    [0, 0, 1, 50, "Buona"],         // nessun protesto + garante, senza reddito verificato (sole dichiarazioni)
    [0, 0, 0, 30, "Buona"],         // solo «nessun protesto»
    [1, 1, 1, 40, "Buona"],         // reddito verificato + protesti + garante
    [1, 1, 0, 20, "Scarsa"],        // reddito verificato + protesti  (il difetto di prima: era «Molto buona»)
    [0, 1, 1, 0, "Scarsa"],         // protesti + garante, senza reddito verificato
    [0, 1, 0, 0, "Scarsa"],         // protesti e nient'altro
  ];
  for (const [R, P, G, punti, etichetta] of matrice) { const r = caso(R, P, G); assert.equal(r.punteggio, punti, `R${R} P${P} G${G}`); assert.equal(r.label, etichetta, `R${R} P${P} G${G}`); }
});

test("IL DIFETTO DI PRIMA: chi ha il reddito verificato E dei protesti non è più «Molto buona» (con i protesti il punteggio scende)", () => {
  const r = calcola({ verificato: true, protestato: true }); assert.equal(r.punteggio, 20); assert.equal(r.label, "Scarsa"); assert.ok(r.punteggio < calcola({ verificato: true, protestato: false }).punteggio);
  for (const p of tutte()) if (p.protestato !== false) { const x = af.computeAffidabilita(p); assert.ok(ORDINE.indexOf(x.label) <= 1 || x.label === "Da completare", `${JSON.stringify(p)} → ${x.label}: con dei protesti non si va oltre «Buona»`); }
});

test("«non indicato» vale come «sì» nel punteggio (stessi punti), ma l'etichetta dice «Da completare» invece di giudicare; con la risposta torna l'etichetta vera", () => {
  for (const verificato of [false, true]) for (const garante of tri) for (const fideiussione of tri) { const base = { verificato, garante, fideiussione }; const nonInd = af.computeAffidabilita({ ...base, protestato: null }); const si = af.computeAffidabilita({ ...base, protestato: true }); assert.equal(nonInd.punteggio, si.punteggio); assert.equal(nonInd.grezzo, si.grezzo); assert.equal(nonInd.label, "Da completare"); assert.equal(si.label, af.etichettaPunteggio(si.punteggio)); assert.ok(af.etichettaPunteggio(si.punteggio) !== "Da completare"); }
});

test("chi non ha niente ha 0 e «Da completare»; il totale vero è −30 (il punteggio non scende sotto 0); il massimo è 100", () => {
  const v = calcola(); assert.equal(v.punteggio, 0); assert.equal(v.grezzo, -30); assert.equal(v.label, "Da completare"); assert.equal(calcola({ protestato: true }).grezzo, -30); assert.equal(calcola({ protestato: true }).punteggio, 0);
  assert.equal(calcola({ verificato: true, protestato: false, garante: true }).punteggio, 100); assert.equal(calcola({ verificato: true, protestato: false, fideiussione: true }).punteggio, 100);
});

test("monotonia: reddito verificato e garante non fanno mai scendere il punteggio; passare da protesti a «nessun protesto» lo fa sempre salire di 60 (salvo il pavimento di 0)", () => {
  for (const p of tutte()) { const b = af.computeAffidabilita(p); if (!p.verificato) assert.ok(af.computeAffidabilita({ ...p, verificato: true }).grezzo === b.grezzo + 50); if (!(p.garante === true || p.fideiussione === true)) assert.equal(af.computeAffidabilita({ ...p, garante: true }).grezzo, b.grezzo + 20); if (p.protestato !== false) { const pulito = af.computeAffidabilita({ ...p, protestato: false }); assert.equal(pulito.grezzo, b.grezzo + 60); assert.ok(pulito.punteggio > b.punteggio, JSON.stringify(p)); } }
});

test("i punteggi possibili sono sette e ogni caso è distinguibile (tranne i due peggiori, entrambi a 0): 0, 20, 30, 40, 50, 80, 100", () => {
  assert.deepEqual([...new Set([...tutte()].map((p) => af.computeAffidabilita(p).punteggio))].sort((a, b) => a - b), [0, 20, 30, 40, 50, 80, 100]);
});

test("il reddito verificato vale più delle dichiarazioni: senza reddito verificato non si va oltre «Buona» (50), con i protesti solo reddito verificato E garante arrivano a «Buona»", () => {
  assert.ok(calcola({ verificato: true, protestato: false }).punteggio > calcola({ protestato: false, garante: true }).punteggio);
  for (const p of tutte()) if (!p.verificato) { const x = af.computeAffidabilita(p); assert.ok(x.punteggio <= 50 && x.label !== "Molto buona" && x.label !== "Eccellente", `${JSON.stringify(p)} → ${x.label}`); }
  for (const p of tutte()) if (p.protestato !== false) { const x = af.computeAffidabilita(p); const garanzia = p.garante === true || p.fideiussione === true; assert.equal(x.punteggio >= 30, p.verificato && garanzia, `${JSON.stringify(p)}: con i protesti si arriva a «Buona» solo con reddito verificato e garante`); }
});

test("garante o fideiussione valgono +20 una volta sola, anche se ci sono entrambi; «no» non dà punti", () => {
  const g = (o) => calcola({ protestato: false, ...o }).punteggio; assert.equal(g({ garante: true, fideiussione: true }), 50); assert.equal(g({ garante: false, fideiussione: false }), 30); assert.equal(g({ garante: true, fideiussione: false }), 50); assert.equal(g({ garante: false, fideiussione: true }), 50);
});

test("etichette: Scarsa sotto 30, Buona da 30, Molto buona da 60, Eccellente da 85 (estremi esatti); con la risposta ai protesti l'etichetta segue il punteggio", () => {
  const e = af.etichettaPunteggio; assert.deepEqual([0, 20, 29, 30, 59, 60, 84, 85, 100].map(e), ["Scarsa", "Scarsa", "Scarsa", "Buona", "Buona", "Molto buona", "Molto buona", "Eccellente", "Eccellente"]); assert.deepEqual(af.SOGLIE_ETICHETTA, { buona: 30, moltoBuona: 60, eccellente: 85 });
  for (const p of tutte()) { const r = af.computeAffidabilita(p); assert.equal(r.label, p.protestato === null ? "Da completare" : e(r.punteggio)); }
});

// ============================================================ le voci
test("voci: sempre le stesse tre, nell'ordine; solo i protesti possono avere punti NEGATIVI; punti, potenziale, origine e «dove si fa» sono coerenti", () => {
  for (const p of tutte()) {
    const r = af.computeAffidabilita(p); assert.deepEqual(r.voci.map((v) => v.id), ["reddito", "protesti", "garanzia"]);
    for (const v of r.voci) {
      assert.equal(v.origine, v.id === "reddito" ? "verificato" : "dichiarato", `${v.id}: solo il reddito lo controlla lo staff (anche quando è preso)`); assert.ok(Number.isInteger(v.punti) && v.nota.length > 5);
      if (v.id === "protesti") { assert.ok(v.punti === 30 || v.punti === -30, `i protesti valgono +30 o −30: ${v.punti}`); assert.equal(v.presa, v.punti > 0); } else { assert.ok(v.punti >= 0, `${v.id}: punti negativi`); assert.equal(v.punti, v.presa ? v.massimo : 0); }
      if (v.presa) { assert.equal(v.potenziale, 0); assert.equal(v.suggerimento, null); assert.equal(v.sezione, null); }
      else { assert.ok([0, v.massimo, 2 * v.massimo].includes(v.potenziale)); if (v.potenziale > 0) { assert.equal(typeof v.suggerimento, "string"); assert.ok(["verifica", "dati"].includes(v.sezione)); } else { assert.equal(v.suggerimento, null); assert.equal(v.sezione, null); } }
    }
  }
});

test("voci: chi controlla cosa (solo il reddito lo controlla lo staff) e dove si completa", () => {
  const r = calcola(); const [red, pro, gar] = r.voci;
  assert.deepEqual([red.origine, pro.origine, gar.origine], ["verificato", "dichiarato", "dichiarato"]); assert.deepEqual([red.massimo, pro.massimo, gar.massimo], [50, 30, 20]);
  assert.deepEqual([red.sezione, pro.sezione, gar.sezione], ["verifica", "dati", "dati"]); assert.equal(red.suggerimento, "Verifica il tuo reddito"); assert.equal(pro.suggerimento, "Indica i protesti nei tuoi dati"); assert.equal(gar.suggerimento, "Indica un garante o una fideiussione");
  assert.match(calcola({ verificato: true }).voci[0].nota, /staff/); assert.match(calcola({ protestato: false }).voci[1].nota, /Non ancora verificato: vale quanto hai dichiarato/); assert.match(calcola({ protestato: false, protestiVerificati: true }).voci[1].nota, /Controllato dallo staff/); assert.match(calcola({ garante: true }).voci[2].nota, /Nessuno lo controlla/);
});

test("protesti: «No» dà +30; «Sì» e «non indicato» tolgono 30; solo il «non indicato» si può correggere (e vale 60 punti), chi ha dichiarato dei protesti non ha niente da guadagnare", () => {
  const no = calcola({ protestato: false }).voci[1]; const si = calcola({ protestato: true }).voci[1]; const nd = calcola({ protestato: null }).voci[1];
  assert.deepEqual([no.presa, no.punti, no.etichetta, no.potenziale], [true, 30, "Nessun protesto", 0]); assert.deepEqual([si.presa, si.punti, si.etichetta, si.potenziale, si.suggerimento], [false, -30, "Protesti dichiarati", 0, null]); assert.match(si.nota, /tolgono 30 punti/);
  assert.deepEqual([nd.presa, nd.punti, nd.etichetta, nd.potenziale, nd.sezione], [false, -30, "Protesti non indicati", 60, "dati"]); assert.match(nd.nota, /valgono come se ci fossero e tolgono 30 punti/);
});

test("punteggio possibile: parte dal totale vero, mai sotto 0 né oltre 100; nessun dato → 100; protesti dichiarati → al massimo 40 (reddito verificato + garante)", () => {
  for (const p of tutte()) { const r = af.computeAffidabilita(p); const possibile = af.punteggioPossibile(r); assert.ok(possibile >= r.punteggio && possibile <= 100); assert.equal(possibile, Math.max(0, Math.min(100, r.grezzo + r.voci.reduce((s, v) => s + v.potenziale, 0)))); }
  assert.equal(af.punteggioPossibile(calcola()), 100); assert.equal(af.punteggioPossibile(calcola({ protestato: true })), 40, "con i protesti dichiarati il massimo è 40"); assert.equal(af.punteggioPossibile(calcola({ verificato: true, protestato: false, garante: true })), 100);
});

test("gli input che non servono più non cambiano il punteggio (professione, reddito dichiarato, recensioni non ne fanno parte)", () => {
  const base = { verificato: true, protestato: false, garante: null, fideiussione: null };
  assert.equal(af.computeAffidabilita({ ...base, professione: "Designer", reddito_mensile: 9999, mediaRecensioni: 1, numeroRecensioni: 9 }).punteggio, af.computeAffidabilita(base).punteggio);
  for (const vecchio of ["checks", "hasRecensioni", "limite", "totaleGrezzo"]) assert.equal(vecchio in calcola(), false, vecchio);
});

test("la risposta sui protesti è obbligatoria: l'azione che salva i dati la richiede PRIMA di scrivere, con il messaggio condiviso", () => {
  assert.equal(af.MESSAGGIO_PROTESTI_OBBLIGATORI, "Indica se hai protesti o segnalazioni: serve per il punteggio di affidabilità.");
  const a = leggi("src", "app", "(app)", "profilo", "actions.ts"); const f = a.slice(a.indexOf("export async function updateDatiPersonali"), a.indexOf("export async function updateRicerca"));
  assert.match(f, /if \(protestato === null\) return \{ error: MESSAGGIO_PROTESTI_OBBLIGATORI \};/); assert.ok(f.indexOf("protestato === null") < f.indexOf('.from("tenant_profiles")'), "il controllo deve venire prima della scrittura"); assert.match(a, /import \{ MESSAGGIO_PROTESTI_OBBLIGATORI \} from "@\/lib\/affidabilita";/);
  const d = leggi("src", "components", "DatiForm.tsx"); assert.match(d, /Hai protesti o segnalazioni in centrale rischi\? · obbligatorio/); assert.match(d, /Va indicato\. Rispondere «No» vale \+\{PUNTI_AFFIDABILITA\.protesti\} nel punteggio; «Sì», o non rispondere, toglie \{PUNTI_AFFIDABILITA\.protesti\}\./, "la nota deve dire sia cosa dà «No» sia cosa toglie «Sì» o il non rispondere"); assert.match(d, /\{state\?\.error && <p className="note-error">\{state\.error\}<\/p>\}/);
});

// ============================================================ le recensioni, a parte
test("recensioni: stelle intere da 1 a 5 e la loro media a un decimale; tutto ciò che non è una stella valida si ignora", () => {
  assert.deepEqual(rc.riepilogoRecensioni([5, 4, 4]), { numero: 3, media: 4.3 }); assert.deepEqual(rc.riepilogoRecensioni([5]), { numero: 1, media: 5 }); assert.deepEqual(rc.riepilogoRecensioni([1, 2]), { numero: 2, media: 1.5 }); assert.deepEqual(rc.riepilogoRecensioni([5, 5, 4]), { numero: 3, media: 4.7 });
  for (const v of [[], null, undefined]) assert.deepEqual(rc.riepilogoRecensioni(v), { numero: 0, media: null });
  assert.deepEqual(rc.riepilogoRecensioni([0, 6, -1, 3.5, "5", null, NaN, Infinity, 4]), { numero: 1, media: 4 }, "0 non è una recensione (si confonderebbe con «nessuna»)"); assert.deepEqual(rc.riepilogoRecensioni([0, 0]), { numero: 0, media: null });
  assert.equal(rc.VOTO_MINIMO, 1); assert.equal(rc.VOTO_MASSIMO, 5);
});

test("recensioni: il testo dice SEMPRE anche quante sono (una sola non pesa come dieci)", () => {
  const t = rc.testoRecensioni; assert.equal(t({ numero: 0, media: null }), "Nessuna recensione ancora"); assert.equal(t({ numero: 1, media: 5 }), "5,0 su 5 · 1 recensione"); assert.equal(t({ numero: 3, media: 4.5 }), "4,5 su 5 · 3 recensioni"); assert.equal(t({ numero: 12, media: 3.2 }), "3,2 su 5 · 12 recensioni");
  for (const x of [{ numero: 0, media: 4 }, { numero: -1, media: 4 }, { numero: 2, media: null }]) assert.equal(t(x), "Nessuna recensione ancora", JSON.stringify(x));
});

test("recensioni: le stelle da disegnare, sempre cinque; la media si arrotonda alla più vicina", () => {
  const s = rc.stelleTesto; assert.equal(s(null), "☆☆☆☆☆"); assert.equal(s(5), "★★★★★"); assert.equal(s(4.5), "★★★★★"); assert.equal(s(4.4), "★★★★☆"); assert.equal(s(1), "★☆☆☆☆"); assert.equal(s(0.4), "☆☆☆☆☆"); assert.equal(s(99), "★★★★★"); assert.equal(s(-3), "☆☆☆☆☆"); assert.equal(s(NaN), "☆☆☆☆☆");
  for (const m of [null, 1, 2.5, 3.3, 4.9, 5, 100, -1]) assert.equal(s(m).length, 5, String(m));
});

test("recensioni: un riepilogo salvato si rilegge solo se ha la forma giusta", () => {
  const l = rc.leggiRiepilogo; assert.deepEqual(l({ numero: 3, media: 4.5 }), { numero: 3, media: 4.5 }); assert.deepEqual(l({ numero: 0, media: null }), { numero: 0, media: null });
  for (const x of [null, undefined, 5, "x", [], {}, { numero: 3 }, { numero: 3, media: 6 }, { numero: 3, media: 0.5 }, { numero: -1, media: null }, { numero: 1.5, media: 3 }, { numero: 0, media: 3 }, { numero: 2, media: "4" }, { numero: 2, media: NaN }]) assert.equal(l(x), null, JSON.stringify(x));
});

test("il voto nel database è da 1 a 5 (da cui le stelle da 1 a 5)", () => {
  assert.match(leggi("supabase", "migrations", "0001_init.sql"), /voto smallint not null check \(voto between 1 and 5\)/);
});

// ============================================================ lato proprietario
const profilo = { professione: "Designer", reddito_mensile: 2600, reddito_nucleo: null, garante: true, fideiussione: false, protestato: false, animali_compilato: true, nucleo_compilato: true, presentazione: "Ciao", verificato: true };
const valuta = (recensioni) => cd.valutaCandidato({ criteri: [], canone: 1000, profilo, recensioni });

test("valutazione del candidato: il punteggio è lo stesso con qualunque recensione; le recensioni viaggiano a parte", () => {
  const a = valuta({ numero: 0, media: null }); const b = valuta({ numero: 9, media: 1 }); const c = valuta({ numero: 1, media: 5 });
  assert.equal(a.affidabilita, 100); assert.equal(b.affidabilita, a.affidabilita); assert.equal(c.affidabilita, a.affidabilita); assert.deepEqual(b.recensioni, { numero: 9, media: 1 });
});

test("fotografia: le recensioni si rileggono se ci sono e si ignorano se rotte; una fotografia vecchia (senza) resta valida", () => {
  const v = valuta({ numero: 3, media: 4.5 }); const fot = JSON.parse(JSON.stringify(v));
  assert.deepEqual(cd.leggiFotografia(fot).recensioni, { numero: 3, media: 4.5 });
  const vecchia = { match: fot.match, affidabilita: 85 }; const r = cd.leggiFotografia(vecchia); assert.ok(r, "la fotografia vecchia non si legge più"); assert.equal(r.affidabilita, 85); assert.equal("recensioni" in r, false);
  for (const rotta of [5, "x", { numero: 3 }, { numero: 3, media: 9 }]) { const x = cd.leggiFotografia({ ...fot, recensioni: rotta }); assert.ok(x && x.affidabilita === fot.affidabilita, "una recensione rotta non deve far perdere la fotografia"); assert.equal("recensioni" in x, false, JSON.stringify(rotta)); }
});

test("ordine dei candidati: a parità di tutto, prima la media di stelle più alta, poi chi ha più recensioni; il resto non cambia", () => {
  const m = { bloccato: false, punteggio: 80 }; const voce = (id, aff, rec) => ({ id, match: m, affidabilita: aff, recensioni: rec });
  const ordine = (v) => pr.ordinaCandidati(v).map((x) => x.id).join();
  assert.equal(ordine([voce("a", 75, { numero: 1, media: 3 }), voce("b", 75, { numero: 1, media: 5 }), voce("c", 75, null)]), "b,a,c"); assert.equal(ordine([voce("a", 75, { numero: 1, media: 5 }), voce("b", 75, { numero: 4, media: 5 })]), "b,a");
  assert.equal(ordine([voce("a", 60, { numero: 9, media: 5 }), voce("b", 75, null)]), "b,a", "l'affidabilità conta più delle recensioni"); assert.equal(ordine([voce("a", 75, undefined), voce("b", 75, { numero: 0, media: null })]).length, 3);
  assert.equal(pr.ordinaCandidati([{ id: "x", match: { bloccato: true, punteggio: 99 }, affidabilita: 100, recensioni: { numero: 9, media: 5 } }, { id: "y", match: { bloccato: false, punteggio: 10 }, affidabilita: 0 }]).map((v) => v.id).join(), "y,x", "chi non soddisfa i criteri obbligatori resta in fondo qualunque punteggio abbia");
});

// ============================================================ i collegamenti nel codice
test("modulo dei dati: avvisa UNA volta per salvataggio, le note sul punteggio vengono dalle costanti, ha le ancore a cui porta il riepilogo; il salvataggio aggiorna anche la Home", () => {
  const d = leggi("src", "components", "DatiForm.tsx"); assert.match(d, /export function DatiForm/); assert.match(d, /if \(pending\) \{\s+eraInCorso\.current = true;\s+return;\s+\}\s+if \(eraInCorso\.current\) \{\s+eraInCorso\.current = false;\s+if \(state\?\.ok\) onSalvata\?\.\(\);/);
  assert.match(d, /\+\{PUNTI_AFFIDABILITA\.garanzia\}/); assert.match(d, /\+\{PUNTI_AFFIDABILITA\.protesti\}/); assert.ok(!/\b(60|25|15)\b/.test(d.replace(/max=\{[^}]*\}|step=\{[^}]*\}/g, "")), "un numero di punti scritto a mano nelle note"); assert.match(d, /tenant\.verificato && \(\s+<p className="field-note">\s+Il tuo reddito è verificato: se cambi lavoro o reddito/);
  assert.match(d, /<div id="dati-garante" className="ancora-dati" \/>/); assert.match(d, /<div id="dati-protesti" className="ancora-dati" \/>/); assert.ok(!/<Sheet/.test(d), "il modulo non ha più un suo contenitore: sta dentro la scheda unica");
  const a = leggi("src", "app", "(app)", "profilo", "actions.ts"); const f = a.slice(a.indexOf("export async function updateDatiPersonali"), a.indexOf("export async function updateRicerca")); assert.match(f, /revalidatePath\("\/profilo"\);\s+revalidatePath\("\/"\);/, "la Home non si aggiorna dopo il salvataggio dei dati");
});

test("proprietario: vede le recensioni a parte dal punteggio (lista e dettaglio) e le usa solo come ultimo spareggio", () => {
  const d = leggi("src", "app", "(app)", "database", "DatabaseClient.tsx"); assert.match(d, /label="Recensioni"/); assert.match(d, /selezionata\.valutazione\?\.recensioni/); assert.match(leggi("src", "lib", "database-proprietario.ts"), /recensioni: c\.valutazione!\.recensioni \?\? null/); assert.match(leggi("src", "lib", "database-proprietario.ts"), /recensioni: v\?\.recensioni \?\? null/, "la scheda mostra le recensioni a parte");
  const c = leggi("src", "lib", "candidati.ts"); assert.match(c, /recensioni: riepilogoRecensioni\(recensioniGrezze\.map\(\(r\) => r\.voto\)\)/); const x = leggi("src", "app", "(app)", "database", "actions.ts"); assert.match(x, /recensioni: riepilogoRecensioni\(recensioniGrezze\.map\(\(r\) => r\.voto\)\)/);
});

test("nessun posto del codice calcola ancora la media delle recensioni a mano né le dà al punteggio", () => {
  const cartella = path.join(radice, "src"); const trovati = [];
  const visita = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) visita(p); else if (/\.(ts|tsx)$/.test(e.name)) { const t = fs.readFileSync(p, "utf8"); if (/mediaRecensioni|numeroRecensioni/.test(t)) trovati.push(path.relative(cartella, p)); } } };
  visita(cartella); assert.deepEqual(trovati, [], "campi vecchi ancora in uso: " + trovati.join(", "));
});

// ============================================================ le fasce e gli esempi
test("fasce: coprono da 0 a 100 senza buchi né sovrapposizioni, ogni estremo cade nell'etichetta giusta; sono quattro (e «Da completare» non è una fascia)", () => {
  const f = af.fasceAffidabilita(); assert.deepEqual(f.map((x) => x.label), ["Scarsa", "Buona", "Molto buona", "Eccellente"]); assert.deepEqual(f.map((x) => [x.da, x.a]), [[0, 29], [30, 59], [60, 84], [85, 100]]); assert.equal(f[0].da, 0); assert.equal(f.at(-1).a, 100);
  for (let i = 1; i < f.length; i++) assert.equal(f[i].da, f[i - 1].a + 1, "buco o sovrapposizione tra le fasce");
  for (const x of f) { assert.ok(x.da <= x.a); assert.equal(af.etichettaPunteggio(x.da), x.label); assert.equal(af.etichettaPunteggio(x.a), x.label); }
  for (let p = 0; p <= 100; p++) assert.equal(f.filter((x) => p >= x.da && p <= x.a).length, 1, `il ${p} sta in una sola fascia`);
});

test("esempi: nove casi, dal migliore al peggiore, ciascuno con il punteggio e l'etichetta che dà davvero il calcolo; sono i casi della tabella", () => {
  const e = af.esempiAffidabilita(); assert.equal(e.length, 9); assert.equal(new Set(e.map((x) => x.descrizione)).size, 9);
  assert.deepEqual(e.map((x) => x.punteggio), [100, 80, 50, 30, 40, 20, 0, 0, 0]); assert.deepEqual(e.map((x) => x.label), ["Eccellente", "Molto buona", "Buona", "Buona", "Buona", "Scarsa", "Scarsa", "Scarsa", "Da completare"]);
  assert.ok(e.every((x) => x.label === "Da completare" || x.label === af.etichettaPunteggio(x.punteggio))); assert.equal(e[5].descrizione, "Reddito verificato e protesti", "il caso del difetto di prima c'è, e dice «Scarsa»"); assert.equal(e.at(-1).descrizione, "Protesti non indicati");
});

// ============================================================ il riepilogo e l'informativa, disegnati davvero
const SENZA_BADGE = { raccomandato: false, autoriPositivi: 0, mancano: 2, negativa: false };
const html = (input, recensioni, gestori = { onCome: () => {}, onVai: () => {} }, raccomandazione = SENZA_BADGE) => renderToStaticMarkup(React.createElement(riepilogo.RiepilogoAffidabilita, { affidabilita: af.computeAffidabilita(input), recensioni, raccomandazione, ...gestori }));
const testoDi = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const NESSUNA = { numero: 0, media: null };
const nBottoni = (h) => (h.match(/<button/g) ?? []).length;
const VUOTO = { verificato: false, protestato: null, garante: null, fideiussione: null };

test("riepilogo, senza niente: la voce dei protesti è «non indicati» e TOGLIE 30; i tre suggerimenti e il link sono pulsanti; si dice a quanto si può arrivare e che non scende sotto 0", () => {
  const h = html(VUOTO, NESSUNA); const t = testoDi(h);
  for (const x of ["0 /100", "Da completare", "Come viene calcolato il punteggio ›", "0 su 50", "Protesti non indicati", "−30", "0 su 20", "Verifica il tuo reddito", "Indica i protesti nei tuoi dati", "Indica un garante o una fideiussione", "arrivi a 100", "Il punteggio non scende sotto 0", "Nessuna recensione ancora"]) assert.ok(t.includes(x), `manca «${x}»: ${t}`);
  assert.equal(nBottoni(h), 5, "il link + i tre suggerimenti + «Come funziona» del badge"); assert.match(h, /class="aff-voce is-negativa"/, "la voce che toglie punti ha il suo aspetto"); for (const vietato of ["Punto di partenza", "Dati che indichi"]) assert.ok(!t.includes(vietato), `non deve esserci «${vietato}»`);
});

test("riepilogo, con protesti dichiarati: «Protesti dichiarati −30», nessun suggerimento sui protesti (non c'è niente da correggere), e a quanto si può arrivare tiene conto dei −30", () => {
  const h = html({ verificato: false, protestato: true, garante: null, fideiussione: null }, NESSUNA); const t = testoDi(h);
  for (const x of ["0 /100", "Scarsa", "Protesti dichiarati", "−30", "tolgono 30 punti", "arrivi a 40"]) assert.ok(t.includes(x), `manca «${x}»: ${t}`); assert.ok(!t.includes("Indica i protesti nei tuoi dati")); assert.ok(!t.includes("Da completare"), "con la risposta data non si dice «Da completare»");
  const conRedditoEGarante = testoDi(html({ verificato: true, protestato: true, garante: true, fideiussione: null }, NESSUNA)); assert.ok(conRedditoEGarante.includes("40 /100") && conRedditoEGarante.includes("Buona") && !conRedditoEGarante.includes("arrivi a"), "al massimo possibile non resta niente da completare: " + conRedditoEGarante.slice(0, 200));
});

test("riepilogo, con tutto: +50 +30 +20, resta il link e «Come funziona», nessun invito a completare, nessun «−»", () => {
  const h = html({ verificato: true, protestato: false, garante: true, fideiussione: null }, { numero: 3, media: 4.3 }); const t = testoDi(h);
  for (const x of ["100 /100", "Eccellente", "+50", "+30", "+20", "Controllato dallo staff sui tuoi documenti", "Nessun protesto"]) assert.ok(t.includes(x), `manca «${x}»`); assert.equal(nBottoni(h), 2, "il link e «Come funziona» del badge: nessun suggerimento"); assert.ok(!t.includes("arrivi a") && !t.includes("0 su") && !t.includes("−") && !t.includes("sotto 0"), "con tutto preso non c'è niente da completare"); assert.ok(!/is-negativa/.test(h));
});

test("riepilogo: chi controlla cosa è scritto sotto ogni voce (una volta lo staff, due la persona); senza il gestore i suggerimenti non sono pulsanti ma il link sì", () => {
  const h = html(VUOTO, NESSUNA); assert.equal((h.match(/Lo controlla lo staff/g) ?? []).length, 1); assert.equal((h.match(/Lo dichiari tu/g) ?? []).length, 2);
  const senza = html(VUOTO, NESSUNA, { onCome: () => {} }); assert.equal(nBottoni(senza), 2, "il link e «Come funziona»: i suggerimenti non sono pulsanti"); assert.ok(testoDi(senza).includes("Verifica il tuo reddito"), "il suggerimento si legge anche senza pulsante");
});

test("riepilogo: le recensioni si VEDONO (stelle, media e quante sono), anche quando non ce ne sono, dicono che stanno a parte e non sono nascoste", () => {
  const con = html(VUOTO, { numero: 3, media: 4.3 }); const senza = html(VUOTO, NESSUNA);
  assert.ok(testoDi(con).includes("★★★★☆ 4,3 su 5 · 3 recensioni"), testoDi(con).slice(-200)); assert.ok(testoDi(senza).includes("☆☆☆☆☆ Nessuna recensione ancora"));
  for (const h of [con, senza]) { const blocco = h.slice(h.indexOf("aff-recensioni") - 20, h.indexOf("aff-recensioni") + 260); assert.ok(!/\shidden(=|\s|>)/.test(blocco), "il blocco delle recensioni è nascosto"); assert.ok(blocco.includes('aria-label="Recensioni: '), "senza un nome per chi usa un lettore di schermo"); assert.ok(testoDi(h).includes("Le recensioni stanno a parte: non cambiano il punteggio.")); }
});

test("riepilogo: il link apre l'informativa e ogni suggerimento porta all'ancora giusta della scheda (reddito → verifica, protesti, garante)", () => {
  const eventi = []; const albero = riepilogo.RiepilogoAffidabilita({ affidabilita: af.computeAffidabilita(VUOTO), recensioni: NESSUNA, raccomandazione: SENZA_BADGE, onCome: () => eventi.push("come"), onVai: (x) => eventi.push(x) });
  const bottoni = []; const visita = (n) => { if (!n || typeof n !== "object") return; if (Array.isArray(n)) return n.forEach(visita); if (n.type === "button") bottoni.push(n); visita(n.props?.children); }; visita(albero);
  assert.equal(bottoni.length, 5); for (const b of bottoni) b.props.onClick(); assert.deepEqual(eventi, ["come", "dati-verifica", "dati-protesti", "dati-garante", "come"], "il link, i tre suggerimenti e «Come funziona» (che apre la stessa informativa)"); assert.deepEqual(riepilogo.ANCORE_VOCI, { reddito: "dati-verifica", protesti: "dati-protesti", garanzia: "dati-garante" });
});

test("informativa «come viene calcolato»: tre voci con i punti (i protesti +30 o −30), le quattro fasce con gli estremi, «Da completare», tutti i casi, le recensioni a parte; nessun pulsante e nessun dato personale", () => {
  const h = renderToStaticMarkup(React.createElement(come.ComeSiCalcola)); const t = testoDi(h);
  for (const x of ["da 0 a 100", "due danno punti, i protesti li tolgono", "Non scende sotto 0", "Reddito verificato +50", "Protesti +30 o −30", "Garante o fideiussione +20", "«non indicato» vale come «sì»", "La domanda è obbligatoria", "Lo controlla lo staff", "Se cambi lavoro o reddito la verifica decade", "Le fasce", "Scarsa 0–29", "Buona 30–59", "Molto buona 60–84", "Eccellente 85–100", "Finché non rispondi alla domanda sui protesti, al posto della fascia vedi «Da completare»", "Tutti i casi", "Reddito verificato, nessun protesto, garante o fideiussione 100 · Eccellente", "Reddito verificato e protesti 20 · Scarsa", "Protesti non indicati 0 · Da completare", "Con le sole dichiarazioni non si va oltre «Buona»", "solo con reddito verificato e garante", "Le recensioni, a parte"]) assert.ok(t.includes(x), `manca «${x}»: ${t.slice(0, 400)}`);
  assert.equal(nBottoni(h), 0, "è solo un'informativa: nessuna azione"); for (const personale of ["Il tuo punteggio", "Hai ", "Completando"]) assert.ok(!t.includes(personale), `contiene «${personale}»: non deve dipendere da chi la legge`);
});

test("informativa: i numeri vengono dalle regole del calcolo (nessun punteggio scritto a mano) e dice lo stesso di ciò che il calcolo fa", () => {
  const c = leggi("src", "components", "ComeSiCalcola.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const r = leggi("src", "components", "RiepilogoAffidabilita.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(!/\b(50|30|20|60|85|29|59|84|40)\b/.test(c), "un numero di punteggio scritto a mano nella spiegazione"); assert.match(c, /fasceAffidabilita\(\)/); assert.match(c, /esempiAffidabilita\(\)/); assert.match(c, /PUNTI_AFFIDABILITA\.reddito/); assert.match(c, /PUNTI_AFFIDABILITA\.protesti/);
  assert.ok(!/\b(50|30|20)\b/.test(r), "un numero di punti scritto a mano nel riepilogo");
});

test("informativa legale: dice che i protesti (o non rispondere) fanno scendere il punteggio, con lo stesso numero della formula e nuova versione senza far riaccettare", () => {
  const inf = caricaTs(path.join(radice, "src", "content", "informativa.ts")); const testo = JSON.stringify(inf.INFORMATIVA);
  assert.ok(testo.includes(`la risposta è obbligatoria e «non indicato» vale come «sì»), il punteggio di affidabilità scende di ${af.PUNTI_AFFIDABILITA.protesti} punti`)); assert.ok(testo.includes("Il punteggio non è mai inferiore a zero"));
  const vN = Number(inf.INFORMATIVA.versione.match(/^2026-10-provvisoria-(\d+)$/)?.[1]); assert.ok(vN >= 22, "versione: " + inf.INFORMATIVA.versione); for (let v = 22; v < vN; v++) assert.ok(inf.INFORMATIVA.equivalenti.includes(`2026-10-provvisoria-${v}`), `la ${v} deve restare equivalente`); assert.ok(inf.INFORMATIVA.equivalenti.every((e) => Number(e.split("-").pop()) >= 20), "le versioni prima della 20 non sono equivalenti: cambia chi vede il profilo");
});

test("stile: una voce che toglie punti ha un aspetto suo (come la voce presa e quella non presa)", () => {
  const css = leggi("src", "app", "globals.css"); assert.match(css, /\.aff-voce\.is-negativa \.aff-punti \{\s+background: rgba\(176, 94, 74, 0\.14\);\s+color: var\(--clay\);/); assert.match(css, /\.aff-voce\.is-presa \.aff-punti \{/); assert.match(css, /\.aff-voce\.is-non-presa \.aff-punti \{/);
  const r = leggi("src", "components", "RiepilogoAffidabilita.tsx"); assert.match(r, /v\.presa \? "is-presa" : v\.punti < 0 \? "is-negativa" : "is-non-presa"/); assert.match(r, /if \(v\.punti < 0\) return `−\$\{Math\.abs\(v\.punti\)\}`;/);
});
