/**
 * Test della prova di proprietà nella SCHEDA DELL'IMMOBILE e della scheda dell'immobile nella lista.
 *  - il proprietario carica la visura o l'atto e chiede la verifica dalla scheda di ogni immobile (prima si poteva solo dalla Home di chi non ha ancora
 *    immobili verificati: con una casa già verificata non c'era più modo di verificarne un'altra, né di rifare una verifica respinta);
 *  - la scritta lunga nel riquadro a destra non schiaccia più il nome dell'immobile.
 * Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const vf = caricaTs(path.join(radice, "src", "lib", "verifica.ts"));
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const comp = senzaCommenti(leggi("src", "components", "VerificaImmobile.tsx"));
const client = leggi("src", "app", "(app)", "immobili", "ImmobiliClient.tsx");
const css = leggi("src", "app", "globals.css");

const casa = (o = {}) => ({ id: "a1", titolo: "Bilocale", zona: "Isola, Milano", verifica_stato: "non_avviata", verifica_esito_note: null, nProprieta: 0, classe_energetica: "C", luogo_id: "q1", bagni: 1, piano: 2, riscaldamento: "autonomo", tipo_contratto: "libero_4_4", disponibile_dal: "2026-12-01", ...o });

// ============================================================ la logica
test("dalla scheda di un immobile ai dati della verifica: tutti i campi, i vuoti diventano null, le prove di proprietà partono da zero", () => {
  const v = vf.immobileVerificaDa(casa({ nProprieta: 2, verifica_esito_note: "il nome non coincide" }));
  assert.deepEqual(v, { id: "a1", titolo: "Bilocale", zona: "Isola, Milano", stato: "non_avviata", note: "il nome non coincide", nProprieta: 2, documenti: [], dati: { classe_energetica: "C", luogo_id: "q1", bagni: 1, piano: 2, riscaldamento: "autonomo", tipo_contratto: "libero_4_4", disponibile_dal: "2026-12-01" } });
  const vuota = vf.immobileVerificaDa({ id: "a2", titolo: "X", zona: "Y", verifica_stato: "non_avviata", verifica_esito_note: null }); assert.equal(vuota.nProprieta, 0); assert.deepEqual(Object.values(vuota.dati), [null, null, null, null, null, null, null]);
  assert.equal(vf.immobileVerificaDa(casa({ verifica_esito_note: undefined })).note, null);
});

test("cosa manca per chiedere la verifica: l'identità, la prova di proprietà e i dati obbligatori dell'annuncio; con tutto si può inviare, e solo se la verifica non è già partita", () => {
  const completa = vf.immobileVerificaDa(casa({ nProprieta: 1 })); assert.deepEqual(vf.cosaManca(true, completa), []); assert.equal(vf.puoInviare(true, completa), true);
  assert.equal(vf.puoInviare(false, completa), false, "senza documento d'identità"); assert.match(vf.cosaManca(false, completa)[0], /documento d'identità/);
  assert.match(vf.cosaManca(true, vf.immobileVerificaDa(casa({ nProprieta: 0 })))[0], /prova di proprietà/);
  const senzaDati = vf.immobileVerificaDa(casa({ nProprieta: 1, classe_energetica: null, bagni: null })); assert.equal(vf.cosaManca(true, senzaDati).length, 2); assert.equal(vf.puoInviare(true, senzaDati), false);
  for (const stato of ["in_verifica", "verificato"]) assert.equal(vf.puoInviare(true, vf.immobileVerificaDa(casa({ nProprieta: 1, verifica_stato: stato }))), false, stato);
});

// ============================================================ il componente
test("il componente: il file va nell'archivio di verifica, nella cartella di chi lo carica; poi si registra; poi si ricarica la pagina; la verifica si chiede con la funzione del database", () => {
  assert.match(comp, /const percorso = percorsoDocumento\(\{ userId: user\.id, tipo, listingId, estensione, id: crypto\.randomUUID\(\) \}\);/);
  assert.match(comp, /supabase\.storage\.from\("documenti-verifica"\)\.upload\(percorso, file, \{ contentType: file\.type, upsert: false \}\)/);
  assert.match(comp, /supabase\.from\("documenti_verifica"\)\.insert\(\{\s+owner_id: user\.id,\s+listing_id: listingId,\s+tipo,\s+percorso,\s+nome_file: file\.name\.slice\(0, 200\),\s+\}\)/);
  assert.ok(comp.indexOf('.upload(percorso') < comp.indexOf('.from("documenti_verifica").insert'), "prima il file, poi la registrazione");
  assert.match(comp, /nome_file: file\.name\.slice\(0, 200\),\s+\}\);\s+if \(eRiga\) \{[^}]*\}\s+router\.refresh\(\);/, "dopo la registrazione la pagina si aggiorna"); assert.match(comp, /rpc\("richiedi_verifica_immobile", \{ p_listing: listingId \}\);\s+if \(error\) \{[^}]*\}\s+router\.refresh\(\);/, "dopo l'invio la pagina si aggiorna"); assert.equal([...comp.matchAll(/router\.refresh\(\);/g)].length, 2);
  assert.match(comp, /createClient\(\)\.rpc\("richiedi_verifica_immobile", \{ p_listing: listingId \}\)/); assert.ok(!/from\("listings"\)\s*\.(update|insert)/.test(comp), "la verifica non si imposta a mano");
  assert.match(comp, /const problema = validaFileDocumento\(file\);/); assert.match(comp, /Il file deve essere un PDF, una foto JPG o una foto PNG\./);
});

test("il componente: le azioni compaiono solo se la verifica non è partita; il documento d'identità solo se serve; l'invio è spento finché manca qualcosa", () => {
  assert.match(comp, /\{immobile\.stato === "non_avviata" && \(\s+<>/, "caricamento e invio solo se non avviata"); assert.equal([...comp.matchAll(/immobile\.stato === "non_avviata"/g)].length, 2, "il motivo del rifiuto e le azioni");
  assert.match(comp, /\{conIdentita && !haIdentita && \(/); assert.match(comp, /disabled=\{!puoInviare\(haIdentita, immobile\) \|\| inCorso !== null\}/); assert.match(comp, /\{manca\.length > 0 && <p className="field-note">Per inviare manca: \{manca\.join\(" e "\)\}\.<\/p>\}/);
  assert.match(comp, /Li vede solo il team di MatchAmI: mai gli inquilini\./, "dice a chi sono visibili i documenti"); assert.match(comp, /\{errore && \(\s+<p className="note-error" role="alert"/); assert.match(comp, /Motivo del rifiuto: \{immobile\.note\}/);
});

test("la Home di verifica riusa lo STESSO componente e lo stesso codice di caricamento: la registrazione dei documenti esiste in un posto solo", () => {
  const home = senzaCommenti(leggi("src", "app", "(app)", "VerificaHome.tsx")); assert.match(home, /import \{ VerificaImmobile, useVerificaDocumenti \} from "@\/components\/VerificaImmobile";/); assert.match(home, /<VerificaImmobile immobile=\{im\} haIdentita=\{haIdentita\} \/>/);
  assert.ok(!/documenti_verifica|storage|rpc\(/.test(home), "la Home non deve più avere una sua copia del caricamento");
  const dove = []; const visita = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) visita(f); else if (/\.(ts|tsx)$/.test(e.name) && /from\("documenti_verifica"\)\.insert/.test(fs.readFileSync(f, "utf8"))) dove.push(path.relative(radice, f).replaceAll("\\", "/")); } }; visita(path.join(radice, "src")); assert.deepEqual(dove, ["src/components/VerificaImmobile.tsx"]);
});

// ============================================================ la scheda dell'immobile
test("scheda dell'immobile: la prova di proprietà sta IN CIMA, con il documento d'identità se manca; la scheda si aggiorna dopo un caricamento (si tiene l'identificativo, non una copia)", () => {
  assert.match(client, /<>\s+\{\/\*[^*]*\*\/\}\s+<VerificaImmobile key=\{selezionato\.id\} immobile=\{immobileVerificaDa\(selezionato\)\} haIdentita=\{haIdentita\} conIdentita \/>\s+<IndirizzoImmobile key=\{selezionato\.id\}/);
  assert.match(client, /const \[selezionatoId, setSelezionatoId\] = useState<string \| null>\(null\);\s+const selezionato = immobili\.find\(\(i\) => i\.id === selezionatoId\) \?\? null;/); assert.ok(!/setSelezionato\(/.test(client), "resta una selezione per copia");
  assert.match(client, /haIdentita = false,/); assert.match(client, /import \{ descriviStato, immobileVerificaDa \} from "@\/lib\/verifica";/);
});

test("scheda dell'immobile: non rimanda più alla Home (con una casa già verificata la Home non mostra la verifica)", () => {
  assert.ok(!/Puoi seguire la verifica\s+dalla Home/.test(client), "la frase che rimanda alla Home c'è ancora"); assert.match(client, /Per farlo verificare carica\s+la prova di proprietà qui sopra, in questa scheda\./);
});

test("pagina Immobili: legge i documenti di verifica del proprietario (solo i suoi) e dice a ogni casa quante prove ha e se c'è il documento d'identità", () => {
  const p = senzaCommenti(leggi("src", "app", "(app)", "immobili", "page.tsx")); assert.match(p, /supabase\.from\("documenti_verifica"\)\.select\("id, tipo, listing_id, nome_file, percorso, created_at"\)\.eq\("owner_id", user!\.id\)/);
  assert.match(p, /const haIdentita = \(documenti \?\? \[\]\)\.some\(\(d\) => d\.tipo === "identita"\);/); assert.match(p, /documenti: documentiProprieta\(documenti, l\.id as string\),\s+nProprieta: documentiProprieta\(documenti, l\.id as string\)\.length,/); assert.match(p, /<ImmobiliClient immobili=\{immobili\} haIdentita=\{haIdentita\}/);
});

// ============================================================ le scritte che si sovrapponevano
test("lista immobili: il riquadro a destra è SEMPRE «numero + etichetta piccola», mai una scritta lunga (con «Nessuna candidatura» schiacciava il nome fino a farlo uscire dalla scheda)", () => {
  assert.ok(!/Nessuna candidatura|>Non pubblicato</.test(client.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")), "è tornata una scritta lunga nel riquadro");
  assert.match(client, /\{im\.nCandidature > 0 \|\| im\.pubblicato \? \(\s+<>\s+\{im\.nCandidature\}\s+<span>candidatur\{im\.nCandidature === 1 \? "a" : "e"\}<\/span>\s+<\/>\s+\) : \(\s+<>\s+—<span>non pubblicato<\/span>\s+<\/>\s+\)\}/);
});

test("stile della scheda: il riquadro non supera 92 px, i testi vanno a capo anche con una parola lunghissima, e sui telefoni stretti la foto è più piccola; lo stesso per le schede dei contratti", () => {
  assert.match(css, /\.match-card \.mc-pct,\s+\.contratto-testa \.mc-pct \{\s+max-width: 92px;\s+overflow-wrap: anywhere;\s+\}/);
  assert.match(css, /\.match-card \.mc-zona,\s+\.match-card \.mc-title,\s+\.match-card \.mc-meta,\s+\.contratto-testa \.mc-zona,\s+\.contratto-testa \.mc-title,\s+\.contratto-testa \.mc-meta \{\s+overflow-wrap: anywhere;\s+\}/);
  assert.match(css, /@media \(max-width: 359px\) \{\s+\.match-card img,\s+\.match-card \.mc-avatar \{\s+width: 58px;\s+height: 58px;/);
  // nessun @media prima delle regole di base dell'app (un test sul mazzo dell'inquilino legge il CSS fino al primo @media)
  assert.ok(css.indexOf("@media (max-width: 359px)") > css.indexOf(".swipe-hint {"), "il blocco per i telefoni stretti deve stare dopo le regole di base");
});

test("stile della prova di proprietà: caratteri da 15 px in su, pulsanti alti, angoli come le altre schede; nella Home di verifica niente scatola dentro la scatola", () => {
  const m = css.slice(css.indexOf("/* ---- La prova di proprietà nella scheda dell'immobile")); const misure = [...m.matchAll(/font-size:\s*(\d+)px/g)].map((x) => Number(x[1])); assert.ok(misure.length >= 7 && Math.min(...misure) >= 15, `caratteri: ${Math.min(...misure)} px`);
  assert.match(m, /\.verifica-immobile \.opp-cta \{\s+min-height: 52px;\s+font-size: 17px;/); assert.match(m, /\.verifica-immobile \.selettore-file \{[^}]*min-height: 44px;/); assert.match(m, /\.verifica-immobile \{\s+margin: 0 0 16px;\s+padding: 14px;\s+border-radius: 16px;/); assert.match(m, /\.verifica-card-colonna \.verifica-immobile \{\s+margin: 8px 0 0;\s+padding: 0;\s+background: none;/);
});

test("il controllo dei dati dimostrativi si salta (non fallisce) se il file facoltativo non c'è in questa copia del progetto", () => {
  const t = leggi("scripts", "test-rapporti.mjs"); assert.match(t, /const FILE_SEED = path\.join\(radice, "supabase", "migrations", "seed_demo_data\.sql"\);/); assert.match(t, /\{ skip: fs\.existsSync\(FILE_SEED\) \? false : "il file dei dati dimostrativi \(seed_demo_data\.sql\) non c'è in questa copia del progetto" \}/); assert.match(t, /fs\.readFileSync\(FILE_SEED, "utf8"\)/);
});

// ============================================================ i documenti già caricati: si rivedono e si riscaricano
const riga = (o) => ({ id: "d1", tipo: "proprieta", listing_id: "a1", nome_file: "visura.pdf", percorso: "u/proprieta-a1-1.pdf", created_at: "2026-10-12T10:00:00Z", ...o });

test("i documenti di una casa: solo le prove di proprietà di QUELLA casa (non l'identità, non le altre case), dalla più recente, con un nome sempre leggibile", () => {
  const righe = [riga({ id: "1", created_at: "2026-10-01T10:00:00Z", nome_file: "vecchia.pdf" }), riga({ id: "2", created_at: "2026-10-20T10:00:00Z", nome_file: "  nuova.pdf  " }), riga({ id: "3", tipo: "identita", listing_id: null }), riga({ id: "4", listing_id: "a2" }), riga({ id: "5", created_at: "2026-10-10T10:00:00Z", nome_file: "" }), riga({ id: "6", created_at: null, nome_file: null })];
  const d = vf.documentiProprieta(righe, "a1"); assert.deepEqual(d.map((x) => x.id), ["2", "5", "1", "6"], "dalla più recente; senza data in fondo"); assert.deepEqual(d.map((x) => x.nome), ["nuova.pdf", "Documento", "vecchia.pdf", "Documento"]);
  assert.deepEqual(d[0], { id: "2", nome: "nuova.pdf", percorso: "u/proprieta-a1-1.pdf", creatoIl: "2026-10-20T10:00:00Z" }); assert.deepEqual(vf.documentiProprieta(righe, "a2").map((x) => x.id), ["4"]);
  for (const vuoto of [null, undefined, []]) assert.deepEqual(vf.documentiProprieta(vuoto, "a1"), []); assert.deepEqual(vf.documentiProprieta(righe, "non-esiste"), []);
});

test("la data di un documento si legge in italiano («12 ott 2026», ora italiana) e se non si legge non si scrive niente", () => {
  assert.equal(vf.dataDocumento("2026-10-12T10:00:00Z"), "12 ott 2026"); assert.equal(vf.dataDocumento("2026-01-03T23:30:00Z"), "4 gen 2026", "alle 00:30 italiane è già il giorno dopo"); assert.equal(vf.dataDocumento("2026-03-05T12:00:00+02:00"), "5 mar 2026");
  for (const x of [null, undefined, "", "boh", "2026-13-45"]) assert.equal(vf.dataDocumento(x), "", String(x)); assert.ok(!/\./.test(vf.dataDocumento("2026-09-12T10:00:00Z")), "senza il punto dopo il mese");
  assert.equal(vf.nomeDocumento(null), "Documento"); assert.equal(vf.nomeDocumento("   "), "Documento"); assert.equal(vf.nomeDocumento(" atto.pdf "), "atto.pdf");
});

test("dalla scheda ai dati della verifica: i documenti passano, e il loro numero è quello delle prove caricate (altrimenti vale il numero dato)", () => {
  const docs = vf.documentiProprieta([riga({ id: "1" }), riga({ id: "2" })], "a1"); const v = vf.immobileVerificaDa(casa({ documenti: docs, nProprieta: 99 })); assert.equal(v.nProprieta, 2, "il numero è quello dei documenti"); assert.equal(v.documenti.length, 2);
  const senza = vf.immobileVerificaDa(casa({ nProprieta: 3 })); assert.equal(senza.nProprieta, 3); assert.deepEqual(senza.documenti, []);
});

test("il componente: l'elenco dei documenti si vede in OGNI stato (anche verificato e in verifica), con «Apri» e «Scarica» per ognuno; non dipende dallo stato della verifica", () => {
  const a = comp.indexOf('<div className="documenti-caricati">'); const b = comp.indexOf('{immobile.stato === "non_avviata" && (\n        <>'); assert.ok(a > 0 && b > a, "l'elenco sta PRIMA del blocco che vale solo se la verifica non è partita");
  const blocco = comp.slice(a, b); assert.match(blocco, /Documenti caricati: <b>\{documenti\.length\}<\/b>/); assert.match(blocco, /Non hai ancora caricato nessun documento per questa casa\./);
  assert.match(blocco, /\{documenti\.map\(\(doc\) => \(\s+<li key=\{doc\.id\} className="documento">\s+<div className="documento-nome">\{doc\.nome\}<\/div>/); assert.match(blocco, /Caricato il \{dataDocumento\(doc\.creatoIl\)\}/);
  assert.match(blocco, /aria-label=\{`Apri \$\{doc\.nome\}`\}[\s\S]*?onClick=\{\(\) => vedi\(doc\.percorso, doc\.nome, "apri"\)\}[\s\S]*?>\s+Apri\s+<\/button>/); assert.match(blocco, /aria-label=\{`Scarica \$\{doc\.nome\}`\}[\s\S]*?onClick=\{\(\) => vedi\(doc\.percorso, doc\.nome, "scarica"\)\}[\s\S]*?>\s+Scarica\s+<\/button>/);
  assert.ok(!/immobile\.stato/.test(blocco), "l'elenco e il caricamento non dipendono dallo stato della verifica");
});

test("il componente: «Carica un altro documento» c'è sempre (anche a casa verificata); «Carica visura o atto» solo se non c'è ancora nessun documento; i documenti restano visibili solo al proprietario e allo staff", () => {
  const a = comp.indexOf('<div className="documenti-caricati">'); const b = comp.indexOf('{immobile.stato === "non_avviata" && (\n        <>'); const blocco = comp.slice(a, b);
  assert.match(blocco, /etichetta=\{documenti\.length > 0 \? "Carica un altro documento" : "Carica visura o atto"\}/); assert.match(blocco, /onFile=\{\(f\) => carica\("proprieta", immobile\.id, f, `proprieta-\$\{immobile\.id\}`\)\}/); assert.match(blocco, /Li vede solo il team di MatchAmI: mai gli inquilini\./);
  const dopo = comp.slice(b); assert.ok(!/Carica un altro documento|Carica visura o atto/.test(dopo), "il caricamento non deve più dipendere dallo stato"); assert.match(dopo, /Invia per la verifica/, "l'invio resta solo con la verifica non partita");
});

test("rivedere e riscaricare: l'indirizzo è TEMPORANEO (un minuto), si crea al tocco con la sessione del proprietario, non è mai pubblico; «scarica» salva con il nome del file; «apri» si apre in una nuova scheda aperta SUBITO (il telefono non la blocca)", () => {
  assert.match(comp, /\.storage\.from\("documenti-verifica"\)\s+\.createSignedUrl\(percorso, 60, modo === "scarica" \? \{ download: nome \} : undefined\)/); assert.ok(!/getPublicUrl|createSignedUrls|createSignedUrl\(percorso, (?!60)/.test(comp), "indirizzi pubblici o di durata diversa");
  assert.match(comp, /const finestra = modo === "apri" \? window\.open\("", "_blank"\) : null;\s+if \(finestra\) finestra\.opener = null;/); assert.ok(comp.indexOf('window.open("", "_blank")') < comp.indexOf("await createClient()") || comp.indexOf('window.open("", "_blank")') < comp.indexOf(".createSignedUrl("), "la finestra si apre prima di aspettare il database");
  assert.match(comp, /if \(error \|\| !data\?\.signedUrl\) \{\s+finestra\?\.close\(\);\s+setErrore\("Non riesco ad aprire il documento\. Riprova\."\);\s+return;\s+\}/); assert.match(comp, /if \(finestra\) finestra\.location\.href = data\.signedUrl;\s+else window\.location\.assign\(data\.signedUrl\);/);
});

test("la Home di verifica e la pagina Immobili passano i documenti di ogni casa con la stessa funzione", () => {
  const home = senzaCommenti(leggi("src", "app", "(app)", "page.tsx")); assert.match(home, /supabase\.from\("documenti_verifica"\)\.select\("id, tipo, listing_id, nome_file, percorso, created_at"\)\.eq\("owner_id", userId\)/); assert.match(home, /documenti: documentiProprieta\(documenti, l\.id as string\),\s+nProprieta: documentiProprieta\(documenti, l\.id as string\)\.length,/);
  assert.match(home, /import \{ documentiProprieta, type ImmobileVerifica \} from "@\/lib\/verifica";/); assert.match(senzaCommenti(leggi("src", "app", "(app)", "immobili", "page.tsx")), /import \{ documentiProprieta \} from "@\/lib\/verifica";/);
});

test("stile dei documenti: caratteri da 15 px in su, pulsanti alti almeno 48 px e larghi uguali, scheda come le altre, nome a capo anche se lungo", () => {
  const m = css.slice(css.indexOf("/* ---- I documenti già caricati per un immobile")); const misure = [...m.matchAll(/font-size:\s*(\d+)px/g)].map((x) => Number(x[1])); assert.ok(misure.length >= 4 && Math.min(...misure) >= 15, `caratteri: ${Math.min(...misure)} px`);
  assert.match(m, /\.documento-bottone \{\s+flex: 1;\s+min-height: 48px;/); assert.match(m, /\.documento \{\s+padding: 12px 14px;\s+border-radius: 16px;\s+background: #fff;\s+box-shadow: 0 8px 20px rgba\(16, 21, 26, 0\.06\);/); assert.match(m, /\.documento-nome \{[^}]*overflow-wrap: anywhere;/); assert.match(m, /\.documento-azioni \{\s+display: flex;/);
});
