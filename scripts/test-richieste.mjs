/**
 * Test delle richieste dei proprietari («Fai match»): consenso dell'inquilino, scelta e ordine dei possibili inquilini, cosa
 * vede il proprietario (e cosa NO), le parole degli errori, e la coerenza tra la migrazione 0032 e il codice.
 * Le regole vere stanno nel database: le prova test-db-richieste.mjs su un PostgreSQL vero. Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const rq = caricaTs(path.join(radice, "src", "lib", "richieste.ts"));
const pi = caricaTs(path.join(radice, "src", "lib", "proprietario", "possibili-inquilini.ts"));
const lu = caricaTs(path.join(radice, "src", "lib", "luoghi.ts"));
const mp = caricaTs(path.join(radice, "src", "lib", "match", "possibili.ts"));
const nt = caricaTs(path.join(radice, "src", "lib", "notifiche.ts"));
const cand = caricaTs(path.join(radice, "src", "lib", "candidature.ts"));
const inf = caricaTs(path.join(radice, "src", "content", "informativa.ts"));
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const migrazione = leggi("supabase", "migrations", "0032_richieste_proprietari.sql");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");

// ============================================================ la migrazione e il codice dicono le stesse cose
test("limiti: 280 caratteri e venti richieste al giorno sono gli STESSI nel database e nel codice", () => {
  assert.equal(rq.MESSAGGIO_RICHIESTA_MAX, 280); assert.equal(rq.RICHIESTE_AL_GIORNO, 20);
  assert.match(migrazione, /char_length\(messaggio\) between 1 and 280/); assert.match(migrazione, /char_length\(v_msg\) > 280/); assert.match(migrazione, /created_at > now\(\) - interval '1 day'\) >= 20/);
});

test("errori: ogni codice che il database può restituire ha le sue parole, e nessuna parola è per un codice che non esiste", () => {
  const codici = [...new Set([...migrazione.matchAll(/raise exception '([A-Z_]+):/g)].map((m) => m[1]))].sort(); assert.ok(codici.length >= 11, "codici: " + codici.length);
  assert.deepEqual(Object.keys(rq.ERRORI_RICHIESTA).sort(), codici, "i codici del database e quelli del codice devono coincidere");
  for (const [k, v] of Object.entries(rq.ERRORI_RICHIESTA)) { assert.ok(v.length > 10 && /[.]$/.test(v), `${k}: una frase intera`); assert.ok(!/[A-Z_]{6,}/.test(v), `${k}: il codice non deve comparire nelle parole`); }
});

test("errori: dal messaggio del database alle parole; ciò che non si riconosce resta generico e non lascia passare testo del database", () => {
  assert.equal(rq.messaggioErroreRichiesta("GIA_CANDIDATO: questa persona si è già candidata a questa casa"), rq.ERRORI_RICHIESTA.GIA_CANDIDATO); assert.equal(rq.messaggioErroreRichiesta("TROPPE_RICHIESTE: x"), "Per oggi hai scritto ad abbastanza persone: riprova domani.");
  for (const x of [null, undefined, 5, {}, [], "", "boh", "gia_candidato: x", "  GIA_CANDIDATO: x", "errore GIA_CANDIDATO: x", "CODICE_INVENTATO: x", 'new row violates check constraint "x"', "permission denied for function invia_richiesta_proprietario"]) assert.equal(rq.messaggioErroreRichiesta(x), rq.ERRORE_RICHIESTA_GENERICO, JSON.stringify(x));
});

test("messaggio del proprietario: ripulito dagli spazi, vuoto = nessuno, oltre 280 caratteri no, tipi strani no", () => {
  const m = rq.messaggioPulito; assert.deepEqual(m("  Ciao  "), { ok: true, valore: "Ciao" }); assert.deepEqual(m("   "), { ok: true, valore: null }); assert.deepEqual(m(""), { ok: true, valore: null }); assert.deepEqual(m(null), { ok: true, valore: null }); assert.deepEqual(m(undefined), { ok: true, valore: null });
  assert.deepEqual(m("a".repeat(280)), { ok: true, valore: "a".repeat(280) }); assert.deepEqual(m("a".repeat(281)), { ok: false }); assert.deepEqual(m(" " + "a".repeat(280) + " "), { ok: true, valore: "a".repeat(280) }, "gli spazi non contano nel limite"); for (const x of [5, {}, [], true]) assert.deepEqual(m(x), { ok: false });
});

test("identificativi: solo veri UUID passano (niente testo libero verso il database)", () => {
  assert.equal(rq.eUuid("11111111-0000-0000-0000-000000000001"), true); assert.equal(rq.eUuid("AAAAAAAA-0000-4000-8000-00000000000A"), true);
  for (const x of ["", "x", "1", "11111111-0000-0000-0000-00000000000", "11111111-0000-0000-0000-0000000000011", "'; drop table x; --", null, undefined, 5, {}]) assert.equal(rq.eUuid(x), false, String(x));
});

// ============================================================ la richiesta letta dall'inquilino
const RIGA = (o = {}) => ({ id: "r1", stato: "inviata", messaggio: "  Ciao!  ", nome_proprietario: " Mario ", candidatura_id: null, created_at: "2026-10-15T10:00:00Z", listings: { titolo: "Bilocale", zona: "Isola", prezzo: 1250, locali: 2, mq: 55, listing_photos: [{ url: "b.jpg", ordine: 2 }, { url: "a.jpg", ordine: 1 }] }, ...o });

test("richiestaDaRiga: legge la richiesta con la casa e la sua prima foto, ripulisce i testi; la casa può arrivare come oggetto o come lista", () => {
  const r = rq.richiestaDaRiga(RIGA()); assert.deepEqual(r, { id: "r1", stato: "inviata", messaggio: "Ciao!", nomeProprietario: "Mario", creataIl: "2026-10-15T10:00:00Z", candidaturaId: null, casa: { titolo: "Bilocale", zona: "Isola", prezzo: 1250, locali: 2, mq: 55, foto: "a.jpg" } });
  assert.deepEqual(rq.richiestaDaRiga(RIGA({ listings: [RIGA().listings] })).casa, r.casa);
  assert.equal(rq.richiestaDaRiga(RIGA({ messaggio: "   " })).messaggio, null); assert.equal(rq.richiestaDaRiga(RIGA({ nome_proprietario: null })).nomeProprietario, null); assert.equal(rq.richiestaDaRiga(RIGA({ stato: "accettata", candidatura_id: "c1" })).candidaturaId, "c1");
});

test("richiestaDaRiga: la casa che non c'è più dà «nessuna casa»; una riga rotta dà null e non rompe niente", () => {
  for (const l of [null, undefined, {}, { titolo: 5 }, "x"]) assert.equal(rq.richiestaDaRiga(RIGA({ listings: l })).casa, null, JSON.stringify(l));
  assert.equal(rq.richiestaDaRiga(RIGA({ listings: { titolo: "X", listing_photos: [] } })).casa.foto, null); assert.equal(rq.richiestaDaRiga(RIGA({ listings: { titolo: "X", listing_photos: [{ url: 5 }, null] } })).casa.foto, null);
  for (const x of [null, undefined, 5, "x", [], {}, { id: 5, stato: "inviata" }, { id: "x" }, { id: "x", stato: "inventato" }, RIGA({ stato: "annullata" })]) assert.equal(rq.richiestaDaRiga(x), null, JSON.stringify(x));
});

test("richieste in attesa: solo quelle a cui non si è risposto, le più recenti per prime; frase con il nome", () => {
  const r = (id, stato, quando) => rq.richiestaDaRiga(RIGA({ id, stato, created_at: quando, candidatura_id: stato === "accettata" ? "c" : null }));
  assert.deepEqual(rq.richiesteInAttesa([r("a", "inviata", "2026-10-01T00:00:00Z"), r("b", "accettata", "2026-10-03T00:00:00Z"), r("c", "inviata", "2026-10-05T00:00:00Z"), r("d", "rifiutata", "2026-10-06T00:00:00Z")]).map((x) => x.id), ["c", "a"]); assert.deepEqual(rq.richiesteInAttesa([]), []);
  assert.equal(rq.fraseRichiesta({ nomeProprietario: "Mario" }), "Mario ha scelto il tuo profilo"); assert.equal(rq.fraseRichiesta({ nomeProprietario: null }), "Un proprietario ha scelto il tuo profilo");
});

// ============================================================ i possibili inquilini, per il proprietario
const LUOGHI = [{ id: "pMI", livello: "provincia", nome: "Milano", sigla: "MI", parent_id: null }, { id: "cMI", livello: "comune", nome: "Milano", sigla: null, parent_id: "pMI" }, { id: "qIsola", livello: "quartiere", nome: "Isola", sigla: null, parent_id: "cMI" }, { id: "qNavigli", livello: "quartiere", nome: "Navigli", sigla: null, parent_id: "cMI" }];
const mappa = lu.mappaLuoghi(LUOGHI);
const ANNUNCIO = mp.annuncioDaRiga({ id: "a1", prezzo: 1250, zona: "Isola, Milano", locali: 2, mq: 55, attributi: { balcone: true }, luogo_id: "qIsola", tipologia: "appartamento" }, mappa).annuncio;
const ORA = Date.parse("2026-10-15T12:00:00Z");
const persona = (id, o = {}) => ({ tenantId: id, nome: "Anna", cognome: "Verdi", professione: "Designer", avatarUrl: null, presentazione: "Ciao, cerco casa.", verificato: false, protestato: false, garante: null, fideiussione: null, reddito_mensile: 2600, reddito_nucleo: null, animaliCompilato: true, nucleoCompilato: true, riga: { budget_max: 1500, locali_min: null, mq_min: null }, zone: [], interessi: [], recensioni: [], ...o });
const schede = (disponibili, o = {}) => pi.schedeInquilini({ annuncio: ANNUNCIO, canone: 1250, criteri: [], disponibili, esclusi: new Set(), ora: ORA, ...o });
const ids = (s) => s.map((x) => x.tenantId);

test("nome breve: nome e iniziale del cognome in maiuscolo; con una parte sola quella; senza niente «Un inquilino»; spazi ripuliti", () => {
  const n = pi.nomeBreve; assert.equal(n("Anna", "Verdi"), "Anna V."); assert.equal(n("  Anna  ", " verdi "), "Anna V."); assert.equal(n("Anna", null), "Anna"); assert.equal(n(null, "Verdi"), "V."); assert.equal(n("Maria Luisa", "De Rossi"), "Maria Luisa D."); assert.equal(n("Émile", "ébert"), "Émile É.");
  for (const x of [null, undefined, "", "  ", 5, {}]) assert.equal(n(x, x), "Un inquilino", String(x));
});

test("estratto della presentazione: intera se è breve; sennò tagliata a una parola intera con i puntini; mai oltre 160 caratteri più i puntini", () => {
  assert.equal(pi.estratto("Ciao, cerco casa."), "Ciao, cerco casa."); assert.equal(pi.estratto("  tanti   spazi   qui  "), "tanti spazi qui"); for (const x of [null, undefined, "", "   ", 5, {}]) assert.equal(pi.estratto(x), null);
  const lungo = "parola ".repeat(60); const e = pi.estratto(lungo); assert.ok(e.endsWith("…") && e.length <= 161 && !/parol…$/.test(e), e); assert.ok(!/[ ,.;:]…$/.test(e)); assert.equal(pi.estratto("x".repeat(500)).length, 161, "senza spazi si taglia dove capita"); assert.equal(pi.LUNGHEZZA_ESTRATTO, 160);
});

test("in linea: la casa rispetta la ricerca (budget, zona, tipologia); una ricerca vuota non conta", () => {
  const li = (riga, zone = []) => pi.ricercaInLinea(ANNUNCIO, { riga: { budget_max: null, locali_min: null, mq_min: null, ...riga }, zone, interessi: [] });
  assert.equal(li({ budget_max: 1500 }), true); assert.equal(li({ budget_max: 1000 }), false); assert.equal(li({}), false, "ricerca vuota"); assert.equal(li({ budget_max: 1500 }, [{ zona: "Navigli", luogo_id: "qNavigli" }]), false); assert.equal(li({ budget_max: 1500 }, [{ zona: "Milano", luogo_id: "cMI" }]), true); assert.equal(li({ budget_max: 1500, tipologia: "villa" }), false);
});

test("schede: solo chi ha una ricerca in linea con la casa; chi non è disponibile o sfora il budget non compare", () => {
  const s = schede([persona("a"), persona("b", { riga: { budget_max: 900, locali_min: null, mq_min: null } }), persona("c", { riga: { budget_max: null, locali_min: null, mq_min: null } }), persona("d", { riga: { budget_max: 2000, locali_min: null, mq_min: null } })]); assert.deepEqual(ids(s).sort(), ["a", "d"]);
});

test("schede: chi si è già candidato o ha già ricevuto una richiesta non si propone di nuovo", () => {
  const tutti = [persona("a"), persona("b"), persona("c")]; assert.deepEqual(ids(schede(tutti, { esclusi: new Set(["a", "c"]) })), ["b"]); assert.deepEqual(ids(schede(tutti, { esclusi: new Set(["a", "b", "c"]) })), []);
});

test("schede: chi non rispetta un criterio OBBLIGATORIO del proprietario non si propone; uno solo preferenziale sì, ma più in basso", () => {
  const verificato = [{ chiave: "profiloVerificato", peso: 8, modo: "obbligatorio" }]; const tutti = [persona("v", { verificato: true }), persona("n", { verificato: false })];
  assert.deepEqual(ids(schede(tutti, { criteri: verificato })), ["v"], "chi non ha il reddito verificato è escluso se il proprietario lo vuole"); const preferito = [{ chiave: "profiloVerificato", peso: 8, modo: "preferenziale" }];
  const s = schede(tutti, { criteri: preferito }); assert.deepEqual(ids(s), ["v", "n"]); assert.ok(s[0].compatibilita > s[1].compatibilita, "chi ha il reddito verificato è più adatto");
});

test("schede: l'ordine è compatibilità, poi il badge «raccomandato», poi l'affidabilità", () => {
  const rec = (a, b) => [{ voto: 5, autore_id: a, created_at: "2026-09-01T00:00:00Z" }, { voto: 5, autore_id: b, created_at: "2026-09-01T00:00:00Z" }];
  const tutti = [persona("basso", { protestato: true }), persona("badge", { recensioni: rec("o1", "o2"), garante: null }), persona("alto", { verificato: true, garante: true })];
  const s = schede(tutti); assert.deepEqual(ids(s), ["badge", "alto", "basso"], "senza criteri la compatibilità è la stessa: prima il badge, poi l'affidabilità"); assert.equal(s[0].raccomandato, true); assert.equal(s[1].raccomandato, false);
  assert.deepEqual(ids(schede([persona("b2", { verificato: true }), persona("b1", { verificato: true, garante: true })])), ["b1", "b2"], "a parità di tutto, l'affidabilità più alta");
});

test("COSA VEDE IL PROPRIETARIO: solo nome e iniziale, lavoro, foto, estratto, affidabilità, badge, recensioni, reddito verificato sì/no, compatibilità; NIENTE reddito, contatti, cognome intero, identificativi interni oltre a quello per scrivere", () => {
  const p = persona("a", { nome: "Anna", cognome: "Verdi", reddito_mensile: 4321, reddito_nucleo: 8765, protestato: true, garante: true, avatarUrl: "https://x/f.jpg", presentazione: "x ".repeat(200), verificato: true });
  const [s] = schede([p]); assert.deepEqual(Object.keys(s).sort(), ["affidabilita", "avatarUrl", "compatibilita", "etichettaAffidabilita", "nome", "presentazione", "professione", "protestiVerificati", "raccomandato", "recensioni", "redditoVerificato", "tenantId"]);
  const json = JSON.stringify(s); for (const vietato of ["4321", "8765", "Verdi", "reddito_mensile", "reddito_nucleo", "email", "telefono", "protestato", "cognome"]) assert.ok(!json.includes(vietato), `una scheda contiene «${vietato}»`); assert.equal(s.nome, "Anna V."); assert.equal(s.redditoVerificato, true); assert.ok(s.presentazione.length <= 161);
});

test("schede: le recensioni e il badge si calcolano come altrove (stelle e proprietari diversi); dati rotti si ignorano; gli input non si modificano", () => {
  const recs = [{ voto: 5, autore_id: "o1", created_at: "2026-09-01T00:00:00Z" }, { voto: 4, autore_id: "o2", created_at: "2026-09-01T00:00:00Z" }, { voto: 1, autore_id: "o3", created_at: "2000-01-01T00:00:00Z" }];
  const d = [persona("a", { recensioni: recs }), null, undefined, 5, { tenantId: 7 }, persona("b", { recensioni: [{ voto: 5, autore_id: "o1" }, { voto: 5, autore_id: "o1" }] })]; const copia = JSON.stringify(d);
  const s = schede(d); assert.deepEqual(ids(s).sort(), ["a", "b"]); assert.equal(JSON.stringify(d), copia); const a = s.find((x) => x.tenantId === "a"), b = s.find((x) => x.tenantId === "b");
  assert.equal(a.raccomandato, true, "due proprietari diversi, la negativa è scaduta"); assert.deepEqual(a.recensioni, { numero: 3, media: 3.3 }); assert.equal(b.raccomandato, false, "lo stesso proprietario due volte");
});

// ============================================================ il codice rispetta il consenso e la minimizzazione
test("SICUREZZA: la chiave di servizio legge PRIMA solo i criteri di ricerca e il consenso; nome, lavoro e recensioni si leggono solo dopo, per chi ha dato il consenso e ha una ricerca in linea, e il consenso si ricontrolla sulla riga", () => {
  const s = senzaCommenti(leggi("src", "lib", "proprietario", "possibili-server.ts"));
  const prima = s.slice(s.indexOf("async function leggiRicerche"), s.indexOf("export async function possibiliPerAnnuncio")); const selezioni = [...prima.matchAll(/\.select\("([^"]+)"\)/g)].map((m) => m[1]).join(" ");
  assert.ok(selezioni.includes("visibile_ai_proprietari") && selezioni.includes("budget_max") && selezioni.includes("attributo_key")); for (const v of ["nome", "cognome", "professione", "reddito", "presentazione", "avatar", "protestato", "email", "recensioni"]) assert.ok(!selezioni.includes(v), `la prima lettura (di TUTTI) legge «${v}»`);
  assert.match(s, /const disponibili = ricerche\.filter\(\(r\) => r\.visibile\);/); assert.match(s, /for \(const a of annunci\) for \(const d of disponibili\) if \(!esclusi\.get\(a\.id\)\?\.has\(d\.tenantId\) && ricercaInLinea\(a\.annuncio, d\)\) daLeggere\.add\(d\.tenantId\);/);
  assert.match(s, /if \(!det \|\| det\.visibile_ai_proprietari !== true\) continue;/, "il consenso si ricontrolla sulla riga letta"); assert.match(s, /\.from\("profiles"\)\.select\("id, nome, cognome"\)\.in\("id", blocco\)/);
});

test("nessuna parte dell'app scrive le richieste a mano: si passa solo dalle due funzioni del database", () => {
  const trovati = []; const visita = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) visita(p); else if (/\.(ts|tsx)$/.test(e.name)) { const t = fs.readFileSync(p, "utf8"); if (/from\("richieste_proprietari"\)\s*\.(insert|update|delete|upsert)/.test(t)) trovati.push(path.relative(radice, p)); } } };
  visita(path.join(radice, "src")); assert.deepEqual(trovati, [], "scritture dirette: " + trovati.join(", "));
  const a = leggi("src", "app", "(app)", "database", "actions.ts"); assert.match(a, /supabase\.rpc\("invia_richiesta_proprietario", \{ p_listing: listingId, p_tenant: tenantId, p_messaggio: m\.valore \}\)/);
  const r = leggi("src", "app", "(app)", "candidature", "richieste-actions.ts"); assert.match(r, /supabase\.rpc\("rispondi_richiesta_proprietario", \{ p_richiesta: richiestaId, p_accetta: accetta \}\)/);
});

test("azioni: gli identificativi si controllano PRIMA di chiamare il database, il messaggio pure, e dopo il successo si aggiornano le pagine giuste", () => {
  const a = leggi("src", "app", "(app)", "database", "actions.ts"); const f = a.slice(a.indexOf("export async function faiMatch"));
  assert.match(f, /if \(!eUuid\(listingId\) \|\| !eUuid\(tenantId\)\) return/); assert.match(f, /const m = messaggioPulito\(messaggio \?\? null\);\s+if \(!m\.ok\)/); assert.ok(f.indexOf("eUuid(") < f.indexOf("createClient()") && f.indexOf("messaggioPulito(") < f.indexOf("supabase.rpc("), "i controlli vengono prima"); assert.match(f, /revalidatePath\("\/database"\);\s+revalidatePath\("\/"\);/);
  const r = leggi("src", "app", "(app)", "candidature", "richieste-actions.ts"); assert.match(r, /if \(!eUuid\(richiestaId\) \|\| typeof accetta !== "boolean"\)/); assert.match(r, /revalidatePath\("\/candidature"\);\s+revalidatePath\("\/messaggi"\);/); assert.match(r, /if \(typeof visibile !== "boolean"\) return/);
  assert.match(r, /\.update\(\{ visibile_ai_proprietari: visibile, visibile_dal: visibile \? new Date\(\)\.toISOString\(\) : null \}\)\s+\.eq\("profile_id", user\.id\)/, "si cambia solo il proprio consenso");
});

const migrazione33 = leggi("supabase", "migrations", "0033_visibile_di_default.sql");

test("di partenza si è VISIBILI ai proprietari (dalla 0033, anche per chi era già iscritto); si può nascondere subito; lato server si mostra solo chi ha un «sì» esplicito", () => {
  assert.match(migrazione33, /alter column visibile_ai_proprietari set default true;/); assert.match(migrazione33, /alter column visibile_dal set default now\(\);/); assert.match(migrazione33, /update tenant_profiles\s+set visibile_ai_proprietari = true,\s+visibile_dal = coalesce\(visibile_dal, now\(\)\)\s+where visibile_ai_proprietari is not true;/);
  assert.match(leggi("src", "lib", "types.ts"), /visibile_ai_proprietari\?: boolean;/);
  // la schermata: solo un «no» esplicito vuol dire «nascosto»; se non si sa, si è visibili come di partenza
  assert.match(leggi("src", "app", "(app)", "candidature", "page.tsx"), /visibile=\{profilo\?\.visibile_ai_proprietari !== false\}/); assert.match(leggi("src", "app", "(app)", "candidature", "CandidatureClient.tsx"), /visibile = true,/);
  assert.match(leggi("src", "app", "(app)", "profilo", "ProfiloClient.tsx"), /visibileProprietariIniziale=\{tenant\.visibile_ai_proprietari !== false\}/); assert.ok(!/visibileProprietariIniziale/.test(leggi("src", "app", "(app)", "profilo", "OwnerProfiloClient.tsx")), "il proprietario non ha questa scelta");
  const p = leggi("src", "components", "PrivacySheet.tsx"); assert.match(p, /visibileProprietariIniziale\?: boolean;/); assert.match(p, /useState\(visibileProprietariIniziale === true\)/); assert.match(p, /\{visibileProprietariIniziale !== undefined && \(\s+<Field label="Fatti trovare dai proprietari">/); assert.match(p, /const r = await impostaVisibilita\(nuova\);/); assert.ok(p.includes("Di partenza i proprietari con una casa adatta alla tua ricerca possono vedere il tuo profilo") && p.includes("Con «No» non ti vedono più. Si salva subito."));
  // il server: chi ESPONE guarda il database, e lo fa con un «sì» esplicito (se la riga non si legge, non si mostra niente)
  const srv = senzaCommenti(leggi("src", "lib", "proprietario", "possibili-server.ts")); assert.match(srv, /visibile: t\.visibile_ai_proprietari === true,/); assert.match(srv, /det\.visibile_ai_proprietari !== true\) continue;/);
  const t = JSON.stringify(inf.INFORMATIVA); assert.ok(t.includes("È così per ogni iscritto, ma puoi nasconderti quando vuoi da Privacy e consensi: da quel momento non compari più")); assert.ok(t.includes("Non vedono il reddito né i contatti")); assert.ok(t.includes(`al massimo ${{ 20: "venti" }[rq.RICHIESTE_AL_GIORNO]} al giorno`)); assert.ok(!t.includes("è spento finché non lo accendi tu"), "l'informativa dice ancora che è spento");
});

test("iscrizione: chi si registra come inquilino legge, prima di creare l'account, che il suo profilo sarà visibile ai proprietari e che può nasconderlo; il proprietario no", () => {
  const l = leggi("src", "app", "login", "page.tsx"); assert.match(l, /\{ruolo === "inquilino" && \(\s+<p className="login-consent"[^>]*>\s+Il tuo profilo sarà visibile ai proprietari con una casa adatta alla tua ricerca: vedono nome e iniziale, lavoro, foto e affidabilità, non il\s+reddito né i contatti\. Puoi nasconderti quando vuoi dal Profilo\.\s+<\/p>\s+\)\}/);
  assert.ok(l.indexOf("Il tuo profilo sarà visibile ai proprietari") < l.indexOf("Crea il tuo account"), "la frase sta prima del pulsante");
});

test("NESSUNA schermata chiede più di «rendersi disponibili»: la parola non compare in nessun file dell'app", () => {
  const trovati = []; const visita = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) visita(p); else if (/\.(ts|tsx)$/.test(e.name) && /Mi rendo disponibile|rendersi disponibil|ti rendi disponibile/i.test(fs.readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""))) trovati.push(path.relative(radice, p)); } };
  visita(path.join(radice, "src")); assert.deepEqual(trovati, [], "ci sono ancora richieste di rendersi disponibili: " + trovati.join(", "));
});

// ============================================================ le schermate
test("Database (proprietario): «Fai match» NON invia subito: apre una conferma con le parole giuste, e solo «Sì, invia la richiesta» chiama il server", () => {
  const c = senzaCommenti(leggi("src", "components", "PossibiliMatch.tsx"));
  assert.match(c, /onClick=\{\(\) => setScelta\(s\)\}>\s+Fai match/); assert.equal([...c.matchAll(/faiMatch\(/g)].length, 1, "faiMatch si chiama in un solo punto"); assert.ok(c.indexOf("faiMatch(") > c.indexOf("function invia()") && c.indexOf("faiMatch(") < c.indexOf("function invia()") + 400, "solo dentro «invia»");
  for (const x of ["Fai match con ${scelta.nome}?", "Le arriverà una richiesta per", "Se non risponde o dice di no, non succede\n              niente", "Sì, invia la richiesta", "No, torna indietro", "Vuoi aggiungere due parole? (facoltativo)"]) assert.ok(c.includes(x) || c.replace(/\s+/g, " ").includes(x.replace(/\s+/g, " ")), `manca «${x}»`);
  for (const x of ["Hanno scelto di non farsi trovare dai proprietari: se una di loro si candida, la trovi tra le candidature.", "Puoi contattare questa persona:", "Puoi contattare ${disponibili.length} di queste persone:", "Sono persone iscritte che cercano una casa adatta alla tua."]) assert.ok(c.replace(/\s+/g, " ").includes(x), `manca la frase «${x}»`);
  for (const vecchia of ["si è ancora reso disponibile", "si sono rese disponibili", "si è resa disponibile", "Vedi solo chi ha scelto di farsi trovare"]) assert.ok(!c.includes(vecchia), `c'è ancora la frase vecchia «${vecchia}»`);
  assert.match(c, /className="ob-textarea"/, "il campo del messaggio deve usare la classe che esiste (con bordo e sfondo)"); assert.ok(!/textarea-base/.test(c)); assert.match(leggi("src", "app", "globals.css"), /\.ob-textarea \{/, "la classe del campo di testo deve esistere nel CSS");
  assert.match(c, /maxLength=\{MESSAGGIO_RICHIESTA_MAX\}/); assert.match(c, /\{messaggio\.length\}\/\{MESSAGGIO_RICHIESTA_MAX\}/);
});

test("Database (proprietario): la scheda non mostra reddito né contatti; mostra il badge, l'affidabilità, il match e le recensioni; un rifiuto non dice chi è", () => {
  const sch = senzaCommenti(leggi("src", "components", "SchedaPersona.tsx")); const c = senzaCommenti(leggi("src", "components", "PossibiliMatch.tsx"));
  for (const vietato of ["reddito_mensile", "reddito_nucleo", "email", "telefono", "cognome", "protestato"]) { assert.ok(!sch.includes(vietato), `la scheda usa «${vietato}»`); assert.ok(!c.includes(vietato), `i possibili match usano «${vietato}»`); }
  for (const x of ["<BadgeRaccomandato />", "Reddito verificato", "Affidabilità", "Match", "testoRecensioni(dati.recensioni)"]) assert.ok(sch.includes(x), `manca «${x}»`);
  assert.match(c, /\{rifiutate === 1 \? "1 persona non ha accettato" : `\$\{rifiutate\} persone non hanno accettato`\}/); const s2 = senzaCommenti(leggi("src", "lib", "proprietario", "possibili-server.ts")); assert.match(s2, /nome: r\.stato === "inviata" \? nomiRichieste\.get\(r\.id as string\) \?\? null : null,/);
});

test("«I tuoi match» (inquilino): una nota dice cosa vedono i proprietari e come nascondersi, chi si è nascosto può tornare visibile, si risponde con «Sì, mi interessa» / «No, grazie», accettando si apre la chat; il numero sulla scheda e sulla barra conta solo le richieste in attesa", () => {
  const c = senzaCommenti(leggi("src", "components", "RichiesteProprietari.tsx")); for (const x of ["non il reddito né i contatti", "Per non farti trovare: Profilo › Privacy e consensi", "Ti sei nascosto ai proprietari", "Torna visibile", "Sì, mi interessa", "No, grazie", "È un match!", "Apri la chat", "Nessuna richiesta per ora", "Finché sei nascosto nessun proprietario può scriverti"]) assert.ok(c.replace(/\s+/g, " ").includes(x), `manca «${x}»`);
  for (const x of ["Mi rendo disponibile", "Non voglio più essere trovato"]) assert.ok(!c.includes(x), `c'è ancora «${x}»`);
  assert.match(c, /\{vis \? \(\s+<p className="richieste-nota">/, "chi è visibile vede solo la nota"); assert.match(c, /onClick=\{\(\) => cambiaVisibilita\(true\)\}/, "chi si è nascosto può solo TORNARE visibile da qui");
  const l = leggi("src", "app", "(app)", "layout.tsx"); assert.match(l, /ruolo === "inquilino"\s+\? await supabase\.from\("richieste_proprietari"\)\.select\("id", \{ count: "exact", head: true \}\)\.eq\("stato", "inviata"\)\s+: \{ count: 0 \}/); assert.match(leggi("src", "components", "Navigation.tsx"), /"\/candidature": \{ etichetta: etichettaConteggio\(richiesteInAttesa\), descrizione: "richieste dei proprietari a cui rispondere" \}/);
  assert.match(leggi("src", "app", "(app)", "candidature", "CandidatureClient.tsx"), /\{s\.id === "richieste" && nRichieste > 0 && <span className="conteggio da-leggere">\{nRichieste\}<\/span>\}/);
});

test("«I tuoi match»: la scheda da aprire si legge dall'indirizzo (?scheda=richieste) e qualunque altro valore apre le candidature; la notifica porta lì", () => {
  assert.equal(cand.schedaMatchDaParametro("richieste"), "richieste"); assert.equal(cand.schedaMatchDaParametro(["richieste", "x"]), "richieste"); for (const x of ["candidature", "", "RICHIESTE", "x", null, undefined, 5, {}, []]) assert.equal(cand.schedaMatchDaParametro(x), "candidature", String(x));
  assert.equal(nt.linkNotifica({ tipo: "richiesta_ricevuta", link: "/candidature" }), "/candidature?scheda=richieste"); assert.equal(nt.linkNotifica({ tipo: "candidatura_rifiutata", link: "/candidature" }), "/candidature", "le altre notifiche delle candidature non cambiano"); assert.equal(nt.linkNotifica({ tipo: "richiesta_accettata", link: "/chat/c1" }), "/chat/c1");
  assert.equal(nt.linkNotifica({ tipo: "richiesta_ricevuta", link: "//evil.example" }), "/", "il link resta dentro il sito");
});

test("notifiche: i due tipi nuovi hanno parole per chi legge, con il nome e la casa; un nome o un titolo che manca non rompe niente", () => {
  assert.ok(nt.TIPI_NOTIFICA.includes("richiesta_ricevuta") && nt.TIPI_NOTIFICA.includes("richiesta_accettata"));
  const a = nt.descriviNotifica("richiesta_ricevuta", { nome: "Mario", titolo: "Bilocale" }); assert.equal(a.titolo, "Un proprietario vuole conoscerti"); assert.equal(a.testo, "Mario ha scelto il tuo profilo per «Bilocale». Se ti interessa, rispondi da «I tuoi match».");
  assert.match(nt.descriviNotifica("richiesta_ricevuta", null).testo, /^Un proprietario ha scelto il tuo profilo per la sua casa\./); assert.match(nt.descriviNotifica("richiesta_ricevuta", { nome: 5 }).testo, /^Un proprietario/);
  const b = nt.descriviNotifica("richiesta_accettata", { titolo: "Bilocale" }); assert.equal(b.titolo, "Hai un nuovo match"); assert.match(b.testo, /ora potete scrivervi in chat\.$/); assert.match(nt.descriviNotifica("richiesta_accettata", null).testo, /la tua casa/);
});

test("una candidatura nata da una richiesta si riconosce («Ti ha scelto il proprietario») e resta un match come gli altri", () => {
  const c = leggi("src", "app", "(app)", "candidature", "CandidatureClient.tsx"); assert.match(c, /\{c\.origine === "proprietario" && <div className="mc-origine">Ti ha scelto il proprietario<\/div>\}/); assert.match(leggi("src", "app", "(app)", "candidature", "page.tsx"), /\.select\("id, status, match_pct, motivo_rifiuto, origine, created_at, listings\(titolo, zona, prezzo, locali, mq\)"\)/);
  assert.match(leggi("src", "lib", "types.ts"), /origine\?: "inquilino" \| "proprietario";/);
});

test("stile del proprietario: i pulsanti «Fai match» e di conferma sono grandi (almeno 56 px), e i testi delle schede sono da 15 px in su", () => {
  const css = leggi("src", "app", "globals.css"); const h = (c) => Number((css.match(new RegExp(`${c.replace(/\./g, "\\.")} \\{[^}]*min-height:\\s*(\\d+)px`)) ?? [])[1]); assert.ok(h(".persona-primario") >= 56 && h(".persona-secondario") >= 52 && h(".possibili-conferma .opp-cta") >= 56, `${h(".persona-primario")}, ${h(".persona-secondario")}, ${h(".possibili-conferma .opp-cta")}`);
  assert.match(css, /\.persona-etichette \.badge-raccomandato \{[^}]*font-size: 15px;/, "il badge nelle schede è piccolo: per il proprietario deve essere da 15 px"); assert.ok(!/<BadgeRaccomandato compatto/.test(leggi("src", "components", "SchedaPersona.tsx")) && !/<BadgeRaccomandato compatto/.test(leggi("src", "components", "PossibiliMatch.tsx")), "nelle schede non si usa la versione compatta (11 px)");
  const blocco = css.slice(css.indexOf("/* ---- Database: le case, le schede delle persone e le richieste ---- */")); const misure = [...blocco.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])); assert.ok(misure.length >= 10 && Math.min(...misure) >= 15, `caratteri: ${Math.min(...misure)} px`);
});
