/**
 * Test del PERCORSO DI BENVENUTO dopo l'iscrizione (migrazione 0039 + app) e della conferma password.
 *  - dopo l'iscrizione si compilano i dati che servono, una scheda alla volta (inquilino: chi è, reddito e famiglia, garanzie e protesti, ricerca, documenti;
 *    proprietario: documenti, la sua casa, la prova di proprietà); le schede essenziali sono obbligatorie e non si saltano nemmeno cambiando l'indirizzo;
 *  - chi era già iscritto non lo rifà; chi non l'ha completato non entra nell'app; il segno lo cambia solo il database, e solo con i dati essenziali.
 * Le regole vere le prova test-db-richieste.mjs su un PostgreSQL vero. Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const bw = caricaTs(path.join(radice, "src", "lib", "benvenuto.ts"));
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const sql = leggi("supabase", "migrations", "0039_benvenuto.sql"); const sqlPulito = sql.replace(/--[^\n]*/g, "");

const inq = (o = {}) => ({ professione: null, redditoMensile: null, protestato: null, budgetMax: null, documenti: [], ...o });
const prop = (o = {}) => ({ nImmobili: 0, haIdentita: false, haProva: false, ...o });

// ============================================================ la logica pura
test("schede dell'inquilino: la spiegazione e poi cinque, nell'ordine; obbligatorie solo quelle dei dati essenziali (lavoro, protesti, budget); ognuna è completa quando i suoi dati ci sono", () => {
  const p = bw.passiInquilino(inq());
  assert.deepEqual(p.map((x) => x.id), ["intro", "persona", "reddito", "garanzie", "ricerca", "documenti"]); assert.deepEqual(p.map((x) => x.titolo), ["Come funziona", "Chi sei", "Reddito e famiglia", "Garanzie e protesti", "La tua ricerca", "I tuoi documenti"]);
  assert.deepEqual(p.map((x) => x.obbligatorio), [false, true, false, true, true, false]); assert.ok(p.every((x) => x.completo === false), "all'inizio nessuna è completa");
  const c = (o) => Object.fromEntries(bw.passiInquilino(inq(o)).map((x) => [x.id, x.completo]));
  assert.equal(c({ professione: "Studente" }).persona, true); assert.equal(c({}).intro, false, "chi non ha cominciato vede la spiegazione"); assert.equal(c({ professione: "Studente" }).intro, true, "chi ha già cominciato non la rivede ogni volta che rientra"); assert.equal(c({ professione: "   " }).persona, false); assert.equal(c({ professione: "" }).persona, false);
  assert.equal(c({ redditoMensile: 1800 }).reddito, true); assert.equal(c({ redditoMensile: 0 }).reddito, false);
  assert.equal(c({ protestato: false }).garanzie, true); assert.equal(c({ protestato: true }).garanzie, true, "anche «sì» è una risposta"); assert.equal(c({ protestato: null }).garanzie, false);
  assert.equal(c({ budgetMax: 1200 }).ricerca, true); for (const b of [0, -5, null, NaN]) assert.equal(c({ budgetMax: b }).ricerca, false, String(b));
  assert.equal(c({ documenti: ["identita"] }).documenti, true); assert.equal(c({ documenti: ["reddito", "protesti"] }).documenti, false, "senza identità non è completa");
});

test("schede del proprietario: la spiegazione e poi tre, nell'ordine; obbligatoria solo «La tua casa» (almeno un immobile); documenti e prova di proprietà si possono fare dopo", () => {
  const p = bw.passiProprietario(prop());
  assert.deepEqual(p.map((x) => x.id), ["intro", "identita", "casa", "prova"]); assert.deepEqual(p.map((x) => x.titolo), ["Come funziona", "I tuoi documenti", "La tua casa", "Prova di proprietà"]); assert.deepEqual(p.map((x) => x.obbligatorio), [false, false, true, false]);
  const c = (o) => Object.fromEntries(bw.passiProprietario(prop(o)).map((x) => [x.id, x.completo]));
  assert.deepEqual(c({}), { intro: false, identita: false, casa: false, prova: false }); assert.deepEqual(c({ nImmobili: 1, haIdentita: true, haProva: true }), { intro: true, identita: true, casa: true, prova: true }); assert.equal(c({ haIdentita: true }).intro, true, "chi ha caricato l'identità ha già cominciato"); assert.equal(c({ nImmobili: 3 }).casa, true);
});

test("COERENZA CON IL DATABASE: le schede obbligatorie sono esattamente i dati che completa_onboarding pretende (inquilino: lavoro, protesti, budget; proprietario: un immobile)", () => {
  const f = sqlPulito.slice(sqlPulito.indexOf("create or replace function public.completa_onboarding"));
  assert.match(f, /t\.professione is null or btrim\(t\.professione\) = ''/); assert.match(f, /t\.protestato is null/); assert.match(f, /t\.budget_max is null or t\.budget_max <= 0/); assert.match(f, /not exists \(select 1 from listings where owner_id = auth\.uid\(\)\)/);
  const obbl = (passi) => passi.filter((x) => x.obbligatorio).map((x) => x.id);
  assert.deepEqual(obbl(bw.passiInquilino(inq())), ["persona", "garanzie", "ricerca"]); assert.deepEqual(obbl(bw.passiProprietario(prop())), ["casa"]);
  // una persona con TUTTE le schede obbligatorie complete è esattamente una che il database lascia completare, e viceversa
  assert.equal(bw.puoFinire(bw.passiInquilino(inq({ professione: "Studente", protestato: false, budgetMax: 800 }))), true); for (const manca of [{ professione: null }, { protestato: null }, { budgetMax: null }]) assert.equal(bw.puoFinire(bw.passiInquilino(inq({ professione: "Studente", protestato: false, budgetMax: 800, ...manca }))), false, JSON.stringify(manca));
  assert.equal(bw.puoFinire(bw.passiProprietario(prop({ nImmobili: 1 }))), true); assert.equal(bw.puoFinire(bw.passiProprietario(prop({ haIdentita: true, haProva: true }))), false, "senza casa non si finisce, anche con i documenti");
});

