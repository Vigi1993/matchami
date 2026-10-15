/**
 * Test del badge «Inquilino raccomandato»: due recensioni positive (da 4 stelle in su) di due proprietari DIVERSI, nessuna
 * negativa (da 2 in giù) negli ultimi quattro anni. Non cambia il punteggio: dà visibilità ai proprietari. Si lancia con:   npm test
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
const rc = caricaTs(path.join(radice, "src", "lib", "recensioni.ts"));
const pr = caricaTs(path.join(radice, "src", "lib", "match", "proprietario.ts"));
const ric = caricaTs(path.join(radice, "src", "lib", "ricerca-candidati.ts"));
const riepilogo = caricaTs(path.join(radice, "src", "components", "RiepilogoAffidabilita.tsx"));
const come = caricaTs(path.join(radice, "src", "components", "ComeSiCalcola.tsx"));
const badge = caricaTs(path.join(radice, "src", "components", "BadgeRaccomandato.tsx"));
const inf = caricaTs(path.join(radice, "src", "content", "informativa.ts"));
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const testoDi = (h) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const ORA = Date.parse("2026-10-15T12:00:00Z");
const ANNO = 365.25 * 24 * 60 * 60 * 1000;
const fa = (ms) => new Date(ORA - ms).toISOString();
const r = (voto, autore, quando = fa(30 * 24 * 3600 * 1000)) => ({ voto, autore_id: autore, created_at: quando });
const st = (righe) => rc.statoRaccomandazione(righe, ORA);

// ============================================================ la regola
test("costanti della regola: due proprietari, da 4 stelle in su, negativa da 2 in giù, quattro anni", () => {
  assert.equal(rc.AUTORI_DIVERSI_MINIMI, 2); assert.equal(rc.VOTO_POSITIVO_MINIMO, 4); assert.equal(rc.VOTO_NEGATIVO_MASSIMO, 2); assert.equal(rc.ANNI_VALIDITA, 4); assert.equal(rc.NOME_BADGE_RACCOMANDATO, "Inquilino raccomandato");
});

test("regola: due positive di due proprietari diversi = raccomandato; una sola, o due dello stesso proprietario, no", () => {
  assert.deepEqual(st([r(5, "a"), r(4, "b")]), { raccomandato: true, autoriPositivi: 2, mancano: 0, negativa: false });
  assert.deepEqual(st([r(5, "a")]), { raccomandato: false, autoriPositivi: 1, mancano: 1, negativa: false });
  assert.deepEqual(st([r(5, "a"), r(5, "a")]), { raccomandato: false, autoriPositivi: 1, mancano: 1, negativa: false }, "lo stesso proprietario per due affitti vale una volta");
  assert.deepEqual(st([]), { raccomandato: false, autoriPositivi: 0, mancano: 2, negativa: false }); assert.equal(st([r(5, "a"), r(5, "b"), r(5, "c")]).autoriPositivi, 3);
});

test("regola: 4 stelle è positiva, 3 è neutra (non conta e non toglie), 2 e 1 sono negative e tolgono il badge", () => {
  assert.equal(st([r(4, "a"), r(4, "b")]).raccomandato, true); assert.equal(st([r(3, "a"), r(3, "b")]).raccomandato, false, "due da 3 stelle non bastano"); assert.equal(st([r(5, "a"), r(5, "b"), r(3, "c")]).raccomandato, true, "una da 3 non lo toglie");
  for (const v of [1, 2]) { const x = st([r(5, "a"), r(5, "b"), r(v, "c")]); assert.equal(x.raccomandato, false, `una da ${v} stelle lo toglie`); assert.equal(x.negativa, true); assert.equal(x.autoriPositivi, 2, "le positive restano contate"); assert.equal(x.mancano, 0); }
  assert.equal(st([r(1, "a")]).negativa, true); assert.equal(st([r(3, "a")]).negativa, false);
});

test("regola: una negativa dello STESSO proprietario di una positiva toglie comunque il badge (conta ogni recensione negativa)", () => {
  assert.equal(st([r(5, "a"), r(5, "b"), r(1, "a")]).raccomandato, false);
});

test("regola: contano solo le recensioni degli ultimi quattro anni; esattamente quattro anni conta, un millisecondo di più no; vale per le positive e per le negative", () => {
  assert.equal(st([r(5, "a", fa(4 * ANNO)), r(5, "b", fa(4 * ANNO))]).raccomandato, true, "al limite conta"); assert.equal(st([r(5, "a", fa(4 * ANNO + 1)), r(5, "b")]).raccomandato, false, "una scaduta non conta");
  assert.equal(st([r(5, "a", fa(10 * ANNO)), r(5, "b", fa(10 * ANNO))]).autoriPositivi, 0); assert.equal(st([r(5, "a"), r(5, "b"), r(1, "c", fa(5 * ANNO))]).raccomandato, true, "una negativa vecchia smette di pesare");
  assert.equal(st([r(5, "a"), r(5, "b"), r(1, "c", fa(4 * ANNO))]).raccomandato, false, "una negativa al limite pesa ancora");
});

test("regola: una data illeggibile, mancante o futura non esclude la recensione (si guarda solo ciò che è provatamente vecchio)", () => {
  for (const q of ["non è una data", "", null, undefined, 5, {}, "2999-01-01T00:00:00Z"]) assert.equal(st([r(5, "a", q), r(5, "b", q)]).raccomandato, true, JSON.stringify(q));
  assert.equal(st([{ voto: 5, autore_id: "a" }, { voto: 5, autore_id: "b" }]).raccomandato, true, "senza il campo data");
});

test("regola: una recensione rotta si ignora, senza far crollare niente; una positiva senza autore non conta come proprietario, una negativa senza autore pesa", () => {
  for (const x of [null, undefined, 5, "x", [], {}, { voto: "5" }, { voto: 5.5 }, { voto: 0 }, { voto: 6 }, { voto: NaN }, { voto: 5 }, { voto: 5, autore_id: "" }, { voto: 5, autore_id: "  " }, { voto: 5, autore_id: 7 }, { voto: 5, autore_id: null }]) assert.equal(st([x, r(5, "b")]).raccomandato, false, JSON.stringify(x));
  assert.equal(st([{ voto: 1 }, r(5, "a"), r(5, "b")]).raccomandato, false, "una negativa senza autore pesa lo stesso"); for (const strano of [null, undefined, "x", 5, {}]) assert.deepEqual(st(strano), { raccomandato: false, autoriPositivi: 0, mancano: 2, negativa: false });
});

test("regola: l'ordine non conta, nessuna recensione fa perdere il badge se ne arriva una positiva, e una negativa recente lo toglie sempre", () => {
  let seme = 11; const rnd = () => (seme = (seme * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const scegli = (a) => a[Math.floor(rnd() * a.length)];
  for (let i = 0; i < 400; i++) {
    const righe = Array.from({ length: Math.floor(rnd() * 8) }, () => r(scegli([1, 2, 3, 4, 5]), scegli(["a", "b", "c", "d"]), fa(scegli([1, 100, 3 * ANNO, 4 * ANNO - 1000, 5 * ANNO]) )));
    const base = st(righe); const mischiate = [...righe].sort(() => rnd() - 0.5); assert.deepEqual(st(mischiate), base, "l'ordine delle recensioni cambia il risultato");
    const piu = st([...righe, r(5, "nuovo-" + i)]); assert.ok(piu.autoriPositivi === base.autoriPositivi + 1, "una positiva da un proprietario nuovo conta uno in più"); if (base.raccomandato) assert.equal(piu.raccomandato, true, "una positiva in più non può far perdere il badge");
    assert.equal(st([...righe, r(scegli([1, 2]), "n")]).raccomandato, false, "una negativa recente lo toglie sempre"); assert.deepEqual(st([...righe, r(5, "z", fa(6 * ANNO))]), base, "una recensione scaduta non cambia niente");
    assert.equal(base.mancano, Math.max(0, 2 - base.autoriPositivi)); assert.equal(base.raccomandato, !base.negativa && base.autoriPositivi >= 2);
  }
});

test("regola: senza l'ora data usa quella di adesso (una recensione di oggi conta)", () => {
  const oggi = new Date().toISOString(); assert.equal(rc.statoRaccomandazione([r(5, "a", oggi), r(5, "b", oggi)]).raccomandato, true); assert.equal(rc.statoRaccomandazione([r(5, "a", "2000-01-01T00:00:00Z"), r(5, "b", "2000-01-01T00:00:00Z")]).raccomandato, false);
});

// ============================================================ l'ordine dei candidati e il filtro
const voce = (id, o) => ({ id, match: { bloccato: false, punteggio: 80 }, affidabilita: 50, recensioni: null, ...o });
const ordine = (v) => pr.ordinaCandidati(v).map((x) => x.id).join();

test("ordine: a parità di compatibilità passa prima chi è raccomandato, anche con meno affidabilità; non scavalca la percentuale né i criteri obbligatori", () => {
  assert.equal(ordine([voce("a", { affidabilita: 90 }), voce("b", { affidabilita: 40, raccomandato: true })]), "b,a", "il badge viene prima dell'affidabilità");
  assert.equal(ordine([voce("a", { match: { bloccato: false, punteggio: 90 } }), voce("b", { raccomandato: true })]), "a,b", "la percentuale conta più del badge");
  assert.equal(ordine([voce("a", {}), voce("b", { raccomandato: true, match: { bloccato: true, punteggio: 99 } })]), "a,b", "chi non soddisfa i criteri obbligatori resta in fondo, anche con il badge");
  assert.equal(ordine([voce("a", { affidabilita: 60 }), voce("b", { affidabilita: 70 })]), "b,a", "senza badge vale l'affidabilità come prima"); assert.equal(ordine([voce("a", { raccomandato: false }), voce("b", {})]), "a,b", "false e assente sono uguali");
  assert.equal(ordine([voce("a", { raccomandato: true, affidabilita: 40 }), voce("b", { raccomandato: true, affidabilita: 80 })]), "b,a", "tra due raccomandati vale l'affidabilità"); assert.equal(ordine([voce("a", { raccomandato: true, recensioni: { numero: 2, media: 4 } }), voce("b", { raccomandato: true, recensioni: { numero: 2, media: 5 } })]), "b,a", "poi le stelle");
});

const cand = (id, valutazione) => ({ id, listing_id: "L", status: "in_attesa", tenant_profiles: { verificato: true }, valutazione });
const FV = { ...ric.FILTRI_VUOTI, soloRaccomandati: true }; const sempreAttesa = () => "in_attesa";

test("filtro «Inquilini raccomandati»: tiene solo chi ha il badge; chi non ha il dato (fotografia vecchia, valutazione assente) non risulta raccomandato", () => {
  const v = (x) => ({ match: { bloccato: false, punteggio: 80 }, affidabilita: 50, ...x });
  const tutte = [cand("1", v({ raccomandato: true })), cand("2", v({ raccomandato: false })), cand("3", v({})), cand("4", null), cand("5", undefined)];
  assert.deepEqual(ric.filtraCandidature(tutte, FV, sempreAttesa).map((c) => c.id), ["1"]); assert.equal(ric.filtraCandidature(tutte, ric.FILTRI_VUOTI, sempreAttesa).length, 5, "spento non filtra");
});

test("filtro: è spento di partenza, conta tra i filtri attivi, si somma agli altri e non cambia niente di ciò che c'era", () => {
  assert.equal(ric.FILTRI_VUOTI.soloRaccomandati, false); assert.equal(ric.numeroFiltriAttivi(ric.FILTRI_VUOTI), 0); assert.equal(ric.numeroFiltriAttivi(FV), 1); assert.equal(ric.numeroFiltriAttivi({ ...FV, soloVerificati: true, senzaBlocchi: true }), 3);
  const c = cand("1", { match: { bloccato: false, punteggio: 80 }, affidabilita: 50, raccomandato: true }); assert.equal(ric.corrisponde(c, { ...FV, soloVerificati: true }, sempreAttesa), true); assert.equal(ric.corrisponde({ ...c, tenant_profiles: { verificato: false } }, { ...FV, soloVerificati: true }, sempreAttesa), false);
  assert.equal(ric.filtriValidi(FV, [c]).soloRaccomandati, true, "ripulire i filtri non lo spegne");
});

// ============================================================ ciò che si vede
test("badge disegnato: il nome, il simbolo, e la versione compatta per le liste", () => {
  const h = renderToStaticMarkup(React.createElement(badge.BadgeRaccomandato)); assert.match(h, /class="badge-raccomandato "/); assert.match(testoDi(h), /^Inquilino raccomandato$/); assert.match(h, /<svg[^>]*viewBox="0 0 24 24"/); assert.match(h, /title="Almeno due recensioni positive da due proprietari diversi"/);
  const c = renderToStaticMarkup(React.createElement(badge.BadgeRaccomandato, { compatto: true })); assert.match(c, /class="badge-raccomandato compatto"/);
  assert.match(c, /<span aria-hidden="true">Raccomandato<\/span><span class="solo-lettori">Inquilino raccomandato<\/span>/, "nelle liste si legge «Raccomandato» e i lettori di schermo sentono il nome intero");
  assert.ok(!/aria-hidden="true">Inquilino raccomandato/.test(c) && !/aria-hidden="true">Inquilino raccomandato/.test(h), "il nome intero non deve essere nascosto a chi usa un lettore di schermo");
});

test("scheda dei dati: tutte le situazioni del badge dicono la cosa giusta (ce l'hai, quanto manca, perché per ora non si può)", () => {
  const t = riepilogo.testoRaccomandazione;
  assert.equal(t({ raccomandato: true, autoriPositivi: 2, mancano: 0, negativa: false }), "I proprietari lo vedono sulla tua candidatura e, a parità di compatibilità, ti vedono prima.");
  assert.equal(t({ raccomandato: false, autoriPositivi: 0, mancano: 2, negativa: false }), "Ti servono 2 recensioni positive da 2 proprietari diversi."); assert.equal(t({ raccomandato: false, autoriPositivi: 1, mancano: 1, negativa: false }), "Ne hai 1 su 2: te ne manca 1 da un altro proprietario.");
  assert.equal(t({ raccomandato: false, autoriPositivi: 2, mancano: 0, negativa: true }), "Per ora non si può ottenere: c'è una recensione negativa degli ultimi 4 anni."); assert.equal(t({ raccomandato: false, autoriPositivi: 0, mancano: 2, negativa: true }), "Per ora non si può ottenere: c'è una recensione negativa degli ultimi 4 anni.");
  assert.ok(!/NaN|undefined/.test(t({ raccomandato: false, autoriPositivi: 5, mancano: 0, negativa: false })));
});

const VUOTO = { verificato: false, protestato: null, garante: null, fideiussione: null };
const af = caricaTs(path.join(radice, "src", "lib", "affidabilita.ts"));
const riep = (racc) => renderToStaticMarkup(React.createElement(riepilogo.RiepilogoAffidabilita, { affidabilita: af.computeAffidabilita(VUOTO), recensioni: { numero: 0, media: null }, raccomandazione: racc, onCome: () => {}, onVai: () => {} }));

test("riepilogo: con il badge si vede il sigillo e il blocco è evidenziato; senza, il titolo e quanto manca; sempre il link «Come funziona»", () => {
  const con = riep({ raccomandato: true, autoriPositivi: 2, mancano: 0, negativa: false }); assert.match(con, /class="aff-raccomandato ottenuto"/); assert.match(con, /class="badge-raccomandato "/); assert.ok(testoDi(con).includes("I proprietari lo vedono sulla tua candidatura"));
  const senza = riep({ raccomandato: false, autoriPositivi: 1, mancano: 1, negativa: false }); assert.match(senza, /class="aff-raccomandato "/); assert.ok(!/badge-raccomandato/.test(senza), "senza il badge non si mostra il sigillo"); assert.match(senza, /<b class="aff-raccomandato-titolo">Inquilino raccomandato<\/b>/); assert.ok(testoDi(senza).includes("Ne hai 1 su 2"));
  for (const h of [con, senza]) assert.ok(testoDi(h).includes("Come funziona"));
});

test("spiegazione: dice come si ottiene, come si perde, per quanto tempo e cosa cambia, con i numeri della regola (nessuno scritto a mano)", () => {
  const h = renderToStaticMarkup(React.createElement(come.ComeSiCalcola)); const t = testoDi(h);
  for (const x of ["Inquilino raccomandato", "È un badge, non un punteggio: non cambia il numero da 0 a 100", "almeno 2 recensioni positive (da 4 stelle in su) di 2 proprietari diversi", "Due recensioni dello stesso proprietario valgono una sola", "Una recensione da 3 stelle non conta per ottenerlo, ma non lo toglie", "da 2 stelle in giù", "ultimi 4 anni", "i proprietari vedono il badge sulla tua candidatura", "«Inquilini raccomandati»", "a parità di compatibilità, chi ce l'ha compare prima", "dichiara un affitto o invita il tuo proprietario", "prima passa chi ha il badge «Inquilino raccomandato», poi chi ha l'affidabilità più alta"]) assert.ok(t.includes(x), `manca «${x}»: ${t.slice(-700)}`);
  assert.equal((h.match(/<button/g) ?? []).length, 0, "è solo un'informativa");
  const src = leggi("src", "components", "ComeSiCalcola.tsx").replace(/\/\*[\s\S]*?\*\//g, ""); const piatto = src.replace(/\{" "\}/g, " ").replace(/\s+/g, " ");
  assert.deepEqual([...piatto.matchAll(/\b(\d+) (stelle|proprietari|anni)\b/g)].map((m) => m[0]), ["5 stelle", "3 stelle"], "un numero della regola è scritto a mano (ammessi solo «5 stelle», la scala dei voti, e «3 stelle», il caso neutro)");
  assert.ok(!/\shidden(=|\s|>)/.test(h), "una parte della spiegazione è nascosta"); const regole = h.slice(h.indexOf('class="come-regole"')); assert.equal([...regole.slice(0, regole.indexOf("</ul>")).matchAll(/<li>/g)].length, 3, "le regole devono essere tre"); for (const k of ["AUTORI_DIVERSI_MINIMI", "VOTO_POSITIVO_MINIMO", "VOTO_NEGATIVO_MASSIMO", "ANNI_VALIDITA"]) assert.ok(src.includes(k), k);
});

// ============================================================ i collegamenti nel codice
const home = () => leggi("src", "app", "(app)", "HomeClient.tsx");

test("Home: il badge sta nel pannello dell'affidabilità, solo per chi lo ha, e il mazzo scende solo in quel caso (stessa soglia dello schermo largo del mazzo)", () => {
  const h = home(); assert.match(h, /<div className=\{`screen-dark \$\{raccomandazione\.raccomandato \? "con-badge" : ""\}`\}>/); assert.match(h, /\{raccomandazione\.raccomandato && \(\s+<div className="hi-badge">\s+<BadgeRaccomandato \/>\s+<\/div>\s+\)\}/);
  assert.ok(h.indexOf('className="hi-punteggio"') < h.indexOf('className="hi-badge"') && h.indexOf('className="hi-badge"') < h.indexOf('className="hi-ricerca"'), "il badge sta sotto l'affidabilità e sopra la ricerca"); assert.match(h, /raccomandazione=\{raccomandazione\}\s+verificaPanel=\{verificaPanel\}/);
  const css = leggi("src", "app", "globals.css"); assert.match(css, /\.screen-dark\.con-badge \.deck \{\s+top: 266px;/); const i = css.indexOf("@media (min-width: 768px) {\n  .screen-dark.con-badge .deck"); assert.ok(i > 0, "a schermo largo il mazzo deve scendere con la stessa soglia delle altre regole del mazzo"); assert.match(css.slice(i, i + 200), /inset: 266px auto 130px 50%;/);
  assert.match(css, /\.deck \{\s+position: absolute;\s+inset: 0;\s+top: 232px;/, "senza badge il mazzo resta dov'era");
});

test("pagine: leggono chi ha scritto le recensioni e quando (servono per il badge), e passano il badge a Home e Profilo", () => {
  for (const [f, q] of [[["app", "(app)", "page.tsx"], /\.select\("voto, autore_id, created_at"\)\.eq\("tenant_id", userId\)/], [["app", "(app)", "profilo", "page.tsx"], /\.select\("voto, autore_id, created_at"\)\.eq\("tenant_id", user!\.id\)/], [["app", "(app)", "database", "actions.ts"], /\.select\("voto, autore_id, created_at"\)\.eq\("tenant_id", c\.tenant_id\)/], [["app", "(app)", "database", "page.tsx"], /\.select\("tenant_id, voto, autore_id, created_at"\)/]]) assert.match(leggi("src", ...f), q, f.join("/"));
  for (const f of [["app", "(app)", "page.tsx"], ["app", "(app)", "profilo", "page.tsx"]]) assert.match(leggi("src", ...f), /const raccomandazione = statoRaccomandazione\(recensioni \?\? \[\]\);/); assert.match(leggi("src", "app", "(app)", "database", "actions.ts"), /raccomandato: statoRaccomandazione\(recensioniGrezze\)\.raccomandato/);
});

test("proprietario: il badge compare sulla scheda e nel dettaglio solo se c'è, entra nell'ordine, e il filtro è nella ricerca", () => {
  const d = leggi("src", "app", "(app)", "database", "DatabaseClient.tsx"); // la scheda in lista è SchedaPersona (badge intero, 15 px); il dettaglio ha la riga con il badge compatto; l'ordine lo usa dopo la percentuale
  assert.match(leggi("src", "components", "SchedaPersona.tsx"), /\{dati\.raccomandato && <BadgeRaccomandato \/>\}/); assert.match(leggi("src", "lib", "database-proprietario.ts"), /raccomandato: v\?\.raccomandato === true,/); assert.match(d, /selezionata\.valutazione\?\.raccomandato === true && \(\s+<div className="feat-row">/); assert.match(leggi("src", "lib", "database-proprietario.ts"), /raccomandato: c\.valutazione!\.raccomandato === true,/);
  assert.match(leggi("src", "components", "RicercaCandidati.tsx"), /<Interruttore acceso=\{filtri\.soloRaccomandati\} onClick=\{\(\) => imposta\(\{ soloRaccomandati: !filtri\.soloRaccomandati \}\)\}>\s+Inquilini raccomandati/);
});

test("il badge non tocca il punteggio né la percentuale: affidabilita.ts non lo conosce, e il confronto lo usa solo dopo la percentuale", () => {
  assert.ok(!/raccomand/i.test(leggi("src", "lib", "affidabilita.ts")), "il calcolo del punteggio non deve dipendere dal badge"); assert.ok(!/raccomand/i.test(leggi("src", "lib", "match", "inquilino.ts")), "il match lato inquilino non dipende dal badge");
  const p = leggi("src", "lib", "match", "proprietario.ts"); const c = p.slice(p.indexOf("export function confrontaCandidati")); assert.ok(c.indexOf("a.match.bloccato") < c.indexOf("pa !== pb") && c.indexOf("pa !== pb") < c.indexOf("a.raccomandato") && c.indexOf("a.raccomandato") < c.indexOf("a.affidabilita"), "ordine dei criteri: bloccati, percentuale, badge, affidabilità");
});

test("informativa: dice del badge (chi lo vede, filtro, ordine, nessun effetto sul punteggio), con una nuova versione; chi aveva la precedente non deve riaccettare (testo ancora provvisorio)", () => {
  const testo = JSON.stringify(inf.INFORMATIVA); assert.ok(testo.includes("Il badge «Inquilino raccomandato» lo ottieni in automatico con almeno due recensioni positive (da 4 stelle in su) scritte da due proprietari diversi")); assert.ok(testo.includes("possono cercare solo gli inquilini raccomandati")); assert.ok(testo.includes("Non cambia il punteggio di affidabilità")); assert.ok(testo.includes("resta sempre del proprietario"));
  const vN = Number(inf.INFORMATIVA.versione.match(/^2026-10-provvisoria-(\d+)$/)?.[1]); assert.ok(vN >= 20, "versione: " + inf.INFORMATIVA.versione); for (let v = 20; v < vN; v++) assert.ok(inf.INFORMATIVA.equivalenti.includes(`2026-10-provvisoria-${v}`), `la ${v} deve restare equivalente`); assert.ok(inf.INFORMATIVA.equivalenti.every((e) => Number(e.split("-").pop()) >= 20), "le versioni prima della 20 non sono equivalenti: cambia chi vede il profilo"); assert.ok(!inf.INFORMATIVA.equivalenti.includes(inf.INFORMATIVA.versione));
});

test("il simbolo del badge esiste, è sul reticolo 24x24 e la spunta non è riempita", () => {
  const i = leggi("src", "components", "icons.tsx"); const c = i.slice(i.indexOf("export function IconRaccomandato"), i.indexOf("\n}\n", i.indexOf("export function IconRaccomandato"))); assert.match(c, /viewBox="0 0 24 24"/); assert.match(c, /aria-hidden/); assert.match(c, /<path d="M8\.4 12\.1l2\.5 2\.5 4\.8-5" fill="none" \/>/, "la spunta riempita fa un triangolo chiaro");
});
