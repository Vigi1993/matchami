/**
 * Test della VERIFICA DEI PROTESTI da parte dello staff (migrazione 0038 + app).
 *  - l'inquilino risponde alla domanda sui protesti, carica il certificato dei protesti e il documento d'identità, e chiede la verifica;
 *  - lo staff decide: «nessun protesto», «ci sono protesti» o «respingi» (con una nota); il risultato dello staff PREVALE su ciò che era stato dichiarato;
 *  - una volta verificato, la risposta non si cambia più da soli; il proprietario vede solo «verificato» (e con quale risultato), mai i documenti.
 * Le regole vere le prova test-db-richieste.mjs su un PostgreSQL vero. Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const pr = caricaTs(path.join(radice, "src", "lib", "protesti.ts"));
const af = caricaTs(path.join(radice, "src", "lib", "affidabilita.ts"));
const vf = caricaTs(path.join(radice, "src", "lib", "verifica.ts"));
const nt = caricaTs(path.join(radice, "src", "lib", "notifiche.ts"));
const dbp = caricaTs(path.join(radice, "src", "lib", "database-proprietario.ts"));
const inf = caricaTs(path.join(radice, "src", "content", "informativa.ts"));
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const sql = leggi("supabase", "migrations", "0038_verifica_protesti.sql"); const sqlPulito = sql.replace(/--[^\n]*/g, "");

// ============================================================ la logica pura
test("cosa dire alla persona: ogni stato ha il suo titolo e il suo tono; da verificato dice il RISULTATO dello staff (nessun protesto / risultano protesti)", () => {
  const d = pr.descriviStatoProtesti;
  assert.deepEqual([d("non_avviata", null, false).titolo, d("non_avviata", null, false).tono], ["Non ancora verificato", "neutro"]); assert.match(d("non_avviata", null, null).testo, /Il risultato dello staff vale più di ciò che hai dichiarato\./);
  assert.deepEqual([d("in_verifica", null, false).titolo, d("in_verifica", null, false).tono], ["In verifica", "attesa"]);
  assert.deepEqual([d("verificato", null, false).titolo, d("verificato", null, false).tono], ["Protesti verificati: nessun protesto", "ok"]); assert.match(d("verificato", null, false).testo, /non risultano protesti/);
  assert.deepEqual([d("verificato", null, true).titolo, d("verificato", null, true).tono], ["Protesti verificati: risultano dei protesti", "no"]); assert.match(d("verificato", null, true).testo, /Se qualcosa non è corretto, scrivici\./);
  assert.deepEqual([d("non_avviata", "  Il certificato è illeggibile.  ", false).titolo, d("non_avviata", "Illeggibile.", false).tono], ["Verifica non riuscita", "no"]); assert.equal(d("non_avviata", "Il certificato è illeggibile.", false).testo, "Il certificato è illeggibile. Correggi e invia di nuovo."); assert.equal(d("non_avviata", "   ", false).titolo, "Non ancora verificato", "una nota vuota non conta");
});

test("cosa manca per chiedere la verifica: la risposta, l'identità, il certificato; con tutto si può inviare, e solo se non è già partita", () => {
  const doc = (...tipi) => tipi.map((tipo) => ({ tipo })); const m = pr.cosaMancaProtesti;
  assert.deepEqual(m({ documenti: doc("identita", "protesti"), protestato: false }), []); assert.deepEqual(m({ documenti: doc("identita", "protesti"), protestato: true }), [], "anche rispondendo «sì» si può far verificare");
  assert.equal(m({ documenti: doc("identita", "protesti"), protestato: null }).length, 1); assert.match(m({ documenti: doc("identita", "protesti"), protestato: null })[0], /Rispondi alla domanda sui protesti/);
  assert.deepEqual(m({ documenti: doc("protesti"), protestato: false }), ["Carica un documento d'identità"]); assert.deepEqual(m({ documenti: doc("identita"), protestato: false }), ["Carica il certificato dei protesti"]);
  assert.equal(m({ documenti: doc("reddito", "identita"), protestato: false }).length, 1, "la prova del reddito non è il certificato dei protesti"); assert.equal(m({ documenti: [], protestato: null }).length, 3);
  const ok = { documenti: doc("identita", "protesti"), protestato: false }; assert.equal(pr.puoInviareProtesti({ stato: "non_avviata", ...ok }), true);
  for (const stato of ["in_verifica", "verificato"]) assert.equal(pr.puoInviareProtesti({ stato, ...ok }), false, stato); assert.equal(pr.puoInviareProtesti({ stato: "non_avviata", documenti: doc("identita"), protestato: false }), false);
});

