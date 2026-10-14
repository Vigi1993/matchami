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
/** La regola, riscritta a parte: 60 + 25 + 15. */
const oracolo = (p) => (p.verificato ? 60 : 0) + (p.protestato === false ? 25 : 0) + (p.garante === true || p.fideiussione === true ? 15 : 0);
const calcola = (o = {}) => af.computeAffidabilita({ verificato: false, protestato: null, garante: null, fideiussione: null, ...o });

// ============================================================ il punteggio
test("punteggio: 60 + 25 + 15, per OGNI combinazione (54 casi), mai negativo e mai oltre 100", () => {
  let n = 0;
  for (const p of tutte()) { n++; const r = af.computeAffidabilita(p); assert.equal(r.punteggio, oracolo(p), JSON.stringify(p)); assert.ok(Number.isInteger(r.punteggio) && r.punteggio >= 0 && r.punteggio <= 100, String(r.punteggio)); assert.equal(r.punteggio, r.voci.reduce((s, v) => s + v.punti, 0), "la somma delle voci è il punteggio"); }
  assert.equal(n, 54); assert.equal(af.PUNTEGGIO_MINIMO, 0); assert.equal(af.PUNTEGGIO_MASSIMO, 100); assert.deepEqual(af.PUNTI_AFFIDABILITA, { reddito: 60, protesti: 25, garanzia: 15 });
});

test("chi non ha niente ha 0; «protestato» e «non indicato» valgono lo stesso (niente punti); il massimo è 100", () => {
  assert.equal(calcola().punteggio, 0); assert.equal(calcola({ protestato: true }).punteggio, 0); assert.equal(calcola({ protestato: null }).punteggio, calcola({ protestato: true }).punteggio);
  assert.equal(calcola({ verificato: true, protestato: false, garante: true }).punteggio, 100); assert.equal(calcola({ verificato: true, protestato: false, fideiussione: true }).punteggio, 100);
});

test("i soli punteggi possibili sono 8: 0, 15, 25, 40, 60, 75, 85, 100 (ogni caso è distinguibile)", () => {
  assert.deepEqual([...new Set([...tutte()].map((p) => af.computeAffidabilita(p).punteggio))].sort((a, b) => a - b), [0, 15, 25, 40, 60, 75, 85, 100]);
});

test("il reddito verificato da solo (60) batte le due dichiarazioni insieme (40)", () => {
  assert.ok(calcola({ verificato: true }).punteggio > calcola({ protestato: false, garante: true }).punteggio);
});

test("garante o fideiussione valgono +15 una volta sola, anche se ci sono entrambi; «no» non dà punti", () => {
  assert.equal(calcola({ garante: true, fideiussione: true }).punteggio, 15); assert.equal(calcola({ garante: false, fideiussione: false }).punteggio, 0); assert.equal(calcola({ garante: true, fideiussione: false }).punteggio, 15); assert.equal(calcola({ garante: false, fideiussione: true }).punteggio, 15);
});

test("etichette: Da costruire sotto 40, Buona da 40, Molto buona da 60, Eccellente da 85; le sole dichiarazioni non arrivano mai a «Molto buona»", () => {
  const e = af.etichettaPunteggio; assert.deepEqual([0, 15, 25, 39, 40, 59, 60, 75, 84, 85, 100].map(e), ["Da costruire", "Da costruire", "Da costruire", "Da costruire", "Buona", "Buona", "Molto buona", "Molto buona", "Molto buona", "Eccellente", "Eccellente"]);
  assert.deepEqual(af.SOGLIE_ETICHETTA, { buona: 40, moltoBuona: 60, eccellente: 85 });
  for (const p of tutte()) { const r = af.computeAffidabilita(p); assert.equal(r.label, e(r.punteggio)); if (!p.verificato) assert.ok(r.label !== "Molto buona" && r.label !== "Eccellente", `${JSON.stringify(p)} → ${r.label}`); }
});

