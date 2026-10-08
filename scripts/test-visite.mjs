/**
 * Test delle visite (src/lib/visite.ts). Si lancia con:   npm test
 *
 * Le date sono la parte che sbaglia in silenzio: un'ora che salta o che si
 * ripete due volte l'anno, un telefono con un fuso diverso, un mese di 30
 * giorni. Qui si provano uno per uno.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { caricaTs, radice } from "./carica-ts.mjs";

const percorso = path.join(radice, "src", "lib", "visite.ts");
const v = caricaTs(percorso);
const base = caricaTs(path.join(radice, "src", "lib", "verifica.ts"));
const sql = fs.readFileSync(path.join(radice, "supabase", "migrations", "0022_visite.sql"), "utf8");

const ORA = 3600_000, MIN = 60_000, GIORNO = 86_400_000;

// ------------------------------------------------------------
// Da «ora di Roma» a un istante
// ------------------------------------------------------------

test("estate: a Roma sono due ore avanti rispetto a UTC", () => {
  assert.equal(v.daInputRoma("2026-10-12T10:00"), "2026-10-12T08:00:00.000Z");
  assert.equal(v.daInputRoma("2026-07-01T00:00"), "2026-06-30T22:00:00.000Z");
});

test("inverno: a Roma è un'ora avanti", () => {
  assert.equal(v.daInputRoma("2026-12-12T10:00"), "2026-12-12T09:00:00.000Z");
  assert.equal(v.daInputRoma("2026-01-15T23:45"), "2026-01-15T22:45:00.000Z");
});

test("ora legale in primavera: l'ora che SALTA non esiste, e non si inventa", () => {
  // il 29 marzo 2026 alle 02:00 le lancette vanno a 03:00: le 02:00-02:59 non ci sono
  assert.equal(v.daInputRoma("2026-03-29T02:00"), null);
  assert.equal(v.daInputRoma("2026-03-29T02:30"), null);
  assert.equal(v.daInputRoma("2026-03-29T02:59"), null);
  // a cavallo del salto, invece, le ore ci sono
  assert.equal(v.daInputRoma("2026-03-29T01:59"), "2026-03-29T00:59:00.000Z");
  assert.equal(v.daInputRoma("2026-03-29T03:00"), "2026-03-29T01:00:00.000Z");
});

test("ora solare in autunno: l'ora che si RIPETE si risolve sempre sulla prima", () => {
  // il 25 ottobre 2026 alle 03:00 le lancette tornano a 02:00: le 02:00-02:59 ci sono due volte
  assert.equal(v.daInputRoma("2026-10-25T02:30"), "2026-10-25T00:30:00.000Z", "la prima volta (ancora ora legale)");
  assert.equal(v.daInputRoma("2026-10-25T02:00"), "2026-10-25T00:00:00.000Z");
  assert.equal(v.daInputRoma("2026-10-25T02:59"), "2026-10-25T00:59:00.000Z");
  // prima e dopo la ripetizione, nessuna ambiguità
  assert.equal(v.daInputRoma("2026-10-25T01:59"), "2026-10-24T23:59:00.000Z");
  assert.equal(v.daInputRoma("2026-10-25T03:00"), "2026-10-25T02:00:00.000Z");
  assert.equal(v.daInputRoma("2026-10-25T10:00"), "2026-10-25T09:00:00.000Z", "dopo il cambio è inverno");
  assert.equal(v.daInputRoma("2026-10-24T10:00"), "2026-10-24T08:00:00.000Z", "il giorno prima è ancora estate");
});

test("ora legale: le date del 2027 (l'ultima domenica di marzo e di ottobre)", () => {
  assert.equal(v.daInputRoma("2027-03-28T02:30"), null, "28 marzo 2027: salto");
  assert.equal(v.daInputRoma("2027-10-31T02:30"), "2027-10-31T00:30:00.000Z", "31 ottobre 2027: ripetuta");
});

test("date impossibili: giorno inesistente, mese, ora o minuto fuori scala", () => {
  for (const x of ["2026-02-29T10:00", "2026-04-31T10:00", "2026-06-31T10:00", "2026-13-01T10:00", "2026-00-10T10:00", "2026-10-00T10:00", "2026-10-32T10:00", "2026-10-12T24:00", "2026-10-12T10:60", "2026-10-12T25:00"]) {
    assert.equal(v.daInputRoma(x), null, x);
  }
  assert.ok(v.daInputRoma("2028-02-29T10:00"), "il 29 febbraio di un anno bisestile esiste");
  assert.equal(v.daInputRoma("2100-02-29T10:00"), null, "il 2100 non è bisestile");
});

test("forme non ammesse: vuoto, non testo, con secondi, con fuso, scritte male", () => {
  for (const x of ["", " ", null, undefined, 42, {}, [], "2026-10-12", "10:00", "2026-10-12 10:00", "2026-10-12T10:00:00", "2026-10-12T10:00Z", "2026-10-12T10:00+02:00", "12/10/2026 10:00", "2026-1-2T9:00", "boh", "2026-10-12T10:0"]) {
    assert.equal(v.daInputRoma(x), null, JSON.stringify(x));
  }
});

test("andata e ritorno: ogni quarto d'ora del 2026 e del 2027 si converte e si riconverte (tranne la seconda ora ripetuta)", () => {
  const inizio = Date.UTC(2026, 0, 1), fine = Date.UTC(2028, 0, 1);
  let controllati = 0, ripetuti = 0;
  for (let t = inizio; t < fine; t += 15 * MIN) {
    const locale = v.aInputRoma(t);
    const indietro = v.daInputRoma(locale);
    assert.ok(indietro, `l'ora ${locale} (da ${new Date(t).toISOString()}) non torna indietro`);
    const r = Date.parse(indietro);
    if (r === t) controllati++;
    else {
      // l'unico caso ammesso: la SECONDA volta di un'ora ripetuta, che torna alla prima (un'ora prima)
      assert.equal(r, t - ORA, `${locale}: atteso ${new Date(t - ORA).toISOString()}, ottenuto ${indietro}`);
      ripetuti++;
    }
  }
  assert.equal(ripetuti, 8, "quattro quarti d'ora per ciascuna delle due notti di ottobre (2026 e 2027): " + ripetuti);
  assert.ok(controllati > 70000);
});

test("il fuso del telefono non conta: lo stesso risultato da Auckland, New York, Tokyo e Roma", () => {
  // Un modulo ESM si importa con un URL «file://», non con un percorso: su Windows un percorso
  // come «C:\\Users\\...» sarebbe preso per un URL con schema «c:» e non partirebbe.
  const caricatore = pathToFileURL(path.join(radice, "scripts", "carica-ts.mjs")).href;
  const script = `
    import { caricaTs } from ${JSON.stringify(caricatore)};
    const v = caricaTs(${JSON.stringify(percorso)});
    console.log(JSON.stringify([
      v.daInputRoma("2026-10-12T10:00"), v.daInputRoma("2026-10-25T02:30"), v.daInputRoma("2026-03-29T02:30"),
      v.formattaQuando("2026-10-12T08:00:00Z"), v.aInputRoma("2026-10-12T08:00:00Z"), v.chiaveGiorno("2026-10-12T22:30:00Z"),
    ]));`;
  const risultati = ["Pacific/Auckland", "America/New_York", "Asia/Tokyo", "Europe/Rome", "UTC"].map((TZ) =>
    execFileSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, TZ }, encoding: "utf8" }).trim()
  );
  assert.equal(new Set(risultati).size, 1, "i fusi danno risultati diversi:\n" + risultati.join("\n"));
  assert.deepEqual(JSON.parse(risultati[0]), ["2026-10-12T08:00:00.000Z", "2026-10-25T00:30:00.000Z", null, "lunedì 12 ottobre · 10:00", "2026-10-12T10:00", "2026-10-13"]);
});

// ------------------------------------------------------------
// Mostrare una data
// ------------------------------------------------------------

test("mostrare: giorno, ora e la frase completa in italiano", () => {
  assert.equal(v.formattaGiorno("2026-10-12T08:00:00Z"), "lunedì 12 ottobre");
  assert.equal(v.formattaOra("2026-10-12T08:00:00Z"), "10:00");
  assert.equal(v.formattaQuando("2026-10-12T08:00:00Z"), "lunedì 12 ottobre · 10:00");
  assert.equal(v.formattaQuando("2026-12-25T11:30:00Z"), "venerdì 25 dicembre · 12:30");
  assert.equal(v.formattaOra("2026-10-12T22:00:00Z"), "00:00", "mezzanotte, non «24:00»");
});

test("mostrare: una data illeggibile dà una stringa vuota, mai «Invalid Date»", () => {
  for (const x of ["", "boh", null, undefined, 42, "2026-13-45", {}]) {
    assert.equal(v.formattaQuando(x), "", String(x));
  }
  assert.equal(v.formattaGiorno("boh"), "");
  assert.equal(v.formattaOra("boh"), "");
  assert.equal(v.aInputRoma("boh"), "");
  assert.equal(v.chiaveGiorno("boh"), "");
});

test("giorno: si cambia a mezzanotte di Roma, non a quella di UTC", () => {
  assert.equal(v.chiaveGiorno("2026-10-12T21:59:00Z"), "2026-10-12");
  assert.equal(v.chiaveGiorno("2026-10-12T22:00:00Z"), "2026-10-13", "mezzanotte a Roma in estate");
  assert.equal(v.chiaveGiorno("2026-12-12T22:59:00Z"), "2026-12-12");
  assert.equal(v.chiaveGiorno("2026-12-12T23:00:00Z"), "2026-12-13", "mezzanotte a Roma in inverno");
});

// ------------------------------------------------------------
// Proporre un posto
// ------------------------------------------------------------

const ADESSO = Date.parse("2026-10-08T12:00:00Z");
const tra = (ms) => new Date(ADESSO + ms).toISOString();

test("posto: valido tra più di un'ora e meno di novanta giorni", () => {
  assert.equal(v.validaNuovoPosto(tra(61 * MIN), ADESSO, [], 0), null);
  assert.equal(v.validaNuovoPosto(tra(5 * GIORNO), ADESSO, [], 0), null);
  assert.equal(v.validaNuovoPosto(tra(89 * GIORNO), ADESSO, [], 0), null);
});

test("posto: troppo vicino o nel passato", () => {
  for (const ms of [-GIORNO, 0, 59 * MIN, 30 * MIN]) assert.equal(v.validaNuovoPosto(tra(ms), ADESSO, [], 0), "Il posto deve essere tra almeno un'ora.", String(ms));
  assert.equal(v.validaNuovoPosto(tra(60 * MIN), ADESSO, [], 0), null, "esattamente un'ora va bene, come per il database (< non <=)");
});

test("posto: troppo lontano", () => {
  assert.equal(v.validaNuovoPosto(tra(91 * GIORNO), ADESSO, [], 0), "Il posto deve essere entro 90 giorni.");
  assert.equal(v.validaNuovoPosto(tra(90 * GIORNO), ADESSO, [], 0), null, "esattamente novanta giorni va bene");
});

test("posto: non valido, nullo o illeggibile", () => {
  for (const x of [null, "boh", "", "2026-13-99"]) assert.equal(v.validaNuovoPosto(x, ADESSO, [], 0), "Scegli una data e un'ora valide.", String(x));
});

test("posto: a mezz'ora da un altro (prima o dopo) no, a trenta minuti esatti sì", () => {
  const base = tra(2 * GIORNO);
  assert.match(v.validaNuovoPosto(base, ADESSO, [base], 0), /servono almeno 30 minuti/, "identico");
  assert.match(v.validaNuovoPosto(tra(2 * GIORNO + 20 * MIN), ADESSO, [base], 0), /servono almeno 30 minuti/);
  assert.match(v.validaNuovoPosto(tra(2 * GIORNO + 29 * MIN), ADESSO, [base], 0), /servono almeno 30 minuti/);
  assert.match(v.validaNuovoPosto(tra(2 * GIORNO - 29 * MIN), ADESSO, [base], 0), /servono almeno 30 minuti/);
  assert.equal(v.validaNuovoPosto(tra(2 * GIORNO + 30 * MIN), ADESSO, [base], 0), null);
  assert.equal(v.validaNuovoPosto(tra(2 * GIORNO - 30 * MIN), ADESSO, [base], 0), null);
});

test("posto: i secondi non contano, come per il database (che taglia al minuto)", () => {
  const base = tra(2 * GIORNO);
  const trentaMinutiEUnSecondoDopo = new Date(Date.parse(base) + 30 * MIN + 1000).toISOString();
  // dopo il troncamento al minuto sono esattamente 30 minuti: ammesso
  assert.equal(v.validaNuovoPosto(trentaMinutiEUnSecondoDopo, ADESSO, [base], 0), null);
  const ventinoveMinutiE59Secondi = new Date(Date.parse(base) + 29 * MIN + 59_000).toISOString();
  assert.match(v.validaNuovoPosto(ventinoveMinutiE59Secondi, ADESSO, [base], 0), /servono almeno 30 minuti/);
});

test("posto: gli altri immobili non c'entrano (si passano solo i posti di questo)", () => {
  assert.equal(v.validaNuovoPosto(tra(2 * GIORNO), ADESSO, [], 5), null);
});

test("posto: il trentunesimo posto libero no", () => {
  assert.match(v.validaNuovoPosto(tra(2 * GIORNO), ADESSO, [], 30), /Hai già 30 posti liberi/);
  assert.equal(v.validaNuovoPosto(tra(2 * GIORNO), ADESSO, [], 29), null);
});

test("posto: un elenco di posti con valori illeggibili non rompe niente", () => {
  assert.equal(v.validaNuovoPosto(tra(2 * GIORNO), ADESSO, ["boh", "", null], 0), null);
});

test("limiti del campo: da un'ora da adesso a novanta giorni, in ora di Roma", () => {
  const l = v.limitiSelezione(ADESSO);
  assert.equal(l.min, "2026-10-08T15:00", "adesso 14:00 a Roma + 1 ora");
  assert.equal(l.max, v.aInputRoma(ADESSO + 90 * GIORNO));
  assert.match(l.max, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test("le regole rispecchiate sono quelle della migrazione", () => {
  assert.match(sql, /v_quando < now\(\) \+ interval '1 hour'/);
  assert.equal(v.ANTICIPO_MINIMO_ORE, 1);
  assert.match(sql, /v_quando > now\(\) \+ interval '90 days'/);
  assert.equal(v.ANTICIPO_MASSIMO_GIORNI, 90);
  assert.match(sql, /abs\(extract\(epoch from \(data_ora - v_quando\)\)\) < 1800/);
  assert.equal(v.DISTANZA_MINIMA_MINUTI * 60, 1800);
  assert.match(sql, /\) >= 30 then\s+raise exception 'TROPPI_POSTI'/);
  assert.equal(v.MASSIMO_POSTI_LIBERI, 30);
  assert.ok((sql.match(/interval '30 minutes'/g) ?? []).length >= 2, "il margine di prenotazione manca nella migrazione");
  assert.equal(v.MARGINE_PRENOTAZIONE_MINUTI, 30);
});

// ------------------------------------------------------------
// Raggruppare
// ------------------------------------------------------------

const riga = (id, stato, dopoMs, o = {}) => ({ visita_id: id, listing_id: "L1", titolo: "Bilocale", data_ora: tra(dopoMs), stato, candidatura_id: stato === "proposta" ? null : "c1", nome_inquilino: stato === "proposta" ? null : "Tina Rossi", ...o });

test("visite di un immobile: prenotate, libere e chiuse, ciascuna dalla più vicina", () => {
  const e = [
    riga("b", "proposta", 3 * GIORNO), riga("a", "proposta", 1 * GIORNO), riga("p2", "confermata", 5 * GIORNO), riga("p1", "confermata", 2 * GIORNO),
    riga("vecchia", "confermata", -2 * GIORNO), riga("annullata", "rifiutata", 4 * GIORNO), riga("scaduto", "proposta", -1 * GIORNO),
    riga("altro", "proposta", 1 * GIORNO, { listing_id: "L2" }),
  ];
  const g = v.raggruppaVisiteImmobile(e, "L1", ADESSO);
  assert.deepEqual(g.prenotate.map((x) => x.visita_id), ["p1", "p2"]);
  assert.deepEqual(g.liberi.map((x) => x.visita_id), ["a", "b"]);
  assert.deepEqual(g.chiuse.map((x) => x.visita_id), ["annullata", "scaduto", "vecchia"], "le chiuse: la più recente per prima");
});

test("visite di un immobile: ogni riga sta in un gruppo solo, e le altre non compaiono", () => {
  const e = [riga("1", "proposta", GIORNO), riga("2", "confermata", GIORNO), riga("3", "rifiutata", GIORNO), riga("4", "completata", -GIORNO), riga("5", "proposta", GIORNO, { listing_id: "L9" })];
  const g = v.raggruppaVisiteImmobile(e, "L1", ADESSO);
  assert.equal(g.prenotate.length + g.liberi.length + g.chiuse.length, 4);
  const id = [...g.prenotate, ...g.liberi, ...g.chiuse].map((x) => x.visita_id);
  assert.equal(new Set(id).size, id.length, "una riga in due gruppi");
});

test("visite di un immobile: l'elenco vuoto e le righe di un altro immobile non rompono niente", () => {
  assert.deepEqual(v.raggruppaVisiteImmobile([], "L1", ADESSO), { prenotate: [], liberi: [], chiuse: [] });
  assert.deepEqual(v.raggruppaVisiteImmobile([riga("x", "proposta", GIORNO, { listing_id: "L2" })], "L1", ADESSO), { prenotate: [], liberi: [], chiuse: [] });
});

test("visite di un immobile: non si modifica l'elenco ricevuto", () => {
  const e = [riga("b", "proposta", 3 * GIORNO), riga("a", "proposta", GIORNO)];
  const copia = JSON.parse(JSON.stringify(e));
  v.raggruppaVisiteImmobile(e, "L1", ADESSO);
  assert.deepEqual(e, copia);
});

test("un posto libero con una candidatura (incoerente) non si offre come libero", () => {
  const g = v.raggruppaVisiteImmobile([riga("x", "proposta", GIORNO, { candidatura_id: "c9" })], "L1", ADESSO);
  assert.equal(g.liberi.length, 0);
});

test("posti per giorno: raggruppati per giorno di Roma, anche a cavallo della mezzanotte", () => {
  const posti = [
    { visita_id: "1", data_ora: "2026-10-12T07:00:00Z" }, { visita_id: "2", data_ora: "2026-10-12T21:30:00Z" },
    { visita_id: "3", data_ora: "2026-10-12T22:30:00Z" }, { visita_id: "4", data_ora: "2026-10-13T08:00:00Z" },
    { visita_id: "x", data_ora: "boh" },
  ];
  const g = v.raggruppaPostiPerGiorno(posti);
  assert.deepEqual(g.map((x) => [x.chiave, x.posti.map((p) => p.visita_id).join("")]), [["2026-10-12", "12"], ["2026-10-13", "34"]]);
  assert.equal(g[0].etichetta, "lunedì 12 ottobre");
  assert.deepEqual(v.raggruppaPostiPerGiorno([]), []);
});

test("visita attiva: confermata e futura, la più vicina; le altre no", () => {
  const e = [{ visita_id: "a", data_ora: tra(-GIORNO), stato: "confermata" }, { visita_id: "b", data_ora: tra(3 * GIORNO), stato: "confermata" }, { visita_id: "c", data_ora: tra(2 * GIORNO), stato: "confermata" }, { visita_id: "d", data_ora: tra(GIORNO), stato: "rifiutata" }];
  assert.equal(v.visitaAttiva(e, ADESSO).visita_id, "c");
  assert.equal(v.visitaAttiva([], ADESSO), null);
  assert.equal(v.visitaAttiva([e[0], e[3]], ADESSO), null);
});

test("visita annullata di recente: l'inquilino deve saperlo finché non è passata", () => {
  const e = [{ visita_id: "a", data_ora: tra(-GIORNO), stato: "rifiutata" }, { visita_id: "b", data_ora: tra(2 * GIORNO), stato: "rifiutata" }];
  assert.equal(v.visitaAnnullataRecente(e, ADESSO).visita_id, "b");
  assert.equal(v.visitaAnnullataRecente([e[0]], ADESSO), null);
});

// ------------------------------------------------------------
// Testi
// ------------------------------------------------------------

test("testi: non presumono il genere, e non promettono promemoria che non esistono", () => {
  const tutto = [v.SUGGERIMENTO_POSTI, v.NESSUN_POSTO_PER_INQUILINO, v.NESSUNA_VISITA_PER_PROPRIETARIO, v.AVVISO_ANNULLAMENTO_AL_PROPRIETARIO, v.AVVISO_ANNULLAMENTO_ALL_INQUILINO].join(" ");
  assert.ok(!/\b(lui|lei)\b/i.test(tutto), tutto);
  assert.ok(!/promemoria|ti ricorder|ricorderemo|riceverai un (sms|email)/i.test(tutto), tutto);
});

// ------------------------------------------------------------
// Gli errori del database
// ------------------------------------------------------------

const GENERICO = base.messaggioErroreVerifica("qualcosa di sconosciuto");

test("errori: ogni codice che la migrazione può sollevare ha una frase sua", () => {
  const codici = [...new Set([...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]))];
  assert.ok(codici.length >= 14, `trovati solo ${codici.length} codici`);
  for (const c of codici) {
    const frase = base.messaggioErroreVerifica(`ERROR: ${c} (P0001)`);
    assert.notEqual(frase, GENERICO, `il codice ${c} non ha un messaggio: la persona vedrebbe «Riprova»`);
    assert.ok(!frase.includes(c), `${c} compare nella frase`);
  }
});

test("errori: i messaggi dati prima di chiamare il database sono gli stessi che darebbe lui", () => {
  assert.equal(v.validaNuovoPosto(null, ADESSO, [], 0), base.messaggioErroreVerifica("DATA_NON_VALIDA"));
  assert.equal(v.validaNuovoPosto(tra(10 * MIN), ADESSO, [], 0), base.messaggioErroreVerifica("DATA_TROPPO_VICINA"));
  assert.equal(v.validaNuovoPosto(tra(100 * GIORNO), ADESSO, [], 0), base.messaggioErroreVerifica("DATA_TROPPO_LONTANA"));
  assert.equal(v.validaNuovoPosto(tra(2 * GIORNO), ADESSO, [], 30), base.messaggioErroreVerifica("TROPPI_POSTI"));
  assert.equal(v.validaNuovoPosto(tra(2 * GIORNO + 10 * MIN), ADESSO, [tra(2 * GIORNO)], 0), base.messaggioErroreVerifica("POSTO_TROPPO_VICINO"));
});

test("errori: «già prenotata» e «non disponibile» non si confondono, e le frasi non parlano di codici", () => {
  const a = base.messaggioErroreVerifica("VISITA_GIA_PRENOTATA"), b = base.messaggioErroreVerifica("VISITA_NON_DISPONIBILE"), c = base.messaggioErroreVerifica("VISITA_PRENOTATA");
  assert.equal(new Set([a, b, c]).size, 3);
  for (const f of [a, b, c]) assert.ok(!/[A-Z_]{8,}/.test(f), f);
  assert.match(a, /annullala/);
  assert.match(b, /Scegline un altro/);
});

test("le notifiche delle visite: i tipi, i link e la data compaiono nel testo", () => {
  const n = caricaTs(path.join(radice, "src", "lib", "notifiche.ts"));
  assert.ok(n.TIPI_NOTIFICA.includes("visita_prenotata") && n.TIPI_NOTIFICA.includes("visita_annullata"));
  assert.match(n.descriviNotifica("visita_prenotata", { titolo: "Casa", quando: "2026-10-12T08:00:00+00:00" }).testo, /«Casa»: lunedì 12 ottobre · 10:00\./);
  assert.match(n.descriviNotifica("visita_annullata", { titolo: "Casa", quando: "2026-10-12T08:00:00+00:00" }).testo, /di lunedì 12 ottobre · 10:00 è stata annullata/);
  assert.match(n.descriviNotifica("visita_annullata", { titolo: "Casa" }).testo, /^La visita a «Casa» è stata annullata\.$/);
});

// ------------------------------------------------------------
// Le chiamate nel codice corrispondono alle funzioni del database
// ------------------------------------------------------------

/** Tutti i file di codice dell'app. */
function filiDiCodice(dir = path.join(radice, "src")) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith("__")) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? filiDiCodice(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

/** Nome e parametri di ogni funzione definita dalla migrazione 0022 e chiamabile dall'app. */
function funzioniDellaMigrazione() {
  const f = new Map();
  for (const m of sql.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)/g)) {
    f.set(m[1], [...m[2].matchAll(/\b(p_\w+)\s/g)].map((x) => x[1]).sort());
  }
  return f;
}