test("regole sui documenti e sulla risposta: i documenti si tolgono solo prima dell'invio; la risposta è bloccata solo dopo la verifica; la nota sotto la domanda cambia con lo stato", () => {
  assert.deepEqual(["non_avviata", "in_verifica", "verificato"].map(pr.puoTogliereDocumentiProtesti), [true, false, false]); assert.deepEqual(["non_avviata", "in_verifica", "verificato"].map(pr.rispostaBloccata), [false, false, true]);
  assert.match(pr.notaDomandaProtesti("non_avviata"), /Lo verifica il nostro staff: carica il certificato dei protesti in «Verifica dei protesti»/); assert.match(pr.notaDomandaProtesti("in_verifica"), /Lo staff sta controllando/); assert.match(pr.notaDomandaProtesti("verificato"), /Verificato dallo staff: non si cambia da soli\./);
  assert.deepEqual([...pr.TIPI_DOCUMENTO_PROTESTI], ["identita", "protesti"]); assert.equal(pr.ETICHETTE_DOCUMENTO_PROTESTI.protesti, "Certificato dei protesti"); assert.match(pr.TESTI_VERIFICA_PROTESTI.introduzione, /lo verifica il nostro staff/i); assert.match(pr.TESTI_VERIFICA_PROTESTI.riservatezza, /Il proprietario non li vede mai: vede solo se i protesti sono verificati, sì o no\./);
});

test("per il proprietario: «verificato dallo staff» si dice solo se lo è davvero; il dichiarato resta «dichiarato»; senza risposta «non indicati»", () => {
  const e = pr.etichettaProtestiPerProprietario;
  assert.equal(e(false, true), "Nessun protesto (verificato dallo staff)"); assert.equal(e(true, true), "Protesti (verificati dallo staff)"); assert.equal(e(false, false), "Nessun protesto dichiarato"); assert.equal(e(true, false), "Protesti dichiarati"); assert.equal(e(null, true), "Protesti non indicati"); assert.equal(e(null, false), "Protesti non indicati");
});

