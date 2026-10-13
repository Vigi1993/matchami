/**
 * Test della Home dell'inquilino: il punteggio e le sue voci, la logica della ricerca, e i collegamenti tra la Home,
 * il Profilo e i componenti condivisi. Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const af = caricaTs(path.join(radice, "src", "lib", "affidabilita.ts"));
const hm = caricaTs(path.join(radice, "src", "lib", "home.ts"));
// con i ritorni a capo di Windows normalizzati
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");

// ============================================================ il punteggio: nessun numero è cambiato
/** La formula com'era PRIMA delle voci, riscritta qui a parte: il punteggio non deve essere cambiato per nessuna combinazione. */
function oracolo(p) {
  let s = 45;
  if (p.verificato) s += 20;
  if (p.protestato === false) s += 15;
  if (p.protestato === true) s -= 30;
  if (p.garante === true || p.fideiussione === true) s += 10;
  if (p.numeroRecensioni > 0 && p.mediaRecensioni !== null) s += Math.round((p.mediaRecensioni - 3) * 6);
  return Math.max(5, Math.min(99, Math.round(s)));
}
const tri = [null, false, true];
const recensioni = [{ numeroRecensioni: 0, mediaRecensioni: null }, { numeroRecensioni: 1, mediaRecensioni: 1 }, { numeroRecensioni: 1, mediaRecensioni: 2 }, { numeroRecensioni: 2, mediaRecensioni: 2.5 }, { numeroRecensioni: 3, mediaRecensioni: 3 }, { numeroRecensioni: 2, mediaRecensioni: 3.5 }, { numeroRecensioni: 4, mediaRecensioni: 4.25 }, { numeroRecensioni: 5, mediaRecensioni: 5 }, { numeroRecensioni: 2, mediaRecensioni: null }];
function* tutte() {
  for (const verificato of [false, true]) for (const protestato of tri) for (const garante of tri) for (const fideiussione of tri) for (const r of recensioni)
    yield { verificato, protestato, garante, fideiussione, professione: verificato ? "Designer" : null, reddito_mensile: garante ? 2600 : null, ...r };
}

test("punteggio: identico alla formula di prima per OGNI combinazione (486 casi), e l'etichetta segue le soglie", () => {
  let n = 0;
  for (const p of tutte()) {
    const r = af.computeAffidabilita(p); n++;
    assert.equal(r.punteggio, oracolo(p), JSON.stringify(p));
    assert.equal(r.label, r.punteggio >= 85 ? "Eccellente" : r.punteggio >= 70 ? "Molto buona" : r.punteggio >= 50 ? "Buona" : "Da costruire", JSON.stringify(p));
  }
  assert.equal(n, 486);
});

test("voci: la somma dà il punteggio (stesso calcolo, nessuna divergenza possibile), e il limite si dice quando scatta", () => {
  for (const p of tutte()) {
    const r = af.computeAffidabilita(p); const somma = r.voci.reduce((s, v) => s + v.punti, 0);
    assert.equal(somma, r.totaleGrezzo, JSON.stringify(p)); assert.equal(r.punteggio, Math.max(5, Math.min(99, Math.round(r.totaleGrezzo))));
    assert.equal(r.limite, r.totaleGrezzo > 99 ? "massimo" : r.totaleGrezzo < 5 ? "minimo" : null, `${r.totaleGrezzo}`);
  }
});