test("chiamate: ogni chiamata a una funzione delle visite porta esattamente i parametri che la migrazione dichiara", () => {
  const funzioni = funzioniDellaMigrazione();
  const daControllare = ["crea_slot_visita", "elimina_posto_visita", "prenota_visita", "annulla_visita", "visite_del_proprietario", "posti_liberi_per_candidatura", "visite_della_candidatura"];
  for (const n of daControllare) assert.ok(funzioni.has(n), `la migrazione non definisce ${n}`);

  const trovate = new Map(daControllare.map((n) => [n, 0]));
  for (const file of filiDiCodice()) {
    const codice = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const nome of daControllare) {
      for (const m of codice.matchAll(new RegExp(`"${nome}"\\s*(?:,\\s*\\{([^}]*)\\}|\\))`, "g"))) {
        const usati = m[1] === undefined ? [] : [...m[1].matchAll(/\b(p_\w+)\s*:/g)].map((x) => x[1]).sort();
        assert.deepEqual(usati, funzioni.get(nome), `${path.relative(radice, file)} chiama ${nome} con ${JSON.stringify(usati)}, la migrazione vuole ${JSON.stringify(funzioni.get(nome))}`);
        trovate.set(nome, trovate.get(nome) + 1);
      }
    }
  }
  // e ognuna è davvero chiamata da qualche parte (altrimenti il controllo non guarda niente)
  for (const [nome, n] of trovate) assert.ok(n >= 1, `nessuna chiamata a ${nome} nel codice`);
});