test("non si salta avanti: il limite è la prima scheda obbligatoria non completa (o l'ultima se sono tutte a posto)", () => {
  const l = (o) => bw.limitePasso(bw.passiInquilino(inq(o)));
  assert.equal(l({}), 1, "all'inizio si arriva a «Chi sei» (la spiegazione è facoltativa)"); assert.equal(l({ professione: "Studente" }), 3, "lavoro fatto: si arriva alle garanzie (la scheda del reddito è facoltativa)"); assert.equal(l({ professione: "Studente", protestato: false }), 4); assert.equal(l({ professione: "Studente", protestato: false, budgetMax: 800 }), 5);
  assert.equal(bw.limitePasso(bw.passiProprietario(prop())), 2); assert.equal(bw.limitePasso(bw.passiProprietario(prop({ nImmobili: 1 }))), 3);
});

test("la scheda da mostrare: quella chiesta dall'indirizzo (da 1) se ci si può arrivare, altrimenti il limite; senza richiesta la prima non completa; richieste strane ignorate", () => {
  const pr = (o) => bw.passiInquilino(inq(o)); const m = (passi, r) => bw.passoDaMostrare(passi, r);
  assert.equal(m(pr({}), undefined), 0, "chi è nuovo comincia dalla spiegazione"); assert.equal(m(pr({}), "1"), 0); assert.equal(m(pr({}), "2"), 1); assert.equal(m(pr({}), "4"), 1, "oltre il limite torna al limite");
  const quasi = pr({ professione: "Studente", protestato: false }); assert.equal(m(quasi, "1"), 0, "si può tornare indietro"); assert.equal(m(quasi, "2"), 1); assert.equal(m(quasi, "4"), 3); assert.equal(m(quasi, "5"), 4); assert.equal(m(quasi, "6"), 4, "la ricerca è obbligatoria: non si va ai documenti");
  assert.equal(m(quasi, undefined), 2, "senza richiesta: la prima non completa (il reddito, facoltativo ma non fatto: la spiegazione e «Chi sei» sono già a posto)");
  const tutto = pr({ professione: "Studente", redditoMensile: 1000, protestato: false, budgetMax: 800, documenti: ["identita"] }); assert.equal(m(tutto, undefined), 5, "tutto fatto: l'ultima"); assert.equal(m(tutto, "6"), 5);
  for (const r of ["0", "-1", "abc", "2.5", "", " 2", "99", null, undefined, 3, {}, []]) assert.ok(m(quasi, r) >= 0 && m(quasi, r) <= 4, String(JSON.stringify(r)));
  assert.equal(m(quasi, "0"), 2, "«0» non è una scheda: si ignora"); assert.equal(m(quasi, "99"), 2);
});

test("avanti, fine, indirizzi e barra: solo le schede facoltative o già salvate si superano; si finisce solo con le obbligatorie a posto; i passi si contano da 1", () => {
  const [, persona, reddito] = bw.passiInquilino(inq({ redditoMensile: null })); const intro = bw.passiInquilino(inq())[0]; assert.equal(bw.puoAndareAvanti(intro), true, "la spiegazione si supera sempre"); assert.equal(intro.azione, "Ho capito, cominciamo"); assert.equal(bw.puoAndareAvanti(persona), false); assert.equal(bw.puoAndareAvanti({ ...persona, completo: true }), true); assert.equal(bw.puoAndareAvanti(reddito), true, "facoltativa: sempre");
  assert.equal(bw.puoFinire(bw.passiInquilino(inq())), false);
  assert.equal(bw.indirizzoPasso(0), "/benvenuto?passo=1"); assert.equal(bw.indirizzoPasso(4), "/benvenuto?passo=5"); assert.equal(bw.testoProgresso(0, 5), "Passo 1 di 5"); assert.equal(bw.testoProgresso(4, 5), "Passo 5 di 5");
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => bw.percentualeProgresso(i, 5)), [20, 40, 60, 80, 100]); assert.equal(bw.percentualeProgresso(0, 0), 0);
  assert.equal(bw.TESTI_BENVENUTO.saluto("Anna"), "Benvenuto, Anna"); assert.equal(bw.TESTI_BENVENUTO.saluto("  Anna  "), "Benvenuto, Anna"); for (const n of [null, "", "   "]) assert.equal(bw.TESTI_BENVENUTO.saluto(n), "Benvenuto");
});

test("errori: ogni codice del database ha le sue parole in italiano, senza il codice; ciò che non si riconosce resta generico", () => {
  const f = sqlPulito.slice(sqlPulito.indexOf("create or replace function public.completa_onboarding")); const codici = [...new Set([...f.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]))].sort();
  assert.deepEqual(codici, ["NON_AUTENTICATO", "ONBOARDING_BUDGET_MANCANTE", "ONBOARDING_LAVORO_MANCANTE", "ONBOARDING_NESSUN_IMMOBILE", "PROFILO_INESISTENTE", "PROTESTI_NON_DICHIARATI"]);
  for (const c of codici.filter((x) => x !== "PROFILO_INESISTENTE")) { const m = bw.messaggioErroreBenvenuto(`ERROR: ${c} (P0001)`); assert.ok(m.length > 20 && !m.includes(c), `${c}: «${m}»`); assert.notEqual(m, "Non sono riuscito a completare. Riprova.", `${c} non ha parole sue`); }
  assert.match(bw.messaggioErroreBenvenuto("ONBOARDING_BUDGET_MANCANTE"), /«La tua ricerca»/); assert.match(bw.messaggioErroreBenvenuto("ONBOARDING_NESSUN_IMMOBILE"), /«La tua casa»/);
  for (const x of [null, undefined, 5, {}, "boh", "JWT expired"]) assert.equal(bw.messaggioErroreBenvenuto(x), "Non sono riuscito a completare. Riprova.", JSON.stringify(x));
});

