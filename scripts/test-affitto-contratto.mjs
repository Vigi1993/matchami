/**
 * Test dell'affitto che nasce dal contratto e della dichiarazione tolta al proprietario.
 *  - il PROPRIETARIO non dichiara più un affitto (non ne ha bisogno: non gli serve un feedback); conferma quelli dell'inquilino;
 *  - quando il contratto fatto su MatchAmI è «firmato», l'INQUILINO conferma con un tocco; poi una delle due parti carica la copia del
 *    contratto per lo staff; lo staff verifica; il proprietario verificato può lasciare il feedback.
 * Le regole vere stanno nel database (migrazione 0035): le prova test-db-richieste.mjs su un PostgreSQL vero. Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const af = caricaTs(path.join(radice, "src", "lib", "affitto-contratto.ts"));
const rp = caricaTs(path.join(radice, "src", "lib", "rapporti.ts"));
const nt = caricaTs(path.join(radice, "src", "lib", "notifiche.ts"));
const vf = caricaTs(path.join(radice, "src", "lib", "verifica.ts"));
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const migrazione = leggi("supabase", "migrations", "0035_affitto_da_contratto.sql");
const sqlSenza = (s) => s.replace(/--[^\n]*/g, "");

// ============================================================ le parole e le regole
test("errori: ogni codice che le funzioni nuove del database possono restituire ha le sue parole, e nessuna parola è per un codice che non esiste", () => {
  const fn = (nome, fine) => { const a = migrazione.indexOf(`create or replace function public.${nome}`); return migrazione.slice(a, fine ? migrazione.indexOf(fine, a) : undefined); };
  const corpo = fn("proteggi_risposta_affitto", "create or replace function public.proteggi_risposta_affitto".length ? "drop trigger if exists proteggi_risposta_affitto" : "") + fn("conferma_affitto_contratto", "-- ---- 6.") + fn("allega_documento_rapporto", "-- ---- 7.");
  const codici = [...new Set([...corpo.matchAll(/raise exception '([A-Z_]+):/g)].map((m) => m[1]))].sort(); assert.ok(codici.length >= 12, "codici: " + codici.join());
  assert.deepEqual(Object.keys(af.ERRORI_AFFITTO).sort(), codici, "i codici del database e quelli del codice devono coincidere");
  for (const [k, v] of Object.entries(af.ERRORI_AFFITTO)) { assert.ok(v.length > 10 && /[.]$/.test(v), `${k}: una frase intera`); assert.ok(!/[A-Z_]{6,}/.test(v), `${k}: il codice non deve comparire`); }
  assert.match(vf.messaggioErroreVerifica("MANCA_DOCUMENTO"), /non si può verificare/, "lo staff legge in italiano che manca il documento"); assert.match(migrazione, /raise exception 'MANCA_DOCUMENTO'/);
});

test("errori: dal messaggio del database alle parole; ciò che non si riconosce resta generico", () => {
  assert.equal(af.messaggioErroreAffitto("GIA_RISPOSTO: hai già risposto"), af.ERRORI_AFFITTO.GIA_RISPOSTO); assert.match(af.messaggioErroreAffitto("AFFITTO_NON_ANCORA_INIZIATO: x"), /non è ancora cominciato/);
  for (const x of [null, undefined, 5, {}, "", "boh", "gia_risposto: x", "  GIA_RISPOSTO: x", "CODICE_INVENTATO: x", 'new row violates check constraint "x"', "permission denied for function conferma_affitto_contratto"]) assert.equal(af.messaggioErroreAffitto(x), af.ERRORE_AFFITTO_GENERICO, JSON.stringify(x));
});

test("quando risponde l'inquilino: solo con il contratto firmato o concluso e finché non ha già risposto", () => {
  const c = (stato, conf = null, rif = null) => ({ stato, inquilino_conferma_at: conf, inquilino_rifiuta_at: rif });
  assert.deepEqual(["bozza", "in_firma", "firmato", "concluso"].map((s) => af.daConfermare(c(s))), [false, false, true, true]); assert.equal(af.daConfermare(c("firmato", "2026-10-01")), false); assert.equal(af.daConfermare(c("firmato", null, "2026-10-01")), false);
  for (const x of [null, undefined, {}, { stato: 5 }, { stato: "firmato", inquilino_conferma_at: "x" }]) assert.equal(af.daConfermare(x), Boolean(x && x.stato === "firmato" && !x.inquilino_conferma_at), String(JSON.stringify(x)));
  assert.deepEqual(["bozza", "firmato"].map((s) => af.rispostaInquilino(c(s))), ["non_firmato", "da_dare"]); assert.equal(af.rispostaInquilino(c("firmato", "x")), "confermato"); assert.equal(af.rispostaInquilino(c("concluso", null, "x")), "non_corretto"); assert.equal(af.rispostaInquilino(null), "non_firmato");
});

test("cosa vede il proprietario sul contratto: niente finché non è firmato; poi in attesa, confermato (con cosa fare) o «c'è qualcosa che non va» (con cosa fare)", () => {
  const p = af.statoPerProprietario; assert.equal(p({ stato: "bozza" }), null); assert.equal(p(null), null);
  assert.deepEqual(p({ stato: "firmato" }), { chiave: "da_dare", testo: "In attesa che l'inquilino confermi l'affitto." }); assert.match(p({ stato: "firmato", inquilino_conferma_at: "x" }).testo, /Carica una copia del contratto per farlo verificare\.$/); assert.match(p({ stato: "concluso", inquilino_rifiuta_at: "x" }).testo, /correggi i dati del contratto e gli verrà chiesto di nuovo\.$/);
});

test("descrizione di un affitto: nato da un contratto e senza documento = «Manca il contratto»; con il documento = «In verifica»; respinto = si può ricaricare; gli affitti dichiarati non cambiano", () => {
  const d = rp.descriviRapporto; assert.deepEqual([d("da_verificare", null, { daContratto: true, senzaDocumento: true }).etichetta, d("da_verificare", null, { daContratto: true, senzaDocumento: true }).tono], ["Manca il contratto", "da_fare"]);
  assert.deepEqual([d("da_verificare", null, { daContratto: true, senzaDocumento: false }).etichetta, d("da_verificare", null, { daContratto: true, senzaDocumento: false }).tono], ["In verifica", "attesa"]); assert.match(d("respinto", "nota", { daContratto: true }).testo, /caricare di nuovo la copia del contratto/); assert.doesNotMatch(d("respinto", "nota", { daContratto: true }).testo, /dichiararla di nuovo/);
  assert.equal(d("da_verificare", null).testo, "L'altra persona ha confermato. Ora controlliamo il contratto."); assert.match(d("respinto", "nota").testo, /Puoi ritirare la richiesta e dichiararla di nuovo/); assert.equal(d("verificato", null, { daContratto: true }).etichetta, "Verificato"); assert.equal(d("da_verificare", null, { senzaDocumento: true }).etichetta, "In verifica", "senza contratto non si parla di documento mancante");
});

test("le notifiche nuove hanno parole per chi legge, con la casa; senza titolo non si rompe", () => {
  for (const t of ["affitto_da_confermare", "affitto_confermato", "affitto_non_confermato"]) assert.ok(nt.TIPI_NOTIFICA.includes(t), t);
  assert.equal(nt.descriviNotifica("affitto_da_confermare", { titolo: "Bilocale" }).titolo, "Conferma il tuo affitto"); assert.match(nt.descriviNotifica("affitto_da_confermare", { titolo: "Bilocale" }).testo, /«Bilocale» ha segnato il contratto come firmato/); assert.match(nt.descriviNotifica("affitto_confermato", { titolo: "Bilocale" }).testo, /Carica una copia del contratto/); assert.match(nt.descriviNotifica("affitto_non_confermato", { titolo: "Bilocale" }).testo, /Correggi i dati/);
  for (const t of ["affitto_da_confermare", "affitto_confermato", "affitto_non_confermato"]) assert.ok(nt.descriviNotifica(t, null).testo.length > 20, t);
});

// ============================================================ PUNTO 1: il proprietario non dichiara più un affitto
const pannello = senzaCommenti(leggi("src", "components", "RapportiPanel.tsx"));

test("il proprietario NON ha più «Dichiara un affitto»: il pulsante e il modulo si vedono solo all'inquilino, e non c'è più la scelta dell'immobile", () => {
  assert.match(pannello, /\{ruolo === "inquilino" && \(\s+<>\s+\{!form \? \(/); const blocco = pannello.slice(pannello.indexOf('{ruolo === "inquilino" && ('));
  assert.ok(blocco.includes("Dichiara un affitto") && blocco.includes("Crea il link")); assert.ok(!/Quale tuo immobile|immobileId|setImmobileId|ImmobileScelta/.test(pannello), "resta la scelta dell'immobile"); assert.ok(!/\bimmobili\b/.test(pannello.slice(0, pannello.indexOf("return (")).replace(/\/\*[\s\S]*?\*\//g, "")), "la proprietà «immobili» non serve più");
  assert.ok(!/p_listing: ruolo/.test(pannello)); assert.match(pannello, /p_listing: null,\s+p_indirizzo: indirizzo\.trim\(\),/); assert.match(pannello, /if \(ruolo !== "inquilino"\) return;/, "anche la funzione di invio rifiuta il proprietario");
  assert.equal([...pannello.matchAll(/Dichiara un affitto/g)].length, 2, "il testo compare solo dentro il blocco dell'inquilino (pulsante e titolo del modulo)");
});

test("il proprietario trova comunque ciò che gli serve: gli affitti da confermare, il link per le richieste già mandate, il feedback; l'introduzione cambia per ruolo", () => {
  for (const x of ["I tuoi affitti", "In attesa dell&apos;altra persona", "<LinkCondiviso", "<FeedbackAffitto", "Mostra il link"]) assert.ok(pannello.includes(x), `manca «${x}»`);
  assert.match(pannello, /\{ruolo === "inquilino"\s+\? "Un affitto dichiarato vale per i feedback solo se l'altra persona lo conferma e se il contratto, che vediamo solo noi, risulta in regola\. L'altra persona vede i dati principali, non il contratto\."\s+: "Qui trovi gli affitti che i tuoi inquilini ti hanno chiesto di confermare\. Dopo il controllo del contratto, che vediamo solo noi, puoi lasciare un feedback: aiuta chi ha affittato bene a trovare casa\."\}/);
});

test("le pagine non passano più gli immobili al pannello e il proprietario non li carica più per questo", () => {
  const g = leggi("src", "app", "(app)", "gestione-affitti", "page.tsx"); assert.ok(!/immobili=/.test(g) && !/\{ data: immobili \}/.test(g)); assert.match(g, /const \[rapporti, \{ data: verificato \}\] = await Promise\.all\(\[\s+caricaRapportiMiei\(supabase, user!\.id\),\s+supabase\.rpc\("proprietario_verificato", \{ p_owner: user!\.id \}\),\s+\]\);/);
  assert.ok(!/immobili=/.test(leggi("src", "app", "(app)", "gestione", "page.tsx"))); assert.match(g, /<RapportiPanel\s+ruolo="proprietario"/); assert.match(leggi("src", "app", "(app)", "gestione", "page.tsx"), /<RapportiPanel\s+ruolo="inquilino"/);
});

test("il database accetta ancora la richiesta di un proprietario (i link già mandati devono funzionare): la 0035 non tocca crea_richiesta_rapporto", () => {
  assert.ok(!/crea_richiesta_rapporto|conferma_richiesta_rapporto/.test(sqlSenza(migrazione)), "la 0035 non deve cambiare le funzioni delle richieste"); assert.match(migrazione, /La funzione crea_richiesta_rapporto accetta ancora anche il\n-- proprietario/);
});

// ============================================================ PUNTO 2: l'affitto da contratto
test("pagina dell'inquilino: per ogni contratto firmato o concluso senza risposta c'è la carta di conferma, PRIMA dell'elenco dei contratti", () => {
  const c = senzaCommenti(leggi("src", "app", "(app)", "gestione", "GestioneClient.tsx")); assert.match(c, /\{contratti\.filter\(daConfermare\)\.map\(\(c\) => \(\s+<ConfermaAffitto key=\{c\.id\} contratto=\{c\} \/>\s+\)\)\}/); assert.ok(c.indexOf("contratti.filter(daConfermare)") < c.indexOf("contratti.length === 0"), "la carta sta sopra i contratti");
  const p = leggi("src", "app", "(app)", "gestione", "page.tsx"); assert.match(p, /data_firma, inquilino_conferma_at, inquilino_rifiuta_at, candidature!inner\(tenant_id, listings\(titolo, zona\)\)/);
});

test("carta di conferma: si risponde sì o no con due pulsanti grandi, ognuno chiama il server UNA volta; dopo, un messaggio; l'errore del database si legge e si può riprovare", () => {
  const c = senzaCommenti(leggi("src", "components", "ConfermaAffitto.tsx")); assert.equal([...c.matchAll(/confermaAffitto\(/g)].length, 1, "una sola chiamata al server"); assert.match(c, /rispondi\(true\)/); assert.match(c, /rispondi\(false\)/); assert.match(c, /if \(!r\.ok\) return setErrore\(r\.error\);\s+setEsito\(conferma \? "si" : "no"\);/);
  for (const x of ["TESTI_CONFERMA_AFFITTO.si", "TESTI_CONFERMA_AFFITTO.no", "TESTI_CONFERMA_AFFITTO.grazie", "TESTI_CONFERMA_AFFITTO.rifiutato", "role=\"alert\""]) assert.ok(c.includes(x), `manca ${x}`);
  assert.deepEqual([af.TESTI_CONFERMA_AFFITTO.si, af.TESTI_CONFERMA_AFFITTO.no, af.TESTI_CONFERMA_AFFITTO.titolo], ["Sì, è tutto corretto", "No, c'è qualcosa che non va", "Confermi che l'affitto è cominciato?"]); assert.match(af.TESTI_CONFERMA_AFFITTO.grazie, /carica una copia del contratto registrato/); assert.match(af.TESTI_CONFERMA_AFFITTO.spiegazione, /varrà per i feedback/);
});

test("azioni dell'inquilino e delle parti: identificativi controllati PRIMA del database, funzioni giuste, pagine aggiornate, errori in italiano, nessuna scrittura diretta", () => {
  const a = senzaCommenti(leggi("src", "app", "(app)", "gestione", "affitto-actions.ts")); assert.match(a, /if \(!eUuid\(contrattoId\) \|\| typeof conferma !== "boolean"\)/); assert.match(a, /supabase\.rpc\("conferma_affitto_contratto", \{ p_contratto: contrattoId, p_conferma: conferma \}\)/); assert.match(a, /supabase\.rpc\("allega_documento_rapporto", \{ p_rapporto: rapportoId, p_path: percorso \}\)/);
  assert.ok(a.indexOf("eUuid(contrattoId)") < a.indexOf("createClient()")); assert.equal([...a.matchAll(/revalidatePath\("\/gestione"\)/g)].length, 2); assert.equal([...a.matchAll(/revalidatePath\("\/gestione-affitti"\)/g)].length, 2); assert.equal([...a.matchAll(/messaggioErroreAffitto\(error\.message\)/g)].length, 2);
  assert.match(a, /percorso\.length === 0 \|\| percorso\.length > 300/); assert.ok(!/from\("(rapporti_locazione|contratti)"\)\s*\.(insert|update|delete|upsert)/.test(a), "scritture dirette");
});

test("caricamento del contratto per lo staff: il file va nell'archivio di verifica, nella cartella di chi lo carica, e SOLO dopo si collega all'affitto; non si carica nell'archivio privato del contratto", () => {
  const c = senzaCommenti(leggi("src", "components", "CaricaContrattoRapporto.tsx")); assert.match(c, /storage\.from\("documenti-verifica"\)\.upload\(percorso, file/); assert.match(c, /percorsoDocumento\(\{ userId: user\.id, tipo: "contratto", listingId: null, estensione, id: crypto\.randomUUID\(\) \}\)/); assert.ok(c.indexOf(".upload(percorso") < c.indexOf("allegaDocumentoAffitto(rapportoId, percorso)"), "prima il file, poi il collegamento");
  assert.ok(!/documenti-contratto/.test(c), "il documento per lo staff non va nell'archivio privato del contratto"); assert.match(c, /validaFileDocumento\(file\)/); assert.match(c, /disabled=\{occupato \|\| !file\}/);
});

test("pannello degli affitti: la carta per caricare il contratto compare solo per un affitto da contratto non verificato che non ha il documento o è stato respinto; «Ritira» non compare per quelli da contratto", () => {
  assert.match(pannello, /\{r\.daContratto && r\.stato !== "verificato" && \(r\.senzaDocumento \|\| r\.stato === "respinto"\) && \(\s+<CaricaContrattoRapporto rapportoId=\{r\.id\} onFatto=\{\(\) => router\.refresh\(\)\} \/>/); assert.match(pannello, /\{r\.creatoDaMe && !r\.daContratto && r\.stato !== "verificato" && \(/); assert.match(pannello, /descriviRapporto\(r\.stato, r\.esito_note, \{ daContratto: r\.daContratto, senzaDocumento: r\.senzaDocumento \}\)/);
  const s = senzaCommenti(leggi("src", "lib", "rapporti-server.ts")); assert.match(s, /contratto_id, documento_path, listings\(titolo, zona\)/); assert.match(s, /daContratto: typeof r\.contratto_id === "string",\s+senzaDocumento: !r\.documento_path,/);
});

test("il proprietario vede sul contratto se l'inquilino ha confermato; l'inquilino non può cambiare i propri dati di risposta da solo", () => {
  assert.match(leggi("src", "app", "(app)", "gestione-affitti", "page.tsx"), /data_firma, inquilino_conferma_at, inquilino_rifiuta_at, candidature!inner\(listing_id, tenant_id/); const c = senzaCommenti(leggi("src", "app", "(app)", "gestione-affitti", "GestioneAffittiClient.tsx"));
  assert.match(c, /\{statoPerProprietario\(c\) && <div className=\{`mc-affitto is-\$\{statoPerProprietario\(c\)!\.chiave\}`\}>\{statoPerProprietario\(c\)!\.testo\}<\/div>\}/); assert.ok(!/inquilino_conferma_at|inquilino_rifiuta_at/.test(senzaCommenti(leggi("src", "app", "(app)", "gestione-affitti", "actions.ts"))), "il modulo del proprietario non scrive la risposta dell'inquilino");
});

test("staff: un affitto da contratto entra nella coda solo con il documento, la pagina dice da dove nasce, e non c'è nessun accesso nuovo ai documenti dei contratti", () => {
  assert.match(leggi("src", "app", "staff", "page.tsx"), /\.eq\("stato", "da_verificare"\)\s+\/\/[^\n]*\n\s+\.or\("contratto_id\.is\.null,documento_path\.not\.is\.null"\)/); const p = leggi("src", "app", "staff", "rapporti", "[id]", "page.tsx"); assert.match(p, /const daContratto = typeof rapporto\.contratto_id === "string";/); assert.ok(p.includes("nato da un contratto fatto su MatchAmI: il proprietario lo ha segnato come firmato e l'inquilino ha confermato"));
  const m = sqlSenza(migrazione); assert.ok(!/documenti_contratto|documenti-contratto/.test(m), "la 0035 non deve dare allo staff (né a nessuno) un accesso nuovo all'archivio dei contratti: i documenti restano privati alle due parti"); assert.ok(!/create policy[^;]*storage\.objects/i.test(m), "nessuna policy nuova sull'archivio dei file");
});

// ============================================================ la migrazione
test("migrazione 0035: la risposta dell'inquilino è protetta (nessuna delle due parti la scrive a mano), l'affitto da contratto non si ritira, lo staff non verifica senza documento, le funzioni sono delle parti e non dell'anonimo", () => {
  const m = sqlSenza(migrazione);
  assert.match(m, /if current_user not in \('authenticated', 'anon'\) then\s+return new;\s+end if;\s+if tg_op = 'INSERT' then\s+if new\.inquilino_conferma_at is not null or new\.inquilino_rifiuta_at is not null then\s+raise exception 'RISPOSTA_RISERVATA/); assert.match(m, /create trigger proteggi_risposta_affitto before insert or update on contratti/); assert.match(m, /check \(inquilino_conferma_at is null or inquilino_rifiuta_at is null\)/);
  assert.match(m, /using \(auth\.uid\(\) = creato_da and stato in \('da_verificare', 'respinto'\) and contratto_id is null\)/); assert.match(m, /if r\.contratto_id is not null and r\.documento_path is null then\s+raise exception 'MANCA_DOCUMENTO';/); assert.match(m, /create unique index if not exists rapporti_locazione_contratto_idx on rapporti_locazione \(contratto_id\) where contratto_id is not null;/);
  assert.match(m, /if k\.tenant_id is distinct from auth\.uid\(\) then\s+raise exception 'CONTRATTO_NON_TUO/); assert.match(m, /if v_inizio > current_date then\s+raise exception 'AFFITTO_NON_ANCORA_INIZIATO/); assert.match(m, /creato_da, contratto_id\)\s+values \(l\.owner_id, k\.tenant_id, l\.id, v_inizio, v_fine, k\.tenant_id, c\.id\)/);
  for (const f of ["conferma_affitto_contratto(uuid, boolean)", "allega_documento_rapporto(uuid, text)"]) { assert.match(m, new RegExp(`revoke all on function public\\.${f.replace(/[()]/g, "\\$&")} from public, anon;`)); assert.match(m, new RegExp(`grant execute on function public\\.${f.replace(/[()]/g, "\\$&")} to authenticated;`)); }
  assert.equal([...m.matchAll(/security definer/g)].length, 4, "le quattro funzioni che scrivono su altre tabelle (trigger di avviso, conferma, allega, esito) sono security definer");
});

test("il DB test esegue anche le prove dell'affitto da contratto (61 controlli) e non se ne perde nessuno", () => {
  const sql = leggi("scripts", "db", "affitto-contratto.sql"); const controlli = [...sql.matchAll(/(select|perform) t\.(ok|fallisce)\(/g)].length; assert.ok(controlli >= 60, `controlli: ${controlli}`); assert.match(sql, /select t\.ok\(\(select count\(\*\) from t\.esiti\) = 60,/);
  for (const tema of ["C05 il proprietario non può segnare la conferma", "C09 un altro inquilino non può confermare", "C15 un affitto che comincia nel futuro", "C23 lo staff non può verificare un affitto da contratto senza il documento", "C26 l'inquilino non può ritirare", "C29 il file deve stare nella cartella", "C38 IL FEEDBACK", "C46 se il proprietario CORREGGE i dati", "C51 se l'affitto era già stato dichiarato", "C60 si conferma un contratto GIÀ concluso", "C61 e se il contratto si è concluso PRIMA della fine prevista"]) assert.ok(sql.replaceAll("''", "'").includes(tema), `manca il controllo «${tema}»`);
});

test("stile: la carta di conferma e la riga di stato del contratto hanno caratteri da 15 px in su", () => {
  const css = leggi("src", "app", "globals.css"); const m = css.slice(css.indexOf("/* ---- L'affitto che nasce dal contratto ---- */")); const misure = [...m.matchAll(/font-size:\s*(\d+)px/g)].map((x) => Number(x[1])); assert.ok(misure.length >= 5 && Math.min(...misure) >= 15, `caratteri: ${Math.min(...misure)} px`); assert.match(m, /\.carica-contratto \.field-note,\s+\.carica-contratto \.chip \{\s+font-size: 15px;/, "la nota e il file della carta del contratto devono essere da 15 px"); assert.match(m, /\.carica-contratto \.opp-cta \{\s+min-height: 52px;\s+font-size: 17px;/);
  assert.match(m, /\.conferma-affitto-azioni \.opp-cta,\s+\.conferma-affitto-azioni \.richieste-secondario \{\s+min-height: 52px;/, "i due pulsanti della carta devono essere alti uguali");
});