// ============================================================ gli errori e il punteggio
test("errori: ogni codice che il database può restituire per la verifica dei protesti ha le sue parole in italiano, senza il codice", () => {
  const corpo = sqlPulito.slice(sqlPulito.indexOf("create or replace function public.proteggi_verifica_inquilino"));
  const codici = [...new Set([...corpo.matchAll(/raise exception '([A-Z_]+)/g)].map((m) => m[1]))].filter((c) => /PROTESTI|DOCUMENTI_PROTESTI|ESITO_NON_VALIDO|INQUILINO_INESISTENTE|NON_INQUILINO|NON_AUTENTICATO|NON_STAFF/.test(c));
  assert.ok(codici.length >= 9, "codici: " + codici.join());
  for (const c of codici) { const m = vf.messaggioErroreVerifica(`ERROR: ${c} (P0001)`); assert.ok(m.length > 15 && !m.includes(c), `${c}: «${m}»`); assert.ok(!/Riprova tra poco|Qualcosa non ha funzionato/.test(m) || c === "NON_STAFF", `${c} non ha parole sue`); }
  assert.match(vf.messaggioErroreVerifica("PROTESTI_VERIFICATI: i protesti li ha verificato lo staff"), /I protesti li ha verificati lo staff: per cambiarli scrivici\./); assert.match(vf.messaggioErroreVerifica("PROTESTI_GIA_VERIFICATI"), /già verificati/);
  assert.match(vf.messaggioErroreVerifica("DOCUMENTI_PROTESTI_MANCANTI"), /documento d'identità e il certificato dei protesti/); assert.match(vf.messaggioErroreVerifica("PROTESTI_NON_DICHIARATI"), /rispondi alla domanda sui protesti/);
});

test("punteggio: la verifica dei protesti NON cambia i punti (+30 / −30), cambia chi li ha controllati («verificato» o «dichiarato») e le parole", () => {
  const c = (o) => af.computeAffidabilita({ verificato: false, protestato: null, garante: null, fideiussione: null, ...o }); const voce = (r) => r.voci.find((v) => v.id === "protesti");
  for (const protestato of [false, true]) { const a = c({ protestato }), b = c({ protestato, protestiVerificati: true }); assert.equal(a.punteggio, b.punteggio, "i punti non cambiano"); assert.equal(voce(a).punti, voce(b).punti); assert.equal(voce(a).origine, "dichiarato"); assert.equal(voce(b).origine, "verificato"); }
  assert.deepEqual([voce(c({ protestato: false, protestiVerificati: true })).etichetta, voce(c({ protestato: true, protestiVerificati: true })).etichetta, voce(c({ protestato: true })).etichetta], ["Nessun protesto", "Protesti verificati", "Protesti dichiarati"]);
  assert.match(voce(c({ protestato: false, protestiVerificati: true })).nota, /Controllato dallo staff sul tuo certificato dei protesti\./); assert.match(voce(c({ protestato: true, protestiVerificati: true })).nota, /Lo staff ha controllato il tuo certificato: risultano dei protesti\. Tolgono 30 punti\./);
  assert.equal(voce(c({ protestato: null, protestiVerificati: true })).origine, "dichiarato", "senza risposta non c'è niente di verificato"); assert.equal(c({ protestato: false }).punteggio, 30); assert.equal(c({ protestato: true }).grezzo, -30);
});

test("le notifiche: «protesti verificati» dice il risultato (nessuno / risultano), «respinti» manda alla nota; i tipi esistono", () => {
  for (const t of ["protesti_verificati", "protesti_respinti"]) assert.ok(nt.TIPI_NOTIFICA.includes(t), t);
  assert.match(nt.descriviNotifica("protesti_verificati", { protestato: false }).testo, /non risultano protesti\. I proprietari ora vedono «Protesti verificati»/); assert.match(nt.descriviNotifica("protesti_verificati", { protestato: true }).testo, /risultano dei protesti/); assert.match(nt.descriviNotifica("protesti_verificati", null).testo, /non risultano protesti/, "senza dati si dice la cosa più prudente e non inventa");
  assert.equal(nt.descriviNotifica("protesti_respinti", {}).titolo, "Verifica dei protesti non riuscita"); assert.match(nt.descriviNotifica("protesti_respinti", {}).testo, /Leggi la nota/);
});

// ============================================================ l'inquilino
const pannello = senzaCommenti(leggi("src", "components", "VerificaProtestiPanel.tsx"));
test("pannello dell'inquilino: file nell'archivio di verifica con il nome «inquilino-protesti», poi registrato come «protesti»; la verifica si chiede con la funzione del database; lo stato non si scrive a mano", () => {
  assert.match(pannello, /tipo: tipo === "identita" \? "inquilino-identita" : "inquilino-protesti"/); assert.match(pannello, /supabase\.storage\.from\(BUCKET\)\.upload\(percorso, file, \{ contentType: file\.type, upsert: false \}\)/); assert.match(pannello, /from\("documenti_inquilino"\)\.insert\(\{\s+tenant_id: user\.id,\s+tipo,\s+percorso,\s+nome_file: file\.name\.slice\(0, 200\),\s+\}\)/);
  assert.ok(pannello.indexOf(".upload(percorso") < pannello.indexOf('.from("documenti_inquilino").insert'), "prima il file, poi la registrazione"); assert.match(pannello, /await supabase\.storage\.from\(BUCKET\)\.remove\(\[percorso\]\);/, "se la registrazione fallisce il file non resta nell'archivio");
  assert.match(pannello, /createClient\(\)\.rpc\("richiedi_verifica_protesti"\)/); assert.ok(!/from\("tenant_profiles"\)/.test(pannello) && !/\.update\(|\.upsert\(/.test(pannello), "il pannello non scrive il profilo (lo stato lo cambia solo il database)"); assert.ok(!/documenti-contratto/.test(pannello));
  assert.match(pannello, /const problema = validaFileDocumento\(file\);/); assert.match(pannello, /!tolti \|\| tolti\.length === 0/, "se il database non lascia togliere il file non si cancella la riga");
});

test("pannello dell'inquilino: i documenti si tolgono solo prima dell'invio; dopo la verifica non si carica altro; l'invio è spento finché manca qualcosa e compare solo se non è partita", () => {
  assert.match(pannello, /const siTolgono = puoTogliereDocumentiProtesti\(stato\);/); assert.match(pannello, /\{siTolgono && \(\s+<button/); assert.match(pannello, /\{stato !== "verificato" && \(\s+<SelettoreFile/);
  assert.match(pannello, /\{stato === "non_avviata" && \(\s+<>\s+\{manca\.length > 0 && <p className="field-note">Per inviare manca: \{manca\.join\("; "\)\}\.<\/p>\}/); assert.match(pannello, /disabled=\{!inviabile \|\| inCorso !== null\}/);
  assert.match(pannello, /\{TIPI_DOCUMENTO_PROTESTI\.map\(\(tipo\) => \{/); assert.match(pannello, /TESTI_VERIFICA_PROTESTI\.riservatezza/); assert.match(pannello, /className=\{`note-box \$\{descrizione\.tono === "no" \? "is-no" : ""\}`\}/);
});

test("scheda «I tuoi dati»: la sezione «Verifica dei protesti» sta dopo quella del reddito, con la sua ancora; Home e Profilo costruiscono il pannello con lo stato, la nota, il valore che vale oggi e i documenti", () => {
  const ds = senzaCommenti(leggi("src", "components", "DatiSheet.tsx")); assert.match(ds, /\{verificaPanel\}\s+<div id="dati-verifica-protesti" className="ancora-dati" \/>[\s\S]*?\{TESTI_VERIFICA_PROTESTI\.titolo\}[\s\S]*?\{TESTI_VERIFICA_PROTESTI\.introduzione\}[\s\S]*?\{protestiPanel\}/);
  for (const [f, t] of [[["src", "app", "(app)", "page.tsx"], "tenantProfile"], [["src", "app", "(app)", "profilo", "page.tsx"], "\\(tenant as TenantProfile\\)"]]) { const p = senzaCommenti(leggi(...f)); assert.match(p, new RegExp(`protestiPanel=\\{\\s+<VerificaProtestiPanel\\s+stato=\\{${t}\\.protesti_verifica_stato \\?\\? "non_avviata"\\}\\s+nota=\\{${t}\\.protesti_verifica_esito_note \\?\\? null\\}\\s+protestato=\\{${t}\\.protestato\\}\\s+documenti=\\{\\(documentiRows \\?\\? \\[\\]\\) as DocumentoInquilino\\[\\]\\}`)); }
  assert.match(senzaCommenti(leggi("src", "app", "(app)", "page.tsx")), /protestiVerificati: tenantProfile\.protesti_verifica_stato === "verificato",/); assert.match(senzaCommenti(leggi("src", "app", "(app)", "profilo", "ProfiloClient.tsx")), /protestiVerificati: tenant\.protesti_verifica_stato === "verificato",/);
});

test("la domanda sui protesti: dopo la verifica non ci sono più i pulsanti Sì/No ma «verificato dallo staff»; il valore resta nel modulo e il salvataggio traduce l'errore del database", () => {
  const f = senzaCommenti(leggi("src", "components", "DatiForm.tsx")); assert.match(f, /\{rispostaBloccata\(statoProtesti\) \? \(/); assert.match(f, /<b>\{protestato \? "Sì, risultano protesti" : "No, nessun protesto"\}<\/b> · verificato dallo staff/); assert.match(f, /\{notaDomandaProtesti\(statoProtesti\)\}/); assert.match(f, /<input type="hidden" name="protestato" value=\{String\(protestato\)\} \/>/); assert.ok(!/nessuno lo controlla/i.test(f.slice(f.indexOf("dati-protesti"), f.indexOf("fideiussione"))), "i protesti non sono più «nessuno li controlla»");
  const a = senzaCommenti(leggi("src", "app", "(app)", "profilo", "actions.ts")); const dati = a.slice(a.indexOf("export async function updateDatiPersonali"), a.indexOf("export async function updateRicerca")); assert.match(dati, /if \(error\) return \{ error: messaggioErroreVerifica\(error\.message\) \};\s+revalidatePath\("\/profilo"\);\s+revalidatePath\("\/"\);/, "il salvataggio dei dati traduce l'errore del database (proprio quella funzione)"); assert.match(senzaCommenti(leggi("src", "components", "ComeSiCalcola.tsx")), /lo può verificare il nostro staff sul certificato dei protesti: il risultato dello staff vale più di ciò che hai dichiarato e non si cambia più da soli/);
});

// ============================================================ lo staff
test("staff: l'elenco mostra chi aspetta (funzione dedicata); la pagina legge solo ciò che serve (funzione dedicata), i documenti dei soli due tipi con indirizzi temporanei di 5 minuti; il modulo ha le tre scelte", () => {
  const l = senzaCommenti(leggi("src", "app", "staff", "page.tsx")); assert.match(l, /supabase\.rpc\("protesti_da_verificare"\)/); assert.match(l, /Protesti da verificare/); assert.match(l, /href=\{`\/staff\/protesti\/\$\{q\.tenant_id\}`\}/);
  const p = senzaCommenti(leggi("src", "app", "staff", "protesti", "[id]", "page.tsx")); assert.match(p, /if \(!èUuid\(id\)\) notFound\(\);/); assert.match(p, /supabase\.rpc\("dati_per_verifica_protesti", \{ p_tenant: id \}\)/); assert.ok(!/from\("tenant_profiles"\)/.test(p), "lo staff non legge il profilo intero");
  assert.match(p, /\.in\("tipo", \[\.\.\.TIPI_DOCUMENTO_PROTESTI\]\)/); assert.match(p, /createSignedUrl\(d\.percorso, 300\)/); assert.match(p, /const decidibile = dati\.protesti_verifica_stato === "in_verifica";/); assert.match(p, /\{decidibile \? \(\s+<EsitoProtestiForm id=\{id\} \/>/);
  const f = senzaCommenti(leggi("src", "app", "staff", "protesti", "[id]", "EsitoProtestiForm.tsx")); for (const v of ["nessun_protesto", "protestato", "respingi"]) assert.ok(f.includes(`name="esito" value="${v}"`), v); assert.match(f, /name="nota"/); assert.match(f, /useActionState<EsitoState, FormData>\(decidiProtesti, null\)/);
});

test("staff: l'azione controlla l'identificativo e la scelta PRIMA di chiamare il database, pretende la nota per respingere, usa la funzione giusta con i parametri giusti e traduce l'errore", () => {
  const a = senzaCommenti(leggi("src", "app", "staff", "actions.ts")); const f = a.slice(a.indexOf("export async function decidiProtesti")); assert.match(f, /const supabase = await richiediStaff\(\);/); assert.match(f, /if \(!èUuid\(id\)\) return \{ error: "Inquilino non valido\." \};/); assert.match(f, /if \(esito !== "nessun_protesto" && esito !== "protestato" && esito !== "respingi"\) return \{ error: "Scelta non valida\." \};/);
  assert.match(f, /if \(esito === "respingi" && nota\.length < 3\) \{\s+return \{ error: messaggioErroreVerifica\("PROTESTI_NOTA_OBBLIGATORIA"\) \};/); assert.match(f, /supabase\.rpc\("esito_verifica_protesti", \{\s+p_tenant: id,\s+p_esito: esito,\s+p_note: esito === "respingi" \? nota : null,\s+\}\)/);
  assert.match(f, /if \(error\) return \{ error: messaggioErroreVerifica\(error\.message\) \};/); assert.ok(f.indexOf("èUuid(id)") < f.indexOf("rpc("), "prima i controlli"); assert.ok(!/from\("tenant_profiles"\)/.test(f), "lo stato non si scrive a mano");
});

// ============================================================ il proprietario
test("proprietario: la vista dà «protesti verificati» (sì/no) e mai la nota o lo stato interno; la scheda mostra «Nessun protesto · verificato» o «Ha protesti · verificato» SOLO se lo staff ha verificato, altrimenti niente", () => {
  const c = senzaCommenti(leggi("src", "lib", "candidati.ts")); assert.match(c, /COLONNE_VISTA_CANDIDATI =\s+"[^"]*nucleo_compilato, protesti_verificati";/); assert.match(c, /protestiVerificati: v\?\.protesti_verificati === true,/); assert.match(c, /protesti_verificati: v\?\.protesti_verificati === true,\s+protestato: v\?\.protestato \?\? null,/); assert.ok(!/protesti_verifica_esito_note|protesti_verifica_stato/.test(c), "il proprietario non legge lo stato interno né la nota");
  const cand = (tp) => ({ nome: "Anna", cognome: "Verdi", tenant_profiles: tp, valutazione: undefined }); const d = (tp) => dbp.datiSchedaCandidato(cand(tp)).protestiVerificati;
  assert.equal(d({ protesti_verificati: true, protestato: false }), "nessuno"); assert.equal(d({ protesti_verificati: true, protestato: true }), "si"); assert.equal(d({ protesti_verificati: false, protestato: false }), null, "il dichiarato non si mostra come verificato"); assert.equal(d({ protesti_verificati: false, protestato: true }), null); assert.equal(d({ protesti_verificati: true, protestato: null }), null); assert.equal(d(null), null); assert.equal(d({}), null);
  const sp = senzaCommenti(leggi("src", "components", "database", "DettaglioPersona.tsx")); assert.match(sp, /\{s\.protestiVerificati === "nessuno" && <span className="persona-chip">Nessun protesto · verificato<\/span>\}\s+\{s\.protestiVerificati === "si" && <span className="persona-chip persona-chip-attenzione">Ha protesti · verificato<\/span>\}/);
  assert.match(sp, /esito=\{s\.protestiVerificati === "nessuno" \? "si" : s\.protestiVerificati === "si" \? "no" : "nd"\}/, "anche nell'elenco delle verifiche: solo se verificati, altrimenti «non ancora verificati» (mai il dichiarato come un fatto)"); assert.ok(sp.includes("Non ancora verificati dallo staff"));
});

test("proprietario: i possibili inquilini leggono lo stato dei protesti con la chiave riservata e lo trasformano in sì/no verificato; il criterio «Nessun protesto» non dice più solo «dichiarato»", () => {
  const s = senzaCommenti(leggi("src", "lib", "proprietario", "possibili-server.ts")); assert.match(s, /protestato, protesti_verifica_stato, animali, nucleo, presentazione, verificato, avatar_url/); assert.match(s, /protestiVerificati: det\.protesti_verifica_stato === "verificato",/);
  const p = senzaCommenti(leggi("src", "lib", "proprietario", "possibili-inquilini.ts")); assert.match(p, /protestiVerificati: d\.protestiVerificati === true && d\.protestato !== null \? \(d\.protestato \? "si" : "nessuno"\) : null,/); assert.match(p, /protestiVerificati: d\.protestiVerificati === true,/); assert.match(p, /garante: d\.garante, fideiussione: d\.fideiussione, protestiVerificati: d\.protestiVerificati === true \}\);/);
  const m = senzaCommenti(leggi("src", "lib", "match", "proprietario.ts")); assert.match(m, /nome: "Nessun protesto",\s+descrizione: "Il candidato non ha protesti: lo dichiara, e se lo staff ha controllato il certificato vale il risultato dello staff\.",\s+etichetta: \(\) => "Nessun protesto",/);
  assert.match(senzaCommenti(leggi("src", "lib", "match", "candidato.ts")), /protestiVerificati: profilo\.protestiVerificati === true,/);
});

// ============================================================ la migrazione e l'informativa
test("migrazione 0038: il proprietario non può leggere nessun documento; i protetti non si scrivono a mano; i protesti verificati non si cambiano da soli (riscrivere lo stesso valore sì); lo staff ha solo due funzioni; è rieseguibile", () => {
  assert.match(sqlPulito, /if old\.protesti_verifica_stato = 'verificato' and new\.protestato is distinct from old\.protestato then\s+raise exception 'PROTESTI_VERIFICATI:/); for (const col of ["protesti_verifica_stato", "protesti_verifica_esito_note", "protesti_verifica_inviata_at", "protesti_verificati_at"]) assert.match(sqlPulito, new RegExp(`or new\\.${col} is distinct from old\\.${col}`), `${col} non protetta`);
  assert.match(sqlPulito, /if not public\.is_staff\(\) then\s+raise exception 'NON_STAFF'/); assert.equal([...sqlPulito.matchAll(/raise exception 'NON_STAFF'/g)].length, 3, "esito, elenco e dati: tutte e tre solo per lo staff");
  assert.ok(!/create policy[^;]*documenti_inquilino[^;]*for select/i.test(sqlPulito), "la 0038 non apre la lettura dei documenti"); assert.ok(!/documenti_inquilino/.test(sqlPulito.slice(sqlPulito.indexOf("create or replace view public.candidati_del_proprietario"))), "la vista dei candidati non tocca i documenti");
  assert.match(sqlPulito, /case when c\.status <> 'rifiutata' then \(t\.protesti_verifica_stato = 'verificato'\) end as protesti_verificati/); assert.ok(!/protesti_verifica_esito_note/.test(sqlPulito.slice(sqlPulito.indexOf("create or replace view public.candidati_del_proprietario"))), "la nota non arriva al proprietario");
  assert.match(sqlPulito, /drop trigger if exists notifica_protesti_esito on tenant_profiles;/); assert.match(sqlPulito, /add column if not exists protesti_verifica_stato stato_verifica not null default 'non_avviata'/); assert.match(sql, /IL RISULTATO dello staff PREVALE|PREVALE su ciò che/);
  for (const f of ["richiedi_verifica_protesti()", "esito_verifica_protesti(uuid, text, text)", "protesti_da_verificare()", "dati_per_verifica_protesti(uuid)"]) { const e = f.replace(/[()]/g, "\\$&"); assert.match(sqlPulito, new RegExp(`revoke all on function public\\.${e} from public, anon;`)); assert.match(sqlPulito, new RegExp(`grant execute on function public\\.${e} to authenticated;`)); }
});

test("il DB test esegue anche le prove dei protesti (55 controlli) e non se ne perde nessuno", () => {
  const s = leggi("scripts", "db", "protesti.sql"); const n = [...s.matchAll(/select t\.(ok|fallisce)\(/g)].length; assert.ok(n >= 54, `controlli: ${n}`); assert.match(s, /select t\.ok\(\(select count\(\*\) from t\.esiti\) = 54,/);
  for (const tema of ["P02 l'inquilino non può mettersi «verificato» da solo", "P06 senza aver risposto alla domanda sui protesti", "P10b con il solo certificato manca il documento d'identità", "P15 mentre è in verifica il certificato non si toglie", "P17 e il FILE del certificato non si cancella", "P18 un inquilino non può dare l'esito", "P35 i protesti verificati non si cambiano da soli", "P41 cambiare il reddito azzera SOLO la verifica del reddito", "P42 il risultato dello staff PREVALE", "P45 con i protesti in verifica il documento d'identità non si cancella", "P47 e di Bruno", "P50b di un candidato SCARTATO"]) assert.ok(s.replaceAll("''", "'").includes(tema), `manca «${tema}»`);
});

test("informativa 22: dice del certificato dei protesti, che il risultato dello staff prevale, e cosa vede il proprietario; chi aveva accettato la 21 deve riaccettare", () => {
  const t = JSON.stringify(inf.INFORMATIVA); assert.match(t, /se vuoi, li verifica il nostro staff sul certificato dei protesti che carichi, e il risultato dello staff prevale su ciò che hai dichiarato/); assert.ok(!/non vengono verificati/.test(t), "i protesti non sono più «non verificati»");
  assert.match(t, /se chiedi di verificare i protesti, un documento d'identità e il certificato dei protesti intestato a te/); assert.match(t, /i protesti \(quelli che hai dichiarato o, se li ha verificati lo staff, il risultato dello staff, con l'indicazione che è verificato\)/); assert.match(t, /e se i protesti sono verificati dallo staff \(e con quale risultato\)/);
  assert.equal(inf.INFORMATIVA.versione, "2026-10-provvisoria-22"); assert.deepEqual([...inf.INFORMATIVA.equivalenti], [], "la 22 non ha equivalenti: tutti riaccettano");
});