// ============================================================ l'accesso: pagina e controllo nell'app
const pagina = senzaCommenti(leggi("src", "app", "benvenuto", "page.tsx"));
test("pagina di benvenuto: serve l'accesso e l'informativa PRIMA; chi l'ha già completato (o se il segno non si legge) torna nell'app; i dati si leggono per ruolo", () => {
  const i = (x) => pagina.indexOf(x); assert.match(pagina, /if \(!user\) redirect\("\/login"\);/); assert.match(pagina, /if \(!\(await haAccettatoInformativa\(supabase, user\.id, versioniAccettabili\(INFORMATIVA\)\)\)\) redirect\("\/informativa\/accetta"\);/);
  assert.match(pagina, /if \(!profilo \|\| profilo\.onboarding_completato !== false\) redirect\("\/"\);/); assert.ok(i("redirect(\"/login\")") < i("redirect(\"/informativa/accetta\")") && i("redirect(\"/informativa/accetta\")") < i('redirect("/")'), "ordine: accesso, informativa, già fatto");
  assert.match(pagina, /if \(profilo\.ruolo === "proprietario"\) \{/); assert.match(pagina, /\.from\("listings"\)\s+\.select\("[^"]+"\)\s+\.eq\("owner_id", user\.id\)\s+\.order\("created_at", \{ ascending: true \}\)/, "solo le case di QUESTO proprietario"); assert.match(pagina, /\.from\("documenti_verifica"\)\.select\("[^"]+"\)\.eq\("owner_id", user\.id\)/, "e solo i suoi documenti"); assert.match(pagina, /from\("documenti_inquilino"\)[\s\S]*?\.eq\("tenant_id", user\.id\)/);
  assert.match(pagina, /indice=\{passoDaMostrare\(passi, richiesto\)\}/); assert.equal([...pagina.matchAll(/indice=\{passoDaMostrare\(passi, richiesto\)\}/g)].length, 2, "per entrambi i ruoli"); assert.match(pagina, /const \{ passo: richiesto \} = await searchParams;/);
});

test("pagina di benvenuto: i passi si calcolano dai dati SALVATI sul server (non dal browser), con le stesse regole del database", () => {
  assert.match(pagina, /passiInquilino\(\{\s+professione: t\.professione,\s+redditoMensile: t\.reddito_mensile,\s+protestato: t\.protestato,\s+budgetMax: t\.budget_max,\s+documenti: documenti\.map\(\(d\) => d\.tipo\),\s+\}\)/);
  assert.match(pagina, /passiProprietario\(\{ nImmobili: \(case_ \?\? \[\]\)\.length, haIdentita: identita\.length > 0, haProva: proprieta\.length > 0 \}\)/); assert.match(pagina, /const proprieta = prima \? documentiProprieta\(documenti, prima\.id as string\) : \[\];/);
  assert.match(pagina, /dati=\{\{ professione: t\.professione, reddito_mensile: t\.reddito_mensile \}\}/); assert.match(pagina, /protesti_verifica_stato \?\? "non_avviata"/);
});

test("controllo nell'app: chi non ha completato il benvenuto viene mandato lì DOPO l'informativa e PRIMA di caricare il resto; se il segno non si legge si entra", () => {
  const l = senzaCommenti(leggi("src", "app", "(app)", "layout.tsx")); assert.match(l, /const \{ data: benvenuto \} = await supabase\.from\("profiles"\)\.select\("onboarding_completato"\)\.eq\("id", user!\.id\)\.single\(\);\s+if \(benvenuto && benvenuto\.onboarding_completato === false\) \{\s+redirect\("\/benvenuto"\);\s+\}/);
  assert.ok(l.indexOf("haAccettatoInformativa") < l.indexOf('redirect("/benvenuto")') && l.indexOf('redirect("/benvenuto")') < l.indexOf('.select("ruolo, nome")'), "ordine: informativa, benvenuto, resto"); assert.ok(!/onboarding_completato/.test(l.slice(l.indexOf('.select("ruolo, nome")'))), "il segno non si mischia alla lettura del profilo (se manca la colonna il resto funziona)");
});

test("azione che completa: usa SOLO la funzione del database (non scrive il profilo), dice cosa manca in italiano, aggiorna l'app e porta alla Home", () => {
  const a = senzaCommenti(leggi("src", "app", "benvenuto", "actions.ts")); assert.match(a, /^"use server";/); assert.match(a, /export async function completaBenvenuto\(\): Promise<BenvenutoState> \{/); assert.match(a, /if \(!user\) return \{ error: messaggioErroreBenvenuto\("NON_AUTENTICATO"\) \};/);
  assert.match(a, /const \{ error \} = await supabase\.rpc\("completa_onboarding"\);\s+if \(error\) return \{ error: messaggioErroreBenvenuto\(error\.message\) \};\s+revalidatePath\("\/", "layout"\);\s+redirect\("\/"\);/); assert.ok(!/from\("profiles"\)/.test(a), "il segno non si scrive a mano");
});

// ============================================================ lo schermo a schede
const client = senzaCommenti(leggi("src", "app", "benvenuto", "BenvenutoClient.tsx"));
test("schermo del benvenuto: marchio, saluto, barra con il numero del passo, puntini, titolo e descrizione della scheda, se è obbligatoria o no; «Esci» sempre disponibile", () => {
  assert.match(client, /<div className="benvenuto-marchio">\s+Match<b>AmI<\/b>\s+<\/div>/); assert.match(client, /\{TESTI_BENVENUTO\.saluto\(p\.nome\)\}/); assert.match(client, /role="progressbar"\s+aria-valuemin=\{1\}\s+aria-valuemax=\{passi\.length\}\s+aria-valuenow=\{indice \+ 1\}/);
  assert.match(client, /width: `\$\{percentualeProgresso\(indice, passi\.length\)\}%`/); assert.match(client, /\{testoProgresso\(indice, passi\.length\)\}/); assert.match(client, /aria-current=\{i === indice \? "step" : undefined\}/);
  assert.match(client, /\{passo\.obbligatorio \? TESTI_BENVENUTO\.obbligatorio : TESTI_BENVENUTO\.facoltativo\}/); assert.match(client, /<form action=\{logout\} className="benvenuto-esci">/);
});

test("schermo del benvenuto: «Indietro» tranne alla prima; «Avanti» spento se la scheda è obbligatoria e non salvata (si chiama «Lo faccio dopo» se facoltativa e non fatta); all'ultima «Entra in MatchAmI», spento senza le obbligatorie", () => {
  assert.match(client, /\{indice > 0 && \(\s+<button type="button" className="richieste-secondario" onClick=\{\(\) => vai\(indice - 1\)\}>/); assert.match(client, /disabled=\{!puoAndareAvanti\(passo\)\} onClick=\{avanti\}>\s+\{passo\.azione \?\? \(passo\.completo \|\| passo\.obbligatorio \? TESTI_BENVENUTO\.avanti : TESTI_BENVENUTO\.saltaPerOra\)\}/);
  assert.match(client, /\{!ultimo \? \([\s\S]*?\) : \(\s+<form action=\{azioneFine\}>\s+<button type="submit" className="opp-cta" disabled=\{!puoFinire\(passi\) \|\| inCorso\}>/); assert.match(client, /const vai = \(i: number\) => router\.push\(indirizzoPasso\(i\)\);/);
  assert.match(client, /\{stato\?\.error && \(\s+<p className="note-error" role="alert">\s+\{stato\.error\}/);
});

test("schermo dell'INQUILINO: ogni scheda del modulo dei dati mostra la sua parte e passa alla successiva salvando; la ricerca apre la scheda della ricerca; i documenti usano i pannelli del reddito e dei protesti", () => {
  assert.match(client, /const SEZIONE_DATI: Record<string, SezioneDati> = \{ persona: "persona", reddito: "reddito", garanzie: "garanzie" \};/);
  assert.match(client, /<DatiForm key=\{passo\.id\} tenant=\{p\.tenant\} sezione=\{SEZIONE_DATI\[passo\.id\]\} etichettaSalva="Salva e continua" onSalvata=\{avanti\} \/>/);
  assert.match(client, /<RicercaSheet\s+open=\{ricercaAperta\}\s+onClose=\{\(\) => setRicercaAperta\(false\)\}\s+ricerca=\{p\.ricerca\}\s+luoghi=\{p\.luoghi\}\s+onSalvata=\{\(\) => \{\s+setRicercaAperta\(false\);\s+router\.refresh\(\);/);
  assert.match(client, /\{p\.verificaPanel\}[\s\S]*?\{p\.protestiPanel\}/); assert.match(client, /Ricerca impostata: fino a €\{p\.tenant\.budget_max\?\.toLocaleString\("it-IT"\)\} al mese\./);
});

test("schermo del PROPRIETARIO: l'identità si carica con il caricamento di sempre; la casa si aggiunge con il MODULO DELL'IMMOBILE di sempre (creaImmobile, con foto, luogo e tutti i dati) e poi si aggiorna la pagina; la prova di proprietà è quella della scheda dell'immobile", () => {
  assert.match(client, /if \(passo\.id === "identita"\) \{\s+return <CaricaIdentita nomiCaricati=\{p\.nomiIdentita\} \/>;/);
  assert.match(client, /return <ImmobileForm action=\{creaImmobile\} quotazioni=\{p\.quotazioni\} luoghi=\{p\.luoghi\} etichettaSalva="Salva e continua" onSaved=\{\(\) => router\.refresh\(\)\} \/>;/);
  assert.match(client, /Hai già aggiunto: <b>\{p\.immobile\.titolo\}<\/b>\. Potrai modificarla e aggiungere altre case dalla sezione «Immobili»\./); assert.match(client, /<VerificaImmobile key=\{p\.immobile\.id\} immobile=\{p\.immobile\} haIdentita=\{p\.haIdentita\} conIdentita \/>/);
  assert.match(client, /import \{ ImmobileForm \} from "@\/app\/\(app\)\/immobili\/ImmobiliClient";/); assert.match(senzaCommenti(leggi("src", "app", "(app)", "immobili", "ImmobiliClient.tsx")), /export function ImmobileForm\(\{[\s\S]*?etichettaSalva = "Salva",/);
  const ci = senzaCommenti(leggi("src", "components", "CaricaIdentita.tsx")); assert.match(ci, /onFile=\{\(f\) => carica\("identita", null, f, "identita"\)\}/);
});

// ============================================================ il modulo dei dati diviso in schede
const dati = senzaCommenti(leggi("src", "components", "DatiForm.tsx"));
test("modulo dei dati: ogni domanda sta nella sua scheda (persona, reddito, garanzie) e «tutto» le mostra tutte; i campi nascosti NON dipendono dalla scheda (salvarne una non cancella le altre)", () => {
  const pezzi = dati.split(/\{mostra\("(persona|reddito|garanzie)"\) && \(/); const per = { persona: "", reddito: "", garanzie: "" }; for (let i = 1; i < pezzi.length; i += 2) per[pezzi[i]] += pezzi[i + 1].slice(0, 1400);
  for (const x of ["La tua foto", "Situazione lavorativa", "Presentati ai proprietari"]) assert.ok(per.persona.includes(x), `persona: ${x}`); for (const x of ["Reddito netto mensile", "Nucleo familiare", "Figli a carico", "Persone con reddito nel nucleo", "Reddito netto mensile di tutto il nucleo", "Animali domestici"]) assert.ok(per.reddito.includes(x), `reddito: ${x}`);
  for (const x of ["Hai un garante", "Hai protesti", "fideiussione", 'id="dati-garante"', 'id="dati-protesti"']) assert.ok(per.garanzie.includes(x), `garanzie: ${x}`); assert.equal([...dati.matchAll(/\{mostra\("/g)].length, 12, "dodici blocchi, nessuno dimenticato");
  assert.match(dati, /const mostra = \(s: Exclude<SezioneDati, "tutto">\) => sezione === "tutto" \|\| sezione === s;/); assert.match(dati, /sezione = "tutto",/);
  for (const nome of ["professione", "reddito_mensile", "reddito_nucleo", "garante", "protestato", "fideiussione", "nucleo", "figli", "redditi_nucleo", "animali", "avatar_url"]) { const m = dati.match(new RegExp(`<input type="hidden" name="${nome}"|name="${nome}"\\s+value=`)); assert.ok(m, `manca il campo nascosto ${nome}`); assert.ok(dati.indexOf(m[0]) < dati.indexOf('{mostra("persona")'), `${nome} deve stare FUORI dalle schede`); }
  assert.match(dati, /\{!mostra\("persona"\) && <input type="hidden" name="presentazione" value=\{presentazione\} \/>\}/, "la presentazione, l'unica non nascosta di suo, si riscrive uguale");
});

test("modulo dei dati: le schede prima dei protesti salvano senza la risposta (campo «parziale») e la scheda «Chi sei» chiede il lavoro (campo «richiede_lavoro», pulsante spento, e il server lo ripete); «tutto» resta com'era", () => {
  assert.match(dati, /\{\(sezione === "persona" \|\| sezione === "reddito"\) && <input type="hidden" name="parziale" value="1" \/>\}/); assert.match(dati, /\{sezione === "persona" && <input type="hidden" name="richiede_lavoro" value="1" \/>\}/);
  assert.match(dati, /<SaveButton pending=\{pending\} etichetta=\{etichettaSalva\} disabled=\{sezione === "persona" && professione === ""\} \/>/); assert.match(dati, /\{state\?\.ok && sezione === "tutto" && <p className="note-saved">Salvato — puoi chiudere\.<\/p>\}/); assert.match(dati, /\{sezione === "tutto" && \(\s+<p className="sheet-sub">/);
  const a = senzaCommenti(leggi("src", "app", "(app)", "profilo", "actions.ts")); assert.match(a, /if \(formData\.get\("richiede_lavoro"\) === "1" && !professione\) return \{ error: "Scegli la tua situazione lavorativa\." \};/); assert.match(a, /if \(protestato === null && !parziale\) return \{ error: MESSAGGIO_PROTESTI_OBBLIGATORI \};/);
  assert.match(senzaCommenti(leggi("src", "components", "ui", "SaveButton.tsx")), /etichetta = "Salva"\s*\}: \{ pending: boolean; disabled\?: boolean; etichetta\?: string \}/); assert.ok(!/DatiForm[^>]*sezione/.test(senzaCommenti(leggi("src", "components", "DatiSheet.tsx"))), "la scheda «I tuoi dati» usa il modulo intero"); assert.match(senzaCommenti(leggi("src", "components", "ui", "SaveButton.tsx")), /\{pending \? "Salvataggio\.\.\." : etichetta\}/, "il testo del pulsante è quello passato");
});

// ============================================================ la conferma password (nel modulo di iscrizione) e lo stile
test("stile del benvenuto: schermata intera che scorre da sola, caratteri da 15 px in su, pulsanti alti 52 px, scheda come le altre (angoli 20, ombra standard)", () => {
  const css = leggi("src", "app", "globals.css"); const m = css.slice(css.indexOf("Il percorso di benvenuto (dopo l'iscrizione)")); const misure = [...m.matchAll(/font-size:\s*(\d+)px/g)].map((x) => Number(x[1])); assert.ok(misure.length >= 10 && Math.min(...misure) >= 15, `caratteri: ${Math.min(...misure)} px`);
  assert.match(m, /\.benvenuto \{\s+position: fixed;\s+inset: 0;\s+overflow-y: auto;/); assert.match(m, /\.benvenuto-azioni \.opp-cta,\s+\.benvenuto-azioni \.richieste-secondario,\s+\.benvenuto-azioni form \{\s+min-height: 52px;\s+font-size: 17px;/);
  assert.match(m, /\.benvenuto-scheda \{\s+padding: 18px 16px 20px;\s+border-radius: 20px;\s+background: #fff;\s+box-shadow: 0 8px 20px rgba\(16, 21, 26, 0\.06\);/); assert.match(m, /\.benvenuto > \*,\s+\.benvenuto-fianco > \*,\s+\.benvenuto-corpo > \* \{\s+max-width: 560px;/); assert.match(m, /\.benvenuto-fianco,\s+\.benvenuto-corpo \{\s+display: contents;/);
});

// ============================================================ la migrazione
test("migrazione 0039: riusa la colonna che c'era (non ne aggiunge), sistema chi era già iscritto SOLO alla prima esecuzione, protegge il segno, e la funzione è dell'utente (non dell'anonimo)", () => {
  assert.ok(!/alter table|add column/i.test(sqlPulito), "nessuna colonna nuova"); assert.match(sqlPulito, /if not exists \(select 1 from pg_proc where proname = 'completa_onboarding' and pronamespace = 'public'::regnamespace\) then\s+update profiles set onboarding_completato = true where onboarding_completato = false;/);
  assert.match(sqlPulito, /if new\.onboarding_completato is distinct from old\.onboarding_completato then\s+raise exception 'ONBOARDING_RISERVATO/); assert.match(sqlPulito, /if tg_op = 'INSERT' then\s+new\.onboarding_completato := false;/); assert.match(sqlPulito, /revoke all on function public\.completa_onboarding\(\) from public, anon;\s+grant execute on function public\.completa_onboarding\(\) to authenticated;/);
  assert.match(sqlPulito, /if not public\.is_staff\(\) then/); assert.ok(!/delete from|drop table|truncate|drop column/i.test(sqlPulito)); assert.match(sql, /Rieseguirla non lo rifà/);
  const prima = leggi("supabase", "migrations", "0001_init.sql"); assert.match(prima, /onboarding_completato boolean[^,\n]*default false/i, "la colonna esiste dal primo schema");
});

test("il DB test esegue anche le prove del benvenuto (20 controlli in due tempi) e non se ne perde nessuno", () => {
  const d = leggi("scripts", "db", "benvenuto-dopo.sql"); const n = [...d.matchAll(/select t\.(ok|fallisce)\(/g)].length; assert.ok(n >= 20, `controlli: ${n}`);
  for (const tema of ["B1 chi era già iscritto", "B3 l'inquilino non può segnarsi «completato» da solo", "B5 senza la situazione lavorativa", "B7 senza aver risposto sui protesti", "B8 senza un budget massimo", "B14 senza nessun immobile", "B15 l'immobile di un altro proprietario non conta", "B16 con un immobile suo", "B17 lo staff non ha dati da compilare", "B18 chi non ha fatto l'accesso", "B20 anche chi inserisce da sé il proprio profilo"]) assert.ok(d.replaceAll("''", "'").includes(tema), `manca «${tema}»`);
  assert.match(leggi("scripts", "db", "benvenuto-prima.sql"), /gli iscritti esistenti risultano tutti «non completato»/);
});

// ============================================================ la pagina «Come funziona», i testi sulla documentazione, l'importo a mano
const tt = caricaTs(path.join(radice, "src", "lib", "benvenuto-testi.ts"));
const af = caricaTs(path.join(radice, "src", "lib", "affidabilita.ts"));
const im = caricaTs(path.join(radice, "src", "lib", "importo.ts"));

test("«Come funziona»: ha i cinque blocchi (cos'è, match, affidabilità, documenti, cosa facciamo adesso) per tutti e due i ruoli, brevi ma completi", () => {
  for (const ruolo of ["inquilino", "proprietario"]) {
    const t = tt.testiIntro(ruolo); assert.deepEqual(t.blocchi.map((b) => b.id), ["cosa", "match", "affidabilita", "documenti", "adesso"], ruolo); assert.ok(!("sottotitolo" in t), "niente seconda frase sotto il titolo: la scheda ha già la sua descrizione");
    for (const b of t.blocchi) { assert.ok(b.titolo.length > 8, `${ruolo}/${b.id}: titolo`); assert.ok(b.paragrafi.length >= 1 && b.paragrafi.length <= 3, `${ruolo}/${b.id}: ${b.paragrafi.length} paragrafi`); for (const p of b.paragrafi) assert.ok(p.length >= 40 && p.length <= 380, `${ruolo}/${b.id}: paragrafo di ${p.length} caratteri («breve ma esaustivo»)`); }
    const parole = t.blocchi.flatMap((b) => [b.titolo, ...b.paragrafi]).join(" ").split(/\s+/).length; assert.ok(parole >= 150 && parole <= 420, `${ruolo}: ${parole} parole in tutto`);
    assert.match(t.blocchi[1].titolo, /^Match:/); assert.match(t.blocchi[2].titolo, /^Affidabilità:/);
  }
});

test("«Come funziona» spiega MATCH e AFFIDABILITÀ con i NUMERI VERI del punteggio (presi dalle stesse costanti): punti, massimo, fasce, badge; i numeri non sono scritti a mano", () => {
  for (const ruolo of ["inquilino", "proprietario"]) {
    const a = tt.testiIntro(ruolo).blocchi.find((b) => b.id === "affidabilita"); assert.ok(a.paragrafi[0].includes(`da 0 a ${af.PUNTEGGIO_MASSIMO}`), "il massimo viene dal punteggio"); assert.ok(a.paragrafi[0].includes("«Inquilino raccomandato»"), "il badge ha il suo nome");
    assert.deepEqual(a.voci.map((v) => [v.etichetta, v.valore, v.tono]), [["Reddito verificato dal nostro staff", `+${af.PUNTI_AFFIDABILITA.reddito}`, "piu"], ["Nessun protesto", `+${af.PUNTI_AFFIDABILITA.protesti}`, "piu"], ["Garante o fideiussione", `+${af.PUNTI_AFFIDABILITA.garanzia}`, "piu"], ["Protesti, o risposta non data", `−${af.PUNTI_AFFIDABILITA.protesti}`, "meno"]], ruolo);
    assert.deepEqual(a.fasce, af.fasceAffidabilita().map((f) => ({ etichetta: f.label, intervallo: `${f.da}-${f.a}` })), "le fasce sono quelle vere"); assert.deepEqual(a.fasce.map((f) => f.etichetta), ["Scarsa", "Buona", "Molto buona", "Eccellente"]);
  }
  assert.deepEqual(tt.fasceTesto().map((f) => f.intervallo), ["0-29", "30-59", "60-84", "85-100"]);
  const c = leggi("src", "lib", "benvenuto-testi.ts"); assert.ok(!/\b(50|30|20)\b(?!\))/.test(c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/\$\{[^}]*\}/g, "")), "nessun punteggio scritto a mano nei testi");
});

test("«Come funziona» dell'INQUILINO: match = quanto una casa va bene per lui (necessario/preferito); i documenti: dichiarato vale poco, verificato molto; con le sole dichiarazioni non si va oltre «Buona»; servono identità, prova del reddito, certificato dei protesti; li vede solo lo staff; «te li chiederemo alla fine»", () => {
  const t = tt.testiIntro("inquilino"); const testo = (id) => t.blocchi.find((b) => b.id === id).paragrafi.join(" ");
  assert.match(testo("match"), /quanto una casa somiglia a ciò che cerchi/); assert.match(testo("match"), /necessario \(se la casa non ce l'ha, non te la mostriamo\)/); assert.match(testo("match"), /preferito \(fa salire o scendere la percentuale\)/);
  assert.match(testo("documenti"), /Ciò che dichiari vale poco, ciò che il nostro staff verifica vale molto/); assert.match(testo("documenti"), /con le sole dichiarazioni non si va oltre «Buona»/); assert.match(testo("documenti"), /documento d'identità e una busta paga, la CU o la dichiarazione dei redditi/); assert.match(testo("documenti"), /certificato dei protesti/);
  assert.match(testo("documenti"), /li vede solo il nostro staff: ai proprietari arriva solo «verificato», sì o no/); assert.match(testo("documenti"), /Te li chiederemo alla fine di questi passaggi/); assert.match(testo("documenti"), /finché non lo fai il tuo punteggio resta basso/);
  assert.match(testo("adesso"), /5 schede, pochi minuti: chi sei, reddito e famiglia, garanzie e protesti, la tua ricerca e infine i documenti/); assert.equal(tt.SCHEDE_DOPO_INTRO.inquilino, bw.passiInquilino(inq()).length - 1, "il numero di schede detto è quello vero"); assert.match(testo("affidabilita"), /Non cambia la percentuale di match: a parità di match/);
});

test("«Come funziona» del PROPRIETARIO: match = quanto un inquilino va bene per la sua casa (criteri obbligatori e preferenziali, «fai match» apre la chat); affidabilità = quanto fidarsi, con verificato/dichiarato; la casa resta invisibile finché lo staff non verifica la proprietà", () => {
  const t = tt.testiIntro("proprietario"); const testo = (id) => t.blocchi.find((b) => b.id === id).paragrafi.join(" ");
  assert.match(testo("match"), /quanto il suo profilo risponde ai criteri che scegli tu per la casa/); assert.match(testo("match"), /un criterio obbligatorio esclude chi non lo rispetta, uno preferenziale fa salire o scendere la percentuale/); assert.match(testo("match"), /fai match: si apre la chat/);
  assert.match(testo("affidabilita"), /sulla scheda vedi se reddito e protesti sono verificati\. I documenti non li vedi mai/); assert.match(testo("documenti"), /Gli inquilini vedono il tuo annuncio solo dopo che il nostro staff ha verificato che la casa è tua/); assert.match(testo("documenti"), /visura catastale o l'atto di proprietà/); assert.match(testo("documenti"), /finché non lo fai la casa resta invisibile/);
  assert.match(testo("adesso"), /3 schede, pochi minuti: i tuoi documenti, la tua casa \(con le foto\) e la prova di proprietà/); assert.equal(tt.SCHEDE_DOPO_INTRO.proprietario, bw.passiProprietario(prop()).length - 1);
  assert.ok(!/reddito|busta paga|CU\b/.test(testo("documenti")), "al proprietario non si parla dei documenti del reddito");
});

test("le note sulla documentazione futura: durante l'iscrizione (schede «reddito» e «garanzie») dicono che DOPO verrà chiesta, cosa e perché; la scheda «I tuoi dati» di Home e Profilo non le mostra", () => {
  assert.match(tt.NOTE_DOCUMENTI.reddito, /^Dopo ti chiederemo la documentazione: nella scheda «I tuoi documenti» caricherai un documento d'identità e una busta paga recente, la CU o la dichiarazione dei redditi\./); assert.match(tt.NOTE_DOCUMENTI.reddito, /Senza documenti il reddito resta «dichiarato» e non dà punti di affidabilità\./);
  assert.match(tt.NOTE_DOCUMENTI.protesti, /^Dopo ti chiederemo la documentazione: nella scheda «I tuoi documenti» caricherai il certificato dei protesti \(si chiede alla Camera di Commercio, anche online\) e un documento d'identità\./); assert.match(tt.NOTE_DOCUMENTI.protesti, /il suo risultato vale più di questa risposta/);
  assert.match(dati, /\{sezione === "reddito" && <p className="nota-documenti" role="note">\{NOTE_DOCUMENTI\.reddito\}<\/p>\}/); assert.match(dati, /\{sezione === "garanzie" && <p className="nota-documenti" role="note">\{NOTE_DOCUMENTI\.protesti\}<\/p>\}/);
  const iRed = dati.indexOf("NOTE_DOCUMENTI.reddito"), iPro = dati.indexOf("NOTE_DOCUMENTI.protesti"); assert.ok(dati.indexOf("<CampoImporto valore={reddito}") < iRed && iRed < dati.indexOf('id="dati-garante"'), "la nota sta subito dopo il reddito"); assert.ok(dati.indexOf('id="dati-protesti"') < iPro && iPro < dati.indexOf('{mostra("reddito") && (\n        <Field label="Nucleo familiare"') || iPro > dati.indexOf('id="dati-protesti"'), "la nota sta dopo la domanda sui protesti");
  assert.ok(!/NOTE_DOCUMENTI/.test(senzaCommenti(leggi("src", "components", "DatiSheet.tsx"))), "la scheda intera non le ha");
});

test("la pagina «Come funziona» è la PRIMA scheda, per tutti e due; non dice «obbligatoria/facoltativa»; il suo pulsante dice «Ho capito, cominciamo»", () => {
  assert.equal(bw.passiInquilino(inq())[0].id, "intro"); assert.equal(bw.passiProprietario(prop())[0].id, "intro");
  assert.match(client, /if \(passo\.id === "intro"\) return <IntroBenvenuto ruolo="inquilino" \/>;/); assert.match(client, /if \(passo\.id === "intro"\) return <IntroBenvenuto ruolo="proprietario" \/>;/); assert.match(client, /\{passo\.id !== "intro" && \(\s+<p className=\{`benvenuto-tipo/);
  const ib = senzaCommenti(leggi("src", "components", "IntroBenvenuto.tsx")); assert.match(ib, /const t = testiIntro\(ruolo\);/); assert.ok(!/sottotitolo/.test(ib), "il componente non mostra una frase doppia sotto il titolo"); assert.match(ib, /\{b\.voci && \(\s+<ul className="intro-voci" aria-label="Cosa dà o toglie punti">/); assert.match(ib, /\{b\.fasce && \(\s+<ul className="intro-fasce" aria-label="Le fasce di affidabilità">/);
  const css = leggi("src", "app", "globals.css"); const m = css.slice(css.indexOf("La pagina «Come funziona» (prima scheda del benvenuto)")); const misure = [...m.matchAll(/font-size:\s*(\d+)px/g)].map((x) => Number(x[1])); assert.ok(misure.length >= 6 && Math.min(...misure) >= 15, `caratteri: ${Math.min(...misure)} px (${misure.length} regole)`);
});

test("importo a mano: un intero tra 0 e il massimo; di partenza 0; «1.800», «1800,50», vuoto, lettere e negativi si leggono in modo sensato", () => {
  const d = im.importoDaTesto; assert.equal(d("1800"), 1800); assert.equal(d("0"), 0); assert.equal(d(""), 0); assert.equal(d("   "), 0); assert.equal(d(null), 0); assert.equal(d(undefined), 0); assert.equal(d({}), 0);
  assert.equal(d("1.800"), 1800, "il punto separa le migliaia"); assert.equal(d("12.345.678"), im.IMPORTO_MASSIMO, "oltre il massimo si ferma al massimo"); assert.equal(d("1800,50"), 1801); assert.equal(d("1800.4"), 1800); assert.equal(d("1 800"), 1800);
  assert.equal(d("-5"), 0); assert.equal(d("abc"), 0); assert.equal(d("12abc"), 0); assert.equal(d("1e3"), 1000, "i numeri di tipo number con esponente"); assert.equal(d(2500), 2500); assert.equal(d(2500.6), 2501); assert.equal(d(NaN), 0); assert.equal(d(Infinity), 0);
  assert.equal(d("999999"), im.IMPORTO_MASSIMO); assert.equal(d("9000", 8000), 8000); assert.equal(d("5", -1), 5, "un massimo non valido torna al massimo di sempre"); assert.equal(im.IMPORTO_MASSIMO, 100000);
  assert.equal(im.posizioneBarra(3000, 8000), 3000); assert.equal(im.posizioneBarra(12000, 8000), 8000, "la barra si ferma in fondo"); assert.equal(im.posizioneBarra(-1, 8000), 0); assert.equal(im.posizioneBarra(NaN, 8000), 0);
});

test("campo del reddito: la barra E il numero a mano, allineati, per il reddito mensile (barra fino a 8000) e per quello del nucleo (fino a 15000); di partenza 0", () => {
  const c = senzaCommenti(leggi("src", "components", "CampoImporto.tsx")); assert.match(c, /<input\s+type="range"\s+min=\{0\}\s+max=\{massimoBarra\}\s+step=\{50\}\s+value=\{posizioneBarra\(valore, massimoBarra\)\}\s+onChange=\{\(e\) => onChange\(Number\(e\.target\.value\)\)\}/);
  assert.match(c, /<input\s+type="text"\s+inputMode="numeric"\s+pattern="\[0-9\]\*"\s+autoComplete="off"\s+value=\{String\(valore\)\}\s+onChange=\{\(e\) => onChange\(importoDaTesto\(e\.target\.value\.replace\(\/\[\^\\d\.,\]\/g, ""\)\)\)\}/); assert.ok(!/type="number"/.test(c), "non un campo numerico: lascerebbe lo zero davanti («02500»)"); assert.match(c, /aria-label=\{`\$\{nome\}: barra`\}/); assert.match(c, /aria-label=\{`\$\{nome\}: scrivi la cifra`\}/);
  assert.match(dati, /<CampoImporto valore=\{reddito\} onChange=\{setReddito\} massimoBarra=\{8000\} nome="Reddito netto mensile" \/>/); assert.match(dati, /<CampoImporto valore=\{redditoNucleo\} onChange=\{setRedditoNucleo\} massimoBarra=\{15000\} nome="Reddito netto mensile di tutto il nucleo" \/>/);
  assert.match(dati, /useState\(tenant\.reddito_mensile \?\? 0\)/); assert.match(dati, /useState\(tenant\.reddito_nucleo \?\? 0\)/); assert.equal([...dati.matchAll(/type="range"/g)].length, 0, "nessuna barra senza il numero accanto");
  const css = leggi("src", "app", "globals.css"); assert.match(css, /\.campo-importo-cifra input \{\s+width: 140px;\s+min-height: 48px;/); assert.match(css, /\.campo-importo-cifra input \{[^}]*font-size: 18px;/, "16 px o più: sul telefono non fa ingrandire la pagina");
});
