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
  assert.deepEqual(v, { id: "a1", titolo: "Bilocale", zona: "Isola, Milano", stato: "non_avviata", note: "il nome non coincide", nProprieta: 2, dati: { classe_energetica: "C", luogo_id: "q1", bagni: 1, piano: 2, riscaldamento: "autonomo", tipo_contratto: "libero_4_4", disponibile_dal: "2026-12-01" } });
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
  const p = senzaCommenti(leggi("src", "app", "(app)", "immobili", "page.tsx")); assert.match(p, /supabase\.from\("documenti_verifica"\)\.select\("tipo, listing_id"\)\.eq\("owner_id", user!\.id\)/);
  assert.match(p, /const haIdentita = \(documenti \?\? \[\]\)\.some\(\(d\) => d\.tipo === "identita"\);/); assert.match(p, /if \(d\.tipo === "proprieta" && d\.listing_id\) proprietaPerImmobile\.set\(/); assert.match(p, /nProprieta: proprietaPerImmobile\.get\(l\.id as string\) \?\? 0,/); assert.match(p, /<ImmobiliClient immobili=\{immobili\} haIdentita=\{haIdentita\}/);
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
