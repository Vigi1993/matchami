/**
 * Test della generazione del contratto e del PDF (src/lib/contratto). Si lancia con:   npm test
 *
 * Contengono il CONTRATTO di ogni modello: girano su tutti quelli registrati, quindi chi ne
 * aggiunge uno validato da un legale li ritrova pronti.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { PDFDocument, StandardFonts, PDFArray, decodePDFRawStream } from "pdf-lib";
import { caricaTs, radice } from "./carica-ts.mjs";

const dati = caricaTs(path.join(radice, "src", "lib", "contratto", "dati.ts"));
const reg = caricaTs(path.join(radice, "src", "lib", "contratto", "index.ts"));
const tp = caricaTs(path.join(radice, "src", "lib", "contratto", "testo-pdf.ts"));
const pdf = caricaTs(path.join(radice, "src", "lib", "contratto", "pdf.ts"));
const prov = caricaTs(path.join(radice, "src", "lib", "contratto", "modello-provvisorio.ts"));
const { INFORMATIVA } = caricaTs(path.join(radice, "src", "content", "informativa.ts"));
const sql = fs.readFileSync(path.join(radice, "supabase", "migrations", "0027_dati_contratto.sql"), "utf8");
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8");

const ID = "d1111111-1111-1111-1111-111111111111";
const RIGA = { contratto_id: ID, stato: "in_firma", canone: 1450, durata_mesi: 12, data_inizio: "2026-11-01", data_firma: null, titolo: "Bilocale Isola", zona: "Isola, Milano", locali: 2, mq: 55, classe_energetica: "B", ep_globale: "95.50", via: "Via Garibaldi", civico: "12", cap: "20121", citta: "Milano", locatore_nome: "Olga", locatore_cognome: "Bianchi", conduttore_nome: "Tina", conduttore_cognome: "Verdi", io_sono: "locatore" };
const COMPLETO = dati.datiDaRiga(RIGA);
const VUOTO = dati.datiDaRiga({ contratto_id: ID, io_sono: "conduttore" });
const tutto = (doc) => [doc.titolo, doc.sottotitolo ?? "", ...doc.avvisi, ...doc.sezioni.flatMap((s) => [s.titolo, ...s.paragrafi]), ...doc.firme.flatMap((f) => [f.ruolo, f.nome ?? ""])].join("\n");
const misuraFinta = (t, g) => t.length * g * 0.5;
const DATA = new Date("2026-10-12T10:00:00Z");

// ============================================================ i dati
test("pulizia del testo: spazi ridotti, a capo e caratteri invisibili tolti, e valori strani diventano vuoti", () => {
  assert.equal(dati.pulisciTesto("  Via   Garibaldi \n"), "Via Garibaldi"); assert.equal(dati.pulisciTesto("a\u200bb\u0000c"), "a b c");
  for (const x of [null, undefined, 42, {}, []]) assert.equal(dati.pulisciTesto(x), "");
});

test("nome completo: nome e cognome, uno solo, o nessuno", () => {
  assert.equal(dati.nomeCompleto("Olga", "Bianchi"), "Olga Bianchi"); assert.equal(dati.nomeCompleto("Olga", null), "Olga"); assert.equal(dati.nomeCompleto(null, "Bianchi"), "Bianchi");
  for (const [a, b] of [[null, null], ["", "  "], [undefined, undefined], [5, {}]]) assert.equal(dati.nomeCompleto(a, b), null);
});

test("date: «2026-11-01» diventa «1 novembre 2026»; una data che non esiste o scritta male vale nulla", () => {
  assert.equal(dati.formattaDataIso("2026-11-01"), "1 novembre 2026"); assert.equal(dati.formattaDataIso("2026-12-31"), "31 dicembre 2026"); assert.equal(dati.formattaDataIso("2024-02-29"), "29 febbraio 2024");
  for (const x of ["2026-02-30", "2026-13-01", "2025-02-29", "2026-00-10", "01/11/2026", "2026-1-1", "", null, undefined, 20261101, "2026-11-01T00:00:00Z", "novembre"]) assert.equal(dati.formattaDataIso(x), null, JSON.stringify(x));
});

test("date: il giorno non cambia con il fuso orario del computer", () => {
  const prima = process.env.TZ; try { for (const tz of ["Pacific/Kiritimati", "America/Los_Angeles", "Europe/Rome", "UTC"]) { process.env.TZ = tz; assert.equal(dati.formattaDataIso("2026-11-01"), "1 novembre 2026", tz); } } finally { if (prima === undefined) delete process.env.TZ; else process.env.TZ = prima; }
});

test("righe dal database: dati completi", () => {
  const d = COMPLETO; assert.equal(d.id, ID); assert.deepEqual(d.locatore, { nome: "Olga", cognome: "Bianchi" }); assert.deepEqual(d.conduttore, { nome: "Tina", cognome: "Verdi" });
  assert.equal(d.canone, 1450); assert.equal(d.durataMesi, 12); assert.equal(d.dataInizio, "2026-11-01"); assert.equal(d.dataFirma, null); assert.equal(d.ioSono, "locatore");
  assert.deepEqual(d.immobile.indirizzo, { via: "Via Garibaldi", civico: "12", cap: "20121", citta: "Milano" }); assert.equal(d.immobile.epGlobale, 95.5); assert.equal(d.immobile.classeEnergetica, "B");
});

test("righe dal database: ciò che manca resta nullo, e un indirizzo incompleto non si usa a pezzi", () => {
  const d = VUOTO; assert.equal(d.canone, null); assert.equal(d.durataMesi, null); assert.equal(d.dataInizio, null); assert.equal(d.immobile.indirizzo, null); assert.equal(d.locatore.nome, null); assert.equal(d.ioSono, "conduttore");
  for (const manca of ["via", "civico", "cap", "citta"]) assert.equal(dati.datiDaRiga({ ...RIGA, [manca]: null }).immobile.indirizzo, null, manca);
  assert.equal(dati.datiDaRiga({ ...RIGA, via: "   " }).immobile.indirizzo, null);
});

test("righe dal database: numeri e date impossibili diventano nulli, mai valori inventati", () => {
  for (const x of [0, -5, 1.5, NaN, "1450", null]) assert.equal(dati.datiDaRiga({ ...RIGA, canone: x }).canone, null, JSON.stringify(x));
  assert.equal(dati.datiDaRiga({ ...RIGA, data_inizio: "2026-02-30" }).dataInizio, null); assert.equal(dati.datiDaRiga({ ...RIGA, ep_globale: "boh" }).immobile.epGlobale, null); assert.equal(dati.datiDaRiga({ ...RIGA, ep_globale: 0 }).immobile.epGlobale, 0, "zero è un valore");
  assert.equal(dati.datiDaRiga({ ...RIGA, io_sono: "altro" }).ioSono, "conduttore");
});

test("una riga che non è un contratto non produce dati", () => { for (const x of [null, undefined, {}, { contratto_id: "" }, { contratto_id: 5 }, "boh"]) assert.equal(dati.datiDaRiga(x), null, JSON.stringify(x)); });

// ============================================================ il registro e il CONTRATTO di ogni modello
test("registro: senza configurazione il provvisorio; un nome sbagliato è un errore che dice quali ci sono", () => {
  const prima = process.env.CONTRATTO_MODELLO; delete process.env.CONTRATTO_MODELLO;
  try { for (const x of [undefined, null, "", "  ", "provvisorio"]) assert.equal(reg.modelloContratto(x).id, "provvisorio", JSON.stringify(x)); } finally { if (prima !== undefined) process.env.CONTRATTO_MODELLO = prima; }
  assert.throws(() => reg.modelloContratto("legale"), (e) => /«legale»/.test(e.message) && /provvisorio/.test(e.message));
  for (const x of ["__proto__", "constructor", "toString", "hasOwnProperty"]) assert.throws(() => reg.modelloContratto(x), /sconosciuto/, x);
});

for (const [nome, m] of Object.entries(reg.MODELLI_CONTRATTO)) {
  test(`contratto [${nome}]: identificativo uguale al nome registrato, versione, origine ammessa, e nessun difetto`, () => {
    assert.equal(m.id, nome); assert.ok(String(m.versione).trim().length > 0); assert.ok(["provvisorio", "validato"].includes(m.origine)); assert.deepEqual(reg.difettiDelModello(m), []);
  });
  test(`contratto [${nome}]: con dati completi il documento ha titolo, sezioni, firme, e ogni dato compare`, () => {
    const d = m.genera(COMPLETO); const t = tutto(d);
    assert.ok(d.titolo.length > 5 && d.sezioni.length >= 4 && d.firme.length === 2);
    for (const atteso of ["Olga Bianchi", "Tina Verdi", "Bilocale Isola", "Via Garibaldi 12, 20121 Milano", "1450 euro", "12 mesi", "1 novembre 2026", "55", "Isola, Milano"]) assert.ok(t.includes(atteso), `manca «${atteso}»`);
    assert.ok(/\bB\b/.test(t) && t.includes("95,5"), "mancano classe energetica e indice");
    assert.deepEqual(d.firme.map((f) => f.nome), ["Olga Bianchi", "Tina Verdi"]);
  });
  test(`contratto [${nome}]: senza dati NON si inventa niente: ogni mancanza è «[da indicare]» ed è nell'elenco da completare`, () => {
    const d = m.genera(VUOTO); const t = tutto(d);
    assert.ok(t.includes(dati.DA_INDICARE)); assert.ok(d.daIndicare.length >= 5, d.daIndicare.join()); assert.equal(new Set(d.daIndicare).size, d.daIndicare.length, "doppioni nell'elenco");
    for (const etichetta of ["nome del locatore", "nome del conduttore", "canone mensile", "durata", "data di inizio", "indirizzo dell'immobile"]) assert.ok(d.daIndicare.includes(etichetta), `«${etichetta}» non è nell'elenco`);
    for (const falso of ["Olga", "Tina", "1450", "12 mesi", "Via ", "novembre"]) assert.ok(!t.includes(falso), `ha inventato «${falso}»`);
    assert.deepEqual(d.firme.map((f) => f.nome), [null, null]);
  });
  test(`contratto [${nome}]: nessun «undefined», «null», «NaN» o «[object» in nessun testo, né con dati completi né vuoti`, () => {
    for (const x of [COMPLETO, VUOTO]) assert.ok(!/undefined|\bnull\b|NaN|\[object/.test(tutto(m.genera(x))), tutto(m.genera(x)).slice(0, 300));
  });
  test(`contratto [${nome}]: dati completi = pochi segnaposto (solo ciò che non raccogliamo), e lo dice`, () => {
    const d = m.genera(COMPLETO); assert.ok(d.daIndicare.length > 0 && d.daIndicare.length <= 12, d.daIndicare.join());
    assert.ok(d.daIndicare.includes("codice fiscale del locatore") && d.daIndicare.includes("deposito cauzionale"), "i dati che non raccogliamo devono restare da indicare");
    assert.ok(!d.daIndicare.includes("canone mensile") && !d.daIndicare.includes("nome del locatore"), "ciò che abbiamo non può essere «da indicare»");
  });
  test(`contratto [${nome}]: dati ostili non lanciano errori e restano testo`, () => {
    const ostile = dati.datiDaRiga({ ...RIGA, titolo: '<script>alert(1)</script> & "x"', locatore_nome: "a".repeat(5000), conduttore_cognome: "'; DROP TABLE x; --", via: "💥".repeat(300) });
    assert.doesNotThrow(() => m.genera(ostile)); assert.ok(tutto(m.genera(ostile)).includes("<script>"), "il testo di un altro non si altera");
  });
  test(`contratto [${nome}]: è deterministico`, () => { assert.deepEqual(m.genera(COMPLETO), m.genera(COMPLETO)); });
}

test("modello provvisorio: è dichiarato bozza senza valore legale, in cima e nel titolo", () => {
  const d = reg.componiContratto(COMPLETO, "provvisorio");
  assert.match(d.titolo, /^Bozza di contratto/); assert.equal(d.bozza, true); assert.equal(d.modello.origine, "provvisorio");
  assert.ok(d.avvisi[0].startsWith("BOZZA DI PROVA")); assert.match(d.avvisi[0], /non è un contratto valido, non ha valore legale e non va firmato/); assert.match(d.avvisi[1], /verificato da un professionista/);
});

test("modello provvisorio: nessuna clausola di legge, nessun richiamo normativo, nessuna promessa", () => {
  const t = tutto(reg.componiContratto(COMPLETO, "provvisorio"));
  assert.ok(!/\bart\.|articolo \d|D\.?Lgs|decreto|legge n|L\. ?431|ai sensi|codice civile|c\.c\./i.test(t), "un modello di prova non deve citare norme: scriverle spetta a un legale"); assert.ok(!/garantit|conforme alla legge|a norma/i.test(t));
});

test("il «bozza» lo decide il registro: un modello non può togliersi la dicitura, e uno validato senza dire da chi non si usa", () => {
  const base = { id: "x", versione: "1", genera: () => ({ ...reg.MODELLI_CONTRATTO.provvisorio.genera(COMPLETO), bozza: false }) };
  assert.equal(reg.componiContratto(COMPLETO, null, { ...base, origine: "provvisorio" }).bozza, true, "un modello provvisorio che scrive bozza:false resta una bozza");
  assert.throws(() => reg.componiContratto(COMPLETO, null, { ...base, origine: "validato" }), /deve dire da chi e quando/);
  assert.throws(() => reg.componiContratto(COMPLETO, null, { ...base, origine: "validato", validazione: { da: "", data: "2026-10-01" } }), /da chi e quando/);
  assert.throws(() => reg.componiContratto(COMPLETO, null, { ...base, origine: "validato", validazione: { da: "Studio Legale", data: "" } }), /da chi e quando/);
  const ok = reg.componiContratto(COMPLETO, null, { ...base, origine: "validato", validazione: { da: "Studio Legale Rossi", data: "2026-10-01" } }); assert.equal(ok.bozza, false); assert.equal(ok.modello.origine, "validato");
  for (const origine of ["boh", "", undefined]) assert.throws(() => reg.componiContratto(COMPLETO, null, { ...base, origine }), /non utilizzabile/);
  assert.throws(() => reg.componiContratto(COMPLETO, null, { ...base, id: "Id Sbagliato", origine: "provvisorio" }), /identificativo/); assert.throws(() => reg.componiContratto(COMPLETO, null, { ...base, versione: " ", origine: "provvisorio" }), /versione/);
});

// ============================================================ il testo per il PDF
test("caratteri ammessi: Latin-1 e le aggiunte di Windows-1252, ma non i caratteri di controllo né il resto", () => {
  for (const c of ["A", "z", " ", "è", "à", "ù", "ì", "ò", "é", "€", "«", "»", "–", "—", "’", "“", "”", "•", "…"]) assert.equal(tp.inCp1252(c.codePointAt(0)), true, c);
  for (const c of ["Ł", "ł", "Ж", "中", "💥", "\n", "\t", "\u0000", "\u2192", "\u200b", "\u0100"]) assert.equal(tp.inCp1252(c.codePointAt(0)), false, JSON.stringify(c));
});

test("sanitizzare: le lettere italiane restano, ciò che il font non ha si semplifica, e non si inventa niente di strano", () => {
  assert.equal(tp.sanitizzaPerPdf("Perché è già così, più su: «ciò» – 1.450 €"), "Perché è già così, più su: «ciò» – 1.450 €");
  assert.equal(tp.sanitizzaPerPdf("Łukasz Żółć"), "Lukasz Zólc"); assert.equal(tp.sanitizzaPerPdf("Ādams"), "Adams"); assert.equal(tp.sanitizzaPerPdf("Đorđe"), "Dorde");
  assert.equal(tp.sanitizzaPerPdf("Иван"), "????"); assert.equal(tp.sanitizzaPerPdf("a💥b"), "a?b"); assert.equal(tp.sanitizzaPerPdf("a→b"), "a->b"); assert.equal(tp.sanitizzaPerPdf("−5"), "-5");
});

test("sanitizzare: a capo, tabulazioni e spazi particolari diventano uno spazio; i caratteri di controllo e invisibili spariscono", () => {
  assert.equal(tp.sanitizzaPerPdf("a\nb\tc\r\nd"), "a b c  d"); assert.equal(tp.sanitizzaPerPdf("a\u00a0b"), "a b"); assert.equal(tp.sanitizzaPerPdf("a\u200bb\u0000c\u0007d\ufeffe\u00adf"), "abcdef");
  for (const x of [null, undefined, 42, {}, []]) assert.equal(tp.sanitizzaPerPdf(x), "");
});

test("sanitizzare: gli apici diventano cifre semplici (alcuni visualizzatori non li disegnano)", () => { assert.equal(tp.sanitizzaPerPdf("55 m²"), "55 m2"); assert.equal(tp.sanitizzaPerPdf("m³ e ¹"), "m3 e 1"); });

test("sanitizzare: qualunque testo diventa scrivibile, senza errori (prova su 3000 testi casuali, anche con caratteri fuori dal piano base)", () => {
  let seme = 12345; const rnd = () => (seme = (seme * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 3000; i++) {
    let s = ""; const n = Math.floor(rnd() * 40);
    for (let k = 0; k < n; k++) { const t = rnd(); s += String.fromCodePoint(t < 0.4 ? 32 + Math.floor(rnd() * 95) : t < 0.6 ? 0xa0 + Math.floor(rnd() * 96) : t < 0.8 ? Math.floor(rnd() * 0x3000) : 0x1f300 + Math.floor(rnd() * 300)); }
    let fuori; assert.doesNotThrow(() => { fuori = tp.sanitizzaPerPdf(s); }, JSON.stringify(s));
    for (const ch of fuori) assert.ok(tp.inCp1252(ch.codePointAt(0)), `«${ch}» (U+${ch.codePointAt(0).toString(16)}) non è scrivibile, da ${JSON.stringify(s)}`);
  }
});

test("a capo: nessuna riga più larga del permesso, e nessuna parola persa", () => {
  const larg = 120; const t = "Il locatore concede in locazione al conduttore, per uso abitativo, l'immobile situato in Via Garibaldi 12 a Milano";
  const righe = tp.spezzaInRighe(t, larg, 10, false, misuraFinta); assert.ok(righe.length > 3); for (const r of righe) assert.ok(misuraFinta(r, 10) <= larg, r); assert.equal(righe.join(" "), t);
});

test("a capo: una parola più lunga della riga si spezza invece di uscire dalla pagina, e con una larghezza minuscola non gira a vuoto", () => {
  const lunga = "x".repeat(100); const r = tp.spezzaInRighe(lunga, 50, 10, false, misuraFinta); assert.ok(r.length > 1); for (const x of r) assert.ok(misuraFinta(x, 10) <= 50, x); assert.equal(r.join(""), lunga);
  const inizio = Date.now(); const m = tp.spezzaInRighe("abc def", 1, 10, false, misuraFinta); assert.equal(m.join(""), "abcdef"); assert.ok(Date.now() - inizio < 500, "troppo lento");
  assert.deepEqual(tp.spezzaInRighe("", 100, 10, false, misuraFinta), []); assert.deepEqual(tp.spezzaInRighe("   \n  ", 100, 10, false, misuraFinta), []);
});

test("a capo: testi casuali non perdono né inventano caratteri e rispettano la larghezza", () => {
  let seme = 99; const rnd = () => (seme = (seme * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 500; i++) {
    const parole = Array.from({ length: 1 + Math.floor(rnd() * 15) }, () => "ab".repeat(1 + Math.floor(rnd() * 30)).slice(0, 1 + Math.floor(rnd() * 70))); const testo = parole.join(" "); const larg = 30 + rnd() * 300;
    const righe = tp.spezzaInRighe(testo, larg, 10, false, misuraFinta); assert.equal(righe.join("").replace(/ /g, ""), testo.replace(/ /g, ""), "persi o aggiunti caratteri"); for (const r of righe) assert.ok(misuraFinta(r, 10) <= larg + 1e-9, `${r.length} caratteri in ${larg}`);
  }
});

test("caratteri semplificati: un nome come «Łukasz» si segnala, uno normale no, e gli spazi o i caratteri di controllo non contano", () => {
  assert.equal(tp.perdeCaratteri("Łukasz"), true); assert.equal(tp.perdeCaratteri("Иван"), true); assert.equal(tp.perdeCaratteri("a💥b"), true); assert.equal(tp.perdeCaratteri("55 m²"), true, "l'apice diventa «2»: è un cambiamento");
  for (const x of ["Marco", "Perché è già così", "1.450 €", "«ciò» – sì", "  a   b  ", "a\nb", "a\u200bb", "", null, undefined, 5]) assert.equal(tp.perdeCaratteri(x), false, JSON.stringify(x));
  assert.equal(tp.documentoSemplificato(reg.componiContratto(COMPLETO)), false); assert.equal(tp.documentoSemplificato(reg.componiContratto(dati.datiDaRiga({ ...RIGA, conduttore_nome: "Łukasz" }))), true);
});

test("l'avviso sui caratteri semplificati si scrive senza i caratteri che descrive", () => { assert.equal(tp.perdeCaratteri(tp.AVVISO_CARATTERI_SEMPLIFICATI), false, "l'avviso stesso verrebbe alterato"); assert.match(tp.AVVISO_CARATTERI_SEMPLIFICATI, /controlla i nomi/); });

test("i testi del modello provvisorio sono scrivibili tali e quali nel PDF (nessun carattere alterato)", () => {
  for (const x of [COMPLETO, VUOTO]) { const d = reg.componiContratto(x); assert.equal(tp.documentoSemplificato(d), false, "il modello usa un carattere che il PDF non ha"); }
  for (const t of [prov.TESTO_BOZZA, prov.TESTO_DA_COMPLETARE]) assert.equal(tp.perdeCaratteri(t), false, t);
});

// ============================================================ l'impaginazione
const DOC = reg.componiContratto(COMPLETO);
const DOC_LUNGO = { ...DOC, sezioni: [...DOC.sezioni, ...Array.from({ length: 30 }, (_, i) => ({ titolo: `Sezione extra ${i}`, paragrafi: ["Un paragrafo piuttosto lungo che va a capo più volte per riempire le pagine del documento di prova ".repeat(4)] }))] };

test("impaginazione: ogni riga sta dentro i margini della pagina, in alto e in basso", () => {
  for (const doc of [DOC, DOC_LUNGO, reg.componiContratto(VUOTO)]) for (const [n, p] of pdf.impagina(doc, misuraFinta).entries()) for (const r of p.righe) {
    assert.ok(r.x >= pdf.MARGINE.sinistra - 1e-9, `pag ${n + 1}: x ${r.x}`); assert.ok(r.x + misuraFinta(r.testo, r.grandezza) <= pdf.PAGINA.larghezza - pdf.MARGINE.destra + 1e-6, `pag ${n + 1}: «${r.testo}» esce a destra`);
    assert.ok(r.y >= pdf.MARGINE.basso - 20, `pag ${n + 1}: y ${r.y} sotto il margine`); assert.ok(r.y <= pdf.PAGINA.altezza - pdf.MARGINE.alto + 1e-9, `pag ${n + 1}: y ${r.y} sopra il margine`);
  }
});

test("impaginazione: un documento lungo va su più pagine, e il testo del documento c'è per intero", () => {
  const p = pdf.impagina(DOC_LUNGO, misuraFinta); assert.ok(p.length >= 3, "pagine: " + p.length);
  const scritto = p.flatMap((x) => x.righe.map((r) => r.testo)).join(" "); for (const s of DOC_LUNGO.sezioni) assert.ok(scritto.includes(s.titolo), s.titolo);
});

test("impaginazione: un titolo di sezione non resta mai solo in fondo a una pagina", () => {
  const p = pdf.impagina(DOC_LUNGO, misuraFinta);
  p.forEach((pg, n) => { if (n === p.length - 1) return; const corpo = pg.righe.filter((r) => r.grandezza < 14 || r.grandezza > 12.6 || true); const ultima = pg.righe[pg.righe.length - 1]; assert.ok(!(ultima.grassetto && ultima.grandezza === 12.5), `pag ${n + 1} finisce con un titolo di sezione: «${ultima.testo}»`); void corpo; });
});

test("impaginazione: le firme ci sono sull'ultima pagina, ognuna con la sua riga e il nome sotto", () => {
  const p = pdf.impagina(DOC, misuraFinta); const ultima = p[p.length - 1];
  assert.ok(ultima.righe.some((r) => r.testo === "Il locatore") && ultima.righe.some((r) => r.testo === "Il conduttore")); assert.equal(ultima.linee.length, 2); assert.ok(ultima.righe.some((r) => r.testo === "Olga Bianchi") && ultima.righe.some((r) => r.testo === "Tina Verdi"));
  for (const l of ultima.linee) assert.ok(l.x1 >= pdf.MARGINE.sinistra && l.x2 <= pdf.PAGINA.larghezza - pdf.MARGINE.destra);
});

test("impaginazione: nel riquadro degli avvisi stanno tutte le righe degli avvisi", () => {
  const p = pdf.impagina(DOC, misuraFinta)[0]; const r = p.rettangoli[0]; assert.ok(r, "manca il riquadro");
  const dentro = p.righe.filter((x) => x.y > r.y && x.y < r.y + r.altezza); assert.ok(dentro.length >= 3); assert.ok(dentro.some((x) => x.testo.startsWith("BOZZA DI PROVA")));
});

test("impaginazione: l'avviso sui caratteri semplificati compare solo quando serve", () => {
  const con = pdf.impagina(reg.componiContratto(dati.datiDaRiga({ ...RIGA, conduttore_nome: "Łukasz" })), misuraFinta).flatMap((p) => p.righe.map((r) => r.testo)).join(" ");
  const senza = pdf.impagina(DOC, misuraFinta).flatMap((p) => p.righe.map((r) => r.testo)).join(" "); assert.match(con, /semplificati/); assert.ok(!/semplificati/.test(senza));
});

test("pie di pagina: numero e totale; per una bozza dice che non ha valore legale, per un modello validato no", () => {
  assert.deepEqual(pdf.piePagina(DOC, 2, 3).destra, "Pagina 2 di 3"); assert.match(pdf.piePagina(DOC, 1, 1).sinistra, /bozza di prova, nessun valore legale/); assert.match(pdf.piePagina(DOC, 1, 1).sinistra, /modello provvisorio v1/);
  const val = { ...DOC, bozza: false, modello: { id: "legale", versione: "3", origine: "validato" } }; assert.ok(!/bozza/.test(pdf.piePagina(val, 1, 1).sinistra));
});

test("filigrana: sta SEMPRE dentro la pagina, qualunque sia la larghezza del testo, e non supera il corpo massimo", () => {
  for (let k = 2; k <= 14; k += 0.5) { const f = pdf.posizioneFiligrana(k * 100); assert.ok(f.corpo <= 70 + 1e-9 && f.corpo > 10, `corpo ${f.corpo}`); for (const a of f.angoli) { assert.ok(a.x >= 0 && a.x <= pdf.PAGINA.larghezza, `k=${k}: x ${a.x.toFixed(1)}`); assert.ok(a.y >= 0 && a.y <= pdf.PAGINA.altezza, `k=${k}: y ${a.y.toFixed(1)}`); } }
});

// ============================================================ il PDF vero
/** Il testo di ogni pagina, letto dai contenuti veri del PDF (non dalle mie strutture). */
async function testiDelleLePagine(bytes) {
  const d = await PDFDocument.load(bytes); const dec = new TextDecoder("windows-1252"); const fuori = [];
  for (const pagina of d.getPages()) {
    let c = pagina.node.Contents(); const flussi = c instanceof PDFArray ? c.asArray().map((x) => d.context.lookup(x)) : [c]; let testo = "";
    for (const f of flussi) { const bytes2 = decodePDFRawStream(f).decode(); const s = Buffer.from(bytes2).toString("latin1"); for (const m of s.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) { const b = Buffer.from(m[1], "hex"); testo += dec.decode(b) + "\n"; } }
    fuori.push(testo);
  }
  return fuori;
}

