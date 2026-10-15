/**
 * Test del Database inquilini del proprietario: diviso per casa (candidature spontanee, possibili match, già valutati), la scheda con
 * affidabilità e match in alto, «Fai match» / «Scarta» / «Apri chat» e gli ANNULLAMENTI (annulla match, annulla scarto), la ricerca in
 * fondo. Le regole dell'annullamento stanno nel database (migrazione 0034): le prova test-db-richieste.mjs su un PostgreSQL vero.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const db = caricaTs(path.join(radice, "src", "lib", "database-proprietario.ts"));
const dec = caricaTs(path.join(radice, "src", "lib", "decisioni.ts"));
const nt = caricaTs(path.join(radice, "src", "lib", "notifiche.ts"));
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const migrazione = leggi("supabase", "migrations", "0034_riapri_candidatura.sql");

// ============================================================ le parole e le regole
test("errori dell'annullamento: ogni codice che la funzione del database può restituire ha le sue parole, e nessuna parola è per un codice che non esiste", () => {
  const corpo = migrazione.slice(migrazione.indexOf("create or replace function public.riapri_candidatura"));
  const codici = [...new Set([...corpo.matchAll(/raise exception '([A-Z_]+):/g)].map((m) => m[1]))].sort(); assert.deepEqual(Object.keys(dec.ERRORI_RIAPERTURA).sort(), codici);
  for (const [k, v] of Object.entries(dec.ERRORI_RIAPERTURA)) { assert.ok(v.length > 10 && /[.]$/.test(v), `${k}: una frase intera`); assert.ok(!/[A-Z_]{6,}/.test(v), `${k}: il codice non deve comparire`); }
});

test("errori dell'annullamento: dal messaggio del database alle parole; ciò che non si riconosce resta generico", () => {
  assert.equal(dec.messaggioErroreRiapertura("HA_UN_CONTRATTO: c'è già un contratto, il match non si può annullare"), dec.ERRORI_RIAPERTURA.HA_UN_CONTRATTO); assert.match(dec.messaggioErroreRiapertura("HA_UNA_VISITA: x"), /visita in programma/);
  for (const x of [null, undefined, 5, {}, "", "boh", "ha_un_contratto: x", "  HA_UN_CONTRATTO: x", "CODICE_INVENTATO: x", "DECISIONE_DEFINITIVA: la candidatura è già stata valutata", 'new row violates check constraint "x"', "permission denied for function riapri_candidatura"]) assert.equal(dec.messaggioErroreRiapertura(x), dec.ERRORE_RIAPERTURA_GENERICO, JSON.stringify(x));
});

test("cosa si può fare con una candidatura: in attesa = Fai match e Scarta; match = Apri chat e Annulla match; scartata = Annulla scarto; ritirata o sconosciuta = niente", () => {
  const a = dec.azioniPerStato; const solo = (s) => Object.entries(a(s)).filter(([, v]) => v).map(([k]) => k).sort();
  assert.deepEqual(solo("in_attesa"), ["faiMatch", "scarta"]); assert.deepEqual(solo("accettata"), ["annullaMatch", "apriChat"]); assert.deepEqual(solo("rifiutata"), ["annullaScarto"]); for (const x of ["ritirata", "", "boh", undefined, null, 5]) assert.deepEqual(solo(x), [], String(x));
  for (const s of ["in_attesa", "accettata", "rifiutata"]) { assert.ok(!(a(s).faiMatch && a(s).annullaMatch)); assert.ok(!(a(s).apriChat && a(s).scarta), "chi è un match non si scarta senza prima annullare il match"); }
});

test("la notifica «candidatura riaperta» ha parole per l'inquilino, con la casa; senza titolo non si rompe", () => {
  assert.ok(nt.TIPI_NOTIFICA.includes("candidatura_riaperta")); const n = nt.descriviNotifica("candidatura_riaperta", { titolo: "Bilocale" }); assert.equal(n.titolo, "La tua candidatura è di nuovo in attesa"); assert.equal(n.testo, "Il proprietario di «Bilocale» ha annullato la sua decisione: sta rivalutando la tua candidatura."); assert.match(nt.descriviNotifica("candidatura_riaperta", null).testo, /^Il proprietario di una casa ha annullato/);
});

// ============================================================ il raggruppamento per casa
let n = 0;
const cand = (listing, status, o = {}) => ({ id: "c" + ++n, status, match_pct: null, created_at: `2026-10-${String(10 + (n % 15)).padStart(2, "0")}T10:00:00Z`, tenant_id: "t" + n, listing_id: listing, listings: { titolo: "Casa " + listing, zona: "Isola, Milano", prezzo: 1000 }, tenant_profiles: { professione: "Designer", reddito_mensile: 2000, reddito_nucleo: null, verificato: false, presentazione: "Ciao", avatar_url: null }, nome: "Anna", cognome: "Verdi", valutazione: { match: { punteggio: 50, etichetta: "Buona", bloccato: false, mancanti: [], criteri: [], incompleto: false }, affidabilita: 40, recensioni: null, raccomandato: false, congelata: false }, ...o });
const casa = (id, o = {}) => ({ id, titolo: "Casa " + id, zona: "Isola, Milano", prezzo: 1000, foto: null, pubblicata: true, verificata: true, ...o });
const poss = (id, disponibili = [], richieste = [], possibili = disponibili.length) => ({ id, titolo: "Casa " + id, zona: "Isola", possibili, disponibili, richieste });
const sch = (id) => ({ tenantId: id, nome: "Dario R.", professione: "Cuoco", avatarUrl: null, presentazione: null, affidabilita: 80, etichettaAffidabilita: "Eccellente", raccomandato: false, recensioni: { numero: 0, media: null }, redditoVerificato: true, compatibilita: 70 });
const stato = (c) => c.status;
const raggruppa = (o) => db.raggruppaPerAnnuncio({ case_: [], candidature: [], possibili: [], stato, ...o });
const ids = (l) => l.map((c) => c.id);

test("raggruppa: ogni persona sta in UN gruppo secondo il suo stato; le candidature spontanee sono solo quelle in attesa", () => {
  const cs = [cand("A", "in_attesa"), cand("A", "accettata"), cand("A", "rifiutata"), cand("A", "ritirata"), cand("A", "in_attesa")];
  const [g] = raggruppa({ case_: [casa("A")], candidature: cs }); assert.equal(g.spontanei.length, 2); assert.deepEqual([g.match.length, g.scartati.length, g.ritirati.length], [1, 1, 1]); assert.equal(g.casa.id, "A");
  assert.deepEqual([...ids(g.spontanei), ...ids(g.match), ...ids(g.scartati), ...ids(g.ritirati)].sort(), ids(cs).sort(), "tutte, una volta sola");
});

test("raggruppa: lo stato appena cambiato dal proprietario sposta la persona subito (Fai match → Match; Annulla match → di nuovo tra le spontanee)", () => {
  const c1 = cand("A", "in_attesa"), c2 = cand("A", "accettata"); const aggiornate = { [c1.id]: "accettata", [c2.id]: "in_attesa" };
  const [g] = raggruppa({ case_: [casa("A")], candidature: [c1, c2], stato: (c) => aggiornate[c.id] ?? c.status }); assert.deepEqual(ids(g.spontanei), [c2.id]); assert.deepEqual(ids(g.match), [c1.id]);
});

test("raggruppa: una casa pubblicata senza candidati compare lo stesso (chi ha una casa sola la vede subito); una casa che gli inquilini non vedono e senza nessuno non compare", () => {
  const g = raggruppa({ case_: [casa("A"), casa("B", { pubblicata: false }), casa("C", { verificata: false })] }); assert.deepEqual(g.map((x) => x.casa.id), ["A"]); assert.deepEqual([g[0].spontanei, g[0].match, g[0].scartati, g[0].ritirati], [[], [], [], []]); assert.equal(g[0].possibili, null);
  const h = raggruppa({ case_: [casa("B", { pubblicata: false })], candidature: [cand("B", "in_attesa")] }); assert.deepEqual(h.map((x) => x.casa.id), ["B"], "con candidature compare anche se non è pubblicata");
});

test("raggruppa: una casa che non si conosce (cancellata, o non letta) si ricostruisce dalla candidatura; senza case né candidature c'è un elenco vuoto", () => {
  const [g] = raggruppa({ candidature: [cand("X", "in_attesa")] }); assert.equal(g.casa.titolo, "Casa X"); assert.equal(g.casa.foto, null); assert.deepEqual(raggruppa({}), []);
  const [h] = raggruppa({ candidature: [{ ...cand("Y", "in_attesa"), listings: null }] }); assert.equal(h.casa.titolo, "Annuncio");
});

test("raggruppa: i possibili match della casa stanno con la casa; le case sono in ordine (più candidature da valutare, poi più possibili match, poi titolo)", () => {
  const g = raggruppa({ case_: [casa("A"), casa("B"), casa("C")], candidature: [cand("B", "in_attesa"), cand("B", "in_attesa"), cand("A", "in_attesa")], possibili: [poss("A", [sch("p1")]), poss("C", [sch("p2"), sch("p3")])] });
  assert.deepEqual(g.map((x) => x.casa.id), ["B", "A", "C"]); assert.equal(g[1].possibili.id, "A"); assert.equal(g[0].possibili, null);
  const h = raggruppa({ case_: [casa("Z"), casa("A"), casa("M")], possibili: [poss("M", [sch("p")])] }); assert.deepEqual(h.map((x) => x.casa.id), ["M", "A", "Z"], "a parità, più possibili match prima, poi il titolo");
});

test("raggruppa: tra le spontanee prima chi rispetta i criteri e ha il match più alto; senza valutazioni l'ordine è dal più recente", () => {
  const v = (pct, bloccato = false, aff = 50) => ({ match: { punteggio: pct, etichetta: "x", bloccato, mancanti: [], criteri: [], incompleto: false }, affidabilita: aff, recensioni: null, raccomandato: false, congelata: false });
  const a = cand("A", "in_attesa", { valutazione: v(40) }), b = cand("A", "in_attesa", { valutazione: v(90) }), c = cand("A", "in_attesa", { valutazione: v(95, true) });
  assert.deepEqual(ids(raggruppa({ case_: [casa("A")], candidature: [a, b, c] })[0].spontanei), [b.id, a.id, c.id], "chi è bloccato da un criterio obbligatorio va in fondo, anche con il 95%");
  const x = cand("A", "in_attesa", { created_at: "2026-10-01T00:00:00Z", valutazione: undefined }), y = cand("A", "in_attesa", { created_at: "2026-10-09T00:00:00Z", valutazione: undefined }); assert.deepEqual(ids(raggruppa({ case_: [casa("A")], candidature: [x, y] })[0].spontanei), [y.id, x.id]);
});

test("conteggi del gruppo: da valutare, possibili match (persone da contattare + richieste in attesa), valutati (match + scartati + ritirati)", () => {
  const g = raggruppa({ case_: [casa("A")], candidature: [cand("A", "in_attesa"), cand("A", "accettata"), cand("A", "accettata"), cand("A", "rifiutata"), cand("A", "ritirata")], possibili: [poss("A", [sch("p1"), sch("p2")], [{ id: "r1", stato: "inviata", nome: "Dario R.", candidaturaId: null, creataIl: "" }, { id: "r2", stato: "rifiutata", nome: null, candidaturaId: null, creataIl: "" }])] })[0];
  assert.deepEqual(db.conteggiGruppo(g), { daValutare: 1, possibili: 3, match: 2, scartati: 1, valutati: 4 }); assert.deepEqual(db.conteggiGruppo(raggruppa({ case_: [casa("A")] })[0]), { daValutare: 0, possibili: 0, match: 0, scartati: 0, valutati: 0 });
});

test("raggruppa: su 300 insiemi casuali ogni candidatura compare una volta sola, nessuna è persa, gli input non si toccano", () => {
  let seme = 11; const rnd = () => (seme = (seme * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const scegli = (l) => l[Math.floor(rnd() * l.length)];
  for (let i = 0; i < 300; i++) {
    const cs = Array.from({ length: Math.floor(rnd() * 9) }, () => cand(scegli(["A", "B", "C", "D"]), scegli(["in_attesa", "accettata", "rifiutata", "ritirata"]))); const cases = [casa("A"), casa("B", { pubblicata: false }), casa("C")]; const copia = JSON.stringify([cs, cases]);
    const g = raggruppa({ case_: cases, candidature: cs }); const tutte = g.flatMap((x) => [...x.spontanei, ...x.match, ...x.scartati, ...x.ritirati]); assert.deepEqual(ids(tutte).sort(), ids(cs).sort()); assert.equal(JSON.stringify([cs, cases]), copia);
    for (const x of g) for (const c of [...x.spontanei, ...x.match, ...x.scartati, ...x.ritirati]) assert.equal(c.listing_id, x.casa.id, "una persona nella casa sbagliata");
  }
});

// ============================================================ la scheda
test("scheda di un candidato: nome breve, lavoro, affidabilità e match (percentuale, bloccato o nessun criterio), badge, recensioni, reddito verificato, estratto", () => {
  const c = cand("A", "in_attesa", { valutazione: { match: { punteggio: 82, etichetta: "Ottima", bloccato: false, mancanti: [], criteri: [], incompleto: true }, affidabilita: 85, recensioni: { numero: 3, media: 4.3 }, raccomandato: true, congelata: false }, tenant_profiles: { professione: " Insegnante ", reddito_mensile: 2000, reddito_nucleo: null, verificato: true, presentazione: "x ".repeat(200), avatar_url: "a.jpg" } });
  const d = db.datiSchedaCandidato(c); assert.ok(d.presentazione.endsWith("…") && d.presentazione.length <= 161, "estratto tagliato con i puntini"); assert.deepEqual({ ...d, presentazione: "estratto" }, { nome: "Anna V.", professione: "Insegnante", avatarUrl: "a.jpg", affidabilita: 85, match: { tipo: "pct", valore: 82 }, raccomandato: true, recensioni: { numero: 3, media: 4.3 }, redditoVerificato: true, presentazione: "estratto", incompleto: true });
  const b = db.datiSchedaCandidato(cand("A", "in_attesa", { valutazione: { match: { punteggio: 95, etichetta: "x", bloccato: true, mancanti: ["Reddito verificato"], criteri: [], incompleto: false }, affidabilita: 20, recensioni: null, raccomandato: false, congelata: false } })); assert.deepEqual(b.match, { tipo: "bloccato", mancanti: ["Reddito verificato"] }, "bloccato conta più della percentuale");
  assert.deepEqual(db.datiSchedaCandidato(cand("A", "in_attesa", { valutazione: { match: { punteggio: null, etichetta: null, bloccato: false, mancanti: [], criteri: [], incompleto: false }, affidabilita: 0, recensioni: null, raccomandato: false, congelata: false } })).match, { tipo: "nessuno" });
});

test("scheda di un candidato scartato (la vista dà solo il nome) o senza valutazione: niente si rompe, i dati che mancano restano vuoti", () => {
  const d = db.datiSchedaCandidato(cand("A", "rifiutata", { tenant_profiles: { professione: null, reddito_mensile: null, reddito_nucleo: null, verificato: false, presentazione: null, avatar_url: null }, valutazione: undefined })); assert.deepEqual([d.professione, d.avatarUrl, d.affidabilita, d.presentazione, d.redditoVerificato, d.raccomandato, d.recensioni], [null, null, null, null, false, false, null]); assert.deepEqual(d.match, { tipo: "nessuno" });
  const e = db.datiSchedaCandidato(cand("A", "in_attesa", { tenant_profiles: null, nome: null, cognome: null, valutazione: undefined })); assert.equal(e.nome, "Un inquilino"); assert.equal(e.redditoVerificato, false);
});

test("scheda di un possibile match: stessi campi; senza criteri del proprietario il match è «nessuno»; il resto passa invariato", () => {
  const d = db.datiSchedaPossibile({ ...sch("p"), compatibilita: 64, raccomandato: true }); assert.deepEqual([d.nome, d.professione, d.affidabilita, d.match, d.raccomandato, d.redditoVerificato, d.incompleto], ["Dario R.", "Cuoco", 80, { tipo: "pct", valore: 64 }, true, true, false]); assert.deepEqual(db.datiSchedaPossibile({ ...sch("p"), compatibilita: null }).match, { tipo: "nessuno" });
  assert.deepEqual(Object.keys(d).sort(), Object.keys(db.datiSchedaCandidato(cand("A", "in_attesa"))).sort(), "le due schede hanno gli stessi campi");
});

test("colore della percentuale: da 70 verde, da 50 oro, sotto rosso (estremi esatti)", () => {
  assert.deepEqual([100, 70, 69, 50, 49, 0].map(db.classeMatch), ["is-match", "is-match", "is-wait", "is-wait", "is-off", "is-off"]);
});

// ============================================================ la pagina
const cl = senzaCommenti(leggi("src", "app", "(app)", "database", "DatabaseClient.tsx"));

test("PAGINA: ogni casa ha tre sezioni nell'ordine candidature spontanee, possibili match, già valutati (match e scartati); la ricerca viene DOPO le case", () => {
  const i = (x) => { const k = cl.indexOf(x); assert.ok(k > 0, `manca «${x}»`); return k; };
  assert.ok(i('titolo="Candidature spontanee"') < i('titolo="Possibili match"') && i('titolo="Possibili match"') < i('titolo="Già valutati"')); assert.ok(i('<h3 className="sotto-titolo">Match</h3>') < i('<h3 className="sotto-titolo">Scartati</h3>'));
  assert.ok(i("{gruppi.map") < i('aria-label="Cerca tra i candidati"') && i('aria-label="Cerca tra i candidati"') < i("<RicercaCandidati"), "la ricerca sta in fondo"); assert.ok(i('<h2 className="ricerca-fondo-titolo">Cerca tra i candidati</h2>') > i("{gruppi.map"));
  assert.match(cl, /titolo="Già valutati" conteggio=\{n\.valutati\} aperta=\{n\.daValutare === 0 && n\.possibili === 0\}/, "«Già valutati» parte chiusa se c'è altro da fare"); assert.match(cl, /\{cercando && visibili\.length > 0 && \(/, "i risultati si mostrano solo cercando");
});

test("PAGINA: i pulsanti di ogni scheda vengono dalla tabella delle azioni (Fai match, Apri chat, Scarta, Annulla match, Annulla scarto) e ciascuno fa la cosa giusta", () => {
  const a = cl.slice(cl.indexOf("function azioni("), cl.indexOf("function scheda("));
  assert.match(a, /const a = azioniPerStato\(stato\(c\)\);/); for (const [flag, testo] of [["faiMatch", "Fai match"], ["scarta", "Scarta"], ["annullaMatch", "Annulla match"], ["annullaScarto", "Annulla scarto"]]) assert.match(a, new RegExp(`\\{a\\.${flag} && \\([\\s\\S]*?${testo}\\s+</button>`), `${flag} → «${testo}»`);
  assert.match(a, /\{a\.apriChat && \(\s+<Link href=\{`\/chat\/\$\{c\.id\}`\} className="opp-cta persona-primario block text-center">\s+Apri chat/);
  assert.match(a, /apriDialogo\("match", c\)/); assert.match(a, /apriDialogo\("scarta", c\)/); assert.match(a, /apriDialogo\("annulla_match", c\)/); assert.match(a, /onClick=\{\(\) => annullaScarto\(c\)\}/, "annullare uno scarto è un tocco solo (non c'è niente da proteggere)");
});

test("PAGINA: fai match, scarta e annulla match passano da una conferma; il server si chiama solo da «conferma» e «annullaScarto»", () => {
  assert.equal([...cl.matchAll(/valutaCandidatura\(/g)].length, 1, "valutaCandidatura in un solo punto"); assert.equal([...cl.matchAll(/riapriCandidatura\(/g)].length, 2, "riapriCandidatura in due punti: conferma (annulla match) e annullaScarto");
  const conf = cl.slice(cl.indexOf("function conferma()"), cl.indexOf("function annullaScarto(")); assert.ok(conf.includes("valutaCandidatura(") && conf.includes("riapriCandidatura("), "dentro «conferma»"); const sc = cl.slice(cl.indexOf("function annullaScarto("), cl.indexOf("// ---- i gruppi"));
  assert.ok(sc.includes("riapriCandidatura("), "annullaScarto chiama il server"); assert.match(cl, /dialogo\.tipo === "match" \? "Sì, fai match" : dialogo\.tipo === "scarta" \? "Conferma lo scarto" : "Sì, annulla il match"/); assert.match(cl, /No, torna indietro/);
  assert.match(cl, /disabled=\{pending \|\| \(dialogo\.tipo === "scarta" && motivo === null\)\}/, "scartare richiede il motivo");
});

test("PAGINA: le parole delle conferme e degli avvisi dicono che si può annullare, e cosa succede annullando un match", () => {
  const t = cl.replace(/&apos;/g, "'").replace(/\s+/g, " "); for (const x of ["Si apre la chat e la persona riceve una notifica. Se cambi idea, potrai annullare il match.", "La persona leggerà il motivo che scegli. Se cambi idea, potrai annullare lo scarto.", "La chat si chiude e la persona riceve un avviso: la candidatura torna tra quelle da valutare. I messaggi non si perdono.", "Se c'è già un contratto o una visita in programma, il match non si può annullare.", "Match fatto con ${nome}: ora potete scrivervi.", "Match annullato: ${nome} è di nuovo tra le candidature da valutare.", "Hai scartato ${nome}: se cambi idea, puoi annullare lo scarto.", "Scarto annullato: ${datiSchedaCandidato(c).nome} è di nuovo tra le candidature da valutare.", "Apri la chat ›"]) assert.ok(t.includes(x), `manca «${x}»`);
  for (const vecchia of ["La decisione non si può annullare", "Accettare e rifiutare non si annullano", "La decisione\n                    non si può annullare"]) assert.ok(!t.includes(vecchia), `c'è ancora «${vecchia}»`);
  assert.match(cl, /dopo\(c, "accettata", `Match fatto con \$\{nome\}: ora potete scrivervi\.`, `\/chat\/\$\{c\.id\}`\)/, "dopo il match c'è il link alla chat");
});

test("PAGINA: dopo ogni azione lo stato si aggiorna subito (match → accettata, scarto → rifiutata, annullamento → in attesa) e l'errore del database si legge in italiano e la conferma resta aperta", () => {
  assert.match(cl, /dopo\(c, "in_attesa", `Match annullato/); assert.match(cl, /dopo\(c, "accettata", /); assert.match(cl, /dopo\(c, "rifiutata", /); assert.match(cl, /if \(!r\.ok\) return setErrore\(r\.error\);/); assert.match(cl, /if \(!r\.ok\) return setAvviso\(\{ testo: r\.error \}\);/, "se l'annullamento dello scarto fallisce lo si dice");
  assert.ok(cl.indexOf("chiudiDialogo();\n    });") > cl.indexOf("setErrore(r.error)"), "la conferma si chiude solo se è andata bene");
});

test("scheda della persona: in alto affidabilità e match, poi foto e informazioni, poi i pulsanti; la scheda completa si apre da un pulsante", () => {
  const s = senzaCommenti(leggi("src", "components", "SchedaPersona.tsx")); const i = (x) => { const k = s.indexOf(x); assert.ok(k > 0, x); return k; };
  assert.ok(i('className="persona-cifre"') < i('className="persona-testa"') && i('className="persona-testa"') < i('className="persona-etichette"') && i('className="persona-etichette"') < i('className="persona-presentazione"') && i('className="persona-presentazione"') < i('className="persona-azioni"') && i('className="persona-azioni"') < i("Vedi la scheda completa ›"));
  for (const x of ["Affidabilità", "Match", "Manca un requisito", "Match (nessun criterio)", "Non soddisfa:"]) assert.ok(s.includes(x), `manca «${x}»`); assert.match(s, /\{onApri && \(\s+<button type="button" className="persona-dettagli" onClick=\{onApri\}>/);
  for (const vietato of ["reddito_mensile", "reddito_nucleo", "email", "telefono", "protestato"]) assert.ok(!s.includes(vietato), `la scheda usa «${vietato}»`);
});

test("sezione apribile: bottone con titolo e numero, aria-expanded, il contenuto resta nella pagina da chiuso (nascosto, non smontato)", () => {
  const s = senzaCommenti(leggi("src", "components", "SezioneApribile.tsx")); assert.match(s, /aria-expanded=\{stato\}/); assert.match(s, /aria-controls=\{corpo\}/); assert.match(s, /<div id=\{corpo\} className="sezione-corpo" hidden=\{!stato\}>/); assert.ok(!/stato &&\s*\(/.test(s), "il contenuto non deve smontarsi"); assert.match(s, /\{conteggio === 0 && vuoto \? <p className="sezione-vuota">\{vuoto\}<\/p> : null\}/);
});

// ============================================================ l'azione e la migrazione
test("azione «annulla»: controlla l'identificativo PRIMA del database, chiama la funzione giusta, aggiorna le pagine e traduce gli errori", () => {
  const a = leggi("src", "app", "(app)", "database", "actions.ts"); const f = a.slice(a.indexOf("export async function riapriCandidatura"));
  assert.match(f, /if \(!eUuid\(candidaturaId\)\) return/); assert.ok(f.indexOf("eUuid(") < f.indexOf("createClient()")); assert.match(f, /supabase\.rpc\("riapri_candidatura", \{ p_candidatura: candidaturaId \}\)/); assert.match(f, /revalidatePath\("\/database"\);\s+revalidatePath\("\/"\);\s+revalidatePath\("\/messaggi"\);/); assert.match(f, /messaggioErroreRiapertura\(error\.message\)/);
  assert.ok(!/from\("candidature"\)\s*\.(update|upsert|delete)/.test(a), "nessuna scrittura diretta sulle candidature");
});

test("migrazione 0034: il trigger lascia passare SOLO accettata/rifiutata → in attesa col segnale della funzione; la funzione è del proprietario, controlla contratti e visite, cancella la valutazione e avvisa l'inquilino; nessuna policy di modifica", () => {
  const m = senzaCommenti(migrazione);
  assert.match(m, /if old\.status in \('accettata', 'rifiutata'\) and new\.status = 'in_attesa'\s+and current_setting\('matchami\.riapertura', true\) = 'on' then\s+return new;/); assert.match(m, /raise exception 'DECISIONE_DEFINITIVA/);
  assert.match(m, /create or replace function public\.riapri_candidatura\(p_candidatura uuid\)\s+returns void\s+language plpgsql\s+security definer\s+set search_path = public/); assert.match(m, /if l\.owner_id is distinct from auth\.uid\(\) then/); assert.match(m, /c\.status::text not in \('accettata', 'rifiutata'\)/);
  assert.match(m, /exists \(select 1 from contratti where candidatura_id = c\.id\)/); assert.match(m, /exists \(select 1 from visite where candidatura_id = c\.id and stato in \('proposta', 'confermata'\) and data_ora >= now\(\)\)/); assert.match(m, /perform set_config\('matchami\.riapertura', 'on', true\);[\s\S]*?perform set_config\('matchami\.riapertura', 'off', true\);/);
  assert.match(m, /delete from valutazioni_candidati where candidatura_id = c\.id;/); assert.match(m, /crea_notifica\(c\.tenant_id, 'candidatura_riaperta'/); assert.match(m, /revoke all on function public\.riapri_candidatura\(uuid\) from public, anon;\s+grant execute on function public\.riapri_candidatura\(uuid\) to authenticated;/);
  assert.ok(!/create policy/i.test(m), "la 0034 non deve aggiungere policy (nessuno modifica le candidature a mano)"); assert.ok(!/grant (update|all)[^;]*candidature/i.test(m));
});

test("il DB test esegue anche le prove dell'annullamento (44 controlli) e non se ne perde nessuno", () => {
  const sql = leggi("scripts", "db", "riapri.sql"); const controlli = [...sql.matchAll(/(select|perform) t\.(ok|fallisce)\(/g)].length; assert.ok(controlli >= 44, `controlli: ${controlli}`); assert.match(sql, /select t\.ok\(\(select count\(\*\) from t\.esiti\) = 43,/);
  for (const tema of ["A04 un altro proprietario non può annullare", "A11 con un contratto il match non si annulla", "A13 con una visita CONFERMATA", "A20 ma la chat è chiusa", "A24 dopo lo scarto il proprietario non vede più i dati", "A28 e la nuova valutazione è quella NUOVA", "A30 il proprietario non può riportare una candidatura", "A35 col segnale alzato", "A43 finita una riapertura il segnale è spento"]) assert.ok(sql.replaceAll("''", "'").includes(tema), `manca il controllo «${tema}»`);
});

test("la ricerca in fondo ha caratteri leggibili (pulsanti da 15 px, campo da 17 px) e bersagli larghi", () => {
  const css = leggi("src", "app", "globals.css"); const m = css.slice(css.indexOf("/* la ricerca in fondo"));
  assert.match(m, /\.ricerca-fondo \.chip \{\s+min-height: 44px;\s+padding: 8px 16px;\s+font-size: 15px;/); assert.match(m, /\.ricerca-fondo \.ricerca-input,\s+\.ricerca-fondo \.ricerca-select \{\s+min-height: 52px;\s+font-size: 17px;/);
  const misure = [...m.matchAll(/font-size:\s*(\d+)px/g)].map((x) => Number(x[1])); assert.ok(Math.min(...misure) >= 15, `caratteri: ${Math.min(...misure)} px`);
});

test("i messaggi con il nome abbreviato («Anna V.») non hanno mai due punti di fila: dopo il nome non c'è un punto", () => {
  const testo = cl.replace(/&apos;/g, "'"); for (const m of testo.matchAll(/`([^`]*\$\{nome\}[^`]*)`/g)) assert.ok(!/\$\{nome\}\./.test(m[1]), `un punto subito dopo il nome: «${m[1]}»`);
  for (const m of testo.matchAll(/\$\{datiSchedaCandidato\(c\)\.nome\}[.]/g)) assert.fail("un punto subito dopo il nome in " + m[0]);
});