// ============================================================ le voci
test("voci: sempre le stesse tre, nell'ordine, con una coerenza interna tra stato, punti, potenziale, origine e dove si fa", () => {
  for (const p of tutte()) {
    const r = af.computeAffidabilita(p); assert.deepEqual(r.voci.map((v) => v.id), ["reddito", "protesti", "garanzia"]);
    for (const v of r.voci) {
      assert.equal(v.origine, v.id === "reddito" ? "verificato" : "dichiarato", `${v.id}: solo il reddito lo controlla lo staff (anche quando è preso)`);
      assert.ok(Number.isInteger(v.punti) && v.punti >= 0, `${v.id}: punti negativi o non interi`); assert.equal(v.punti, v.presa ? v.massimo : 0); assert.ok(v.nota.length > 5);
      if (v.presa) { assert.equal(v.potenziale, 0); assert.equal(v.suggerimento, null); assert.equal(v.sezione, null); }
      else { assert.ok(v.potenziale === 0 || v.potenziale === v.massimo); if (v.potenziale > 0) { assert.equal(typeof v.suggerimento, "string"); assert.ok(["verifica", "dati"].includes(v.sezione)); } else { assert.equal(v.suggerimento, null); assert.equal(v.sezione, null); } }
    }
  }
});

test("voci: chi controlla cosa (solo il reddito lo controlla lo staff) e dove si completa", () => {
  const r = calcola(); const [red, pro, gar] = r.voci;
  assert.deepEqual([red.origine, pro.origine, gar.origine], ["verificato", "dichiarato", "dichiarato"]); assert.deepEqual([red.massimo, pro.massimo, gar.massimo], [60, 25, 15]);
  assert.deepEqual([red.sezione, pro.sezione, gar.sezione], ["verifica", "dati", "dati"]); assert.equal(red.suggerimento, "Verifica il tuo reddito"); assert.equal(pro.suggerimento, "Indica i protesti nei tuoi dati"); assert.equal(gar.suggerimento, "Indica un garante o una fideiussione");
  assert.match(calcola({ verificato: true }).voci[0].nota, /staff/); assert.match(calcola({ protestato: false }).voci[1].nota, /Nessuno lo controlla/); assert.match(calcola({ garante: true }).voci[2].nota, /Nessuno lo controlla/);
});

test("protesti: «No» dà i punti; «Sì» e «non indicato» no, ma solo il «non indicato» si può completare (chi ha dichiarato dei protesti non ha niente da guadagnare)", () => {
  const no = calcola({ protestato: false }).voci[1]; const si = calcola({ protestato: true }).voci[1]; const nd = calcola({ protestato: null }).voci[1];
  assert.deepEqual([no.presa, no.punti], [true, 25]); assert.deepEqual([si.presa, si.punti, si.potenziale, si.suggerimento], [false, 0, 0, null]); assert.match(si.nota, /dichiarato dei protesti/); assert.deepEqual([nd.presa, nd.punti, nd.potenziale], [false, 0, 25]); assert.match(nd.nota, /Non indicato/);
});

test("punteggio possibile: quello di oggi più le voci ottenibili, mai oltre 100; con tutto preso non c'è niente da guadagnare; protesti dichiarati non si contano", () => {
  for (const p of tutte()) { const r = af.computeAffidabilita(p); const possibile = af.punteggioPossibile(r); assert.ok(possibile >= r.punteggio && possibile <= 100); assert.equal(possibile, r.punteggio + r.voci.reduce((s, v) => s + v.potenziale, 0)); }
  assert.equal(af.punteggioPossibile(calcola()), 100); assert.equal(af.punteggioPossibile(calcola({ protestato: true })), 75, "con i protesti dichiarati il massimo è 75"); assert.equal(af.punteggioPossibile(calcola({ verificato: true, protestato: false, garante: true })), 100);
});

test("gli input che non servono più non cambiano il punteggio (professione, reddito dichiarato, recensioni non ne fanno parte)", () => {
  const base = { verificato: true, protestato: false, garante: null, fideiussione: null };
  assert.equal(af.computeAffidabilita({ ...base, professione: "Designer", reddito_mensile: 9999, mediaRecensioni: 1, numeroRecensioni: 9 }).punteggio, af.computeAffidabilita(base).punteggio);
  for (const vecchio of ["checks", "hasRecensioni", "limite", "totaleGrezzo"]) assert.equal(vecchio in calcola(), false, vecchio);
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
  const d = leggi("src", "app", "(app)", "database", "DatabaseClient.tsx"); assert.match(d, /label="Recensioni"/); assert.match(d, /selezionata\.valutazione\?\.recensioni/); assert.match(d, /recensioni: c\.valutazione!\.recensioni \?\? null/);
  const c = leggi("src", "lib", "candidati.ts"); assert.match(c, /recensioni: riepilogoRecensioni\(voti\)/); const x = leggi("src", "app", "(app)", "database", "actions.ts"); assert.match(x, /recensioni: riepilogoRecensioni\(voti\)/);
});