test("PDF: è un PDF valido (intestazione, fine, si riapre), di pagine A4", async () => {
  const b = await pdf.generaPdf(DOC, { data: DATA }); assert.equal(Buffer.from(b.slice(0, 5)).toString(), "%PDF-"); assert.match(Buffer.from(b.slice(-10)).toString(), /%%EOF\s*$/);
  const d = await PDFDocument.load(b); assert.ok(d.getPageCount() >= 1); for (const p of d.getPages()) { assert.ok(Math.abs(p.getWidth() - 595.28) < 0.01 && Math.abs(p.getHeight() - 841.89) < 0.01); }
});

test("PDF: il numero di pagine è quello dell'impaginazione, anche per un documento lungo", async () => {
  const d0 = await PDFDocument.create(); const n = await d0.embedFont(StandardFonts.Helvetica); const g = await d0.embedFont(StandardFonts.HelveticaBold); const misura = (t, s, b) => (b ? g : n).widthOfTextAtSize(t, s);
  for (const doc of [DOC, DOC_LUNGO]) { const b = await pdf.generaPdf(doc, { data: DATA }); assert.equal((await PDFDocument.load(b)).getPageCount(), pdf.impagina(doc, misura).length); }
  assert.ok((await PDFDocument.load(await pdf.generaPdf(DOC_LUNGO, { data: DATA }))).getPageCount() >= 3);
});

