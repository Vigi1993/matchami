/**
 * Test del consiglio sul prezzo d'affitto (src/lib/prezzi). Si lancia con:   npm test
 *
 * Contengono il CONTRATTO di ogni fonte di quotazioni: girano su tutte quelle
 * registrate, quindi chi ne aggiunge una vera (OMI) le ritrova pronte.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const reg = caricaTs(path.join(radice, "src", "lib", "prezzi", "index.ts"));
const con = caricaTs(path.join(radice, "src", "lib", "prezzi", "consiglio.ts"));
const prov = caricaTs(path.join(radice, "src", "lib", "prezzi", "provvisorio.ts"));
const en = caricaTs(path.join(radice, "src", "lib", "annunci", "energia.ts"));
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8");
const ZONE = [...leggi("src", "lib", "constants.ts").match(/ZONE_MILANO = \[([\s\S]*?)\] as const/)[1].matchAll(/"([^"]+, Milano)"/g)].map((m) => m[1]);

const Q = (o = {}) => ({ min: 20, max: 30, origine: "fornitore", fonte: "Fonte di prova del test", aggiornamento: "2° semestre 2025", ...o });

// ============================================================ il registro e la fonte provvisoria
test("registro: senza configurazione la fonte provvisoria; un nome sbagliato è un errore che dice quali ci sono", () => {
  const prima = process.env.QUOTAZIONI_PROVIDER; delete process.env.QUOTAZIONI_PROVIDER;
  try { for (const x of [undefined, null, "", "  ", "provvisorio"]) assert.equal(reg.fornitoreQuotazioni(x).id, "provvisorio", JSON.stringify(x)); } finally { if (prima !== undefined) process.env.QUOTAZIONI_PROVIDER = prima; }
  assert.throws(() => reg.fornitoreQuotazioni("omi"), (e) => /«omi»/.test(e.message) && /provvisorio/.test(e.message));
  for (const x of ["__proto__", "constructor", "toString", "hasOwnProperty"]) assert.throws(() => reg.fornitoreQuotazioni(x), /sconosciuta/, x);
});

test("registro: la configurazione dell'ambiente si rispetta", () => {
  const prima = process.env.QUOTAZIONI_PROVIDER; process.env.QUOTAZIONI_PROVIDER = "inesistente";
  try { assert.throws(() => reg.fornitoreQuotazioni(), /sconosciuta/); } finally { if (prima === undefined) delete process.env.QUOTAZIONI_PROVIDER; else process.env.QUOTAZIONI_PROVIDER = prima; }
});

for (const [nome, f] of Object.entries(reg.FORNITORI_QUOTAZIONI)) {
  test(`contratto [${nome}]: identificativo uguale al nome registrato, origine ammessa`, () => { assert.equal(f.id, nome); assert.ok(["provvisoria", "fornitore"].includes(f.origine)); assert.match(f.id, /^[a-z][a-z0-9_-]*$/); });

  test(`contratto [${nome}]: ogni zona dell'app ha una quotazione valida, o nessuna: mai una quotazione rotta`, async () => {
    assert.ok(ZONE.length >= 13, `zone trovate: ${ZONE.length}`);
    for (const z of ZONE) {
      const q = await f.quotazione(z); if (q === null) continue;
      assert.ok(Number.isFinite(q.min) && Number.isFinite(q.max), z); assert.ok(q.min > 0 && q.max >= q.min, `${z}: ${q.min}–${q.max}`);
      assert.ok(q.max < 200, `${z}: ${q.max} €/m² al mese è troppo per un affitto`); assert.ok(["provvisoria", "fornitore"].includes(q.origine), z);
      assert.equal(q.origine, f.origine, "l'origine della quotazione e quella della fonte devono coincidere");
      assert.ok(typeof q.fonte === "string" && q.fonte.trim().length > 5, `${z}: manca la fonte`); assert.ok(typeof q.aggiornamento === "string" && q.aggiornamento.trim().length > 0, `${z}: manca l'aggiornamento`);
    }
  });

  test(`contratto [${nome}]: zone strane non lanciano errori e non inventano una quotazione`, async () => {
    for (const z of ["", "   ", "Zona che non esiste, Milano", "__proto__", "constructor", "toString", "<script>", "a".repeat(5000), null, undefined, 42, {}]) {
      let q; await assert.doesNotReject(async () => { q = await f.quotazione(z); }); assert.ok(q === null || (q.min > 0 && q.max >= q.min), JSON.stringify(z));
      if (f.origine === "provvisoria") assert.equal(q, null, `la fonte di prova non deve conoscere «${String(z).slice(0, 20)}»`);
    }
  });

  test(`contratto [${nome}]: la stessa zona dà sempre la stessa risposta`, async () => { for (const z of ZONE.slice(0, 3)) assert.deepEqual(await f.quotazione(z), await f.quotazione(z)); });

  test(`contratto [${nome}]: una fonte di prova lo dice nella fonte; una vera non dice «prova»`, async () => {
    const q = await f.quotazione(ZONE[0]); if (!q) return;
    if (f.origine === "provvisoria") assert.match(q.fonte, /prova/i); else assert.ok(!/prova|esempio|test/i.test(q.fonte), `una fonte vera dice «${q.fonte}»`);
  });
}

test("fonte provvisoria: ogni zona dell'app ha i suoi numeri, e ogni voce è una zona dell'app", () => {
  const nomi = ZONE.map((z) => z.replace(/,\s*Milano$/, ""));
  for (const n of nomi) assert.ok(prov.QUOTAZIONI_DI_PROVA[n], `la zona «${n}» non ha quotazioni di prova`);
  for (const k of Object.keys(prov.QUOTAZIONI_DI_PROVA)) assert.ok(nomi.includes(k), `«${k}» non è una zona dell'app`);
});

test("fonte provvisoria: i numeri sono plausibili per Milano (non zero, non assurdi), e Porta Nuova costa più di Certosa", () => {
  for (const [z, q] of Object.entries(prov.QUOTAZIONI_DI_PROVA)) { assert.ok(q.min >= 8 && q.max <= 60 && q.min < q.max, z); }
  assert.ok(prov.QUOTAZIONI_DI_PROVA["Porta Nuova"].min > prov.QUOTAZIONI_DI_PROVA.Certosa.max);
});

test("quotazioniPerZone: restituisce le zone note e salta le altre", async () => {
  const r = await reg.quotazioniPerZone([...ZONE, "Zona sconosciuta, Milano"]); assert.equal(Object.keys(r).length, ZONE.length); assert.ok(!("Zona sconosciuta, Milano" in r)); assert.deepEqual(await reg.quotazioniPerZone([]), {});
});

test("quotazioniPerZone: una zona che non si riesce a leggere non impedisce le altre, e una fonte configurata male dà un elenco vuoto (mai un errore)", async () => {
  const f = reg.FORNITORI_QUOTAZIONI.provvisorio; const originale = f.quotazione;
  try { f.quotazione = async (z) => { if (z === ZONE[1]) throw new Error("boom"); return originale(z); }; const r = await reg.quotazioniPerZone(ZONE); assert.equal(Object.keys(r).length, ZONE.length - 1); assert.ok(!(ZONE[1] in r)); } finally { f.quotazione = originale; }
  const prima = process.env.QUOTAZIONI_PROVIDER; process.env.QUOTAZIONI_PROVIDER = "inesistente";
  try { assert.deepEqual(await reg.quotazioniPerZone(ZONE), {}); } finally { if (prima === undefined) delete process.env.QUOTAZIONI_PROVIDER; else process.env.QUOTAZIONI_PROVIDER = prima; }
});

// ============================================================ il consiglio
const cons = (o = {}) => con.consigliaPrezzo({ quotazione: Q(), mq: 50, canone: 1250, classe: null, ...o });

test("in linea: dentro la fascia (20–30 €/m² per 50 m² = 1000–1500), con i numeri nel testo", () => {
  const c = cons(); assert.equal(c.fascia, "in_linea"); assert.equal(c.minimo, 1000); assert.equal(c.massimo, 1500); assert.equal(c.scostamentoPct, 0);
  assert.equal(c.testo, "Il canone è in linea con la zona: per 50 m² un affitto tipico sta tra 1000 e 1500 € al mese.");
});

test("i bordi: il minimo e il massimo sono in linea; con la tolleranza del 5% ancora; oltre no", () => {
  assert.equal(cons({ canone: 1000 }).fascia, "in_linea"); assert.equal(cons({ canone: 1500 }).fascia, "in_linea");
  assert.equal(cons({ canone: 950 }).fascia, "in_linea", "esattamente -5%: ancora in linea"); assert.equal(cons({ canone: 949 }).fascia, "sotto");
  assert.equal(cons({ canone: 1575 }).fascia, "in_linea", "esattamente +5%"); assert.equal(cons({ canone: 1576 }).fascia, "sopra");
});

test("sotto e sopra: lo scostamento in percentuale e un testo che non promette", () => {
  const s = cons({ canone: 800 }); assert.equal(s.fascia, "sotto"); assert.equal(s.scostamentoPct, 20); assert.match(s.testo, /sotto la fascia tipica.*potresti chiedere di più/);
  const o = cons({ canone: 2000 }); assert.equal(o.fascia, "sopra"); assert.equal(o.scostamentoPct, 33); assert.match(o.testo, /sopra la fascia tipica.*potresti ricevere meno candidature/);
  for (const t of [s.testo, o.testo, cons().testo]) assert.ok(!/garantit|sicur|certo|vincol|obblig|devi\b/i.test(t), `il testo promette o impone: ${t}`);
});

test("al crescere del canone la fascia va da sotto a in linea a sopra, mai al contrario", () => {
  const ordine = { sotto: 0, in_linea: 1, sopra: 2 }; let prec = -1;
  for (let canone = 100; canone <= 4000; canone += 25) { const f = ordine[cons({ canone }).fascia]; assert.ok(f >= prec, `a ${canone} la fascia torna indietro`); prec = f; }
  assert.equal(prec, 2);
});

test("la fascia cresce con i metri quadri", () => {
  const a = cons({ mq: 30 }), b = cons({ mq: 60 }), c = cons({ mq: 120 }); assert.ok(a.minimo < b.minimo && b.minimo < c.minimo && a.massimo < b.massimo && b.massimo < c.massimo); assert.ok(a.minimo <= a.massimo);
});

test("arrotondamento a 10 euro", () => { const c = cons({ quotazione: Q({ min: 21.37, max: 29.91 }), mq: 47 }); assert.equal(c.minimo % 10, 0); assert.equal(c.massimo % 10, 0); assert.equal(c.minimo, 1000); assert.equal(c.massimo, 1410); });

test("nessun consiglio quando mancano i dati: meglio niente che un consiglio inventato", () => {
  for (const o of [{ quotazione: null }, { quotazione: undefined }, { mq: null }, { mq: 0 }, { mq: -5 }, { mq: NaN }, { mq: Infinity }, { mq: "50" }, { canone: null }, { canone: 0 }, { canone: -100 }, { canone: NaN }, { canone: "1250" }, { quotazione: Q({ min: 0 }) }, { quotazione: Q({ min: 30, max: 20 }) }, { quotazione: Q({ min: NaN }) }]) assert.equal(cons(o), null, JSON.stringify(o));
});

test("classe energetica: i coefficienti salgono dalla G alla A, D è neutra, e una classe assente o falsa non cambia niente", () => {
  const ordine = [...en.CLASSI_ENERGETICHE].reverse(); let prec = 0;
  for (const c of ordine) { const f = con.fattoreEnergia(c); assert.ok(f >= prec, `${c}: ${f} < ${prec}`); prec = f; }
  assert.equal(con.fattoreEnergia("D"), 1); assert.ok(con.fattoreEnergia("A4") > 1 && con.fattoreEnergia("G") < 1);
  for (const x of [null, undefined, "", "H", "a4", 4]) assert.equal(con.fattoreEnergia(x), 1, JSON.stringify(x));
  assert.deepEqual(Object.keys(con.FATTORI_ENERGIA).sort(), [...en.CLASSI_ENERGETICHE].sort(), "ogni classe ha un coefficiente");
  for (const [c, f] of Object.entries(con.FATTORI_ENERGIA)) assert.ok(f > 0.5 && f < 1.5, `${c}: ${f} è un coefficiente assurdo`);
});

test("classe energetica: sposta la fascia e il consiglio la nomina; senza classe o con D non la nomina", () => {
  const a = cons({ classe: "A4" }), g = cons({ classe: "G" }), d = cons({ classe: "D" }), n = cons({ classe: null });
  assert.ok(a.minimo > d.minimo && g.minimo < d.minimo); assert.equal(d.minimo, n.minimo);
  assert.match(a.dettaglio, /classe energetica A4 \(\+6%\)/); assert.match(g.dettaglio, /classe energetica G \(−9%\)/); assert.ok(!/classe energetica/.test(d.dettaglio) && !/classe energetica/.test(n.dettaglio));
  assert.equal(cons({ canone: 1450, classe: "G" }).fascia, "sopra", "lo stesso canone può essere in linea per una casa efficiente e alto per una che disperde"); assert.equal(cons({ canone: 1450, classe: "A4" }).fascia, "in_linea");
});

test("provvisorio: si segnala con una fonte di prova; con una fonte vera solo se un coefficiente provvisorio ha cambiato il numero", () => {
  assert.equal(cons({ quotazione: Q({ origine: "provvisoria" }) }).provvisorio, true);
  assert.equal(con.COEFFICIENTI_ENERGIA_PROVVISORI, true);
  assert.equal(cons({ classe: null }).provvisorio, false, "fonte vera e nessun coefficiente in gioco"); assert.equal(cons({ classe: "D" }).provvisorio, false, "D vale 1: il coefficiente non ha cambiato niente");
  assert.equal(cons({ classe: "B" }).provvisorio, true, "B sposta la fascia con un coefficiente provvisorio");
});

test("il dettaglio dice da dove vengono i numeri", () => {
  const c = cons({ quotazione: Q({ fonte: "Agenzia delle Entrate, OMI", aggiornamento: "2° semestre 2025", min: 22, max: 29 }), classe: null });
  assert.equal(c.dettaglio, "Agenzia delle Entrate, OMI · 22–29 € al m² al mese · 2° semestre 2025");
});

test("testi: nessuna promessa, nessun genere, e le costanti dicono che è un'indicazione e che i dati sono di prova", () => {
  assert.match(con.AVVISO_INDICATIVO, /non una valutazione/); assert.match(con.AVVISO_INDICATIVO, /il canone lo decidi tu/); assert.match(con.AVVISO_DATI_DI_PROVA, /non sono dati reali/); assert.match(con.AVVISO_DATI_DI_PROVA, /OMI/);
  for (const t of [con.AVVISO_INDICATIVO, con.AVVISO_DATI_DI_PROVA, con.SENZA_QUOTAZIONE, con.SENZA_DATI]) assert.ok(!/\b(lui|lei)\b/i.test(t), t);
});

test("la logica non ha accesso alla rete né al browser, e la fonte non riceve dati dell'annuncio (solo la zona)", () => {
  for (const f of ["tipi.ts", "provvisorio.ts", "consiglio.ts"]) {
    const c = leggi("src", "lib", "prezzi", f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const vietato of [/\bfetch\(/, /localStorage/, /supabase/i, /console\./, /process\.env/, /\bimport\s+(?!type)(?![^;]*from\s+"\.\.?\/)/]) assert.ok(!vietato.test(c), `${f} usa ${vietato}`);
  }
  assert.match(leggi("src", "lib", "prezzi", "tipi.ts"), /quotazione\(zona: string\)/, "la fonte deve ricevere solo la zona");
});

// ============================================================ collegamenti
test("collegamenti: la pagina carica le quotazioni di tutte le zone e le passa al modulo, che le mostra", () => {
  const pagina = leggi("src", "app", "(app)", "immobili", "page.tsx");
  assert.match(pagina, /await quotazioniPerZone\(ZONE_MILANO\)/); assert.match(pagina, /quotazioni=\{quotazioni\}/);
  const client = leggi("src", "app", "(app)", "immobili", "ImmobiliClient.tsx");
  assert.match(client, /action=\{creaImmobile\}\s+quotazioni=\{quotazioni\}/, "il modulo di creazione non riceve le quotazioni");
  assert.match(client, /action=\{aggiornaImmobile\}\s+immobile=\{selezionato\}\s+quotazioni=\{quotazioni\}/, "il modulo di modifica non riceve le quotazioni");
  assert.match(client, /<PannelloPrezzo zona=\{zona\} canone=\{prezzo\} mq=\{mq\} classe=\{classe\} quotazioni=\{quotazioni\} \/>/);
});

test("il pannello non salva niente e non chiama niente: solo calcolo sui dati del modulo", () => {
  const c = leggi("src", "components", "PannelloPrezzo.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const vietato of [/\bfetch\(/, /supabase/i, /\.rpc\(/, /useEffect/, /useState/, /localStorage/, /console\./, /process\.env/]) assert.ok(!vietato.test(c), `il pannello usa ${vietato}`);
});

test("il pannello è un'area che si annuncia ai lettori di schermo quando cambia", () => { assert.match(leggi("src", "components", "PannelloPrezzo.tsx"), /role="status" aria-live="polite"/); });

test("la pagina non rompe se le quotazioni non si leggono: usa un registro che non lancia errori", () => {
  const i = leggi("src", "lib", "prezzi", "index.ts"); const corpo = i.slice(i.indexOf("export async function quotazioniPerZone"));
  assert.match(corpo, /catch \{\s*return \{\};/); assert.match(corpo, /catch \{\s*\/\/ una zona che non si riesce a leggere/);
});