test("nessun posto del codice calcola ancora la media delle recensioni a mano né le dà al punteggio", () => {
  const cartella = path.join(radice, "src"); const trovati = [];
  const visita = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) visita(p); else if (/\.(ts|tsx)$/.test(e.name)) { const t = fs.readFileSync(p, "utf8"); if (/mediaRecensioni|numeroRecensioni/.test(t)) trovati.push(path.relative(cartella, p)); } } };
  visita(cartella); assert.deepEqual(trovati, [], "campi vecchi ancora in uso: " + trovati.join(", "));
});

// ============================================================ le fasce e gli esempi
test("fasce: coprono da 0 a 100 senza buchi né sovrapposizioni, e ogni estremo cade nell'etichetta giusta", () => {
  const f = af.fasceAffidabilita(); assert.deepEqual(f.map((x) => x.label), ["Da costruire", "Buona", "Molto buona", "Eccellente"]); assert.equal(f[0].da, 0); assert.equal(f.at(-1).a, 100);
  for (let i = 1; i < f.length; i++) assert.equal(f[i].da, f[i - 1].a + 1, "buco o sovrapposizione tra le fasce");
  for (const x of f) { assert.ok(x.da <= x.a); assert.equal(af.etichettaPunteggio(x.da), x.label); assert.equal(af.etichettaPunteggio(x.a), x.label); }
  for (let p = 0; p <= 100; p++) assert.equal(f.filter((x) => p >= x.da && p <= x.a).length, 1, `il ${p} sta in una sola fascia`);
});

test("esempi: ogni esempio ha il punteggio e l'etichetta che dà davvero il calcolo; il «Tutto» è 100 e «Nessun dato» è 0", () => {
  const e = af.esempiAffidabilita(); assert.equal(e.length, 5); assert.equal(e[0].punteggio, 0); assert.equal(e.at(-1).punteggio, 100); assert.ok(e.every((x) => x.label === af.etichettaPunteggio(x.punteggio)));
  assert.deepEqual(e.map((x) => x.punteggio), [0, 40, 60, 85, 100]); assert.equal(new Set(e.map((x) => x.descrizione)).size, 5);
});

// ============================================================ il riepilogo e l'informativa, disegnati davvero
const html = (input, recensioni, gestori = { onCome: () => {}, onVai: () => {} }) => renderToStaticMarkup(React.createElement(riepilogo.RiepilogoAffidabilita, { affidabilita: af.computeAffidabilita(input), recensioni, ...gestori }));
const testoDi = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const NESSUNA = { numero: 0, media: null };
const nBottoni = (h) => (h.match(/<button/g) ?? []).length;
const VUOTO = { verificato: false, protestato: null, garante: null, fideiussione: null };

test("riepilogo, senza niente: 0 su ogni voce; i tre suggerimenti e il link «come viene calcolato» sono pulsanti; si dice a quanto si può arrivare", () => {
  const h = html(VUOTO, NESSUNA); const t = testoDi(h);
  for (const x of ["0 /100", "Da costruire", "Come viene calcolato il punteggio ›", "0 su 60", "0 su 25", "0 su 15", "Verifica il tuo reddito", "Indica i protesti nei tuoi dati", "Indica un garante o una fideiussione", "arrivi a 100", "Nessuna recensione ancora"]) assert.ok(t.includes(x), `manca «${x}»: ${t}`);
  assert.equal(nBottoni(h), 4, "il link + i tre suggerimenti"); for (const vietato of ["\u2212", "possibili", "Punto di partenza", "Dati che indichi"]) assert.ok(!t.includes(vietato), `non deve esserci «${vietato}»`);
});

test("riepilogo, con tutto: +60 +25 +15, resta solo il link «come viene calcolato», nessun invito a completare", () => {
  const h = html({ verificato: true, protestato: false, garante: true, fideiussione: null }, { numero: 3, media: 4.3 }); const t = testoDi(h);
  for (const x of ["100 /100", "Eccellente", "+60", "+25", "+15", "Controllato dallo staff sui tuoi documenti"]) assert.ok(t.includes(x), `manca «${x}»`); assert.equal(nBottoni(h), 1); assert.ok(!t.includes("arrivi a") && !t.includes("0 su"), "con tutto preso non c'è niente da completare");
});