test("voci: sempre le stesse cinque, nell'ordine, con una coerenza interna tra stato, punti, potenziale e suggerimento", () => {
  for (const p of tutte()) {
    const r = af.computeAffidabilita(p); assert.deepEqual(r.voci.map((v) => v.id), ["base", "verifica", "protesti", "garanzia", "recensioni"]);
    for (const v of r.voci) {
      assert.ok(Number.isInteger(v.punti) && Number.isInteger(v.potenziale), `${v.id}: punti non interi`); assert.ok(v.etichetta.length > 3);
      if (v.stato === "mancante") { assert.equal(v.punti, 0, `${v.id} mancante con punti`); assert.ok(v.potenziale > 0, `${v.id} mancante senza potenziale`); assert.equal(typeof v.suggerimento, "string"); }
      else { assert.equal(v.potenziale, 0, `${v.id} ${v.stato} con potenziale`); assert.equal(v.suggerimento, null, `${v.id} ${v.stato} con suggerimento`); }
      if (v.stato === "ottenuta") assert.ok(v.punti > 0, `${v.id} ottenuta senza punti`);
      if (v.stato === "negativa") assert.ok(v.punti < 0, `${v.id} negativa senza punti negativi`);
    }
    assert.deepEqual(r.voci[0], { id: "base", etichetta: "Punto di partenza", punti: 45, stato: "neutra", potenziale: 0, suggerimento: null, nota: null });
  }
});

test("voci: i punti di ogni voce sono quelli della formula (+20, +15 o −30, +10, e le recensioni da −12 a +12)", () => {
  const base = { verificato: false, protestato: null, garante: null, fideiussione: null, professione: null, reddito_mensile: null, mediaRecensioni: null, numeroRecensioni: 0 };
  const v = (o, id) => af.computeAffidabilita({ ...base, ...o }).voci.find((x) => x.id === id);
  assert.equal(v({ verificato: true }, "verifica").punti, 20); assert.equal(v({}, "verifica").potenziale, 20);
  assert.equal(v({ protestato: false }, "protesti").punti, 15); assert.equal(v({ protestato: true }, "protesti").punti, -30); assert.equal(v({}, "protesti").potenziale, 15); assert.equal(v({}, "protesti").stato, "mancante");
  assert.equal(v({ garante: true }, "garanzia").punti, 10); assert.equal(v({ fideiussione: true }, "garanzia").punti, 10); assert.equal(v({ garante: false, fideiussione: false }, "garanzia").stato, "mancante");
  for (const [media, atteso] of [[1, -12], [2, -6], [3, 0], [4, 6], [5, 12]]) assert.equal(v({ numeroRecensioni: 3, mediaRecensioni: media }, "recensioni").punti, atteso, `media ${media}`);
  assert.equal(v({}, "recensioni").potenziale, 12, "con tutte a 5 stelle varrebbe +12 (il voto è da 1 a 5)"); assert.equal(v({ numeroRecensioni: 1, mediaRecensioni: 3 }, "recensioni").stato, "neutra");
  assert.match(v({ numeroRecensioni: 1, mediaRecensioni: 4 }, "recensioni").nota, /^Media 4 su 5, 1 recensione$/); assert.match(v({ numeroRecensioni: 3, mediaRecensioni: 4.5 }, "recensioni").nota, /^Media 4,5 su 5, 3 recensioni$/);
});

test("il voto delle recensioni è da 1 a 5 nel database (da cui il +12 massimo mostrato)", () => {
  assert.match(leggi("supabase", "migrations", "0001_init.sql"), /voto smallint not null check \(voto between 1 and 5\)/);
});

test("limiti: tutto in regola con 5 stelle somma 102 e il punteggio è 99; il peggio somma 3 e il punteggio è 5", () => {
  const alto = af.computeAffidabilita({ verificato: true, protestato: false, garante: true, fideiussione: false, professione: "x", reddito_mensile: 1, mediaRecensioni: 5, numeroRecensioni: 2 }); assert.equal(alto.totaleGrezzo, 102); assert.equal(alto.punteggio, 99); assert.equal(alto.limite, "massimo");
  const basso = af.computeAffidabilita({ verificato: false, protestato: true, garante: false, fideiussione: false, professione: null, reddito_mensile: null, mediaRecensioni: 1, numeroRecensioni: 2 }); assert.equal(basso.totaleGrezzo, 3); assert.equal(basso.punteggio, 5); assert.equal(basso.limite, "minimo");
  assert.equal(af.PUNTI_BASE, 45); assert.equal(af.PUNTEGGIO_MINIMO, 5); assert.equal(af.PUNTEGGIO_MASSIMO, 99);
});

