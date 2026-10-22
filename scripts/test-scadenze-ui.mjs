/**
 * Test delle SCHERMATE della scadenza delle verifiche e del reddito del nucleo: cosa legge il proprietario sulla scheda di una persona (verificato con la data,
 * in parte con le cifre, scaduto), cosa fa il pannello dell'inquilino (una prova per persona, consenso, rinnovo), cosa fa lo staff (importi controllati prima del
 * database, anteprima della copertura), e che i possibili match non contino una verifica scaduta. Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { caricaTs, radice } from "./carica-ts.mjs";

const richiedi = createRequire(import.meta.url); const React = richiedi("react"); const { renderToStaticMarkup } = richiedi("react-dom/server");
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const senzaCommenti = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const det = caricaTs(path.join(radice, "src", "components", "database", "DettaglioPersona.tsx"));

const scheda = (o = {}) => ({ nome: "Anna V.", professione: "Impiegata", avatarUrl: null, affidabilita: 75, match: { tipo: "pct", valore: 80 }, raccomandato: false, recensioni: null, redditoVerificato: true, redditoScaduto: false, redditoVerificatoIl: "2026-10-12T10:00:00Z", coperturaReddito: 1, redditoDichiarato: 3000, redditoNucleoVerificato: 3000, protestiVerificati: "nessuno", protestiScaduti: false, protestiVerificatiIl: "2026-09-01T10:00:00Z", presentazione: null, incompleto: false, ...o });
const casa = { id: "A", titolo: "Bilocale luminoso", zona: "Isola, Milano", prezzo: 1250, foto: null };
const disegna = (o) => renderToStaticMarkup(React.createElement(det.DettaglioPersona, { voce: { chiave: "c:1", casaId: "A", stato: "da_valutare", scheda: scheda(o), candidatura: null, possibile: null }, casa, criterio: "match", azioni: null, modale: false, onChiudi() {} }));

// ============================================================ la scheda del proprietario
test("scheda del proprietario: reddito verificato per intero = «Reddito verificato · mese», con la riga «Verificato sui documenti · mese» e il cerchio verde", () => {
  const h = disegna({}); assert.match(h, /<span class="persona-chip ">Reddito verificato · ott 2026<\/span>/); assert.match(h, /<b>Reddito<\/b><small>Verificato sui documenti · ott 2026<\/small>/); assert.match(h, /db-esito db-esito-si[^>]*>[\s\S]*?<\/span><span class="db-voce-testo"><b>Reddito<\/b>/);
  assert.match(h, /<span class="persona-chip ">Nessun protesto · verificato · set 2026<\/span>/); assert.match(h, /<small>Nessun protesto, certificato verificato · set 2026<\/small>/);
});

test("scheda del proprietario: verificato IN PARTE = chip di attenzione con la percentuale, e nella riga le cifre («€1500 verificati su €3000 dichiarati (50%)»); il cerchio non è verde", () => {
  const h = disegna({ coperturaReddito: 0.5, redditoNucleoVerificato: 1500 });
  assert.match(h, /<span class="persona-chip persona-chip-attenzione">Reddito verificato in parte \(50%\) · ott 2026<\/span>/); assert.match(h, /<small>€1500 verificati su €3000 dichiarati \(50%\) · ott 2026<\/small>/);
  assert.match(h, /db-esito db-esito-nd[^>]*>[\s\S]*?<\/span><span class="db-voce-testo"><b>Reddito<\/b>/, "né verde né rosso: incompleto");
  const possibile = disegna({ coperturaReddito: 0.5, redditoDichiarato: null, redditoNucleoVerificato: null }); assert.match(possibile, /<small>Documentato il 50% del reddito dichiarato · ott 2026<\/small>/, "di chi non si è candidato non si mostrano le cifre, solo la percentuale");
  assert.ok(!/1500|3000/.test(possibile), "nessuna cifra di reddito per chi non si è candidato");
});

test("scheda del proprietario: verifica SCADUTA = chip di attenzione «Verifica del reddito scaduta», cerchio rosso, mai «Reddito verificato»; protesti scaduti uguale", () => {
  const h = disegna({ redditoVerificato: false, redditoScaduto: true, coperturaReddito: null, protestiVerificati: null, protestiScaduti: true, protestiVerificatiIl: null });
  assert.match(h, /<span class="persona-chip persona-chip-attenzione">Verifica del reddito scaduta<\/span>/); assert.match(h, /<span class="persona-chip persona-chip-attenzione">Verifica dei protesti scaduta<\/span>/);
  assert.match(h, /<small>Verifica scaduta: non conta più<\/small>/); assert.match(h, /db-esito db-esito-no[^>]*>[\s\S]*?<\/span><span class="db-voce-testo"><b>Reddito<\/b>/); assert.ok(!/Reddito verificato/.test(h), "mai «verificato» se è scaduta"); assert.ok(!/Nessun protesto · verificato/.test(h));
});

test("scheda del proprietario: non verificato = nessun chip, «Non verificato» (grigio); un protesto verificato con «Ha protesti» è di attenzione", () => {
  const h = disegna({ redditoVerificato: false, coperturaReddito: null, redditoVerificatoIl: null, protestiVerificati: null, protestiVerificatiIl: null }); assert.ok(!/Reddito verificato|scaduta/.test(h)); assert.match(h, /<small>Non verificato<\/small>/); assert.match(h, /<small>Non ancora verificati dallo staff<\/small>/);
  const si = disegna({ protestiVerificati: "si" }); assert.match(si, /persona-chip persona-chip-attenzione">Ha protesti · verificato · set 2026</);
});

// ============================================================ il pannello dell'inquilino
test("pannello del reddito: una prova per ogni persona del nucleo, il consenso per chi non sei tu, la persona scritta nel documento, il rinnovo e la conferma", () => {
  const p = senzaCommenti(leggi("src", "components", "VerificaRedditoPanel.tsx"));
  assert.match(p, /const persone = percettoriDaDocumentare\(riga\.redditi_nucleo\);/); assert.match(p, /Array\.from\(\{ length: persone \}, \(_, i\) => i \+ 1\)\.map\(\(persona\) =>/); assert.match(p, /const altra = persona > 1;/);
  assert.match(p, /\{\(!altra \|\| consensoAltri\) && \(\s+<SelettoreFile/, "senza il consenso non si carica il documento di un'altra persona"); assert.match(p, /Questa persona è d&apos;accordo che il suo documento sia caricato e controllato dal team di MatchAmI\./); assert.match(p, /type="checkbox" checked=\{consensoAltri\}/);
  assert.match(p, /insert\(\{\s+tenant_id: user\.id,\s+tipo,\s+percorso,\s+nome_file: file\.name\.slice\(0, 200\),\s+persona,\s+\}\)/, "la persona del documento viene scritta"); assert.match(p, /onFile=\{\(f\) => carica\("reddito", f, persona\)\}/); assert.match(p, /onFile=\{\(f\) => carica\("identita", f, 1\)\}/);
  assert.match(p, /const coperturaIncompleta = ver\.redditoValido && \(ver\.coperturaReddito \?\? 1\) < 1;/); assert.match(p, /const rinnovabile = ver\.reddito !== null && puoRinnovare\(ver\.reddito, \{ coperturaIncompleta \}\);/); assert.match(p, /const mostraInvio = stato === "non_avviata" \|\| \(stato === "verificato" && rinnovabile\);/);
  assert.match(p, /const inviabile = puoInviareInquilino\(\{ stato, documenti, dati, redditiNucleo: riga\.redditi_nucleo, rinnovabile \}\);/); for (const x of ["Invia per la verifica", "Invia le prove aggiunte", "Rinnova la verifica", "La verifica di adesso resta valida finché non rispondiamo."]) assert.ok(p.includes(x), `manca «${x}»`);
  assert.match(p, /\{ver\.confermaNecessaria && \(/); assert.match(p, /rpc\("conferma_situazione"\)/); assert.match(p, /Non sostituisce i documenti, che vanno rinnovati alla scadenza\./); assert.match(p, /siTolgono && !d\.verificato_at/, "un file già verificato non si toglie");
  assert.match(p, /· verificata\$\{d\.importo_verificato \? `: €\$\{d\.importo_verificato\.toLocaleString\("it-IT"\)\}\/mese` : ""\}/, "le prove verificate si vedono con l'importo");
});

test("le tre pagine che montano i pannelli passano la riga dell'inquilino (scadenze, nucleo) e le nuove colonne dei documenti", () => {
  for (const [f, t] of [[["src", "app", "(app)", "page.tsx"], "tenantProfile"], [["src", "app", "(app)", "profilo", "page.tsx"], "tenant as TenantProfile"], [["src", "app", "benvenuto", "page.tsx"], "t"]]) {
    const s = senzaCommenti(leggi(...f)); assert.ok(s.includes("persona, importo_verificato, verificato_at"), `${f.join("/")}: colonne dei documenti`); assert.ok(s.includes(`riga={${t}}`), `${f.join("/")}: riga`);
    assert.equal([...s.matchAll(/riga=\{/g)].length, 2, `${f.join("/")}: la riga va a entrambi i pannelli (reddito e protesti)`);
  }
});

// ============================================================ lo staff
test("staff: gli importi si controllano PRIMA del database (per documento riconosciuto), le prove senza importo si scartano, l'esito passa gli importi; respingere non li vuole", () => {
  const a = senzaCommenti(leggi("src", "app", "staff", "actions.ts")); const f = a.slice(a.indexOf("export async function decidiInquilino"), a.indexOf("export async function decidiProtesti"));
  assert.match(f, /if \(esito === "verifica"\) \{/); assert.match(f, /\.from\("documenti_inquilino"\)\.select\("id, persona, nome_file"\)\.eq\("tenant_id", id\)\.eq\("tipo", "reddito"\)\.is\("verificato_at", null\)/, "solo le prove nuove"); assert.match(f, /rpc\("dati_per_verifica_inquilino", \{ p_tenant: id \}\)/);
  assert.match(f, /if \(chiave\.startsWith\("importo-"\)\) valori\[chiave\.slice\("importo-"\.length\)\] = String\(valore\);/); assert.match(f, /const letti = importiDaForm\(\{/); assert.match(f, /if \(!letti\.ok\) return \{ error: letti\.errore \};/); assert.match(f, /p_importi: importi,/);
  assert.ok(f.indexOf("if (!letti.ok)") < f.indexOf('rpc("esito_verifica_inquilino"'), "prima il controllo, poi il database"); assert.match(f, /let importi: \{ documento: string; importo: number \}\[\] \| null = null;/, "per «respingi» gli importi restano null");
});

test("staff: il modulo ha un campo per ogni prova nuova, l'anteprima della copertura, e non si può verificare senza prove da stimare; la pagina dice se è un rinnovo e cosa vale ancora", () => {
  const m = senzaCommenti(leggi("src", "app", "staff", "inquilini", "[id]", "EsitoInquilinoForm.tsx")); assert.match(m, /name=\{`importo-\$\{d\.id\}`\}/); assert.match(m, /const anteprima = anteprimaCopertura\(\{ documenti, valori, redditiNucleo, redditoNucleo, redditoMensile \}\);/); assert.match(m, /\{anteprima\.testo\}/); assert.match(m, /Reddito del nucleo documentato in parte/);
  assert.match(m, /disabled=\{pending \|\| documenti\.length === 0\} className="opp-cta"/); assert.match(m, /Lascia vuoto se la prova non vale: verrà scartata e cancellata\./);
  const p = senzaCommenti(leggi("src", "app", "staff", "inquilini", "[id]", "page.tsx")); assert.match(p, /\.select\("id, tipo, percorso, nome_file, persona, importo_verificato, verificato_at"\)/); assert.match(p, /<b>È un rinnovo \(o un&apos;integrazione\)\.<\/b> La verifica precedente vale fino al \{dataBreve\(dati\.reddito_scade_il\)\}/);
  assert.match(p, /documenti=\{firmati\.filter\(\(d\) => d\.tipo === "reddito" && !d\.verificato_at\)\.map/, "al modulo vanno solo le prove nuove"); assert.match(p, / · già verificata\$\{d\.importo_verificato \? ` \(€\$\{d\.importo_verificato\.toLocaleString\("it-IT"\)\}\)` : ""\}` : " · nuova"/, "le prove già verificate e quelle nuove si distinguono"); assert.match(p, /\? ` · \$\{etichettaPersona\(d\.persona \?\? 1\)\}` : ""/);
  const e = senzaCommenti(leggi("src", "app", "staff", "page.tsx")); assert.equal([...e.matchAll(/\{q\.rinnovo \? " · rinnovo" : ""\}/g)].length, 2, "il segno «rinnovo» sull'elenco dei redditi e su quello dei protesti");
});

// ============================================================ i possibili match
test("possibili match: la validità si calcola dalle scadenze (una verifica scaduta non vale), con le date e la copertura nella scheda", () => {
  const s = senzaCommenti(leggi("src", "lib", "proprietario", "possibili-server.ts"));
  assert.match(s, /const ver = leggiVerifiche\(det as RigaVerificheInquilino\);/); assert.match(s, /verificato: ver\.redditoValido,/, "una verifica scaduta non conta"); assert.match(s, /protestiVerificati: ver\.protestiValidi,/); assert.match(s, /redditoScaduto: ver\.redditoScaduto,/); assert.match(s, /redditoNucleoVerificato: \(det\.reddito_nucleo_verificato as number \| null\) \?\? null,/);
  assert.match(s, /reddito_scade_il, reddito_verificato_at, reddito_nucleo_verificato, protesti_scade_il, protesti_verificati_at, situazione_confermata_at"\)/, "la lettura chiede le colonne nuove");
});