test("chiamate: la guardia sa riconoscere un argomento sbagliato", () => {
  const funzioni = funzioniDellaMigrazione();
  const sbagliata = '.rpc("prenota_visita", { p_visita: x, p_candidature: y })';
  const m = sbagliata.match(/"prenota_visita"\s*,\s*\{([^}]*)\}/);
  const usati = [...m[1].matchAll(/\b(p_\w+)\s*:/g)].map((x) => x[1]).sort();
  assert.notDeepEqual(usati, funzioni.get("prenota_visita"));
});

// ------------------------------------------------------------
// Compatibilità con Windows
// ------------------------------------------------------------

test("windows: nessuno script di test importa un modulo con un percorso al posto di un URL", () => {
  // Su Linux un percorso assoluto funziona anche come specificatore, su Windows no: l'errore
  // si vedrebbe solo là. Si cerca la forma sbagliata nel testo degli script.
  const sbagliata = /\bfrom\s+\$\{JSON\.stringify\((?!\s*(?:caricatore|pathToFileURL|url))/;
  for (const f of fs.readdirSync(path.join(radice, "scripts")).filter((x) => x.endsWith(".mjs"))) {
    const testo = fs.readFileSync(path.join(radice, "scripts", f), "utf8");
    // la riga di questa stessa guardia contiene la forma sbagliata scritta come espressione regolare
    const righe = testo.split("\n").filter((r) => !r.includes("const sbagliata"));
    assert.ok(!righe.some((r) => sbagliata.test(r)), `${f} importa un modulo con un percorso: usa pathToFileURL(...).href`);
  }
});

test("windows: lo specificatore usato è un URL «file://» valido, anche per un percorso in stile Windows", () => {
  const u = pathToFileURL(path.join(radice, "scripts", "carica-ts.mjs")).href;
  assert.match(u, /^file:\/\/\//);
  // e un percorso Windows, convertito allo stesso modo, non ha schema «c:»
  const w = pathToFileURL("C:\\Users\\marco\\scripts\\carica-ts.mjs", { windows: true }).href;
  assert.match(w, /^file:\/\/\/C:\//);
});