test("punteggio possibile: mai sotto l'attuale, mai oltre 99, e uguale alla somma con le voci mancanti completate", () => {
  for (const p of tutte()) {
    const r = af.computeAffidabilita(p); const possibile = af.punteggioPossibile(r); const guadagno = r.voci.reduce((s, v) => s + (v.stato === "mancante" ? v.potenziale : 0), 0);
    assert.ok(possibile <= 99 && possibile >= 5, `${possibile}`); assert.equal(possibile, Math.max(5, Math.min(99, Math.round(r.totaleGrezzo + guadagno))));
    if (r.punteggio < 99 || guadagno === 0) assert.ok(possibile >= r.punteggio, `${possibile} < ${r.punteggio}`);
  }
  const tutto = af.computeAffidabilita({ verificato: true, protestato: false, garante: true, fideiussione: false, professione: "x", reddito_mensile: 1, mediaRecensioni: 4, numeroRecensioni: 1 }); assert.equal(af.punteggioPossibile(tutto), tutto.punteggio, "con tutto fatto non c'è niente da guadagnare");
});

test("i controlli «dati che indichi» sono professione e reddito dichiarato, nei primi due posti (la scheda ne mostra solo quelli)", () => {
  const con = af.computeAffidabilita({ verificato: false, protestato: null, garante: null, fideiussione: null, professione: "Designer", reddito_mensile: 2600, mediaRecensioni: null, numeroRecensioni: 0 });
  assert.deepEqual(con.checks.slice(0, 2).map((c) => [c.ok, c.label]), [[true, "Designer"], [true, "Reddito dichiarato €2600/mese".replace("€2600", "€" + (2600).toLocaleString("it-IT"))]]);
  const senza = af.computeAffidabilita({ verificato: false, protestato: null, garante: null, fideiussione: null, professione: null, reddito_mensile: null, mediaRecensioni: null, numeroRecensioni: 0 });
  assert.deepEqual(senza.checks.slice(0, 2).map((c) => [c.ok, c.label]), [[false, "Situazione lavorativa da indicare"], [false, "Reddito da indicare"]]);
  assert.equal(con.checks.length, 5);
});

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