test("riepilogo: chi controlla cosa è scritto sotto ogni voce (una volta lo staff, due la persona); senza il gestore i suggerimenti non sono pulsanti ma il link sì", () => {
  const h = html(VUOTO, NESSUNA); assert.equal((h.match(/Lo controlla lo staff/g) ?? []).length, 1); assert.equal((h.match(/Lo dichiari tu/g) ?? []).length, 2);
  const senza = html(VUOTO, NESSUNA, { onCome: () => {} }); assert.equal(nBottoni(senza), 1, "solo il link"); assert.ok(testoDi(senza).includes("Verifica il tuo reddito"), "il suggerimento si legge anche senza pulsante");
});

test("riepilogo: le recensioni si VEDONO (stelle, media e quante sono), anche quando non ce ne sono, dicono che stanno a parte e non sono nascoste", () => {
  const con = html(VUOTO, { numero: 3, media: 4.3 }); const senza = html(VUOTO, NESSUNA);
  assert.ok(testoDi(con).includes("★★★★☆ 4,3 su 5 · 3 recensioni"), testoDi(con).slice(-200)); assert.ok(testoDi(senza).includes("☆☆☆☆☆ Nessuna recensione ancora"));
  for (const h of [con, senza]) { const blocco = h.slice(h.indexOf("aff-recensioni") - 20, h.indexOf("aff-recensioni") + 260); assert.ok(!/\shidden(=|\s|>)/.test(blocco), "il blocco delle recensioni è nascosto"); assert.ok(blocco.includes('aria-label="Recensioni: '), "senza un nome per chi usa un lettore di schermo"); assert.ok(testoDi(h).includes("Le recensioni stanno a parte: non cambiano il punteggio.")); }
});

test("riepilogo: il link apre l'informativa e ogni suggerimento porta all'ancora giusta della scheda (reddito → verifica, protesti, garante)", () => {
  const eventi = []; const albero = riepilogo.RiepilogoAffidabilita({ affidabilita: af.computeAffidabilita(VUOTO), recensioni: NESSUNA, onCome: () => eventi.push("come"), onVai: (x) => eventi.push(x) });
  const bottoni = []; const visita = (n) => { if (!n || typeof n !== "object") return; if (Array.isArray(n)) return n.forEach(visita); if (n.type === "button") bottoni.push(n); visita(n.props?.children); }; visita(albero);
  assert.equal(bottoni.length, 4); for (const b of bottoni) b.props.onClick(); assert.deepEqual(eventi, ["come", "dati-verifica", "dati-protesti", "dati-garante"]); assert.deepEqual(riepilogo.ANCORE_VOCI, { reddito: "dati-verifica", protesti: "dati-protesti", garanzia: "dati-garante" });
});

test("informativa «come viene calcolato»: tre voci con i punti, le quattro fasce con gli estremi, gli esempi, le recensioni a parte; nessun pulsante e nessun dato personale", () => {
  const h = renderToStaticMarkup(React.createElement(come.ComeSiCalcola)); const t = testoDi(h);
  for (const x of ["da 0 a 100", "Reddito verificato +60", "Nessun protesto +25", "Garante o fideiussione +15", "Lo controlla lo staff", "Lo dichiari tu", "Se cambi lavoro o reddito la verifica decade", "Le fasce", "Da costruire 0–39", "Buona 40–59", "Molto buona 60–84", "Eccellente 85–100", "Qualche esempio", "Nessun dato 0 · Da costruire", "Tutto 100 · Eccellente", "Le recensioni, a parte", "da 1 a 5 stelle", "conta solo a parità di compatibilità"]) assert.ok(t.includes(x), `manca «${x}»: ${t.slice(0, 300)}`);
  assert.equal(nBottoni(h), 0, "è solo un'informativa: nessuna azione"); for (const personale of ["Il tuo punteggio", "Hai ", "Completando"]) assert.ok(!t.includes(personale), `contiene «${personale}»: non deve dipendere da chi la legge`);
});

test("informativa: i numeri vengono dalle regole del calcolo (nessun punteggio scritto a mano) e dice lo stesso di ciò che il calcolo fa", () => {
  const c = leggi("src", "components", "ComeSiCalcola.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""); assert.ok(!/\b(60|25|15|40|85|99)\b/.test(c), "un numero di punteggio scritto a mano"); assert.match(c, /fasceAffidabilita\(\)/); assert.match(c, /esempiAffidabilita\(\)/); assert.match(c, /PUNTI_AFFIDABILITA\.reddito/);
  const r = leggi("src", "components", "RiepilogoAffidabilita.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""); assert.ok(!/\b(60|25|15)\b/.test(r), "un numero di punti scritto a mano nel riepilogo");
});
