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
  for (const s of ["affidabilita", "dati", "ricerca", "verifica"]) assert.equal(hm.sezioneProfilo(s), s); assert.equal(hm.sezioneProfilo(["verifica", "dati"]), "verifica");
  assert.deepEqual([...hm.SEZIONI_PROFILO_APRIBILI], ["affidabilita", "dati", "ricerca", "verifica"], "invito e affitti ora stanno in Gestione affitto");
  for (const x of ["invito", "affitti", "", "Verifica", "verifica ", " verifica", "account", "privacy", "faq", "__proto__", "constructor", "toString", "ricerca;x", "../x", "<script>", null, undefined, 5, {}, [], [""]]) assert.equal(hm.sezioneProfilo(x), null, JSON.stringify(x));
});

test("le sezioni del Profilo che si possono aprire da un collegamento esistono davvero nel Profilo (dati, affidabilità e verifica aprono la stessa scheda)", () => {
  const p = leggi("src", "app", "(app)", "profilo", "ProfiloClient.tsx"); const unione = p.match(/useState<([\s\S]*?)\n  >\(aperturaIniziale\)/)[1];
  for (const s of hm.SEZIONI_PROFILO_APRIBILI) assert.ok(unione.includes(`"${s}"`), `la sezione «${s}» non è tra quelle del Profilo`);
  assert.match(p, /open=\{sheetAperta === "ricerca"\}/, "nessuna scheda per «ricerca»"); assert.ok(!/sheetAperta === "(invito|affitti)"/.test(p), "il Profilo ha ancora le schede degli inviti o degli affitti");
  assert.match(p, /open=\{sheetAperta === "dati" \|\| sheetAperta === "affidabilita" \|\| sheetAperta === "verifica"\}/, "le tre vecchie sezioni devono aprire la scheda unica");
  assert.ok(typeof hm.sezionePerVoce === "undefined", "sezionePerVoce non serve più");
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

test("Home: nel pannello dell'affidabilità c'è UN solo pulsante, «Modifica dati»; l'anello non è un pulsante e «Come si calcola» non c'è più", () => {
  const h = leggi("src", "app", "(app)", "HomeClient.tsx"); const pannello = h.slice(h.indexOf('<div className="hi-punteggio"'), h.indexOf('<div className="home-area">'));
  assert.match(pannello, /<div className="hi-punteggio" role="group" aria-label=\{`Affidabilità \$\{affidabilita\.punteggio\} su 100, \$\{affidabilita\.label\}`\}>/);
  assert.match(pannello, /<button type="button" className="hi-azione" onClick=\{\(\) => setSchedaDati\(true\)\}>\s+Modifica dati\s+<\/button>/); assert.equal([...pannello.matchAll(/<button/g)].length, 1, "ci deve essere un solo pulsante");
  assert.ok(!/Come si calcola/.test(h), "resta il vecchio pulsante «Come si calcola»"); assert.ok(!/schedaPunteggio|SchedaAffidabilita|DatiPersonaliSheet/.test(h), "restano pezzi delle schede vecchie");
  const pg = leggi("src", "app", "(app)", "page.tsx"); assert.match(pg, /ricerca=\{profiloRicerca\}/); assert.match(pg, /recensioni=\{riepilogo\}\s+raccomandazione=\{raccomandazione\}\s+tenant=\{tenantProfile\}\s+verificaPanel=\{/);
});

test("Home: «Modifica dati» apre la scheda unica qui (punteggio, dati, verifica), montata solo se aperta; salvando si chiude e lo dice; niente più rimandi al Profilo", () => {
  const h = leggi("src", "app", "(app)", "HomeClient.tsx"); assert.match(h, /import \{ DatiSheet \} from "@\/components\/DatiSheet"/);
  assert.match(h, /\{schedaDati && \(\s+<DatiSheet\s+open\s+onClose=\{\(\) => setSchedaDati\(false\)\}\s+tenant=\{tenant\}\s+affidabilita=\{affidabilita\}\s+recensioni=\{recensioni\}\s+raccomandazione=\{raccomandazione\}\s+verificaPanel=\{verificaPanel\}\s+protestiPanel=\{protestiPanel\}\s+onSalvata=\{\(\) => \{\s+setSchedaDati\(false\);\s+setAvviso\(\{ errore: false, testo: "Dati aggiornati\." \}\);/);
  assert.ok(!/useRouter|router\.push/.test(h), "la Home rimanda ancora altrove"); assert.ok(!/href="\/profilo"/.test(h));
  const pg = leggi("src", "app", "(app)", "page.tsx"); assert.match(pg, /from\("documenti_inquilino"\)\.select\("id, tipo, percorso, nome_file"\)\.eq\("tenant_id", userId\)/); assert.match(pg, /<VerificaRedditoPanel\s+stato=\{tenantProfile\.verifica_stato\}/);
});

test("Profilo: una sola riga e una sola scheda per punteggio, dati e verifica (le altre schede condivise restano), legge ?apri= e passa le recensioni a parte", () => {
  const p = leggi("src", "app", "(app)", "profilo", "ProfiloClient.tsx"); assert.match(p, /import \{ RicercaSheet \} from "@\/components\/RicercaSheet"/); assert.match(p, /import \{ DatiSheet \} from "@\/components\/DatiSheet"/);
  assert.ok(!/function RicercaSheet/.test(p) && !/function DatiPersonaliSheet/.test(p) && !/function SaveButton/.test(p), "il Profilo ha ancora una copia di una scheda");
  assert.equal([...p.matchAll(/onClick=\{\(\) => setSheetAperta\("(dati|affidabilita|verifica)"\)\}/g)].length, 1, "ci deve essere una riga sola per punteggio, dati e verifica"); assert.match(p, /onClick=\{\(\) => setSheetAperta\("dati"\)\}/);
  assert.match(p, /<DatiSheet[\s\S]*?recensioni=\{recensioni\}\s+raccomandazione=\{raccomandazione\}\s+verificaPanel=\{verificaPanel\}\s+protestiPanel=\{protestiPanel\}\s+scorriA=\{sheetAperta === "verifica" \? "verifica" : null\}/); assert.ok(!/SchedaAffidabilita|rigaProfilo|hasRecensioni|\.checks/.test(p), "il Profilo usa ancora pezzi vecchi");
  const pg = leggi("src", "app", "(app)", "profilo", "page.tsx"); assert.match(pg, /sezioneProfilo\(\(await searchParams\)\.apri\)/); assert.match(pg, /searchParams: Promise<\{ apri\?: string \| string\[\] \}>/); assert.match(pg, /recensioni=\{riepilogo\}/);
});

test("scheda di ricerca condivisa: avvisa UNA volta per ogni salvataggio che finisce bene, e il salvataggio aggiorna anche la Home", () => {
  const r = leggi("src", "components", "RicercaSheet.tsx"); assert.match(r, /export function RicercaSheet/); assert.match(r, /if \(pending\) \{\s+eraInCorso\.current = true;\s+return;\s+\}\s+if \(eraInCorso\.current\) \{\s+eraInCorso\.current = false;\s+if \(state\?\.ok\) onSalvata\?\.\(\);/); assert.ok(!/salvataggioNotificato/.test(r), "si confronta ancora l'oggetto dello stato");
  const a = leggi("src", "app", "(app)", "profilo", "actions.ts"); const f = a.slice(a.indexOf("export async function updateRicerca")); assert.match(f, /revalidatePath\("\/profilo"\);\s+revalidatePath\("\/"\);/, "la Home non si aggiorna dopo il salvataggio");
});

test("scheda unica «I tuoi dati»: l'ordine è punteggio → dati → verifica; l'informativa sta nella stessa scheda e i dati restano in memoria (nascosti, non smontati); si torna indietro con la freccia, Esc o la X", () => {
  const d = leggi("src", "components", "DatiSheet.tsx"); const ordine = ["<RiepilogoAffidabilita", "Modifica i tuoi dati", "<DatiForm", 'id="dati-verifica"', "{verificaPanel}"].map((x) => d.indexOf(x)); assert.ok(ordine.every((x) => x > 0) && ordine.every((x, i) => i === 0 || x > ordine[i - 1]), "ordine delle parti: " + ordine.join(","));
  assert.match(d, /<div hidden=\{inInformativa\}>/); assert.match(d, /\{inInformativa && \(\s+<>\s+<button type="button" className="redo-link aff-indietro" onClick=\{\(\) => setVista\("dati"\)\}>\s+‹ Torna ai tuoi dati/);
  assert.match(d, /onClose=\{inInformativa \? \(\) => setVista\("dati"\) : chiudi\}/); assert.match(d, /const chiudi = \(\) => \{\s+setVista\("dati"\);\s+onClose\(\);/); assert.ok(!/useEffect\(\(\) => \{\s+if \(!open\) setVista/.test(d), "reset dello stato in un effetto");
  assert.match(d, /onCome=\{\(\) => setVista\("come"\)\} onVai=\{vai\}/); assert.match(d, /title=\{inInformativa \? "Come viene calcolato" : "I tuoi dati"\}/); assert.match(d, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/); assert.match(d, /if \(open && scorriA === "verifica"\) \{\s+const t = setTimeout\(\(\) => vai\("dati-verifica"\), 60\);\s+return \(\) => clearTimeout\(t\);/, "un collegamento alla verifica deve scorrere fino al pannello");
  assert.ok(!fs.existsSync(path.join(radice, "src", "components", "SchedaAffidabilita.tsx")) && !fs.existsSync(path.join(radice, "src", "components", "DatiPersonaliSheet.tsx")), "restano i file delle schede vecchie");
});

test("CSS: il suggerimento sta sopra i pulsanti e la card sopra il suggerimento (prima il testo finiva dietro i pulsanti)", () => {
  const css = leggi("src", "app", "globals.css"); const base = css.slice(0, css.indexOf("@media")); const px = (re) => Number(base.match(re)[1]);
  const pulsanti = px(/\.actions \{[^}]*?bottom: (\d+)px/); const suggerimento = px(/\.swipe-hint \{[^}]*?bottom: (\d+)px/); const card = px(/\.card-info \{[^}]*?bottom: (\d+)px/);
  assert.ok(suggerimento >= pulsanti + 64 + 8, `il suggerimento (${suggerimento}px) tocca i pulsanti (${pulsanti}px + 64)`); assert.ok(card >= suggerimento + 16, `la card (${card}px) tocca il suggerimento (${suggerimento}px)`);
});

// ============================================================ la ricerca sta SOTTO le foto
test("Home dell'inquilino: «quante case rispondono alla ricerca» e «Modifica/Imposta la ricerca» stanno SOTTO le foto (non più nel pannello in alto): il pannello ha solo affidabilità e badge, poi l'area delle foto con i pulsanti, poi la barra della ricerca", () => {
  const h = leggi("src", "app", "(app)", "HomeClient.tsx");
  const iPannello = h.indexOf('<div className="home-intro">'), iArea = h.indexOf('<div className="home-area">'), iDeck = h.indexOf('<div className="deck">'), iAzioni = h.indexOf('<div className="actions">'), iBarra = h.indexOf('<div className="home-ricerca">'), iRicerca = h.indexOf('<div className="hi-ricerca">');
  assert.ok(iPannello > 0 && iPannello < iArea && iArea < iDeck && iDeck < iAzioni && iAzioni < iBarra && iBarra < iRicerca, "ordine: pannello, area delle foto (mazzo e pulsanti), barra della ricerca");
  const pannello = h.slice(iPannello, iArea); assert.ok(!/hi-ricerca|hi-modifica|hi-riassunto|Modifica ricerca|Imposta la ricerca|testoCase/.test(pannello), "la ricerca non deve restare nel pannello in alto");
  const barra = h.slice(iBarra, h.indexOf("La scheda unica «I tuoi dati»")); for (const x of ["<b>{testoCase.principale}</b>", "{testoCase.secondario && <span>{testoCase.secondario}</span>}", "hi-nascoste", '{mostraMatch ? "Modifica ricerca" : "Imposta la ricerca"}', "setSchedaRicerca(true)", 'className="hi-riassunto"']) assert.ok(barra.includes(x), `manca nella barra: ${x}`);
  const area = h.slice(iArea, iBarra); assert.ok(area.includes('className="deck"') && area.includes('className="actions"'), "il mazzo e i pulsanti stanno nell'area delle foto, sopra la barra"); assert.ok(!/hi-ricerca/.test(area), "la barra della ricerca non sta dentro l'area delle foto");
  assert.match(h, /<div className=\{`screen-dark home-inq \$\{raccomandazione\.raccomandato \? "con-badge" : ""\}`\}>/);
});

test("Home dell'inquilino, stile: l'area delle foto riempie lo spazio sopra la barra e le posizioni di mazzo e pulsanti sono RELATIVE a lei; la barra è alta quanto il suo contenuto, sopra il resto, con lo stesso aspetto che aveva nel pannello; il mazzo comincia subito sotto il pannello (non lascia un buco)", () => {
  const css = leggi("src", "app", "globals.css");
  assert.match(css, /\.home-inq \{\s+display: flex;\s+flex-direction: column;\s+\}/); assert.match(css, /\.home-area \{\s+position: relative;\s+flex: 1 1 0;\s+min-height: 0;\s+\}/);
  assert.match(css, /\.home-ricerca \{\s+position: relative;\s+z-index: 60;\s+flex: none;\s+padding: 10px 14px 12px;\s+background: var\(--ink\);\s+border-top: 1px solid var\(--line\);\s+\}/); assert.match(css, /\.home-ricerca \.hi-ricerca \{\s+padding-top: 0;\s+border-top: none;\s+\}/);
  for (const sel of [".hi-ricerca", ".hi-ricerca-testo", ".hi-ricerca-testo b", ".hi-ricerca-testo span", ".hi-riassunto", ".hi-modifica", ".hi-modifica:focus-visible", ".hi-ricerca-testo .hi-nascoste"]) assert.ok(css.includes(`.home-ricerca ${sel},\n.home-intro ${sel} {`), `la barra non ha lo stile di ${sel}`);
  assert.match(css, /\.deck \{\s+position: absolute;\s+inset: 0;\s+top: 164px;/); assert.match(css, /\.screen-dark\.con-badge \.deck \{\s+top: 198px;/);
  const desk = css.indexOf("@media (min-width: 768px) {\n  .home-ricerca {"); assert.ok(desk > 0, "la barra a schermo largo"); assert.match(css.slice(desk, desk + 200), /\.home-ricerca \{\s+align-self: center;\s+width: 460px;/);
  // il mazzo deve cominciare tra 8 e 24 px sotto il pannello più alto (118 px con il badge, 82 senza)
  const sopra = (top, pannelloFine) => top - pannelloFine; assert.ok(sopra(164, 64 + 82) >= 8 && sopra(164, 64 + 82) <= 24 && sopra(198, 64 + 118) >= 8 && sopra(198, 64 + 118) <= 24, "il mazzo è troppo lontano o troppo vicino al pannello");
});