test("ogni voce del punteggio porta a una sezione ammessa, e quelle sezioni esistono davvero nel Profilo", () => {
  const ids = af.computeAffidabilita({ verificato: false, protestato: null, garante: null, fideiussione: null, professione: null, reddito_mensile: null, mediaRecensioni: null, numeroRecensioni: 0 }).voci.map((v) => v.id);
  for (const id of ids) assert.ok(hm.SEZIONI_PROFILO_APRIBILI.includes(hm.sezionePerVoce(id)), id); assert.deepEqual(["verifica", "protesti", "garanzia", "recensioni"].map(hm.sezionePerVoce), ["verifica", "dati", "dati", "invito"]);
  const p = leggi("src", "app", "(app)", "profilo", "ProfiloClient.tsx"); const unione = p.match(/useState<([\s\S]*?)\n  >\(aperturaIniziale\)/)[1]; for (const s of hm.SEZIONI_PROFILO_APRIBILI) { assert.ok(unione.includes(`"${s}"`), `la sezione «${s}» non è tra quelle del Profilo`); assert.match(p, new RegExp(`open=\\{sheetAperta === "${s}"\\}`), `nessuna scheda per «${s}»`); }
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

test("Home: il punteggio è un pulsante con un nome che dice cosa fa e apre la scheda; la pagina passa la ricerca", () => {
  const h = leggi("src", "app", "(app)", "HomeClient.tsx"); assert.match(h, /className="hi-punteggio"\s+onClick=\{\(\) => setSchedaPunteggio\(true\)\}\s+aria-label=\{`Affidabilità \$\{affidabilita\.punteggio\} su 100, \$\{affidabilita\.label\}\. Scopri come si calcola`\}/);
  assert.match(h, /router\.push\(`\/profilo\?apri=\$\{sezione\}`\)/); const pg = leggi("src", "app", "(app)", "page.tsx"); assert.match(pg, /ricerca=\{profiloRicerca\}/);
});

test("Profilo: usa la scheda di ricerca e quella del punteggio condivise (non ne ha di proprie), e legge ?apri=", () => {
  const p = leggi("src", "app", "(app)", "profilo", "ProfiloClient.tsx"); assert.match(p, /import \{ RicercaSheet \} from "@\/components\/RicercaSheet"/); assert.ok(!/function RicercaSheet/.test(p), "il Profilo ha ancora una scheda di ricerca sua"); assert.ok(!/function SaveButton/.test(p));
  assert.match(p, /<SchedaAffidabilita affidabilita=\{affidabilita\} onApri=\{\(sezione\) => setSheetAperta\(sezione\)\} \/>/); assert.ok(!/affidabilita\.checks\.map/.test(p), "il Profilo mostra ancora i vecchi controlli");
  const pg = leggi("src", "app", "(app)", "profilo", "page.tsx"); assert.match(pg, /sezioneProfilo\(\(await searchParams\)\.apri\)/); assert.match(pg, /searchParams: Promise<\{ apri\?: string \| string\[\] \}>/);
});

test("scheda di ricerca condivisa: avvisa UNA volta per ogni salvataggio che finisce bene, e il salvataggio aggiorna anche la Home", () => {
  const r = leggi("src", "components", "RicercaSheet.tsx"); assert.match(r, /export function RicercaSheet/); assert.match(r, /if \(pending\) \{\s+eraInCorso\.current = true;\s+return;\s+\}\s+if \(eraInCorso\.current\) \{\s+eraInCorso\.current = false;\s+if \(state\?\.ok\) onSalvata\?\.\(\);/); assert.ok(!/salvataggioNotificato/.test(r), "si confronta ancora l'oggetto dello stato");
  const a = leggi("src", "app", "(app)", "profilo", "actions.ts"); const f = a.slice(a.indexOf("export async function updateRicerca")); assert.match(f, /revalidatePath\("\/profilo"\);\s+revalidatePath\("\/"\);/, "la Home non si aggiorna dopo il salvataggio");
});

test("scheda del punteggio: i punti vengono dalla funzione del punteggio (nessun numero scritto a mano), e il minus è un vero meno", () => {
  const c = leggi("src", "components", "SchedaAffidabilita.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""); assert.ok(!/[+-]\s?(20|15|10|12|30)\b/.test(c.replace(/\\u2212/g, "")), "un numero di punti scritto a mano"); assert.match(c, /\\u2212\$\{Math\.abs\(v\.punti\)\}/);
  assert.match(c, /voci\.map\(\(v\) =>/); assert.match(c, /punteggioPossibile\(affidabilita\)/); assert.match(c, /checks\.slice\(0, 2\)/);
});

test("CSS: il suggerimento sta sopra i pulsanti e la card sopra il suggerimento (prima il testo finiva dietro i pulsanti)", () => {
  const css = leggi("src", "app", "globals.css"); const base = css.slice(0, css.indexOf("@media")); const px = (re) => Number(base.match(re)[1]);
  const pulsanti = px(/\.actions \{[^}]*?bottom: (\d+)px/); const suggerimento = px(/\.swipe-hint \{[^}]*?bottom: (\d+)px/); const card = px(/\.card-info \{[^}]*?bottom: (\d+)px/);
  assert.ok(suggerimento >= pulsanti + 64 + 8, `il suggerimento (${suggerimento}px) tocca i pulsanti (${pulsanti}px + 64)`); assert.ok(card >= suggerimento + 16, `la card (${card}px) tocca il suggerimento (${suggerimento}px)`);
});