test("PDF: il testo che contiene è quello del documento: nomi, dati, segnaposto e avvisi", async () => {
  const t = (await testiDelleLePagine(await pdf.generaPdf(DOC, { data: DATA }))).join("\n");
  for (const atteso of ["Bozza di contratto di locazione ad uso abitativo", "Olga Bianchi", "Tina Verdi", "Bilocale Isola", "Via Garibaldi 12, 20121 Milano", "1450 euro", "12 mesi", "1 novembre 2026", "[da indicare]", "BOZZA DI PROVA. Questo documento", "Il locatore", "Il conduttore"]) assert.ok(t.includes(atteso), `nel PDF manca «${atteso}»`);
});

test("PDF: una BOZZA porta la filigrana e l'avvertenza su OGNI pagina", async () => {
  const pagine = await testiDelleLePagine(await pdf.generaPdf(DOC_LUNGO, { data: DATA })); assert.ok(pagine.length >= 3);
  pagine.forEach((t, i) => { assert.ok(t.includes(pdf.TESTO_FILIGRANA), `pagina ${i + 1} senza filigrana`); assert.ok(t.includes("bozza di prova, nessun valore legale"), `pagina ${i + 1} senza avvertenza`); assert.ok(t.includes(`Pagina ${i + 1} di ${pagine.length}`), `pagina ${i + 1}: numerazione`); });
});

