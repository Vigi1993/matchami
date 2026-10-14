/**
 * Test della firma di prova del contratto (src/lib/firma e i collegamenti con la migrazione 0029).
 * Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { caricaTs, radice } from "./carica-ts.mjs";

const imp = caricaTs(path.join(radice, "src", "lib", "firma", "impronta.ts"));
const st = caricaTs(path.join(radice, "src", "lib", "firma", "stato.ts"));
const reg = caricaTs(path.join(radice, "src", "lib", "firma", "index.ts"));
const dati = caricaTs(path.join(radice, "src", "lib", "contratto", "dati.ts"));
const con = caricaTs(path.join(radice, "src", "lib", "contratto", "index.ts"));
const v = caricaTs(path.join(radice, "src", "lib", "verifica.ts"));
const { INFORMATIVA } = caricaTs(path.join(radice, "src", "content", "informativa.ts"));
// con i ritorni a capo di Windows normalizzati
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const sql = leggi("supabase", "migrations", "0029_firme_contratto.sql");

const RIGA = { contratto_id: "d1111111-1111-4111-8111-11111111111d", stato: "in_firma", canone: 1450, durata_mesi: 12, data_inizio: "2026-11-01", data_firma: null, titolo: "Bilocale Isola", zona: "Isola, Milano", locali: 2, mq: 55, classe_energetica: "B", ep_globale: "95.50", via: "Via Garibaldi", civico: "12", cap: "20121", citta: "Milano", locatore_nome: "Olga", locatore_cognome: "Bianchi", conduttore_nome: "Tina", conduttore_cognome: "Verdi", io_sono: "locatore" };
const doc = (o = {}) => con.componiContratto(dati.datiDaRiga({ ...RIGA, ...o }));
const H1 = "a".repeat(64), H2 = "b".repeat(64);
const firma = (ruolo, o = {}) => ({ contratto_id: RIGA.contratto_id, ruolo, origine: "provvisoria", impronta: H1, firmata_at: "2026-10-12T10:00:00Z", mia: false, ...o });

// ============================================================ l'impronta
test("JSON canonico: chiavi in ordine, nessuno spazio, undefined ignorato, array nell'ordine dato", () => {
  assert.equal(imp.jsonCanonico({ b: 2, a: 1 }), '{"a":1,"b":2}'); assert.equal(imp.jsonCanonico({ b: { d: 4, c: 3 }, a: [3, 1, 2] }), '{"a":[3,1,2],"b":{"c":3,"d":4}}');
  assert.equal(imp.jsonCanonico({ a: undefined, b: null }), '{"b":null}'); assert.equal(imp.jsonCanonico([undefined, NaN, Infinity]), "[null,null,null]"); assert.equal(imp.jsonCanonico("a\"b"), '"a\\"b"');
  assert.equal(imp.jsonCanonico({ a: 1, b: 2 }), imp.jsonCanonico({ b: 2, a: 1 }), "l'ordine di costruzione non conta");
});
test("JSON canonico: il testo si normalizza (una «è» precomposta e una «e»+accento sono la stessa cosa)", () => { assert.equal(imp.jsonCanonico("caf\u00e9"), imp.jsonCanonico("cafe\u0301")); assert.notEqual(imp.jsonCanonico("cafe"), imp.jsonCanonico("caf\u00e9")); });
test("impronta: 64 caratteri esadecimali minuscoli, ed è proprio lo SHA-256 della forma canonica", () => {
  const d = doc(); const h = imp.improntaDocumento(d); assert.match(h, /^[0-9a-f]{64}$/); assert.equal(h, createHash("sha256").update(imp.jsonCanonico(d), "utf8").digest("hex"));
});
test("impronta: lo stesso documento dà sempre la stessa impronta", () => { assert.equal(imp.improntaDocumento(doc()), imp.improntaDocumento(doc())); assert.equal(imp.improntaDocumento(doc()), imp.improntaDocumento(JSON.parse(JSON.stringify(doc())))); });
test("impronta: basta cambiare UN dato perché cambi (importo, data, durata, nome, titolo, indirizzo, classe...)", () => {
  const base = imp.improntaDocumento(doc()); const varianti = [{ canone: 1451 }, { data_inizio: "2026-11-02" }, { durata_mesi: 13 }, { conduttore_nome: "Tino" }, { locatore_cognome: "Bianchi " .trim() + "i" }, { titolo: "Bilocale Isola!" }, { civico: "13" }, { classe_energetica: "C" }, { mq: 56 }, { zona: "Navigli, Milano" }, { ep_globale: "95.51" }, { cap: "20122" }];
  const visti = new Set([base]); for (const o of varianti) { const h = imp.improntaDocumento(doc(o)); assert.notEqual(h, base, JSON.stringify(o)); visti.add(h); } assert.equal(visti.size, varianti.length + 1, "due varianti hanno la stessa impronta");
});
test("impronta: cambia anche con la versione del modello o con un avviso (si firma un TESTO, non solo dei dati)", () => {
  const d = doc(); const h = imp.improntaDocumento(d);
  assert.notEqual(imp.improntaDocumento({ ...d, modello: { ...d.modello, versione: "2" } }), h); assert.notEqual(imp.improntaDocumento({ ...d, modello: { ...d.modello, id: "altro" } }), h);
  assert.notEqual(imp.improntaDocumento({ ...d, avvisi: [...d.avvisi, "un avviso in più"] }), h); assert.notEqual(imp.improntaDocumento({ ...d, bozza: false }), h);
  assert.notEqual(imp.improntaDocumento({ ...d, sezioni: d.sezioni.slice(1) }), h);
});
test("impronta: il caso senza dati e quello con dati sono diversi, e nessuno dei due lancia errori", () => {
  const vuoto = con.componiContratto(dati.datiDaRiga({ contratto_id: RIGA.contratto_id, stato: "bozza", io_sono: "locatore" })); assert.match(imp.improntaDocumento(vuoto), /^[0-9a-f]{64}$/); assert.notEqual(imp.improntaDocumento(vuoto), imp.improntaDocumento(doc()));
});

// ============================================================ il servizio di firma e il suo registro
test("registro: senza configurazione il servizio di prova; un nome sbagliato è un errore che dice quali ci sono", () => {
  const prima = process.env.FIRMA_PROVIDER; delete process.env.FIRMA_PROVIDER;
  try { for (const x of [undefined, null, "", "  ", "provvisorio"]) assert.equal(reg.fornitoreFirma(x).id, "provvisorio", JSON.stringify(x)); } finally { if (prima !== undefined) process.env.FIRMA_PROVIDER = prima; }
  assert.throws(() => reg.fornitoreFirma("docusign"), (e) => /«docusign»/.test(e.message) && /provvisorio/.test(e.message));
  for (const x of ["__proto__", "constructor", "toString", "hasOwnProperty"]) assert.throws(() => reg.fornitoreFirma(x), /sconosciuto/, x);
});

for (const [nome, f] of Object.entries(reg.FORNITORI_FIRMA)) {
  test(`contratto [${nome}]: identificativo uguale al nome registrato, origine ammessa`, () => { assert.equal(f.id, nome); assert.ok(["provvisoria", "fornitore"].includes(f.origine)); assert.match(f.id, /^[a-z][a-z0-9_-]*$/); });
  test(`contratto [${nome}]: firma() restituisce sempre un esito e non lancia errori, qualunque cosa riceva`, async () => {
    for (const r of [{ contrattoId: RIGA.contratto_id, impronta: H1, firmatario: "u" }, { contrattoId: "", impronta: "", firmatario: "" }, null, undefined, {}, { impronta: 5 }, { impronta: H1.toUpperCase() }]) {
      let e; await assert.doesNotReject(async () => { e = await f.firma(r); }, JSON.stringify(r)); assert.ok(e && typeof e.ok === "boolean", JSON.stringify(e)); if (!e.ok) { assert.equal(typeof e.errore, "string"); assert.equal(typeof e.definitivo, "boolean"); }
    }
  });
  test(`contratto [${nome}]: un'impronta che non ha la forma giusta non si firma`, async () => { for (const h of ["", "abc", H1.slice(1), H1 + "a", H1.toUpperCase(), "g".repeat(64)]) { const e = await f.firma({ contrattoId: "x", impronta: h, firmatario: "u" }); assert.equal(e.ok, false, JSON.stringify(h)); } });
}
test("servizio di prova: firma una impronta valida, e basta (nessuna rete, nessun effetto)", async () => {
  assert.deepEqual(await reg.FORNITORI_FIRMA.provvisorio.firma({ contrattoId: "x", impronta: H1, firmatario: "u" }), { ok: true }); assert.equal(reg.FORNITORI_FIRMA.provvisorio.origine, "provvisoria");
  const c = leggi("src", "lib", "firma", "provvisorio.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""); for (const vietato of [/\bfetch\(/, /supabase/i, /process\.env/, /console\./, /localStorage/]) assert.ok(!vietato.test(c), String(vietato));
});

test("informativa: finché il servizio è di prova lo dice; con un servizio vero va rivista", () => {
  const t = JSON.stringify(INFORMATIVA); const veri = Object.values(reg.FORNITORI_FIRMA).filter((f) => f.origine === "fornitore");
  if (veri.length === 0) assert.match(t, /Per ora la firma è di prova: non ha valore legale e non rende il contratto «firmato»/);
  else { assert.ok(!/Per ora la firma è di prova/.test(t), `c'è un servizio vero (${veri.map((f) => f.id).join(", ")}) ma il testo dice che la firma è di prova`); assert.match(t, /servizio di firma/); }
});
test("informativa: dichiara cosa si conserva (chi, quando, impronta), cosa NO, chi la vede, e che si ritira", () => {
  const t = JSON.stringify(INFORMATIVA);
  assert.match(t, /conserviamo chi ha firmato \(il proprietario o l'inquilino\), quando, e un'impronta del testo firmato/); assert.match(t, /non conserviamo immagini di firme né dati del dispositivo/); assert.match(t, /La vedono solo le due parti, e ognuno può ritirare la propria/);
});

// ============================================================ cosa mostrare (la logica pura)
const riep = (o = {}) => st.riepilogoFirme({ statoContratto: "in_firma", firme: [], improntaAttuale: H1, ...o });
test("nessuna firma, contratto in firma: si può firmare, e le due righe sono nell'ordine proprietario, inquilino", () => {
  const r = riep(); assert.equal(r.puoFirmare, true); assert.equal(r.haUnaFirmaMia, false); assert.equal(r.entrambeValide, false); assert.equal(r.sintesi, "Nessuna firma di prova ancora.");
  assert.deepEqual(r.righe.map((x) => [x.ruolo, x.etichetta, x.firmata, x.testo]), [["locatore", "Proprietario", false, "Non ha ancora firmato"], ["conduttore", "Inquilino", false, "Non ha ancora firmato"]]);
});
test("si firma SOLO se il contratto è «in firma»: bozza, firmato e concluso no, e dice perché", () => {
  assert.equal(riep({ statoContratto: "bozza" }).puoFirmare, false); assert.equal(riep({ statoContratto: "bozza" }).motivo, "La firma si apre quando il contratto è «in firma».");
  for (const s of ["firmato", "concluso", "boh", ""]) { const r = riep({ statoContratto: s }); assert.equal(r.puoFirmare, false, s); assert.match(r.motivo, /non è più «in firma»/); }
});
test("la mia firma sulla versione attuale: non si rifirma, e si può ritirare", () => {
  const r = riep({ firme: [firma("conduttore", { mia: true })] }); assert.equal(r.puoFirmare, false); assert.equal(r.haUnaFirmaMia, true); assert.equal(r.motivo, "Hai già firmato questa versione."); assert.equal(r.righe[1].valida, true); assert.match(r.righe[1].testo, /^Firma di prova del 12 ottobre 2026$/);
  assert.equal(r.sintesi, "Manca la firma di prova di una delle due parti.");
});
test("una firma SUPERATA (il contratto è cambiato dopo): lo dice, si può rifirmare, e non vale", () => {
  const r = riep({ improntaAttuale: H2, firme: [firma("conduttore", { mia: true })] }); assert.equal(r.righe[1].valida, false); assert.match(r.righe[1].testo, /SUPERATA: il contratto è cambiato dopo la firma/); assert.equal(r.puoFirmare, true); assert.equal(r.haUnaFirmaMia, true); assert.equal(r.entrambeValide, false); assert.equal(r.sintesi, "Il contratto è cambiato dopo una firma di prova: va rifatta.");
});
test("entrambe le parti hanno firmato la versione attuale: la sintesi dice che il contratto NON risulta firmato", () => {
  const r = riep({ firme: [firma("locatore"), firma("conduttore", { mia: true })] }); assert.equal(r.entrambeValide, true); assert.match(r.sintesi, /NON risulta firmato: serve una firma vera/);
});
test("basta UNA firma superata per non essere «entrambe valide»", () => { assert.equal(riep({ firme: [firma("locatore"), firma("conduttore", { impronta: H2 })] }).entrambeValide, false); });
test("se l'impronta di oggi non si è potuta calcolare la firma non è né valida né superata (mai un giudizio inventato)", () => {
  const r = riep({ improntaAttuale: null, firme: [firma("locatore"), firma("conduttore", { mia: true })] }); assert.equal(r.righe[0].valida, null); assert.ok(!/SUPERATA/.test(JSON.stringify(r))); assert.equal(r.entrambeValide, false); assert.equal(r.puoFirmare, true, "si può firmare comunque: l'azione calcola l'impronta per conto suo");
});
test("la data è in italiano e in ora di Roma, anche a cavallo della mezzanotte", () => {
  assert.match(riep({ firme: [firma("locatore", { firmata_at: "2026-10-12T23:30:00Z" })] }).righe[0].testo, /13 ottobre 2026/); assert.match(riep({ firme: [firma("locatore", { firmata_at: "2026-03-01T10:00:00Z" })] }).righe[0].testo, /1 marzo 2026/);
});
test("righe sconosciute o doppie non rompono niente (conta la prima per ruolo)", () => {
  const r = riep({ firme: [firma("boh"), firma("locatore", { impronta: H1 }), firma("locatore", { impronta: H2 })] }); assert.equal(r.righe[0].valida, true); assert.equal(r.righe[1].firmata, false);
});
test("testi: dicono sempre che non ha valore legale e non rende «firmato», senza presumere il genere", () => {
  assert.match(st.TESTO_NESSUN_VALORE, /non ha valore legale e non rende il contratto «firmato»/); const tutto = [st.TESTO_NESSUN_VALORE, ...Object.values(st.ETICHETTA_RUOLO), riep().sintesi, riep({ firme: [firma("locatore"), firma("conduttore")] }).sintesi].join(" ");
  assert.ok(!/\b(lui|lei)\b/i.test(tutto), tutto);
});
test("nessuna combinazione di firme fa dire che il contratto è «firmato» senza il «NON»", () => {
  for (const f of [[], [firma("locatore")], [firma("locatore"), firma("conduttore")], [firma("locatore", { impronta: H2 })]]) { const t = JSON.stringify(riep({ firme: f })); assert.ok(!/risulta firmato/.test(t.replace(/NON risulta firmato/g, "")), t); }
});

// ============================================================ coerenza con la migrazione
test("regole rispecchiate: i ruoli, l'impronta, il modello e lo stato «in firma» sono quelli della migrazione", () => {
  assert.match(sql, /ruolo\s+text not null check \(ruolo in \('locatore', 'conduttore'\)\)/); assert.deepEqual(Object.keys(st.ETICHETTA_RUOLO), ["locatore", "conduttore"]);
  assert.match(sql, /impronta ~ '\^\[0-9a-f\]\{64\}\$'/); assert.match(sql, /v_stato <> 'in_firma'/); assert.match(sql, /modello_id\s+text not null check \(modello_id ~ '\^\[a-z\]\[a-z0-9_-\]\{0,39\}\$'\)/);
  assert.match(sql, /char_length\(modello_versione\) between 1 and 20/); assert.match(sql, /unique \(contratto_id, firmatario\)/);
});
test("migrazione: la promessa è nella STRUTTURA: nessun parametro per scegliere l'origine, nessuna scrittura dello stato, firma vera intoccabile", () => {
  const senzaCommenti = sql.replace(/--[^\n]*/g, ""); const firmaFn = senzaCommenti.slice(senzaCommenti.indexOf("create or replace function public.registra_firma_di_prova"), senzaCommenti.indexOf("create or replace function public.revoca_firma_di_prova"));
  const params = firmaFn.match(/registra_firma_di_prova\(([\s\S]*?)\)\s*returns/)[1]; assert.ok(!/origine|fornitore|stato/i.test(params), "un parametro permette di scegliere l'origine: " + params);
  assert.match(firmaFn, /'provvisoria', 'provvisorio'/); assert.ok(!/update\s+contratti/i.test(senzaCommenti), "una funzione scrive nello stato del contratto"); assert.ok(!/set\s+stato/i.test(senzaCommenti));
  assert.match(firmaFn, /if v_esistente\.origine <> 'provvisoria' then\s+raise exception 'FIRMA_GIA_REGISTRATA'/); assert.match(senzaCommenti, /and origine = 'provvisoria';/, "il ritiro deve toccare solo le firme di prova");
});
test("migrazione: la tabella non ha permessi né regole dirette, e il blocco del contratto c'è", () => {
  assert.match(sql, /alter table firme_contratto enable row level security;/); assert.match(sql, /revoke all on firme_contratto from anon, authenticated;/); assert.ok(!/create policy/i.test(sql.replace(/--[^\n]*/g, "")), "una regola sulla tabella delle firme");
  assert.match(sql, /for update of c;/, "senza il blocco due firme insieme della stessa persona danno un errore"); assert.match(sql, /revoke all on function[\s\S]*?from public, anon;[\s\S]*?grant execute on function[\s\S]*?to authenticated;/);
});
test("migrazione: l'elenco delle firme non rivela chi sono le persone (nessun identificativo, nessun nome)", () => {
  const colonne = sql.match(/firme_dei_miei_contratti\(\)\s+returns table \(([\s\S]*?)\)\s*language sql/)[1]; assert.ok(!/firmatario|user|nome|mail/i.test(colonne), colonne);
  const tipo = leggi("src", "lib", "firma", "tipi.ts").match(/export type FirmaContratto = \{[\s\S]*?\n\};/)[0]; assert.ok(!/firmatario|user_id/.test(tipo), "il tipo della firma ha l'identificativo della persona");
});
test("errori: ogni codice della migrazione ha una frase sua, e «FIRMA_CONTRATTO_NON_TUO» non prende la frase dei documenti", () => {
  const G = v.messaggioErroreVerifica("qualcosa di sconosciuto"); const codici = [...new Set([...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]))];
  for (const c of ["FIRMA_CONTRATTO_NON_TUO", "FIRMA_CONTRATTO_NON_IN_FIRMA", "FIRMA_IMPRONTA_NON_VALIDA", "FIRMA_MODELLO_NON_VALIDO", "FIRMA_NON_TROVATA", "FIRMA_GIA_REGISTRATA"]) assert.ok(codici.includes(c), c);
  for (const c of codici) { const f = v.messaggioErroreVerifica(`ERROR: ${c} (P0001)`); assert.notEqual(f, G, `${c} non ha un messaggio`); assert.ok(!f.includes(c), c); }
  assert.match(v.messaggioErroreVerifica("FIRMA_CONTRATTO_NON_TUO"), /Non puoi firmare questo contratto/); assert.ok(!/documenti/.test(v.messaggioErroreVerifica("FIRMA_CONTRATTO_NON_TUO"))); assert.match(v.messaggioErroreVerifica("FIRMA_CONTRATTO_NON_IN_FIRMA"), /«in firma»/);
});

