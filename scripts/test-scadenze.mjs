/**
 * Test delle SCADENZE delle verifiche (reddito e protesti) e della COPERTURA del reddito del nucleo. Nati da due buchi veri: la verifica non scadeva mai
 * (un licenziato restava «verificato» per sempre) e un reddito del nucleo di 3.000 € con una sola busta paga da 1.500 € dava comunque il badge e tutti i punti.
 * Logica pura. Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { caricaTs, radice } from "./carica-ts.mjs";

const sc = caricaTs(path.join(radice, "src", "lib", "scadenze-verifiche.ts"));
const GIORNO = 24 * 60 * 60 * 1000; const ORA = Date.parse("2026-10-21T10:00:00Z"); const tra = (giorni) => new Date(ORA + giorni * GIORNO).toISOString();
const st = (stato, scadeIl, ora = ORA) => sc.statoScadenza({ stato, scadeIl, ora });

test("costanti: reddito 6 mesi, protesti 3 mesi, preavviso 30 e 7 giorni, conferma ogni 90, tolleranza 5%, fino a 6 percettori", () => {
  assert.deepEqual({ ...sc.VALIDITA_MESI }, { reddito: 6, protesti: 3 }); assert.deepEqual([...sc.PREAVVISO_GIORNI], [30, 7]); assert.equal(sc.CONFERMA_OGNI_GIORNI, 90); assert.equal(sc.TOLLERANZA_COPERTURA, 0.05); assert.equal(sc.PERCETTORI_MASSIMI, 6);
});

// ============================================================ le fasi
test("fase: mai verificata = «non avviata»; documenti inviati = «in verifica»; nessuna validità né punti", () => {
  for (const [stato, fase] of [["non_avviata", "non_avviata"], ["in_verifica", "in_verifica"]]) { const r = st(stato, null); assert.equal(r.fase, fase); assert.equal(r.valida, false); assert.equal(r.giorniResidui, null); assert.equal(r.rinnovoInCorso, false, "senza una verifica precedente non è un rinnovo"); }
  assert.equal(st("non_avviata", undefined).fase, "non_avviata"); assert.equal(st("non_avviata", "non è una data").fase, "non_avviata", "una data illeggibile = nessuna scadenza (non regala validità)");
});

test("fase: valida lontano dalla scadenza, «in scadenza» negli ultimi 30 giorni, «scaduta» dopo; il giorno esatto conta come scaduta", () => {
  assert.deepEqual([st("verificato", tra(120)).fase, st("verificato", tra(120)).valida, st("verificato", tra(120)).giorniResidui], ["valida", true, 120]);
  assert.equal(st("verificato", tra(31)).fase, "valida"); assert.equal(st("verificato", tra(30)).fase, "in_scadenza"); assert.equal(st("verificato", tra(1)).fase, "in_scadenza"); assert.equal(st("verificato", tra(30)).valida, true);
  const s = st("verificato", new Date(ORA).toISOString()); assert.deepEqual([s.fase, s.valida], ["scaduta", false], "alla scadenza esatta non vale più"); assert.equal(st("verificato", tra(-1)).fase, "scaduta"); assert.equal(st("verificato", tra(-1)).valida, false); assert.equal(st("verificato", tra(-1)).giorniResidui, -1);
  assert.equal(st("verificato", new Date(ORA + 3600 * 1000).toISOString()).giorniResidui, 1, "meno di un giorno = 1 giorno residuo (ancora valida)");
});

test("rinnovo: i documenti nuovi non tolgono validità a quella vecchia (nessun buco); se è già scaduta resta scaduta finché lo staff risponde", () => {
  const a = st("in_verifica", tra(10)); assert.deepEqual([a.fase, a.valida, a.rinnovoInCorso], ["in_scadenza", true, true]); const b = st("in_verifica", tra(-5)); assert.deepEqual([b.fase, b.valida, b.rinnovoInCorso], ["scaduta", false, true]);
  assert.equal(sc.puoRinnovare(st("verificato", tra(10))), true); assert.equal(sc.puoRinnovare(st("verificato", tra(-5))), true); assert.equal(sc.puoRinnovare(st("verificato", tra(100))), false, "troppo presto: ancora valida a lungo");
  assert.equal(sc.puoRinnovare(st("in_verifica", tra(10))), false, "già in corso"); assert.equal(sc.puoRinnovare(st("non_avviata", null)), false, "la prima volta non è un rinnovo");
});

test("scadenza: reddito +6 mesi, protesti +3 mesi, a fine mese come il database (31 agosto + 6 mesi = 28 febbraio)", () => {
  const iso = (d) => d.toISOString().slice(0, 10);
  assert.equal(iso(sc.scadenzaDa("2026-10-21T10:00:00Z", "reddito")), "2027-04-21"); assert.equal(iso(sc.scadenzaDa("2026-10-21T10:00:00Z", "protesti")), "2027-01-21"); assert.equal(iso(sc.scadenzaDa("2026-08-31T10:00:00Z", "reddito")), "2027-02-28"); assert.equal(iso(sc.scadenzaDa("2027-08-31T10:00:00Z", "reddito")), "2028-02-29", "anno bisestile");
  assert.equal(iso(sc.scadenzaDa("2026-11-30T10:00:00Z", "protesti")), "2027-02-28"); assert.equal(iso(sc.scadenzaDa("2026-12-15T10:00:00Z", "reddito")), "2027-06-15", "a cavallo d'anno"); assert.equal(sc.scadenzaDa("2026-10-21T10:30:15Z", "reddito").toISOString(), "2027-04-21T10:30:15.000Z", "l'ora resta");
});

test("date: «12 ott 2026» e «ott 2026» (ora italiana, senza punti); vuote se non si leggono", () => {
  assert.match(sc.dataBreve("2026-10-12T10:00:00Z"), /^12 ott 2026$/); assert.match(sc.meseAnno("2026-10-12T10:00:00Z"), /^ott 2026$/); for (const x of [null, undefined, "", "boh"]) { assert.equal(sc.dataBreve(x), ""); assert.equal(sc.meseAnno(x), ""); }
  assert.match(sc.dataBreve("2026-12-31T23:30:00Z"), /^1 gen 2027$/, "mezzanotte italiana: l'ora legale conta");
});

// ============================================================ la copertura del reddito del nucleo
test("copertura: 1.500 su 3.000 = 50%; dal 95% in su è tutto; mai oltre 1; senza dichiarato vale il verificato", () => {
  assert.equal(sc.copertura(3000, 1500), 0.5); assert.equal(sc.copertura(3000, 3000), 1); assert.equal(sc.copertura(3000, 2850), 1, "95%: tolleranza"); assert.ok(sc.copertura(3000, 2849) < 1); assert.equal(sc.copertura(3000, 9000), 1, "documentare di più non dà di più");
  assert.equal(sc.copertura(3000, 0), 0); assert.equal(sc.copertura(3000, null), 0); assert.equal(sc.copertura(3000, -50), 0); assert.equal(sc.copertura(null, 1500), 1); assert.equal(sc.copertura(0, 1500), 1); assert.equal(sc.copertura(null, null), 0); assert.equal(sc.copertura(3000, NaN), 0);
});

test("reddito dichiarato: quello del nucleo se c'è, altrimenti il personale; zero e negativi non contano", () => {
  assert.equal(sc.redditoDichiarato(3000, 1500), 3000); assert.equal(sc.redditoDichiarato(null, 1500), 1500); assert.equal(sc.redditoDichiarato(0, 1500), 1500); assert.equal(sc.redditoDichiarato(undefined, undefined), null); assert.equal(sc.redditoDichiarato(-1, 0), null);
});

test("punti proporzionali: 50 punti pieni, 25 al 50%, 0 a zero; arrotondati; mai fuori da 0..pieni", () => {
  assert.equal(sc.puntiProporzionali(50, 1), 50); assert.equal(sc.puntiProporzionali(50, 0.5), 25); assert.equal(sc.puntiProporzionali(50, 0), 0); assert.equal(sc.puntiProporzionali(50, 0.33), 17); assert.equal(sc.puntiProporzionali(50, 7), 50); assert.equal(sc.puntiProporzionali(50, -2), 0); assert.equal(sc.puntiProporzionali(50, 0.51), 26);
});

test("frase di copertura: «€1500 verificati su €3000 dichiarati (50%)» (come nel resto dell'app, senza punto a 4 cifre); tutto documentato: lo dice; senza dichiarato solo il verificato", () => {
  assert.equal(sc.fraseCopertura(3000, 1500), "€1500 verificati su €3000 dichiarati (50%)"); assert.equal(sc.fraseCopertura(3000, 3000), "€3000 verificati: tutto il reddito dichiarato"); assert.equal(sc.fraseCopertura(null, 1200), "€1200 verificati"); assert.equal(sc.fraseCopertura(null, null), ""); assert.equal(sc.fraseCopertura(3000, 0), "€0 verificati su €3000 dichiarati (0%)");
});

// ============================================================ un documento per ogni percettore
test("percettori: tanti documenti quanti i redditi del nucleo, da 1 a 6", () => {
  for (const [n, atteso] of [[1, 1], [2, 2], [6, 6], [9, 6], [0, 1], [-3, 1], [null, 1], [undefined, 1], [2.9, 2], [NaN, 1]]) assert.equal(sc.percettoriDaDocumentare(n), atteso, String(n));
});

test("prove mancanti: per ogni persona del nucleo con un reddito; le prove senza persona valgono per la prima; gli altri tipi non contano", () => {
  assert.deepEqual(sc.personeSenzaProva([], 2), [1, 2]); assert.deepEqual(sc.personeSenzaProva([{ tipo: "reddito", persona: 1 }], 2), [2]); assert.deepEqual(sc.personeSenzaProva([{ tipo: "reddito", persona: 1 }, { tipo: "reddito", persona: 2 }], 2), []);
  assert.deepEqual(sc.personeSenzaProva([{ tipo: "reddito" }], 2), [2], "senza persona = la prima"); assert.deepEqual(sc.personeSenzaProva([{ tipo: "identita", persona: 1 }, { tipo: "protesti", persona: 1 }], 1), [1], "identità e protesti non sono prove del reddito");
  assert.deepEqual(sc.personeSenzaProva([{ tipo: "reddito", persona: 3 }], 3), [1, 2]); assert.deepEqual(sc.personeSenzaProva([{ tipo: "reddito", persona: 5 }], 2), [1, 2], "una persona fuori dal nucleo non copre nessuno"); assert.deepEqual(sc.personeSenzaProva([{ tipo: "reddito", persona: 1 }], null), []);
});

test("frasi delle prove mancanti: una sola persona = frase semplice; più persone = quale e quante", () => {
  assert.deepEqual(sc.frasiProveMancanti([], 1), ["Carica una prova del reddito"]); assert.deepEqual(sc.frasiProveMancanti([], 2), ["Carica la prova del tuo reddito (persona 1 di 2)", "Carica la prova del reddito della persona 2 di 2"]); assert.deepEqual(sc.frasiProveMancanti([{ tipo: "reddito", persona: 1 }], 3), ["Carica la prova del reddito della persona 2 di 3", "Carica la prova del reddito della persona 3 di 3"]);
  assert.equal(sc.etichettaPersona(1), "Tu"); assert.equal(sc.etichettaPersona(2), "Persona 2"); assert.equal(sc.etichettaPersona(0), "Tu");
});

// ============================================================ la conferma periodica
test("freschezza: l'ultima tra verifica e conferma; conferma necessaria ogni 90 giorni, solo con una verifica valida", () => {
  const fa = (g) => new Date(ORA - g * GIORNO).toISOString();
  assert.equal(sc.ultimaFreschezza(fa(100), fa(10)), fa(10)); assert.equal(sc.ultimaFreschezza(fa(10), fa(100)), fa(10)); assert.equal(sc.ultimaFreschezza(fa(10), null), fa(10)); assert.equal(sc.ultimaFreschezza(null, null), null); assert.equal(sc.ultimaFreschezza("boh", undefined), null);
  assert.equal(sc.giorniDa(fa(5), ORA), 5); assert.equal(sc.giorniDa(null, ORA), null);
  const c = (g, conf, valida = true) => sc.confermaNecessaria({ valida, verificataIl: fa(g), confermataIl: conf, ora: ORA });
  assert.equal(c(89, null), false); assert.equal(c(90, null), true); assert.equal(c(200, fa(10)), false, "ha confermato da poco"); assert.equal(c(200, fa(95)), true); assert.equal(c(200, null, false), false, "senza verifica valida non c'è niente da confermare");
  assert.equal(sc.confermaNecessaria({ valida: true, verificataIl: null, confermataIl: null, ora: ORA }), false, "senza date non si inventa una richiesta");
});

// ============================================================ cosa dire
test("frasi di validità: le date vere, il rinnovo in corso, nessuna frase se non c'è una verifica", () => {
  const f = (tipo, stato, scade) => sc.fraseValidita(tipo, st(stato, scade));
  assert.match(f("reddito", "verificato", tra(120)), /^Valida fino al \d+ \w+ 2027\.$/); assert.match(f("reddito", "verificato", tra(12)), /^Scade tra 12 giorni .*rinnova la verifica dei documenti del reddito per non perdere i punti\.$/); assert.match(f("protesti", "verificato", tra(12)), /rinnova la verifica dei protesti/);
  assert.match(f("reddito", "verificato", tra(1)), /^Scade domani/); assert.match(f("reddito", "verificato", new Date(ORA + 1000).toISOString()), /^Scade domani/, "mancano poche ore: ceil = 1"); assert.match(f("reddito", "in_verifica", tra(5)), /il rinnovo è in corso, finché non rispondiamo la verifica resta valida/);
  assert.match(f("reddito", "verificato", tra(-3)), /^Scaduta il .*non dà più punti .*Rinnovala con documenti recenti\.$/); assert.match(f("reddito", "in_verifica", tra(-3)), /Il rinnovo è in corso\.$/); assert.equal(f("reddito", "non_avviata", null), ""); assert.equal(f("reddito", "in_verifica", null), "");
});

test("etichette per il proprietario: la data della verifica, la parte documentata, «scaduta»; mai «verificato» se è scaduta", () => {
  const e = sc.etichettaRedditoProprietario;
  assert.equal(e({ valida: true, scaduta: false, verificatoIl: "2026-10-12T10:00:00Z", cop: 1 }), "Reddito verificato · ott 2026"); assert.equal(e({ valida: true, scaduta: false, verificatoIl: "2026-10-12T10:00:00Z", cop: 0.5 }), "Reddito verificato in parte (50%) · ott 2026"); assert.equal(e({ valida: true, scaduta: false, verificatoIl: null, cop: null }), "Reddito verificato");
  assert.equal(e({ valida: false, scaduta: true, verificatoIl: "2026-01-10T10:00:00Z", cop: 1 }), "Verifica del reddito scaduta"); assert.equal(e({ valida: false, scaduta: false, verificatoIl: null, cop: null }), null); assert.equal(e({ valida: true, scaduta: true, verificatoIl: null, cop: 1 }), "Verifica del reddito scaduta", "se per errore sono entrambe vere, vince «scaduta»");
  const p = sc.etichettaProtestiProprietario;
  assert.equal(p({ esito: "nessuno", scaduta: false, verificatoIl: "2026-10-12T10:00:00Z" }), "Nessun protesto · verificato · ott 2026"); assert.equal(p({ esito: "si", scaduta: false, verificatoIl: null }), "Ha protesti · verificato"); assert.equal(p({ esito: "nessuno", scaduta: true, verificatoIl: null }), "Verifica dei protesti scaduta"); assert.equal(p({ esito: null, scaduta: false, verificatoIl: null }), null);
});

// ============================================================ il punteggio di affidabilità
const aff = caricaTs(path.join(radice, "src", "lib", "affidabilita.ts"));
const base = { verificato: true, protestato: false, garante: true, fideiussione: false };

test("affidabilità: con tutto il reddito documentato nulla cambia (50 + 30 + 20 = 100); senza indicare la copertura vale 1", () => {
  assert.equal(aff.computeAffidabilita(base).punteggio, 100); assert.equal(aff.computeAffidabilita({ ...base, coperturaReddito: 1 }).punteggio, 100); assert.equal(aff.computeAffidabilita({ ...base, coperturaReddito: 1 }).voci[0].etichetta, "Reddito verificato");
});

test("affidabilità: il reddito documentato a metà dà metà dei punti (25), la voce lo dice e suggerisce di documentare il resto; l'etichetta scende", () => {
  const r = aff.computeAffidabilita({ ...base, coperturaReddito: 0.5 }); const v = r.voci[0];
  assert.equal(r.punteggio, 75); assert.equal(r.label, "Molto buona"); assert.deepEqual([v.etichetta, v.punti, v.massimo, v.potenziale, v.presa, v.origine, v.sezione], ["Reddito verificato in parte", 25, 50, 25, true, "verificato", "verifica"]); assert.match(v.suggerimento, /Documenta il reddito di tutto il nucleo/); assert.match(v.nota, /50% del reddito del nucleo/);
  assert.equal(aff.computeAffidabilita({ ...base, coperturaReddito: 0.33 }).voci[0].punti, 17); assert.equal(aff.computeAffidabilita({ ...base, coperturaReddito: 0 }).voci[0].presa, false, "documentato zero: nessun punto");
  assert.equal(aff.computeAffidabilita({ ...base, coperturaReddito: 9 }).punteggio, 100, "mai più dei punti pieni"); assert.equal(aff.computeAffidabilita({ ...base, coperturaReddito: -1 }).voci[0].punti, 0);
});

test("affidabilità: la verifica scaduta non dà punti, dice di rinnovare e il potenziale è tutto; la copertura non c'entra se non è verificato", () => {
  const r = aff.computeAffidabilita({ ...base, verificato: false, redditoScaduto: true }); const v = r.voci[0];
  assert.equal(r.punteggio, 50); assert.deepEqual([v.etichetta, v.punti, v.presa, v.potenziale, v.sezione, v.suggerimento], ["Reddito verificato (scaduto)", 0, false, 50, "verifica", "Rinnova la verifica del reddito"]); assert.match(v.nota, /scaduta/);
  assert.equal(aff.computeAffidabilita({ ...base, verificato: false, coperturaReddito: 1 }).voci[0].punti, 0, "non verificato: la copertura non regala niente"); assert.equal(aff.computeAffidabilita({ ...base, verificato: false }).voci[0].etichetta, "Reddito verificato", "mai verificato: il testo di sempre");
  assert.equal(aff.computeAffidabilita({ ...base, verificato: true, redditoScaduto: true }).voci[0].punti, 50, "se è ancora valida (verificato) la scadenza non c'entra: il chiamante passa verificato=false quando scade");
});

test("affidabilità: i protesti e la garanzia non cambiano con la copertura (solo il reddito è proporzionale)", () => {
  const r = aff.computeAffidabilita({ ...base, coperturaReddito: 0.5, protestato: true, garante: false }); assert.deepEqual(r.voci.slice(1).map((v) => v.punti), [-30, 0]); assert.equal(r.punteggio, 0, "25 − 30 = −5, fermato a 0");
  assert.equal(aff.computeAffidabilita({ ...base, coperturaReddito: 0.5, protestiVerificati: true }).voci[1].origine, "verificato");
});

// ============================================================ leggere le verifiche da una riga del database
const rigaVerificata = (o = {}) => ({ verificato: true, verifica_stato: "verificato", reddito_scade_il: tra(100), reddito_verificato_at: tra(-80), reddito_nucleo_verificato: 1500, reddito_mensile: 1500, reddito_nucleo: 3000, protesti_verifica_stato: "verificato", protesti_scade_il: tra(40), protesti_verificati_at: tra(-50), situazione_confermata_at: tra(-5), ...o });

test("leggiVerifiche: una riga verificata a metà (1.500 su 3.000) = valida, copertura 50%, protesti validi, nessuna conferma necessaria (confermata da poco)", () => {
  const l = sc.leggiVerifiche(rigaVerificata(), ORA);
  assert.deepEqual([l.redditoValido, l.redditoScaduto, l.coperturaReddito, l.redditoDichiarato, l.redditoNucleoVerificato, l.protestiValidi, l.protestiScaduti, l.confermaNecessaria], [true, false, 0.5, 3000, 1500, true, false, false]);
  assert.equal(l.reddito.fase, "valida"); assert.equal(l.protesti.fase, "valida"); assert.equal(l.redditoVerificatoIl, tra(-80)); assert.equal(l.confermataIl, tra(-5)); assert.equal(l.freschezza, tra(-5), "la più recente tra verifiche e conferma");
});

test("leggiVerifiche: scaduta = non valida, «scaduta», nessuna copertura (non regala niente); il rinnovo in corso non toglie la validità vecchia", () => {
  const s = sc.leggiVerifiche(rigaVerificata({ reddito_scade_il: tra(-2) }), ORA); assert.deepEqual([s.redditoValido, s.redditoScaduto, s.coperturaReddito, s.reddito.fase], [false, true, null, "scaduta"]);
  const r = sc.leggiVerifiche(rigaVerificata({ verifica_stato: "in_verifica", reddito_scade_il: tra(10) }), ORA); assert.deepEqual([r.redditoValido, r.reddito.rinnovoInCorso, r.reddito.fase], [true, true, "in_scadenza"]);
  const p = sc.leggiVerifiche(rigaVerificata({ protesti_scade_il: tra(-1) }), ORA); assert.deepEqual([p.protestiValidi, p.protestiScaduti], [false, true]);
});

test("leggiVerifiche: mai verificato / dati vecchi senza i campi nuovi / verificato senza scadenza = niente di valido (mai valido per dimenticanza)", () => {
  for (const riga of [{}, { verificato: false, verifica_stato: "non_avviata" }, { verificato: true, verifica_stato: "verificato" }, { verificato: true, reddito_scade_il: null }, { verificato: false, reddito_scade_il: tra(100) }]) { const l = sc.leggiVerifiche(riga, ORA); assert.equal(l.redditoValido, false, JSON.stringify(riga)); assert.equal(l.coperturaReddito, null); assert.equal(l.protestiValidi, false); assert.equal(l.confermaNecessaria, false); }
  assert.equal(sc.leggiVerifiche({ verificato: true, reddito_scade_il: null }, ORA).redditoScaduto, false, "senza scadenza non è «scaduta»: è solo non verificato");
  const i = sc.leggiVerifiche({ verifica_stato: "in_verifica" }, ORA); assert.equal(i.reddito.fase, "in_verifica");
});

test("leggiVerifiche: la conferma riguarda lavoro e reddito: la verifica dei PROTESTI non la rinfresca, e con i soli protesti validi non serve", () => {
  const vecchioReddito = { reddito_verificato_at: tra(-120), situazione_confermata_at: tra(-100) };
  assert.equal(sc.leggiVerifiche(rigaVerificata({ ...vecchioReddito, protesti_verificati_at: tra(-2) }), ORA).confermaNecessaria, true, "i protesti verificati ieri non rinfrescano la situazione di lavoro e reddito");
  assert.equal(sc.leggiVerifiche(rigaVerificata({ ...vecchioReddito, protesti_verificati_at: tra(-2) }), ORA).freschezza, tra(-100), "la freschezza è quella del reddito e della conferma");
  assert.equal(sc.leggiVerifiche(rigaVerificata({ ...vecchioReddito, reddito_scade_il: tra(-3), verificato: true }), ORA).confermaNecessaria, false, "con il reddito scaduto si rinnova, non si conferma");
  assert.equal(sc.leggiVerifiche({ protesti_verifica_stato: "verificato", protesti_scade_il: tra(30), protesti_verificati_at: tra(-150) }, ORA).confermaNecessaria, false, "i soli protesti validi: niente da confermare");
  assert.equal(sc.leggiVerificheVista({ verificato: true, reddito_verificato_at: tra(-120), situazione_confermata_at: tra(-100), protesti_verificati: true, protesti_verificati_at: tra(-2) }).confermaNecessaria, true);
});

test("leggiVerifiche: la conferma serve dopo 90 giorni dall'ultima verifica o conferma, e solo se c'è qualcosa di valido", () => {
  assert.equal(sc.leggiVerifiche(rigaVerificata({ reddito_verificato_at: tra(-120), protesti_verificati_at: tra(-130), situazione_confermata_at: tra(-100) }), ORA).confermaNecessaria, true);
  assert.equal(sc.leggiVerifiche(rigaVerificata({ reddito_verificato_at: tra(-120), protesti_verificati_at: tra(-130), situazione_confermata_at: tra(-10) }), ORA).confermaNecessaria, false);
  assert.equal(sc.leggiVerifiche(rigaVerificata({ reddito_verificato_at: tra(-120), protesti_verificati_at: tra(-130), situazione_confermata_at: null, reddito_scade_il: tra(-1), protesti_scade_il: tra(-1) }), ORA).confermaNecessaria, false, "tutto scaduto: si rinnova, non si conferma");
});

test("leggiVerifiche: senza reddito del nucleo si confronta con quello personale; verificato tutto = copertura 1; verificato più del dichiarato = 1", () => {
  assert.equal(sc.leggiVerifiche(rigaVerificata({ reddito_nucleo: null, reddito_mensile: 1500, reddito_nucleo_verificato: 1500 }), ORA).coperturaReddito, 1); assert.equal(sc.leggiVerifiche(rigaVerificata({ reddito_nucleo_verificato: 3000 }), ORA).coperturaReddito, 1); assert.equal(sc.leggiVerifiche(rigaVerificata({ reddito_nucleo_verificato: 4500 }), ORA).coperturaReddito, 1);
  assert.equal(sc.leggiVerifiche(rigaVerificata({ reddito_nucleo_verificato: null }), ORA).coperturaReddito, 0, "verificato senza importi (dati strani): nessuna copertura, non un regalo");
});

test("leggiVerificheVista (il proprietario): la validità arriva già calcolata dal database; copertura, scaduta e date si leggono dalla vista", () => {
  const v = { verificato: true, reddito_scaduto: false, reddito_verificato_at: "2026-10-12T10:00:00Z", reddito_nucleo_verificato: 1500, reddito_mensile: 1500, reddito_nucleo: 3000, protesti_verificati: true, protesti_scaduti: false, protesti_verificati_at: "2026-10-01T10:00:00Z", situazione_confermata_at: null };
  const l = sc.leggiVerificheVista(v); assert.deepEqual([l.redditoValido, l.redditoScaduto, l.coperturaReddito, l.protestiValidi, l.protestiScaduti, l.redditoVerificatoIl, l.protestiVerificatiIl, l.reddito, l.protesti], [true, false, 0.5, true, false, "2026-10-12T10:00:00Z", "2026-10-01T10:00:00Z", null, null]);
  const s = sc.leggiVerificheVista({ ...v, verificato: false, reddito_scaduto: true, protesti_verificati: false, protesti_scaduti: true }); assert.deepEqual([s.redditoValido, s.redditoScaduto, s.coperturaReddito, s.protestiValidi, s.protestiScaduti], [false, true, null, false, true]);
  for (const vuoto of [null, undefined, {}, { verificato: null, reddito_scaduto: null }]) { const e = sc.leggiVerificheVista(vuoto); assert.deepEqual([e.redditoValido, e.redditoScaduto, e.coperturaReddito, e.protestiValidi, e.confermaNecessaria], [false, false, null, false, false]); }
});

test("input dell'affidabilità dalle verifiche: il reddito conta se vale e in proporzione; scaduto lo dice; i protesti «verificati» solo se valgono", () => {
  const a = sc.parteVerificheAffidabilita(sc.leggiVerifiche(rigaVerificata(), ORA)); assert.deepEqual(a, { verificato: true, coperturaReddito: 0.5, redditoScaduto: false, protestiVerificati: true });
  const b = sc.parteVerificheAffidabilita(sc.leggiVerifiche(rigaVerificata({ reddito_scade_il: tra(-1), protesti_scade_il: tra(-1) }), ORA)); assert.deepEqual(b, { verificato: false, coperturaReddito: 1, redditoScaduto: true, protestiVerificati: false });
  const r = aff.computeAffidabilita({ ...sc.parteVerificheAffidabilita(sc.leggiVerifiche(rigaVerificata(), ORA)), protestato: false, garante: true, fideiussione: false }); assert.equal(r.punteggio, 75, "25 (metà del reddito) + 30 + 20");
  const e = aff.computeAffidabilita({ ...b, protestato: false, garante: true, fideiussione: false }); assert.equal(e.punteggio, 50, "scaduto: niente punti del reddito; la risposta sui protesti vale come dichiarata (+30) e il garante (+20)"); assert.equal(e.voci[1].origine, "dichiarato", "scaduti i protesti verificati tornano «dichiarati»");
});

// ============================================================ cosa dice e cosa permette la verifica lato inquilino
const vi = caricaTs(path.join(radice, "src", "lib", "verifica-inquilino.ts"));
const dati = { professione: "Impiegata", reddito_mensile: 1500 };
const doc = (tipo, persona, verificato_at = null) => ({ tipo, persona, verificato_at });

test("puoRinnovare: negli ultimi 30 giorni o scaduta sì; con il reddito documentato solo in parte anche prima (per integrare); mai con un rinnovo già in corso", () => {
  assert.equal(sc.puoRinnovare(st("verificato", tra(100))), false); assert.equal(sc.puoRinnovare(st("verificato", tra(100)), { coperturaIncompleta: true }), true, "integrare le prove degli altri, subito"); assert.equal(sc.puoRinnovare(st("verificato", tra(100)), { coperturaIncompleta: false }), false);
  assert.equal(sc.puoRinnovare(st("in_verifica", tra(100)), { coperturaIncompleta: true }), false, "già in corso"); assert.equal(sc.puoRinnovare(st("non_avviata", null), { coperturaIncompleta: true }), false, "senza verifica non c'è niente da integrare"); assert.equal(sc.puoRinnovare(st("verificato", tra(-3)), { coperturaIncompleta: true }), true);
});

test("descrizione dello stato del reddito: valida (con la data), in scadenza, scaduta, parziale (con le cifre), rinnovo non riuscito; senza verifica il testo di sempre", () => {
  const d = (riga) => vi.descriviVerificaReddito({ stato: riga.verifica_stato ?? "non_avviata", nota: riga.verifica_esito_note ?? null, ver: sc.leggiVerifiche(riga, ORA) });
  const piena = d(rigaVerificata({ reddito_nucleo_verificato: 3000 })); assert.deepEqual([piena.titolo, piena.tono], ["Reddito verificato", "ok"]); assert.match(piena.testo, /Valida fino al \d+ \w+ 2027/); assert.match(piena.testo, /I proprietari vedono «Reddito verificato»/); assert.ok(!/coprono solo una parte/.test(piena.testo));
  const parz = d(rigaVerificata()); assert.deepEqual([parz.titolo, parz.tono], ["Reddito verificato in parte", "attesa"]); assert.match(parz.testo, /€1500 verificati su €3000 dichiarati \(50%\)/); assert.match(parz.testo, /Aggiungi la prova del reddito degli altri componenti/);
  const scad = d(rigaVerificata({ reddito_nucleo_verificato: 3000, reddito_scade_il: tra(12) })); assert.deepEqual([scad.titolo, scad.tono], ["Reddito verificato · in scadenza", "attesa"]); assert.match(scad.testo, /Scade tra 12 giorni/);
  const morta = d(rigaVerificata({ reddito_scade_il: tra(-4) })); assert.deepEqual([morta.titolo, morta.tono], ["Verifica del reddito scaduta", "no"]); assert.match(morta.testo, /non dà più punti/);
  const respinto = d(rigaVerificata({ reddito_nucleo_verificato: 3000, verifica_esito_note: "Busta paga illeggibile" })); assert.match(respinto.testo, /Il rinnovo non è riuscito: Busta paga illeggibile/); assert.equal(respinto.tono, "ok", "la verifica vecchia vale ancora");
  assert.deepEqual(d({ verificato: false, verifica_stato: "non_avviata" }), vi.descriviStatoInquilino("non_avviata", null)); assert.deepEqual(d({ verificato: false, verifica_stato: "in_verifica" }), vi.descriviStatoInquilino("in_verifica", null)); assert.equal(d({ verificato: false, verifica_stato: "non_avviata", verifica_esito_note: "Documento illeggibile" }).titolo, "Verifica non riuscita");
});

test("cosa manca per inviare: una prova NUOVA per ogni persona del nucleo (quelle già verificate non contano), l'identità e i dati", () => {
  const m = (documenti, redditiNucleo) => vi.cosaMancaInquilino({ documenti, dati, redditiNucleo });
  assert.deepEqual(m([doc("identita", 1), doc("reddito", 1)], 1), []); assert.deepEqual(m([doc("identita", 1), doc("reddito", 1)], undefined), [], "senza il numero dei redditi: una persona");
  assert.deepEqual(m([doc("identita", 1), doc("reddito", 1)], 2), ["Carica la prova del reddito della persona 2 di 2"]); assert.deepEqual(m([doc("identita", 1)], 2), ["Carica la prova del tuo reddito (persona 1 di 2)", "Carica la prova del reddito della persona 2 di 2"]);
  assert.deepEqual(m([doc("identita", 1), doc("reddito", 1, "2026-05-01T10:00:00Z")], 1), ["Carica una prova del reddito"], "una prova già verificata non basta per un rinnovo"); assert.deepEqual(m([doc("identita", 1), doc("reddito", 1, "2026-05-01T10:00:00Z"), doc("reddito", 1)], 1), []);
  assert.deepEqual(m([doc("reddito", 1)], 1), ["Carica un documento d'identità"]); assert.deepEqual(vi.cosaMancaInquilino({ documenti: [doc("identita", 1), doc("reddito", 1)], dati: { professione: "", reddito_mensile: 0 } }), ["Indica il tuo lavoro nel profilo, in «I tuoi dati»", "Indica il tuo reddito mensile nel profilo, in «I tuoi dati»"]);
});

test("si può inviare: la prima volta, o un rinnovo/integrazione consentito (verificato + rinnovabile); mai in verifica; mai se manca qualcosa", () => {
  const p = (stato, documenti, extra = {}) => vi.puoInviareInquilino({ stato, documenti, dati, ...extra });
  const ok = [doc("identita", 1), doc("reddito", 1)];
  assert.equal(p("non_avviata", ok), true); assert.equal(p("in_verifica", ok), false); assert.equal(p("verificato", ok), false, "verificato e non rinnovabile: niente da inviare"); assert.equal(p("verificato", ok, { rinnovabile: true }), true); assert.equal(p("verificato", [doc("identita", 1), doc("reddito", 1, "2026-05-01T10:00:00Z")], { rinnovabile: true }), false, "serve una prova nuova");
  assert.equal(p("non_avviata", ok, { redditiNucleo: 2 }), false, "manca la prova della seconda persona"); assert.equal(p("non_avviata", [...ok, doc("reddito", 2)], { redditiNucleo: 2 }), true); assert.equal(p("verificato", ok, { rinnovabile: false }), false);
});

// ============================================================ il lavoro periodico dei promemoria
import fs from "node:fs";
const leggiFile = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");

test("lavoro periodico: rotta protetta dallo stesso segreto delle altre, chiave di servizio, nessun dato personale nella risposta, funziona anche con GET e POST", () => {
  const r = leggiFile("src", "app", "api", "verifiche", "promemoria", "route.ts"); const senza = r.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(senza, /autorizzaCron\(richiesta\.headers\.get\("authorization"\), process\.env\.CRON_SECRET\)/); assert.match(senza, /esito === "non_configurato"\) return risposta\(503/); assert.match(senza, /esito === "rifiutato"\) return risposta\(401/);
  assert.match(senza, /clienteAmministratore\(\)/); assert.match(senza, /admin\.rpc\("promemoria_scadenze_verifiche"\)/); assert.match(senza, /export const dynamic = "force-dynamic";/); assert.match(senza, /export const GET = gestisci;\s+export const POST = gestisci;/);
  assert.match(senza, /risposta\(200, \{ creati: typeof data === "number" \? data : 0 \}\)/, "risponde solo con un numero"); assert.ok(!/nome|cognome|email|tenant_id|user_id/i.test(senza.replace(/^import .*$/gm, "").replace(/console\.error[^;]*;/, "")), "nessun dato personale nella risposta");
  assert.ok(senza.indexOf("autorizzaCron") < senza.indexOf("clienteAmministratore()"), "prima si controlla il segreto, poi si usa la chiave di servizio");
});

// ============================================================ i criteri del proprietario dicono la verità su copertura e scadenza
const pro = caricaTs(path.join(radice, "src", "lib", "match", "proprietario.ts")); const cnd = caricaTs(path.join(radice, "src", "lib", "match", "candidato.ts")); const prt = caricaTs(path.join(radice, "src", "lib", "protesti.ts"));
const dc = (o = {}) => ({ redditoMensileNucleo: 3000, garante: null, fideiussione: null, verificato: true, coperturaReddito: 1, redditoScaduto: false, completezza: 100, protestato: false, ...o });

test("criterio «profilo verificato»: richiede il reddito documentato per intero e la verifica valida; in parte o scaduta NON basta, e dice perché", () => {
  const v = (c) => pro.CATALOGO_CRITERI.profiloVerificato.valuta(c, { canone: 900, sogliaPct: 33 });
  assert.deepEqual(v(dc()), { stato: "ok" }); assert.deepEqual(v(dc({ coperturaReddito: undefined })), { stato: "ok" }, "dati vecchi: tutto documentato"); assert.deepEqual(v(dc({ coperturaReddito: null })), { stato: "ok" });
  assert.deepEqual(v(dc({ coperturaReddito: 0.5 })), { stato: "no", dettaglio: "Reddito verificato solo in parte (50%)" }); assert.deepEqual(v(dc({ coperturaReddito: 0.949 })), { stato: "no", dettaglio: "Reddito verificato solo in parte (95%)" });
  assert.deepEqual(v(dc({ verificato: false, coperturaReddito: null, redditoScaduto: true })), { stato: "no", dettaglio: "Verifica scaduta: va rinnovata" }); assert.deepEqual(v(dc({ verificato: false, coperturaReddito: null })), { stato: "no", dettaglio: "Verifica non ancora effettuata" });
  assert.match(pro.CATALOGO_CRITERI.profiloVerificato.descrizione, /la verifica vale ancora/);
});

test("criterio canone/reddito: resta sul reddito DICHIARATO (nessun incentivo a non documentare) ma dice quanto è documentato", () => {
  const v = (c, canone = 900) => pro.CATALOGO_CRITERI.redditoCanone.valuta(c, { canone, sogliaPct: 33 });
  assert.deepEqual(v(dc({ coperturaReddito: 0.5 })), { stato: "ok", dettaglio: "Il canone pesa il 30% sul reddito dichiarato (documentato solo il 50%)" }); assert.deepEqual(v(dc({ coperturaReddito: 1 })), { stato: "ok", dettaglio: "Il canone pesa il 30% sul reddito" }); assert.deepEqual(v(dc({ coperturaReddito: null })), { stato: "ok", dettaglio: "Il canone pesa il 30% sul reddito" });
  assert.equal(v(dc({ coperturaReddito: 0.5 }), 1500).stato, "no", "e sfora comunque la soglia sul dichiarato"); assert.equal(v(dc({ coperturaReddito: 0.1 })).stato, "ok", "chi documenta poco non viene escluso dal criterio del canone: lo vede il proprietario nel dettaglio");
  assert.deepEqual(v(dc({ redditoMensileNucleo: null })), { stato: "non_indicato" });
});

test("profilo del candidato: la copertura passa al calcolo solo se verificato; l'affidabilità la usa; scaduta = nessun punto del reddito", () => {
  const p = (o = {}) => ({ professione: "x", reddito_mensile: 1500, reddito_nucleo: 3000, garante: true, fideiussione: false, protestato: false, animali_compilato: true, nucleo_compilato: true, presentazione: "ok", verificato: true, protestiVerificati: false, ...o });
  assert.equal(cnd.datiCandidatoDaProfilo(p({ coperturaReddito: 0.5 })).coperturaReddito, 0.5); assert.equal(cnd.datiCandidatoDaProfilo(p({ verificato: false, coperturaReddito: 0.5 })).coperturaReddito, null, "non verificato: nessuna copertura"); assert.equal(cnd.datiCandidatoDaProfilo(p()).coperturaReddito, 1, "assente = tutto documentato"); assert.equal(cnd.datiCandidatoDaProfilo(p({ redditoScaduto: true, verificato: false })).redditoScaduto, true);
  const val = (o) => cnd.valutaCandidato({ criteri: [], canone: 900, profilo: p(o), recensioni: { numero: 0, media: null } }).affidabilita;
  assert.equal(val({}), 100); assert.equal(val({ coperturaReddito: 0.5 }), 75); assert.equal(val({ verificato: false, redditoScaduto: true }), 50); assert.equal(val({ verificato: false }), 50);
});

test("protesti: il rinnovo vuole un certificato NUOVO (quello già verificato non basta); si invia la prima volta o come rinnovo consentito, mai mentre lo staff controlla", () => {
  const nuovo = { tipo: "protesti", verificato_at: null }, vecchio = { tipo: "protesti", verificato_at: "2026-05-01T10:00:00Z" }, id = { tipo: "identita", verificato_at: null };
  assert.deepEqual(prt.cosaMancaProtesti({ documenti: [id, vecchio], protestato: false }), ["Carica il certificato dei protesti"]); assert.deepEqual(prt.cosaMancaProtesti({ documenti: [id, vecchio, nuovo], protestato: false }), []); assert.deepEqual(prt.cosaMancaProtesti({ documenti: [id, nuovo], protestato: null }), ["Rispondi alla domanda sui protesti, in «I tuoi dati»"]);
  const p = (stato, documenti, rinnovabile) => prt.puoInviareProtesti({ stato, documenti, protestato: false, rinnovabile });
  assert.equal(p("non_avviata", [id, nuovo]), true); assert.equal(p("verificato", [id, nuovo]), false, "verificato e non rinnovabile"); assert.equal(p("verificato", [id, nuovo], true), true); assert.equal(p("verificato", [id, vecchio], true), false, "serve un certificato nuovo"); assert.equal(p("in_verifica", [id, nuovo], true), false);
  const v = sc.leggiVerifiche({ protesti_verifica_stato: "verificato", protesti_scade_il: tra(10), protesti_verificati_at: tra(-80) }, ORA); const d = prt.descriviVerificaProtesti({ stato: "verificato", nota: null, protestato: false, ver: v });
  assert.deepEqual([d.titolo, d.tono], ["Protesti verificati: nessun protesto · in scadenza", "attesa"]); assert.match(d.testo, /Scade tra 10 giorni/);
  const morta = prt.descriviVerificaProtesti({ stato: "verificato", nota: null, protestato: false, ver: sc.leggiVerifiche({ protesti_verifica_stato: "verificato", protesti_scade_il: tra(-2) }, ORA) }); assert.deepEqual([morta.titolo, morta.tono], ["Verifica dei protesti scaduta", "no"]); assert.match(morta.testo, /La risposta si può correggere, poi rinnova/);
  assert.deepEqual(prt.descriviVerificaProtesti({ stato: "non_avviata", nota: null, protestato: null, ver: sc.leggiVerifiche({}, ORA) }), prt.descriviStatoProtesti("non_avviata", null, null));
});