test("PDF: solo un modello VALIDATO toglie la filigrana e l'avvertenza, da tutte le pagine", async () => {
  // un modello validato non ha gli avvisi «bozza di prova» nel proprio testo: qui si prova che la filigrana e l'avvertenza
  // dipendano dal registro, e quindi si tolgono gli avvisi dal testo del modello di prova che si riusa
  const val = { id: "legale", versione: "3", origine: "validato", validazione: { da: "Studio Legale Rossi", data: "2026-10-01" }, genera: (d) => ({ ...reg.MODELLI_CONTRATTO.provvisorio.genera(d), avvisi: [], sottotitolo: null }) };
  const doc = reg.componiContratto(COMPLETO, null, val); assert.equal(doc.bozza, false);
  const pagine = await testiDelleLePagine(await pdf.generaPdf({ ...doc, sezioni: DOC_LUNGO.sezioni }, { data: DATA })); assert.ok(pagine.length >= 3);
  for (const [i, t] of pagine.entries()) { assert.ok(!t.includes(pdf.TESTO_FILIGRANA), `pagina ${i + 1}: filigrana presente`); assert.ok(!/bozza di prova/.test(t), `pagina ${i + 1}: avvertenza presente`); assert.ok(t.includes("modello legale v3"), `pagina ${i + 1}: piè di pagina`); }
});

