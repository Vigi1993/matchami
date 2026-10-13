/**
 * Test della scheda di ricerca: dallo stato salvato allo stato del modulo e ritorno, i controlli prima di salvare, le
 * operazioni sulle caratteristiche, il riassunto della ricerca nella Home e i collegamenti nel codice.
 * Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const rf = caricaTs(path.join(radice, "src", "lib", "ricerca-form.ts"));
const hm = caricaTs(path.join(radice, "src", "lib", "home.ts"));
const cr = caricaTs(path.join(radice, "src", "lib", "match", "criteri-ricerca.ts"));
const co = caricaTs(path.join(radice, "src", "lib", "constants.ts"));
const en = caricaTs(path.join(radice, "src", "lib", "annunci", "energia.ts"));
// con i ritorni a capo di Windows normalizzati
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const sql = leggi("supabase", "migrations", "0030_parametri_ricerca.sql");

const VUOTA = { budgetMax: null, localiMin: null, mqMin: null, zone: [], interessi: {} };
const crit = (chiave, o = {}) => ({ chiave, necessaria: false, peso: 5, valore: null, ...o });
const OGGI = "2026-10-13";

// ============================================================ dallo stato salvato al modulo
test("stato del modulo: senza nessun criterio parte da un budget di 1300 (come sempre) e tutto il resto «qualsiasi»", () => {
  assert.deepEqual(rf.statoDaRicerca(VUOTA), { tipologia: "appartamento", budgetMin: 0, budgetMax: 1300, localiMin: 0, localiMax: 0, mqMin: 0, mqMax: 0, luoghi: [], criteri: [] });
});

test("stato del modulo: con almeno un criterio, un budget vuoto vuol dire «senza tetto» (non si rimette 1300 a chi non lo voleva)", () => {
  assert.equal(rf.statoDaRicerca({ ...VUOTA, localiMin: 2 }).budgetMax, rf.BUDGET.max); assert.equal(rf.statoDaRicerca({ ...VUOTA, criteri: [crit("balcone")] }).budgetMax, rf.BUDGET.max); assert.equal(rf.statoDaRicerca({ ...VUOTA, luoghi: ["x"] }).budgetMax, rf.BUDGET.max);
  assert.equal(rf.statoDaRicerca({ ...VUOTA, budgetMax: 900 }).budgetMax, 900);
});

test("stato del modulo: i valori si portano, la tipologia sconosciuta diventa appartamento, le caratteristiche si ripuliscono e si ordinano", () => {
  const s = rf.statoDaRicerca({ ...VUOTA, budgetMin: 800, budgetMax: 1400, localiMin: 2, localiMax: 3, mqMin: 50, mqMax: 90, tipologia: "villa", luoghi: ["a", "b"], criteri: [crit("bagni", { valore: { min: 2 } }), crit("x; drop"), crit("balcone"), crit("balcone", { necessaria: true })] });
  assert.deepEqual([s.budgetMin, s.budgetMax, s.localiMin, s.localiMax, s.mqMin, s.mqMax, s.tipologia, s.luoghi], [800, 1400, 2, 3, 50, 90, "villa", ["a", "b"]]); assert.deepEqual(s.criteri.map((c) => c.chiave), ["balcone", "bagni"]);
  for (const t of ["posto_letto", "castello", null, undefined]) assert.equal(rf.statoDaRicerca({ ...VUOTA, tipologia: t }).tipologia, "appartamento", String(t));
  const lista = ["a"]; const r = rf.statoDaRicerca({ ...VUOTA, luoghi: lista }); r.luoghi.push("z"); assert.deepEqual(lista, ["a"], "lo stato non deve modificare la ricerca ricevuta");
});

test("stato del modulo: una ricerca vecchia (solo interessi) diventa un elenco di caratteristiche opzionali", () => {
  assert.deepEqual(rf.statoDaRicerca({ ...VUOTA, interessi: { ascensore: 3, balcone: 8 } }).criteri, [crit("balcone", { peso: 8 }), crit("ascensore", { peso: 3 })]);
  assert.deepEqual(rf.statoDaRicerca({ ...VUOTA, interessi: { balcone: 8 }, criteri: [] }).criteri, [], "se c'è l'elenco nuovo, anche vuoto, vale quello");
});

// ============================================================ da stato a ciò che si salva
test("salvataggio: i valori «qualsiasi» diventano null, la tipologia e i luoghi si portano, una necessaria salva peso 5", () => {
  const p = rf.ricercaPerSalvataggio({ tipologia: "villa", budgetMin: 0, budgetMax: 3000, localiMin: 0, localiMax: 0, mqMin: 0, mqMax: 0, luoghi: ["a"], criteri: [crit("balcone", { necessaria: true, peso: 9 }), crit("ascensore", { peso: 9 })] });
  assert.deepEqual(p, { tipologia: "villa", budget_min: null, budget_max: null, locali_min: null, locali_max: null, mq_min: null, mq_max: null, luoghi: ["a"], criteri: [{ chiave: "balcone", necessaria: true, peso: 5, valore: null }, { chiave: "ascensore", necessaria: false, peso: 9, valore: null }] });
  const q = rf.ricercaPerSalvataggio({ ...rf.statoDaRicerca(VUOTA), budgetMin: 900, budgetMax: 1400, localiMin: 2, localiMax: 3, mqMin: 50, mqMax: 90 }); assert.deepEqual([q.budget_min, q.budget_max, q.locali_min, q.locali_max, q.mq_min, q.mq_max], [900, 1400, 2, 3, 50, 90]);
  assert.equal(rf.ricercaPerSalvataggio({ ...rf.statoDaRicerca(VUOTA), budgetMax: 2950 }).budget_max, 2950, "appena sotto il tetto è un valore vero"); assert.equal(rf.ricercaPerSalvataggio({ ...rf.statoDaRicerca(VUOTA), budgetMin: 50 }).budget_min, 50);
});

/** Dal contenuto salvato a una ricerca, come fa il database quando la si rilegge. */
const daPayload = (p) => ({ budgetMin: p.budget_min, budgetMax: p.budget_max, localiMin: p.locali_min, localiMax: p.locali_max, mqMin: p.mq_min, mqMax: p.mq_max, tipologia: p.tipologia, luoghi: p.luoghi, zone: [], interessi: {}, criteri: p.criteri });