function filiDiCodice(dir = path.join(radice, "src")) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => { if (e.name.startsWith("__")) return []; const p = path.join(dir, e.name); return e.isDirectory() ? filiDiCodice(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : []; }); }
const rel = (f) => path.relative(radice, f).replaceAll("\\", "/");
test("chiamate: ogni funzione della firma si chiama con i parametri della migrazione, e solo dai posti previsti", () => {
  const funzioni = new Map(); for (const m of sql.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)/g)) funzioni.set(m[1], [...m[2].matchAll(/\b(p_\w+)\s/g)].map((x) => x[1]).sort());
  const attese = { firme_dei_miei_contratti: ["src/lib/firma/carica.ts"], registra_firma_di_prova: ["src/app/(app)/contratto/firma-actions.ts"], revoca_firma_di_prova: ["src/app/(app)/contratto/firma-actions.ts"] }; const trovate = Object.fromEntries(Object.keys(attese).map((k) => [k, new Set()]));
  for (const f of filiDiCodice()) { const c = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""); for (const nome of Object.keys(attese)) for (const m of c.matchAll(new RegExp(`"${nome}"\\s*(?:,\\s*\\{([^}]*)\\}|\\))`, "g"))) { assert.deepEqual([...(m[1] ?? "").matchAll(/\b(p_\w+)\s*:/g)].map((x) => x[1]).sort(), funzioni.get(nome), `${rel(f)} chiama ${nome} con parametri diversi`); trovate[nome].add(rel(f)); } }
  for (const [nome, posti] of Object.entries(attese)) assert.deepEqual([...trovate[nome]].sort(), posti, `${nome}: chiamata da posti diversi dal previsto`);
});
test("privacy: nessun codice dell'app nomina la tabella delle firme", () => { for (const f of filiDiCodice()) assert.ok(!/firme_contratto/.test(fs.readFileSync(f, "utf8")), `${rel(f)} nomina la tabella delle firme`); });
test("azione: l'impronta si calcola sul SERVER dai dati veri (non arriva dal browser), un servizio vero non si registra mai «di prova», e lo stato non si scrive", () => {
  const a = leggi("src", "app", "(app)", "contratto", "firma-actions.ts"); const f = a.slice(a.indexOf("export async function firmaContratto"), a.indexOf("export async function ritiraFirma")); const i = (s) => f.indexOf(s);
  assert.match(a, /export async function firmaContratto\(contrattoId: string\)/, "l'azione accetta altro oltre all'identificativo del contratto"); assert.match(f, /improntaDocumento\(documento\)/);
  assert.ok(i('rpc("dati_contratto"') > 0 && i('rpc("dati_contratto"') < i("improntaDocumento(") && i("improntaDocumento(") < i("servizio.firma(") && i("servizio.firma(") < i('rpc("registra_firma_di_prova"'), "ordine: dati, impronta, servizio, registrazione");
  assert.match(f, /servizio\.origine !== "provvisoria"/); assert.ok(i('servizio.origine !== "provvisoria"') < i("servizio.firma("), "il controllo dell'origine deve venire PRIMA di chiamare il servizio");
  const c = a.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""); // niente scritture dirette né modifiche allo stato del contratto (la parola «stato» compare nei messaggi: «è stato possibile»)
  assert.ok(!/\.from\(|\.update\(|\.insert\(|\bstato\s*[:=]|set\s+stato/.test(c), "l'azione scrive qualcosa o tocca lo stato del contratto");
  assert.deepEqual([...c.matchAll(/\.rpc\("(\w+)"/g)].map((m) => m[1]).sort(), ["dati_contratto", "registra_firma_di_prova", "revoca_firma_di_prova"], "l'azione chiama funzioni diverse da quelle previste");
});
test("componente: nessuna chiamata diretta al database, solo le due azioni", () => {
  const c = leggi("src", "components", "FirmaContratto.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""); for (const vietato of [/supabase/i, /\.rpc\(/, /fetch\(/, /createHash/, /\bimpronta\b/]) assert.ok(!vietato.test(c.replace(/improntaAttuale/g, "")), `il componente usa ${vietato}`);
  assert.match(c, /firmaContratto\(contrattoId\)/); assert.match(c, /ritiraFirma\(contrattoId\)/);
});
test("collegamenti: la firma si vede nei due pannelli dei contratti, con le firme di QUEL contratto", () => {
  // inquilino: la firma sta nel blocco del contratto in pagina, con le firme di QUEL contratto (firme[c.id])
  assert.match(leggi("src", "components", "ContrattoInPagina.tsx"), /<FirmaContratto contrattoId=\{c\.id\} statoContratto=\{c\.stato\} firme=\{firme\?\.firme \?\? \[\]\} improntaAttuale=\{firme\?\.improntaAttuale \?\? null\} \/>/);
  assert.equal([...leggi("src", "app", "(app)", "gestione", "GestioneClient.tsx").matchAll(/firme=\{firme\[c\.id\]\}/g)].length, 2, "in corso e storico passano le firme del PROPRIO contratto");
  for (const f of [["gestione-affitti", "GestioneAffittiClient.tsx"]]) { const c = leggi("src", "app", "(app)", ...f); assert.match(c, /<FirmaContratto\s+contrattoId=\{selezionato\.id\}\s+statoContratto=\{selezionato\.stato\}\s+firme=\{firme\[selezionato\.id\]\?\.firme \?\? \[\]\}\s+improntaAttuale=\{firme\[selezionato\.id\]\?\.improntaAttuale \?\? null\}/, f.join("/")); }
  for (const f of [["gestione", "page.tsx"], ["gestione-affitti", "page.tsx"]]) { const c = leggi("src", "app", "(app)", ...f); assert.match(c, /await caricaFirme\(supabase\)/); assert.match(c, /firme=\{firme\}/); }
});
test("la logica pura della firma non ha accesso alla rete né al browser", () => {
  for (const f of ["tipi.ts", "provvisorio.ts", "stato.ts", "index.ts"]) { const c = leggi("src", "lib", "firma", f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""); for (const vietato of [/\bfetch\(/, /localStorage/, /console\./, /supabase\//]) assert.ok(!vietato.test(c), `${f} usa ${vietato}`); }
});