test("PDF: i metadati contengono il titolo e basta: nessun autore, nessun nome di persona", async () => {
  const b = await pdf.generaPdf(DOC, { data: DATA });
  // updateMetadata:false, altrimenti pdf-lib riscrive il produttore appena apre il file
  const d = await PDFDocument.load(b, { updateMetadata: false });
  assert.equal(d.getTitle(), "Bozza di contratto di locazione ad uso abitativo"); assert.equal(d.getProducer(), "MatchAmI"); assert.equal(d.getCreator(), "MatchAmI");
  assert.equal(d.getAuthor(), undefined); assert.equal(d.getSubject(), undefined); assert.equal(d.getKeywords(), undefined); assert.equal(d.getCreationDate().toISOString(), DATA.toISOString());
  const info = d.getInfoDict(); const chiavi = info.keys().map(String).sort(); assert.deepEqual(chiavi, ["/CreationDate", "/Creator", "/ModDate", "/Producer", "/Title"], `chiavi dei metadati: ${chiavi.join()}`);
  for (const k of info.keys()) assert.ok(!/Olga|Bianchi|Tina|Verdi/.test(String(info.get(k))), `un nome è finito in ${k}`);
});

test("PDF: stessi dati e stessa data danno lo stesso file (nessun elemento casuale)", async () => {
  const a = await pdf.generaPdf(DOC, { data: DATA }), b = await pdf.generaPdf(DOC, { data: DATA }); assert.deepEqual(Buffer.from(a), Buffer.from(b));
});