function* statiCasuali(n) {
  let seme = 424242; const rnd = () => (seme = (seme * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const sc = (a) => a[Math.floor(rnd() * a.length)]; const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  for (let i = 0; i < n; i++) {
    let s = rf.statoDaRicerca(VUOTA); s.tipologia = sc(["appartamento", "villa"]);
    const bmin = rnd() < 0.5 ? 0 : int(1, 50) * 50; s.budgetMin = bmin; s.budgetMax = rnd() < 0.3 ? rf.BUDGET.max : Math.max(bmin, int(1, 59) * 50);
    const lmin = rnd() < 0.5 ? 0 : int(1, 6); s.localiMin = lmin; s.localiMax = rnd() < 0.5 ? 0 : Math.max(lmin, int(1, 10)); const qmin = rnd() < 0.5 ? 0 : int(4, 40) * 5; s.mqMin = qmin; s.mqMax = rnd() < 0.5 ? 0 : Math.max(qmin, int(4, 60) * 5);
    s.luoghi = Array.from({ length: int(0, 4) }, () => sc(["l1", "l2", "l3", "l4", "l5"])).filter((x, i, a) => a.indexOf(x) === i);
    for (const c of rf.CARATTERISTICHE) if (rnd() < 0.4) s.criteri = rf.aggiungi(s.criteri, c.chiave, OGGI);
    if (rnd() < 0.5) s.criteri = rf.alternaTipo(s.criteri, "contratto", sc(co.TIPI_CONTRATTO).id);
    s.criteri = s.criteri.map((c) => (rnd() < 0.4 ? { ...c, necessaria: true } : rnd() < 0.5 ? { ...c, peso: int(1, 10) } : c));
    yield s;
  }
}

test("andata e ritorno: ciò che si salva, riletto e risalvato, è IDENTICO (600 ricerche casuali)", () => {
  let n = 0;
  for (const s of statiCasuali(600)) {
    n++; const una = rf.ricercaPerSalvataggio(s); const due = rf.ricercaPerSalvataggio(rf.statoDaRicerca(daPayload(una)));
    // l'ordine delle caratteristiche si normalizza alla rilettura: si confronta l'insieme
    const ordina = (p) => ({ ...p, criteri: [...p.criteri].sort((a, b) => a.chiave.localeCompare(b.chiave)) }); assert.deepEqual(ordina(due), ordina(una), JSON.stringify(s));
  }
  assert.equal(n, 600);
});

test("tutto ciò che la scheda permette di salvare è accettato dalle regole del database (600 ricerche casuali)", () => {
  for (const s of statiCasuali(600)) {
    assert.equal(rf.primoErrore(s), null, "gli stati costruiti dai controlli non devono avere errori: " + rf.primoErrore(s)); const p = rf.ricercaPerSalvataggio(s);
    for (const [k, min, max] of [["budget_min", 0, 20000], ["budget_max", 1, 20000], ["locali_min", 1, 10], ["locali_max", 1, 10], ["mq_min", 10, 1000], ["mq_max", 10, 1000]]) if (p[k] !== null) assert.ok(Number.isInteger(p[k]) && p[k] >= min && p[k] <= max, `${k}=${p[k]}`);
    if (p.budget_min !== null && p.budget_max !== null) assert.ok(p.budget_min <= p.budget_max); if (p.locali_min !== null && p.locali_max !== null) assert.ok(p.locali_min <= p.locali_max); if (p.mq_min !== null && p.mq_max !== null) assert.ok(p.mq_min <= p.mq_max);
    assert.ok(p.luoghi.length <= 20 && p.criteri.length <= 40); const viste = new Set();
    for (const c of p.criteri) { assert.ok(!viste.has(c.chiave), "doppione " + c.chiave); viste.add(c.chiave); assert.deepEqual(cr.normalizzaCriterioRicerca(c), c, `il database rifiuterebbe ${JSON.stringify(c)}`); assert.ok(c.peso >= 1 && c.peso <= 10); }
  }
});

// ============================================================ testi e controlli
test("testo del budget: fino a, da, da…a, nessun limite", () => {
  const e = (n) => `€${n.toLocaleString("it-IT")}`; assert.equal(rf.testoBudget(0, 3000), "nessun limite"); assert.equal(rf.testoBudget(0, 1400), `fino a ${e(1400)}`); assert.equal(rf.testoBudget(900, 3000), `da ${e(900)}`); assert.equal(rf.testoBudget(900, 1400), `da ${e(900)} a ${e(1400)}`); assert.equal(rf.testoBudget(1000, 1000), `da ${e(1000)} a ${e(1000)}`);
});

test("errori prima di salvare: minimo sopra il massimo, e caratteristiche senza un valore valido; con «qualsiasi» nessun errore", () => {
  const base = rf.statoDaRicerca(VUOTA); assert.equal(rf.primoErrore(base), null);
  assert.match(rf.primoErrore({ ...base, budgetMin: 1500, budgetMax: 1000 }), /budget/i); assert.match(rf.primoErrore({ ...base, localiMin: 4, localiMax: 2 }), /locali/i); assert.match(rf.primoErrore({ ...base, mqMin: 80, mqMax: 60 }), /metratura/i);
  assert.equal(rf.primoErrore({ ...base, localiMin: 4, localiMax: 0 }), null); assert.equal(rf.primoErrore({ ...base, localiMin: 0, localiMax: 2 }), null); assert.equal(rf.primoErrore({ ...base, budgetMin: 1000, budgetMax: 1000 }), null);
  assert.equal(rf.primoErrore({ ...base, criteri: [crit("piano", { valore: { min: null, max: null } })] }), "Controlla «Piano»: manca un valore."); assert.equal(rf.primoErrore({ ...base, criteri: [crit("riscaldamento", { valore: { tipi: [] } })] }), "Controlla «Riscaldamento»: manca un valore.");
  assert.equal(rf.primoErrore({ ...base, criteri: [crit("balcone")] }), null); assert.equal(rf.primoErrore({ ...base, criteri: [crit("bagni", { valore: { min: 2 } })] }), null);
});

// ============================================================ caratteristiche
test("caratteristiche: 16 (le 11 sì/no e 5 con valore; il contratto ha la sua sezione), senza doppioni, e coincidono con quelle del database", () => {
  assert.equal(rf.CARATTERISTICHE.length, 16); assert.equal(new Set(rf.CARATTERISTICHE.map((c) => c.chiave)).size, 16); assert.ok(!rf.CARATTERISTICHE.some((c) => c.chiave === "contratto"));
  assert.deepEqual(rf.CARATTERISTICHE.filter((c) => c.tipo === "si_no").map((c) => c.chiave), co.ATTR_VOCAB.map((a) => a.key)); assert.deepEqual(rf.CARATTERISTICHE.filter((c) => c.tipo === "valore").map((c) => c.chiave), ["bagni", "piano", "riscaldamento", "ingresso", "classeEnergetica"]);
  const booleani = [...sql.match(/v_booleani constant text\[\] := array\[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]); assert.deepEqual(rf.CARATTERISTICHE.filter((c) => c.tipo === "si_no").map((c) => c.chiave).sort(), booleani.sort());
  assert.ok(rf.CARATTERISTICHE.every((c) => c.etichetta.length > 2));
});

test("valori predefiniti: ogni caratteristica con valore parte con un valore VALIDO, e la data di ingresso è tra 30 giorni (anche a cavallo di mese e anno)", () => {
  for (const c of rf.CARATTERISTICHE.filter((x) => x.tipo === "valore")) assert.notEqual(cr.valoreValido(c.chiave, rf.valorePredefinito(c.chiave, OGGI)), null, c.chiave); assert.notEqual(cr.valoreValido("contratto", rf.valorePredefinito("contratto", OGGI)), null);
  for (const c of rf.CARATTERISTICHE.filter((x) => x.tipo === "si_no")) assert.equal(rf.valorePredefinito(c.chiave, OGGI), null, c.chiave);
  for (const [oggi, atteso] of [["2026-10-13", "2026-11-12"], ["2026-12-15", "2027-01-14"], ["2026-01-31", "2026-03-02"], ["2028-02-10", "2028-03-11"], ["2026-12-31", "2027-01-30"]]) assert.equal(rf.valorePredefinito("ingresso", oggi).entro, atteso, oggi);
  assert.deepEqual(rf.valorePredefinito("bagni", OGGI), { min: 2 }); assert.deepEqual(rf.valorePredefinito("classeEnergetica", OGGI), { classe: "C" }); assert.equal(rf.valorePredefinito("sconosciuta", OGGI), null);
});

test("aggiungi, togli, modifica: non toccano le altre, non creano doppioni, non modificano l'elenco ricevuto", () => {
  const a = [crit("balcone")]; const copia = JSON.stringify(a);
  const b = rf.aggiungi(a, "bagni", OGGI); assert.deepEqual(b.map((c) => c.chiave), ["balcone", "bagni"]); assert.equal(JSON.stringify(a), copia, "l'elenco di partenza è cambiato"); assert.deepEqual(rf.aggiungi(b, "bagni", OGGI).map((c) => c.chiave), ["balcone", "bagni"], "doppione");
  assert.deepEqual(rf.rimuovi(b, "balcone").map((c) => c.chiave), ["bagni"]); assert.deepEqual(rf.rimuovi(b, "assente"), b);
  assert.equal(rf.modifica(b, "bagni", { necessaria: true }).find((c) => c.chiave === "bagni").necessaria, true); assert.equal(rf.modifica(b, "bagni", { necessaria: true }).find((c) => c.chiave === "balcone").necessaria, false); assert.deepEqual(rf.modifica(b, "assente", { necessaria: true }), b);
});

test("tipi di contratto e riscaldamento: il primo tipo aggiunge la caratteristica, gli altri si accumulano, l'ultimo tolto la fa sparire", () => {
  let c = rf.alternaTipo([], "contratto", "libero_4_4"); assert.deepEqual(c, [crit("contratto", { valore: { tipi: ["libero_4_4"] } })]); c = rf.alternaTipo(c, "contratto", "studenti"); assert.deepEqual(c[0].valore.tipi, ["libero_4_4", "studenti"]);
  c = rf.modifica(c, "contratto", { necessaria: true }); c = rf.alternaTipo(c, "contratto", "libero_4_4"); assert.deepEqual([c[0].valore.tipi, c[0].necessaria], [["studenti"], true], "togliere un tipo non cambia «necessaria»"); assert.deepEqual(rf.alternaTipo(c, "contratto", "studenti"), []);
});

test("disponibili: le caratteristiche non ancora aggiunte, il contratto escluso", () => {
  assert.equal(rf.disponibili([]).length, 16); assert.ok(!rf.disponibili([crit("balcone")]).some((c) => c.chiave === "balcone")); assert.equal(rf.disponibili([crit("balcone"), crit("contratto", { valore: { tipi: ["studenti"] } })]).length, 15);
  assert.equal(rf.disponibili(rf.CARATTERISTICHE.map((c) => crit(c.chiave))).length, 0); assert.equal(rf.inElenco(crit("contratto")), false); assert.equal(rf.inElenco(crit("balcone")), true);
});

test("opzioni: i piani del menu sono ammessi dal database, le classi sono le dieci in ordine con migliore e peggiore indicate; i limiti del modulo stanno nei limiti del database", () => {
  assert.ok(rf.OPZIONI_PIANO.every((o) => o.valore >= -2 && o.valore <= 60) && rf.OPZIONI_PIANO[0].valore === -1 && rf.OPZIONI_PIANO[1].etichetta === "Terra" && rf.OPZIONI_PIANO.length === 12); assert.deepEqual(rf.OPZIONI_CLASSE.map((o) => o.classe), en.CLASSI_ENERGETICHE.slice()); assert.equal(rf.OPZIONI_CLASSE[0].etichetta, "A4 (la migliore)"); assert.equal(rf.OPZIONI_CLASSE.at(-1).etichetta, "G (la peggiore)");
  assert.ok(rf.BUDGET.max <= 20000 && rf.BUDGET.step > 0 && rf.BUDGET.predefinito <= rf.BUDGET.max); assert.ok(rf.LOCALI.max <= 10); assert.ok(rf.METRATURA.min >= 10 && rf.METRATURA.max <= 1000); assert.equal(rf.IMPORTANZA_PREDEFINITA, 5);
});

// ============================================================ il riassunto nella Home
test("riassunto della ricerca: tipologia (solo se non è l'appartamento), budget «da – a», locali e metratura a intervallo, zone, caratteristiche necessarie", () => {
  const e = (n) => `€${n.toLocaleString("it-IT")}`;
  assert.deepEqual(hm.vociRicerca({ ...VUOTA, tipologia: "villa", budgetMin: 900, budgetMax: 1400, localiMin: 2, localiMax: 3, mqMin: 50, mqMax: 90, zone: ["Isola, Milano"], criteri: [crit("balcone", { necessaria: true }), crit("bagni", { necessaria: true, valore: { min: 2 } }), crit("cantina")] }), ["Villa", `${e(900)} – ${e(1400)}`, "2–3 locali", "50–90 m²", "Isola", "2 necessarie"]);
  assert.deepEqual(hm.vociRicerca({ ...VUOTA, tipologia: "appartamento", budgetMin: 900 }), [`Da ${e(900)}`]); assert.deepEqual(hm.vociRicerca({ ...VUOTA, localiMax: 3, mqMax: 80 }), ["Fino a 3 locali", "Fino a 80 m²"]); assert.deepEqual(hm.vociRicerca({ ...VUOTA, localiMin: 2, localiMax: 2 }), ["2 locali"]); assert.deepEqual(hm.vociRicerca({ ...VUOTA, criteri: [crit("balcone", { necessaria: true })] }), ["1 necessaria"]);
  assert.deepEqual(hm.vociRicerca({ ...VUOTA, criteri: [crit("balcone")], tipologia: "appartamento" }), [], "nessuna necessaria e nessun criterio visibile: vuoto");
});

test("chiave della ricerca: ogni parametro nuovo la cambia; l'ordine delle caratteristiche e dei luoghi no", () => {
  const base = { ...VUOTA, budgetMin: 900, budgetMax: 1400, localiMax: 3, mqMax: 90, tipologia: "villa", luoghi: ["a", "b"], criteri: [crit("balcone"), crit("bagni", { valore: { min: 2 } })] }; const k = hm.chiaveRicerca(base);
  assert.equal(hm.chiaveRicerca({ ...base, luoghi: ["b", "a", "a"], criteri: [base.criteri[1], base.criteri[0]] }), k);
  const diverse = [{ budgetMin: 800 }, { budgetMin: null }, { localiMax: 4 }, { localiMax: null }, { mqMax: 100 }, { mqMax: null }, { tipologia: "appartamento" }, { luoghi: ["a"] }, { luoghi: [] }, { criteri: [crit("balcone")] }, { criteri: [crit("balcone", { necessaria: true }), base.criteri[1]] }, { criteri: [crit("balcone", { peso: 9 }), base.criteri[1]] }, { criteri: [base.criteri[0], crit("bagni", { valore: { min: 3 } })] }];
  const viste = new Set([k]); for (const d of diverse) { const x = hm.chiaveRicerca({ ...base, ...d }); assert.notEqual(x, k, JSON.stringify(d)); viste.add(x); } assert.equal(viste.size, diverse.length + 1);
});

test("case nascoste: singolare, plurale, e nulla se non ce ne sono (o se il numero è strano)", () => {
  assert.equal(hm.testoNascoste(1), "1 casa nascosta: non ha le caratteristiche necessarie"); assert.equal(hm.testoNascoste(3), "3 case nascoste: non hanno le caratteristiche necessarie"); for (const x of [0, -2, NaN, Infinity, null, undefined]) assert.equal(hm.testoNascoste(x), null, String(x));
});

// ============================================================ i collegamenti nel codice
test("scheda: manda UN solo campo con tutto dentro, non usa più le 13 zone scritte a mano, ed è la stessa di Home e Profilo", () => {
  const r = leggi("src", "components", "RicercaSheet.tsx"); assert.deepEqual([...r.matchAll(/<input type="hidden" name="([^"]+)"/g)].map((m) => m[1]), ["ricerca"]); assert.ok(!/ZONE_MILANO/.test(r), "usa ancora le zone scritte a mano");
  assert.match(r, /<SaveButton pending=\{pending\} disabled=\{errore !== null\} \/>/); assert.match(r, /export function RicercaSheet/); assert.match(r, /if \(pending\) \{\s+eraInCorso\.current = true;/);
  for (const f of [["src", "app", "(app)", "HomeClient.tsx"], ["src", "app", "(app)", "profilo", "ProfiloClient.tsx"]]) { const c = leggi(...f); assert.match(c, /<RicercaSheet/); assert.match(c, /ricerca=\{ricerca\}\s+luoghi=\{luoghi\}/, f.join("/")); }
});

test("azione: valida la dimensione, passa tutto al database in una chiamata e aggiorna Home e Profilo", () => {
  const a = leggi("src", "app", "(app)", "profilo", "actions.ts"); const f = a.slice(a.indexOf("export async function updateRicerca")); assert.match(f, /grezzo\.length > 30000/); assert.match(f, /supabase\.rpc\("salva_ricerca_inquilino", \{ p_ricerca: ricerca \}\)/); assert.match(f, /revalidatePath\("\/profilo"\);\s+revalidatePath\("\/"\);/);
  assert.ok(!/\.from\("tenant_(profiles|zone_interesse|interessi)"\)\s*\.(insert|update|delete)/.test(f), "l'azione scrive ancora a pezzi"); assert.match(sql, /create or replace function public\.salva_ricerca_inquilino\(p_ricerca jsonb\)/);
  let chiamate = 0; const cartella = path.join(radice, "src"); const visita = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) visita(p); else if (/\.(ts|tsx)$/.test(e.name) && /rpc\("salva_ricerca_inquilino"/.test(fs.readFileSync(p, "utf8"))) chiamate++; } }; visita(cartella); assert.equal(chiamate, 1, "la funzione si chiama da un posto solo");
});

test("Home e candidature: leggono luoghi, valori e «necessaria»; la Home separa i conteggi (esclusi per budget / nascosti per necessarie)", () => {
  const h = leggi("src", "app", "(app)", "page.tsx"); assert.match(h, /select\("zona, luogo_id"\)/); assert.match(h, /select\("attributo_key, peso, valore, necessaria"\)/); assert.match(h, /from\("luoghi"\)\.select\("id, livello, nome, sigla, parent_id"\)/); assert.match(h, /esclusi=\{esclusiPerBudget\}\s+nascostiPerNecessarie=\{nascostiPerNecessarie\}\s+luoghi=\{luoghi\}/); assert.match(h, /\.\.\.campiMatchDaRiga\(l, mappa\)/);
  const c = leggi("src", "app", "(app)", "actions.ts"); assert.match(c, /select\("zona, luogo_id"\)/); assert.match(c, /select\("attributo_key, peso, valore, necessaria"\)/); assert.match(c, /campiMatchDaRiga\(annuncio, mappa\)/); for (const colonna of ["luogo_id", "tipologia", "bagni", "piano", "riscaldamento", "tipo_contratto", "disponibile_dal", "classe_energetica"]) { assert.ok(h.includes(colonna), `la Home non legge ${colonna}`); assert.ok(c.includes(colonna), `le candidature non leggono ${colonna}`); }
  const hc = leggi("src", "app", "(app)", "HomeClient.tsx"); assert.match(hc, /nascostiPerNecessarie > 0/); assert.match(hc, /testoNascoste\(nascostiPerNecessarie\)/);
});

test("completamento: la casella dichiara i ruoli della lista, Invio non invia il modulo, Esc non chiude altro", () => {
  const l = leggi("src", "components", "LuogoAutocomplete.tsx"); for (const a of ['role="combobox"', "aria-expanded=", "aria-controls=", 'aria-autocomplete="list"', "aria-activedescendant=", 'role="listbox"', 'role="option"', "aria-selected="]) assert.ok(l.includes(a), a);
  assert.match(l, /e\.key === "Enter"\) \{\s+\/\/[^\n]*\n\s+e\.preventDefault\(\);/); assert.match(l, /e\.key === "Escape"\) \{\s+if \(aperto\) \{\s+e\.stopPropagation\(\);/); assert.match(l, /maxLength=\{60\}/);
});

test("informativa: dice che le preferenze di ricerca comprendono anche il tipo di casa e di contratto e se le caratteristiche sono necessarie", () => {
  const t = leggi("src", "content", "informativa.ts"); assert.match(t, /le tue preferenze di ricerca \(budget, zone, locali, metri, tipo di casa e di contratto, caratteristiche e se per te sono necessarie\)/);
});
