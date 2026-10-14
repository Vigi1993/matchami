/**
 * Test della Home dell'inquilino: il punteggio e le sue voci, la logica della ricerca, e i collegamenti tra la Home,
 * il Profilo e i componenti condivisi. Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const hm = caricaTs(path.join(radice, "src", "lib", "home.ts"));
// con i ritorni a capo di Windows normalizzati
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");

// ============================================================ la ricerca e la Home: logica pura
test("ricerca in una riga: budget, taglio e zone; vuota senza criteri; le zone si accorciano e si contano", () => {
  assert.deepEqual(hm.vociRicerca({ budgetMax: 1300, localiMin: 2, mqMin: 45, zone: ["Isola, Milano", "Navigli, Milano"] }), [`Fino a €${(1300).toLocaleString("it-IT")}`, "Da 2 locali", "Da 45 m²", "Isola, Navigli"]);
  assert.deepEqual(hm.vociRicerca({ budgetMax: null, localiMin: null, mqMin: null, zone: [] }), []); assert.deepEqual(hm.vociRicerca({ budgetMax: 0, localiMin: 0, mqMin: 0, zone: [] }), []);
  assert.deepEqual(hm.vociRicerca({ budgetMax: null, localiMin: 1, mqMin: null, zone: [] }), ["Da 1 locale"]);
  assert.deepEqual(hm.vociRicerca({ budgetMax: null, localiMin: null, mqMin: null, zone: ["A, Milano", "B, Milano", "C, Milano"] }), ["A, B, C"]); assert.deepEqual(hm.vociRicerca({ budgetMax: null, localiMin: null, mqMin: null, zone: ["A, Milano", "B, Milano", "C, Milano", "D, Milano", "E, Milano"] }), ["A, B +3"]);
  assert.deepEqual(hm.vociRicerca({ budgetMax: null, localiMin: null, mqMin: null, zone: ["Isola, Milano", "Isola, Milano", " , Milano"] }), ["Isola"], "doppioni e zone vuote");
  assert.doesNotThrow(() => hm.vociRicerca({ budgetMax: null, localiMin: null, mqMin: null, zone: null }));
});

test("chiave della ricerca: cambia se cambia un parametro, non cambia per l'ordine o i doppioni delle zone né per l'ordine delle caratteristiche", () => {
  const base = { budgetMax: 1300, localiMin: 2, mqMin: 45, zone: ["Isola, Milano", "Navigli, Milano"], interessi: { balcone: 5, ascensore: 3 } }; const k = hm.chiaveRicerca(base);
  assert.equal(hm.chiaveRicerca({ ...base, zone: ["Navigli, Milano", "Isola, Milano", "Isola, Milano"] }), k); assert.equal(hm.chiaveRicerca({ ...base, interessi: { ascensore: 3, balcone: 5 } }), k);
  const diverse = [{ budgetMax: 1250 }, { budgetMax: null }, { localiMin: 3 }, { localiMin: null }, { mqMin: 50 }, { mqMin: null }, { zone: ["Isola, Milano"] }, { zone: [] }, { zone: ["Isola, Milano", "Bicocca, Milano"] }, { interessi: {} }, { interessi: { balcone: 6, ascensore: 3 } }, { interessi: { balcone: 5, ascensore: 3, terrazzo: 1 } }];
  const viste = new Set([k]); for (const d of diverse) { const x = hm.chiaveRicerca({ ...base, ...d }); assert.notEqual(x, k, JSON.stringify(d)); viste.add(x); } assert.equal(viste.size, diverse.length + 1, "due ricerche diverse hanno la stessa chiave");
  assert.doesNotThrow(() => hm.chiaveRicerca({ budgetMax: null, localiMin: null, mqMin: null, zone: null, interessi: null }));
});

test("conteggio delle case: singolare, plurale, zero, con e senza criteri; «oltre» solo se ce ne sono", () => {
  const c = (mostraMatch, inRicerca, oltre, totale) => hm.conteggioCase({ mostraMatch, inRicerca, oltre, totale });
  assert.deepEqual(c(true, 2, 1, 3), { principale: "2 case in linea con la tua ricerca", secondario: "+ 1 oltre la ricerca" }); assert.deepEqual(c(true, 1, 0, 1), { principale: "1 casa in linea con la tua ricerca", secondario: null }); assert.deepEqual(c(true, 0, 2, 2), { principale: "Nessuna casa in linea con la tua ricerca", secondario: "+ 2 oltre la ricerca" });
  assert.deepEqual(c(false, 0, 0, 3), { principale: "3 case disponibili", secondario: "Imposta la ricerca per vedere quelle in linea con te" }); assert.equal(c(false, 0, 0, 1).principale, "1 casa disponibile"); assert.equal(c(false, 0, 0, 0).principale, "Nessuna casa disponibile");
});

test("suggerimento sotto la card: tocca i lati se ci sono più foto, altrimenti trascina; mai il centro né i dettagli", () => {
  for (const n of [2, 3, 10]) assert.equal(hm.suggerimentoCard(n), "Tocca ai lati per le foto"); for (const n of [0, 1, -1, NaN, undefined]) assert.equal(hm.suggerimentoCard(n), "Trascina per scegliere", String(n));
  for (const n of [0, 1, 3]) assert.ok(!/centro|dettagli/i.test(hm.suggerimentoCard(n)));
});

test("collegamenti al Profilo: solo sezioni ammesse; qualunque altro valore non apre niente", () => {
  for (const s of ["affidabilita", "dati", "ricerca", "invito", "affitti", "verifica"]) assert.equal(hm.sezioneProfilo(s), s); assert.equal(hm.sezioneProfilo(["verifica", "dati"]), "verifica");
  for (const x of ["", "Verifica", "verifica ", " verifica", "account", "privacy", "faq", "__proto__", "constructor", "toString", "ricerca;x", "../x", "<script>", null, undefined, 5, {}, [], [""]]) assert.equal(hm.sezioneProfilo(x), null, JSON.stringify(x));
});

test("le sezioni del Profilo che si possono aprire da un collegamento esistono davvero nel Profilo", () => {
  const p = leggi("src", "app", "(app)", "profilo", "ProfiloClient.tsx"); const unione = p.match(/useState<([\s\S]*?)\n  >\(aperturaIniziale\)/)[1];
  for (const s of hm.SEZIONI_PROFILO_APRIBILI) { assert.ok(unione.includes(`"${s}"`), `la sezione «${s}» non è tra quelle del Profilo`); assert.match(p, new RegExp(`open=\\{sheetAperta === "${s}"\\}`), `nessuna scheda per «${s}»`); }
  assert.ok(typeof hm.sezionePerVoce === "undefined", "sezionePerVoce non serve più: ogni voce dice da sola la sua sezione");
});

// ============================================================ i collegamenti nel codice
test("Home: i pulsanti dentro la card non catturano il puntatore, il centro non apre niente, e i dettagli si aprono con il clic", () => {
  const h = leggi("src", "app", "(app)", "HomeClient.tsx"); const giu = h.slice(h.indexOf("function onPointerDown"), h.indexOf("function onPointerMove")); const su = h.slice(h.indexOf("function onPointerUp"), h.indexOf("function fotoPrecedente"));
  assert.ok(giu.indexOf('closest("button, a")') > 0 && giu.indexOf('closest("button, a")') < giu.indexOf("setPointerCapture"), "il controllo sui pulsanti deve venire PRIMA della cattura del puntatore");
  assert.ok(!/setSchedaAperta\(true\)/.test(su), "il rilascio del puntatore apre ancora la scheda (col dito il clic di coda la richiude)"); assert.ok(!/daPulsante/.test(h), "resta il vecchio meccanismo del pulsante");
  assert.match(h, /className="card-dettagli"\s+onClick=\{\(\) => setSchedaAperta\(true\)\}/); assert.ok(!/tabIndex=\{-1\}/.test(h), "pulsante fuori dalla tastiera");
  assert.ok(!/al centro per i dettagli/i.test(h) && !/Tocca per i dettagli/.test(h), "il suggerimento parla ancora del centro"); assert.match(h, /suggerimentoCard\(numeroFoto\)/);
});

test("Home: la ricerca si cambia da qui (nessun collegamento al Profilo), la scheda è montata solo se aperta e il mazzo si ricomincia con la chiave", () => {
  const h = leggi("src", "app", "(app)", "HomeClient.tsx");
  assert.ok(!/href="\/profilo"/.test(h) && !/from "next\/link"/.test(h), "c'è ancora un collegamento al Profilo"); assert.ok(!/Profilo → La tua ricerca/.test(h), "un testo manda ancora al Profilo");
  assert.match(h, /\{schedaRicerca && \(\s+<RicercaSheet/); assert.ok(!/key=\{chiaveRicerca\}/.test(h), "la scheda con una key che cambia viene smontata prima di dire «salvato»");
  assert.match(h, /if \(chiaveRicerca !== chiaveVista\) \{[\s\S]*?setMazzo\(listings\);[\s\S]*?setIndex\(0\);[\s\S]*?setStoria\(\[\]\);/); assert.match(h, /const \[mazzo, setMazzo\] = useState\(listings\)/);
  assert.match(h, /onSalvata=\{\(\) => \{\s+setSchedaRicerca\(false\);\s+setAvviso\(\{ errore: false, testo: "Ricerca aggiornata\." \}\);/);
});

test("Home: nel pannello dell'affidabilità ci sono DUE pulsanti veri («Come si calcola» e «Modifica dati»); l'anello non è un pulsante", () => {
  const h = leggi("src", "app", "(app)", "HomeClient.tsx"); const pannello = h.slice(h.indexOf('<div className="hi-punteggio"'), h.indexOf('<div className="hi-ricerca">'));
  assert.match(pannello, /<div className="hi-punteggio" role="group" aria-label=\{`Affidabilità \$\{affidabilita\.punteggio\} su 100, \$\{affidabilita\.label\}`\}>/);
  assert.match(pannello, /<button type="button" className="hi-azione" onClick=\{\(\) => setSchedaPunteggio\(true\)\}>\s+Come si calcola\s+<\/button>/); assert.match(pannello, /<button type="button" className="hi-azione" onClick=\{\(\) => setSchedaDati\(true\)\}>\s+Modifica dati\s+<\/button>/);
  assert.equal([...pannello.matchAll(/<button/g)].length, 2, "ci devono essere due pulsanti e non di più"); assert.ok(!/hi-punteggio-cta/.test(h), "resta la vecchia scritta «Come si calcola ›» dentro un pulsante unico");
  const pg = leggi("src", "app", "(app)", "page.tsx"); assert.match(pg, /ricerca=\{profiloRicerca\}/); assert.match(pg, /recensioni=\{riepilogo\}\s+tenant=\{tenantProfile\}/);
});

test("Home: «Modifica dati» apre la scheda dei dati qui (stessa del Profilo), montata solo se aperta; salvando si chiude e lo dice; la verifica del reddito resta nel Profilo", () => {
  const h = leggi("src", "app", "(app)", "HomeClient.tsx"); assert.match(h, /import \{ DatiPersonaliSheet \} from "@\/components\/DatiPersonaliSheet"/);
  assert.match(h, /\{schedaDati && \(\s+<DatiPersonaliSheet\s+open\s+onClose=\{\(\) => setSchedaDati\(false\)\}\s+tenant=\{tenant\}\s+onSalvata=\{\(\) => \{\s+setSchedaDati\(false\);\s+setAvviso\(\{ errore: false, testo: "Dati aggiornati\." \}\);/);
  assert.match(h, /if \(sezione === "dati"\) setSchedaDati\(true\);\s+else router\.push\("\/profilo\?apri=verifica"\);/); assert.ok(!/href="\/profilo"/.test(h));
});

test("Profilo: usa le schede condivise (ricerca, dati, punteggio: nessuna copia), legge ?apri= e passa le recensioni a parte", () => {
  const p = leggi("src", "app", "(app)", "profilo", "ProfiloClient.tsx"); assert.match(p, /import \{ RicercaSheet \} from "@\/components\/RicercaSheet"/); assert.match(p, /import \{ DatiPersonaliSheet \} from "@\/components\/DatiPersonaliSheet"/);
  assert.ok(!/function RicercaSheet/.test(p) && !/function DatiPersonaliSheet/.test(p) && !/function SaveButton/.test(p), "il Profilo ha ancora una copia di una scheda");
  assert.match(p, /<SchedaAffidabilita affidabilita=\{affidabilita\} recensioni=\{recensioni\} onApri=\{\(sezione\) => setSheetAperta\(sezione\)\} \/>/); assert.ok(!/hasRecensioni|\.checks/.test(p), "il Profilo usa ancora i campi vecchi");
  const pg = leggi("src", "app", "(app)", "profilo", "page.tsx"); assert.match(pg, /sezioneProfilo\(\(await searchParams\)\.apri\)/); assert.match(pg, /searchParams: Promise<\{ apri\?: string \| string\[\] \}>/); assert.match(pg, /recensioni=\{riepilogo\}/);
});

test("scheda di ricerca condivisa: avvisa UNA volta per ogni salvataggio che finisce bene, e il salvataggio aggiorna anche la Home", () => {
  const r = leggi("src", "components", "RicercaSheet.tsx"); assert.match(r, /export function RicercaSheet/); assert.match(r, /if \(pending\) \{\s+eraInCorso\.current = true;\s+return;\s+\}\s+if \(eraInCorso\.current\) \{\s+eraInCorso\.current = false;\s+if \(state\?\.ok\) onSalvata\?\.\(\);/); assert.ok(!/salvataggioNotificato/.test(r), "si confronta ancora l'oggetto dello stato");
  const a = leggi("src", "app", "(app)", "profilo", "actions.ts"); const f = a.slice(a.indexOf("export async function updateRicerca")); assert.match(f, /revalidatePath\("\/profilo"\);\s+revalidatePath\("\/"\);/, "la Home non si aggiorna dopo il salvataggio");
});

test("scheda del punteggio: i punti vengono dalla funzione del punteggio (nessun numero scritto a mano), con la voce, chi la controlla e le recensioni a parte", () => {
  const c = leggi("src", "components", "SchedaAffidabilita.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(!/\b(60|25|15)\b/.test(c), "un numero di punti scritto a mano"); assert.match(c, /voci\.map\(\(v\) =>/); assert.match(c, /punteggioPossibile\(affidabilita\)/); assert.match(c, /Lo controlla lo staff/); assert.match(c, /Lo dichiari tu/); assert.match(c, /Le recensioni, a parte/); assert.ok(!/checks|limite|totaleGrezzo/.test(c), "usa campi che non esistono più");
});

test("CSS: il suggerimento sta sopra i pulsanti e la card sopra il suggerimento (prima il testo finiva dietro i pulsanti)", () => {
  const css = leggi("src", "app", "globals.css"); const base = css.slice(0, css.indexOf("@media")); const px = (re) => Number(base.match(re)[1]);
  const pulsanti = px(/\.actions \{[^}]*?bottom: (\d+)px/); const suggerimento = px(/\.swipe-hint \{[^}]*?bottom: (\d+)px/); const card = px(/\.card-info \{[^}]*?bottom: (\d+)px/);
  assert.ok(suggerimento >= pulsanti + 64 + 8, `il suggerimento (${suggerimento}px) tocca i pulsanti (${pulsanti}px + 64)`); assert.ok(card >= suggerimento + 16, `la card (${card}px) tocca il suggerimento (${suggerimento}px)`);
});