test("PDF: nomi con caratteri che il font non ha non lo fanno fallire, vengono semplificati, e il documento lo dice", async () => {
  for (const nome of ["Łukasz", "Иван", "💥💥", "Żółć Ādams", "a\nb\tc", "\u0000\u0007"]) {
    const doc = reg.componiContratto(dati.datiDaRiga({ ...RIGA, conduttore_nome: nome, conduttore_cognome: "Nome" })); let b; await assert.doesNotReject(async () => { b = await pdf.generaPdf(doc, { data: DATA }); }, nome);
    assert.equal(Buffer.from(b.slice(0, 5)).toString(), "%PDF-");
  }
  const t = (await testiDelleLePagine(await pdf.generaPdf(reg.componiContratto(dati.datiDaRiga({ ...RIGA, conduttore_nome: "Łukasz" })), { data: DATA }))).join("\n"); assert.ok(t.includes("Lukasz Verdi")); assert.ok(t.includes("semplificati: controlla i nomi"));
});

test("PDF: dati vuoti, dati ostili e testi enormi si scrivono lo stesso, in tempi ragionevoli", async () => {
  const doc = reg.componiContratto(dati.datiDaRiga({ ...RIGA, titolo: "x".repeat(8000), locatore_nome: "y".repeat(8000), via: "z".repeat(8000) }));
  const inizio = Date.now(); for (const d of [reg.componiContratto(VUOTO), doc, DOC_LUNGO]) { const b = await pdf.generaPdf(d, { data: DATA }); assert.equal(Buffer.from(b.slice(0, 5)).toString(), "%PDF-"); } assert.ok(Date.now() - inizio < 5000, `troppo lento: ${Date.now() - inizio} ms`);
});

test("PDF: un testo con codice o segni di controllo del PDF resta testo", async () => {
  const doc = reg.componiContratto(dati.datiDaRiga({ ...RIGA, titolo: ") Tj /JS (app.alert(1)) <</S/JavaScript>> (", locatore_nome: "\\) \\( %%EOF" })); const b = await pdf.generaPdf(doc, { data: DATA });
  const d = await PDFDocument.load(b); assert.equal(d.getPageCount(), 1 + (d.getPageCount() - 1)); assert.ok(!/\/JavaScript|\/JS\b|\/OpenAction|\/AA\b|\/Launch/.test(Buffer.from(b).toString("latin1")), "il PDF contiene azioni o script");
});

test("PDF: nessuno script, azione, collegamento o file incorporato", async () => {
  const s = Buffer.from(await pdf.generaPdf(DOC, { data: DATA })).toString("latin1"); for (const vietato of [/\/JavaScript/, /\/JS\b/, /\/OpenAction/, /\/Launch/, /\/URI\b/, /\/EmbeddedFile/, /\/AcroForm/]) assert.ok(!vietato.test(s), String(vietato));
});

// ============================================================ coerenza con la migrazione
test("la riga del database e il tipo dell'app hanno gli stessi campi, nello stesso ordine", () => {
  const colonneSql = sql.match(/returns table \(([\s\S]*?)\)\s*language sql/)[1].split("\n").map((r) => r.trim().match(/^(\w+)\s/)?.[1]).filter(Boolean);
  const tipo = leggi("src", "lib", "contratto", "tipi.ts"); const campiTs = [...tipo.match(/export type RigaContratto = \{([\s\S]*?)\n\};/)[1].matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(campiTs, colonneSql, "il tipo dell'app e la funzione del database sono diversi");
});

test("migrazione: solo le due parti, solo con la candidatura accettata, e nessun dato personale oltre ai nomi", () => {
  assert.match(sql, /k\.status = 'accettata'\s+and \(k\.tenant_id = auth\.uid\(\) or l\.owner_id = auth\.uid\(\)\)/); assert.match(sql, /revoke all on function public\.dati_contratto\(uuid\) from public, anon;/); assert.match(sql, /grant execute on function public\.dati_contratto\(uuid\) to authenticated;/);
  const colonne = sql.match(/returns table \(([\s\S]*?)\)\s*language sql/)[1]; assert.ok(!/mail|telef|fiscale|documento|iban|nascita|password/i.test(colonne), colonne);
  assert.ok(!/create table|insert into|update |delete from/i.test(sql.replace(/--[^\n]*/g, "")), "la migrazione salva qualcosa: la bozza non si conserva");
});

test("la logica del contratto non ha accesso alla rete né al database né al browser", () => {
  for (const f of ["tipi.ts", "dati.ts", "modello-provvisorio.ts", "index.ts", "testo-pdf.ts"]) {
    const c = leggi("src", "lib", "contratto", f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const vietato of [/\bfetch\(/, /supabase/i, /localStorage/, /console\./, /\bimport\s+(?!type)(?![^;]*from\s+"\.\.?\/)/]) assert.ok(!vietato.test(c), `${f} usa ${vietato}`);
  }
  assert.match(leggi("src", "lib", "contratto", "index.ts"), /process\.env\.CONTRATTO_MODELLO/);
});

test("pdf-lib è usata in un solo file, così sostituirla non tocca altro", () => {
  const conPdfLib = []; const visita = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) visita(p); else if (/\.(ts|tsx)$/.test(e.name) && /from "pdf-lib"/.test(fs.readFileSync(p, "utf8"))) conPdfLib.push(path.relative(radice, p).replaceAll("\\", "/")); } };
  visita(path.join(radice, "src")); assert.deepEqual(conPdfLib, ["src/lib/contratto/pdf.ts"]);
  const pkg = JSON.parse(leggi("package.json")); assert.match(pkg.dependencies["pdf-lib"], /^\d+\.\d+\.\d+$/, "la versione di pdf-lib deve essere esatta, senza ^ né ~");
});

// ============================================================ i tetti e i tempi (un titolo gigante non deve bloccare il server)
test("tetti: ogni testo ha una lunghezza massima, oltre la quale si abbrevia con «…» e si segnala", () => {
  const lim = dati.LIMITI_TESTO; assert.ok(lim.nome >= 50 && lim.titolo >= 100 && lim.via >= 100, JSON.stringify(lim));
  const d = dati.datiDaRiga({ ...RIGA, locatore_nome: "a".repeat(5000), titolo: "t".repeat(5000), via: "v".repeat(5000), zona: "z".repeat(5000) });
  assert.equal([...d.locatore.nome].length, lim.nome); assert.ok(d.locatore.nome.endsWith("…")); assert.equal([...d.immobile.titolo].length, lim.titolo); assert.equal(d.troncato, true);
  assert.equal(dati.datiDaRiga(RIGA).troncato, false, "dati normali non si abbreviano");
});

test("tetti: un testo esattamente al limite non si abbrevia, uno di un carattere in più sì; e non si taglia un carattere a metà", () => {
  assert.deepEqual(dati.limita("a".repeat(10), 10), { testo: "a".repeat(10), troncato: false }); const o = dati.limita("a".repeat(11), 10); assert.equal(o.troncato, true); assert.equal(o.testo, "a".repeat(9) + "…");
  const emoji = dati.limita("💥".repeat(20), 10); assert.equal([...emoji.testo].length, 10); assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(emoji.testo), "un carattere è stato tagliato a metà");
  assert.deepEqual(dati.limita(null, 5), { testo: "", troncato: false });
});

test("tetti: il documento dice che qualcosa è stato abbreviato, solo quando è vero", () => {
  const con = reg.componiContratto(dati.datiDaRiga({ ...RIGA, titolo: "t".repeat(5000) })); const senza = reg.componiContratto(COMPLETO);
  assert.ok(con.avvisi.includes(prov.TESTO_ABBREVIATO) && !senza.avvisi.includes(prov.TESTO_ABBREVIATO)); assert.equal(tp.perdeCaratteri(prov.TESTO_ABBREVIATO), false, "l'avviso stesso verrebbe alterato nel PDF");
});

test("TEMPO: spezzare un testo enorme costa in proporzione alla sua lunghezza, non al suo quadrato", async () => {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica); const misura = (t, g) => f.widthOfTextAtSize(t, g);
  const prova = (n) => { const t0 = process.hrtime.bigint(); const r = tp.spezzaInRighe("q".repeat(n), 483, 11, false, misura); const ms = Number(process.hrtime.bigint() - t0) / 1e6; for (const x of r) assert.ok(misura(x, 11) <= 483); return ms; };
  prova(2000); const piccolo = prova(20000), grande = prova(200000);
  assert.ok(grande < 3000, `200000 caratteri: ${grande.toFixed(0)} ms`);
  // dieci volte più testo: al massimo una ventina di volte più tempo (un algoritmo quadratico ne farebbe cento)
  assert.ok(grande < Math.max(piccolo, 5) * 40, `scala male: 20000 → ${piccolo.toFixed(1)} ms, 200000 → ${grande.toFixed(1)} ms`);
});

test("TEMPO: un PDF con tre campi da un milione di caratteri si genera in un attimo (si abbreviano) e il file resta piccolo", async () => {
  const doc = reg.componiContratto(dati.datiDaRiga({ ...RIGA, titolo: "y".repeat(1e6), locatore_nome: "w".repeat(1e6), via: "z".repeat(1e6) }));
  const t0 = Date.now(); const b = await pdf.generaPdf(doc, { data: DATA }); const ms = Date.now() - t0; assert.ok(ms < 3000, `${ms} ms`); assert.ok(b.length < 50_000, `il file pesa ${b.length} byte`); assert.ok((await PDFDocument.load(b)).getPageCount() <= 3);
});

test("TEMPO: la generazione di un documento normale è veloce (sotto un secondo, anche la prima volta)", async () => {
  const t0 = Date.now(); await pdf.generaPdf(DOC, { data: DATA }); assert.ok(Date.now() - t0 < 1000, `${Date.now() - t0} ms`);
});

// ============================================================ collegamento con l'app
function filiDiCodice(dir = path.join(radice, "src")) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => { if (e.name.startsWith("__")) return []; const p = path.join(dir, e.name); return e.isDirectory() ? filiDiCodice(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : []; });
}

test("chiamate: la funzione dei dati del contratto si chiama con il suo parametro, e solo dalla pagina e dal PDF", () => {
  const trovate = [];
  for (const f of filiDiCodice()) { const c = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""); for (const m of c.matchAll(/"dati_contratto"\s*(?:,\s*\{([^}]*)\}|\))/g)) { assert.deepEqual([...(m[1] ?? "").matchAll(/\b(p_\w+)\s*:/g)].map((x) => x[1]), ["p_contratto"], f); trovate.push(path.relative(radice, f).replaceAll("\\", "/")); } }
  assert.deepEqual(trovate.sort(), ["src/app/(app)/contratto/[id]/page.tsx", "src/app/(app)/contratto/[id]/pdf/route.ts"]);
});

test("il PDF si scarica solo dopo aver controllato chi sei e l'informativa, e prima di leggere i dati", () => {
  const r = leggi("src", "app", "(app)", "contratto", "[id]", "pdf", "route.ts"); const i = (s) => r.indexOf(s);
  assert.ok(i("UUID.test(id)") > 0 && i("UUID.test(id)") < i("getUser()") && i("getUser()") < i("haAccettatoInformativa(") && i("haAccettatoInformativa(") < i('rpc("dati_contratto"'), "l'ordine dei controlli non è quello previsto");
  assert.match(r, /export const dynamic = "force-dynamic"/); assert.match(r, /"Cache-Control": "private, no-store"/); assert.match(r, /attachment; filename=/); assert.match(r, /"X-Content-Type-Options": "nosniff"/);
  assert.deepEqual([...r.matchAll(/export (?:async )?(?:function|const) (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]), ["GET"]); assert.ok(!/console\./.test(r), "il percorso scrive nei log");
});

test("il PDF non viene salvato da nessuna parte: nessuna scrittura su database né su storage", () => {
  for (const f of ["src/app/(app)/contratto/[id]/pdf/route.ts", "src/app/(app)/contratto/[id]/page.tsx", "src/lib/contratto/pdf.ts"]) { const c = leggi(...f.split("/")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""); for (const vietato of [/\.insert\(/, /\.update\(/, /\.upsert\(/, /\.delete\(/, /storage/i, /writeFile/, /\.from\("[a-z_]+"\)/]) assert.ok(!vietato.test(c), `${f} usa ${vietato}`); }
});

test("la pagina e i pannelli: la bozza si apre dai due pannelli dei contratti, uno per ruolo", () => {
  assert.match(leggi("src", "app", "(app)", "gestione", "GestioneClient.tsx"), /<BozzaContratto contrattoId=\{selezionato\.id\} \/>/);
  assert.match(leggi("src", "app", "(app)", "gestione-affitti", "GestioneAffittiClient.tsx"), /<BozzaContratto contrattoId=\{selezionato\.id\} \/>/);
  const c = leggi("src", "components", "BozzaContratto.tsx"); assert.match(c, /href=\{`\/contratto\/\$\{contrattoId\}`\}/); assert.match(c, /href=\{`\/contratto\/\$\{contrattoId\}\/pdf`\}[^>]*download/);
});

test("informativa: dichiara la bozza del contratto, chi la vede e che non si conserva; e la migrazione non conserva niente", () => {
  const t = JSON.stringify(INFORMATIVA);
  assert.match(t, /bozza con i dati dell'affitto: i nomi delle due parti, l'immobile/); assert.match(t, /la vedono solo le due parti e noi non la conserviamo/); assert.match(t, /bozza di prova, senza valore legale/);
  assert.ok(!/create table|insert into/i.test(sql.replace(/--[^\n]*/g, "")), "la migrazione salva qualcosa");
});

test("informativa: finché il modello è provvisorio dice che è una bozza di prova; con uno validato va rivista", () => {
  const t = JSON.stringify(INFORMATIVA); const validati = Object.values(reg.MODELLI_CONTRATTO).filter((m) => m.origine === "validato");
  if (validati.length === 0) assert.match(t, /Per ora è una bozza di prova, senza valore legale/);
  else assert.ok(!/Per ora è una bozza di prova/.test(t), `c'è un modello validato (${validati.map((m) => m.id).join(", ")}) ma il testo dice che è di prova`);
});
