/**
 * Test del ritiro di una candidatura (src/lib/candidature.ts). Si lancia con:   npm test
 *
 * Oltre alla logica, tengono allineati l'app e la migrazione 0020: gli stati,
 * il momento in cui si può ritirare, i codici di errore. E controllano la
 * regola di PostgreSQL che su Supabase si scoprirebbe solo eseguendo la
 * migrazione: un valore aggiunto a un enumerato non si può usare nella stessa
 * transazione.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const c = caricaTs(path.join(radice, "src", "lib", "candidature.ts"));
const v = caricaTs(path.join(radice, "src", "lib", "verifica.ts"));
const migrazioni = path.join(radice, "supabase", "migrations");
const sql = fs.readFileSync(path.join(migrazioni, "0020_ritira_candidatura.sql"), "utf8");
const sql0001 = fs.readFileSync(path.join(migrazioni, "0001_init.sql"), "utf8");
const tipi = fs.readFileSync(path.join(radice, "src", "lib", "types.ts"), "utf8");

// ------------------------------------------------------------
// Gli stati
// ------------------------------------------------------------

/** Gli stati di una candidatura nel database: quelli della 0001 più quelli aggiunti dopo. */
function statiDelDatabase() {
  const m = sql0001.match(/create type stato_candidatura as enum \(([^)]*)\)/);
  assert.ok(m, "non trovo l'enumerato nella 0001");
  const stati = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  for (const f of fs.readdirSync(migrazioni).filter((x) => /^\d{4}_.*\.sql$/.test(x)).sort()) {
    const testo = fs.readFileSync(path.join(migrazioni, f), "utf8");
    for (const a of testo.matchAll(/alter type stato_candidatura add value (?:if not exists )?'([^']+)'/g)) stati.push(a[1]);
  }
  return stati;
}

test("stati: quelli dell'app sono quelli del database", () => {
  const m = tipi.match(/export type StatoCandidatura = ([^;]+);/);
  assert.ok(m, "non trovo il tipo nell'app");
  const nellApp = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
  assert.deepEqual(nellApp, [...new Set(statiDelDatabase())].sort());
});

test("stati: ognuno ha un'etichetta e un aspetto, e «ritirata» non si confonde con gli altri", () => {
  const stati = [...new Set(statiDelDatabase())];
  assert.deepEqual(Object.keys(c.STATO_LABEL).sort(), [...stati].sort());
  assert.deepEqual(Object.keys(c.STATO_BADGE).sort(), [...stati].sort());
  const etichette = Object.values(c.STATO_LABEL);
  assert.equal(new Set(etichette).size, etichette.length, "due stati con la stessa etichetta");
  assert.equal(c.STATO_LABEL.ritirata, "Ritirata");
});

// ------------------------------------------------------------
// Quando si può ritirare
// ------------------------------------------------------------

test("ritiro: si può solo da «in attesa», come nel database", () => {
  assert.ok(sql.includes("if v_stato <> 'in_attesa' then"), "la funzione del database è cambiata");
  assert.equal(c.puoRitirare("in_attesa"), true);
  for (const s of ["accettata", "rifiutata", "ritirata"]) assert.equal(c.puoRitirare(s), false, s);
});

// ------------------------------------------------------------
// I gruppi e il riepilogo
// ------------------------------------------------------------

const cand = (id, status) => ({ id, status });

test("gruppi: ogni candidatura sta in uno e un solo gruppo", () => {
  const e = [cand(1, "in_attesa"), cand(2, "accettata"), cand(3, "rifiutata"), cand(4, "ritirata"), cand(5, "in_attesa"), cand(6, "ritirata")];
  const g = c.raggruppaCandidature(e);
  assert.equal(g.accettate.length + g.inAttesa.length + g.rifiutate.length + g.ritirate.length, e.length);
  assert.deepEqual(g.ritirate.map((x) => x.id), [4, 6]);
  assert.deepEqual(g.inAttesa.map((x) => x.id), [1, 5]);
  assert.deepEqual(g.accettate.map((x) => x.id), [2]);
  assert.deepEqual(g.rifiutate.map((x) => x.id), [3]);
});

test("gruppi: l'elenco vuoto e uno stato mai visto non fanno crollare niente", () => {
  const g = c.raggruppaCandidature([]);
  assert.deepEqual([g.accettate, g.inAttesa, g.rifiutate, g.ritirate], [[], [], [], []]);
  const strano = c.raggruppaCandidature([cand(1, "stato_di_domani")]);
  assert.equal(strano.accettate.length + strano.inAttesa.length + strano.rifiutate.length + strano.ritirate.length, 0);
});

test("riepilogo: nessuna, una, più, con match e con ritirate", () => {
  assert.equal(c.riepilogoCandidature([]), "Gli annunci a cui ti candidi arrivano qui.");
  assert.equal(c.riepilogoCandidature([cand(1, "in_attesa")]), "1 candidatura inviata.");
  assert.equal(c.riepilogoCandidature([cand(1, "in_attesa"), cand(2, "rifiutata")]), "2 candidature inviate.");
  assert.equal(c.riepilogoCandidature([cand(1, "accettata"), cand(2, "in_attesa")]), "2 candidature inviate · 1 match.");
  assert.equal(c.riepilogoCandidature([cand(1, "in_attesa"), cand(2, "ritirata")]), "2 candidature inviate · 1 ritirata.");
  assert.equal(c.riepilogoCandidature([cand(1, "accettata"), cand(2, "ritirata"), cand(3, "ritirata")]), "3 candidature inviate · 1 match · 2 ritirate.");
  assert.equal(c.riepilogoCandidature([cand(1, "ritirata")]), "1 candidatura inviata · 1 ritirata.");
});

// ------------------------------------------------------------
// Cosa si dice prima di ritirare
// ------------------------------------------------------------

test("conferma: dice le due conseguenze, con il titolo se c'è", () => {
  const t = c.testoConfermaRitiro("Bilocale Isola");
  assert.match(t, /«Bilocale Isola»/);
  assert.match(t, /il proprietario non la vedrà più/);
  assert.match(t, /non potrai candidarti di nuovo a questo annuncio/);
  assert.match(t, /Puoi comunque candidarti ad altri/);
});

test("conferma: senza titolo usa una formula neutra, mai «undefined» o «null»", () => {
  for (const x of [null, undefined, "", "   "]) {
    const t = c.testoConfermaRitiro(x);
    assert.match(t, /questo annuncio/);
    assert.ok(!/undefined|null|«»/.test(t), t);
  }
});

test("conferma: un titolo con codice dentro resta testo", () => {
  const titolo = '<img src=x onerror="alert(1)">';
  assert.ok(c.testoConfermaRitiro(titolo).includes(titolo));
});

test("testi: non presumono il genere di nessuno", () => {
  for (const t of [c.testoConfermaRitiro("Casa"), c.NOTA_RITIRATA]) {
    assert.ok(!/\b(lui|lei|candidato|iscritto|iscritta)\b/i.test(t), t);
  }
});

test("la nota di una ritirata dice le stesse cose della conferma", () => {
  assert.match(c.NOTA_RITIRATA, /il proprietario non la vede più/);
  assert.match(c.NOTA_RITIRATA, /non puoi ricandidarti a questo annuncio/);
});

// ------------------------------------------------------------
// Gli errori
// ------------------------------------------------------------

const GENERICO = v.messaggioErroreVerifica("qualcosa di sconosciuto");

test("errori: ogni codice che la migrazione può sollevare ha una frase sua", () => {
  const codici = [...new Set([...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]))];
  assert.ok(codici.length >= 7, `trovati solo ${codici.length} codici`);
  for (const cod of codici) {
    const frase = v.messaggioErroreVerifica(`ERROR: ${cod} (P0001)`);
    assert.notEqual(frase, GENERICO, `il codice ${cod} non ha un messaggio: la persona vedrebbe «Riprova»`);
    assert.ok(!frase.includes(cod), `${cod} compare nella frase`);
  }
});

test("errori: la candidatura ritirata e quella non ritirabile non si confondono con «già valutata»", () => {
  const ritirata = v.messaggioErroreVerifica("CANDIDATURA_RITIRATA");
  const valutata = v.messaggioErroreVerifica("CANDIDATURA_GIA_VALUTATA");
  const nonRitirabile = v.messaggioErroreVerifica("CANDIDATURA_NON_RITIRABILE");
  assert.notEqual(ritirata, valutata);
  assert.notEqual(nonRitirabile, valutata);
  assert.match(ritirata, /ritirato la candidatura/);
  assert.match(nonRitirabile, /non si può più ritirare/);
  assert.ok(!/[A-Z_]{8,}/.test(ritirata + nonRitirabile), "codice tecnico nella frase");
});

// ------------------------------------------------------------
// La regola di PostgreSQL sull'enumerato (la insidia di questa migrazione)
// ------------------------------------------------------------

/** La migrazione senza commenti e senza i corpi delle funzioni (si compilano alla prima esecuzione). */
function partiCheSiCompilanoSubito(testo) {
  return testo
    .replace(/--[^\n]*/g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, "$$$$");
}

test("migrazione: il valore nuovo si aggiunge con «if not exists» (si può rilanciare)", () => {
  assert.match(sql, /alter type stato_candidatura add value if not exists 'ritirata';/);
});

test("migrazione: dove si compila subito, «ritirata» si confronta come TESTO, mai come enumerato", () => {
  const subito = partiCheSiCompilanoSubito(sql);
  const usi = [...subito.matchAll(/'ritirata'/g)];
  assert.ok(usi.length >= 4, `attesi almeno 4 usi (policy, vista), trovati ${usi.length}`);
  for (const m of usi) {
    const prima = subito.slice(Math.max(0, m.index - 90), m.index);
    const ammesso = /alter type stato_candidatura add value (if not exists )?$/.test(prima) || /::text\s*(<>|=)\s*$/.test(prima);
    assert.ok(ammesso, `uso non sicuro di 'ritirata' fuori da una funzione: «…${prima.trim().slice(-30)} 'ritirata'»`);
  }
});

test("migrazione: il controllo sa fermare un confronto diretto con l'enumerato", () => {
  const cattiva = "create policy x on t using (status <> 'ritirata');";
  const subito = partiCheSiCompilanoSubito(cattiva);
  const m = [...subito.matchAll(/'ritirata'/g)][0];
  const prima = subito.slice(Math.max(0, m.index - 90), m.index);
  assert.ok(!(/alter type stato_candidatura add value (if not exists )?$/.test(prima) || /::text\s*(<>|=)\s*$/.test(prima)));
  // e uno corretto passa
  const buona = partiCheSiCompilanoSubito("create policy x on t using (status::text <> 'ritirata');");
  const m2 = [...buona.matchAll(/'ritirata'/g)][0];
  assert.ok(/::text\s*(<>|=)\s*$/.test(buona.slice(Math.max(0, m2.index - 90), m2.index)));
});

test("migrazione: i corpi delle funzioni non vengono scambiati per parti che si compilano subito", () => {
  const subito = partiCheSiCompilanoSubito("create function f() returns void as $$ begin update t set status = 'ritirata'; end; $$ language plpgsql;");
  assert.ok(!subito.includes("'ritirata'"));
});

test("migrazione: la vista mantiene le opzioni di sicurezza e i permessi della 0016", () => {
  assert.match(sql, /create or replace view public\.candidati_del_proprietario\s+with \(security_barrier = true\)/);
  assert.match(sql, /revoke all on public\.candidati_del_proprietario from public, anon;/);
  assert.match(sql, /grant select on public\.candidati_del_proprietario to authenticated;/);
});

test("migrazione: il ritiro non è chiamabile da chi non ha un account", () => {
  assert.match(sql, /grant execute on function public\.ritira_candidatura\(uuid\) to authenticated;/);
  assert.ok(!/ritira_candidatura\(uuid\) to anon/.test(sql));
});

// ------------------------------------------------------------
// «I tuoi match»: le schede, le parti in cui si dividono le candidature, la barra
// ------------------------------------------------------------

const leggiFile = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const con = (stati) => stati.map((s, i) => ({ id: "c" + i, status: s }));

test("schede: due, nell'ordine «le tue candidature» e «richieste dei proprietari»", () => {
  assert.deepEqual(c.SCHEDE_MATCH.map((s) => s.id), ["candidature", "richieste"]); assert.deepEqual(c.SCHEDE_MATCH.map((s) => s.etichetta), ["Le tue candidature", "Richieste dei proprietari"]);
});

test("parti delle candidature: nell'ordine match, in attesa, non andate a buon fine, ritirate; coprono tutti gli stati e nessuno due volte", () => {
  assert.deepEqual(c.SEZIONI_CANDIDATURE.map((s) => s.id), ["match", "in_attesa", "non_andate", "ritirate"]); assert.deepEqual(c.SEZIONI_CANDIDATURE.map((s) => s.titolo), ["Match", "In attesa di risposta", "Non andate a buon fine", "Ritirate"]);
  assert.deepEqual(c.SEZIONI_CANDIDATURE.map((s) => s.stato).sort(), Object.keys(c.STATO_LABEL).sort(), "ogni stato di una candidatura deve avere la sua parte");
});

test("sezioniCandidature: ogni candidatura finisce nella parte del suo stato, e nessuna si perde né si duplica (anche con tante)", () => {
  const stati = ["accettata", "in_attesa", "rifiutata", "ritirata"]; let seme = 5; const rnd = () => (seme = (seme * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let n = 0; n < 200; n++) {
    const e = con(Array.from({ length: Math.floor(rnd() * 15) }, () => stati[Math.floor(rnd() * 4)])); const parti = c.sezioniCandidature(e);
    assert.equal(parti.reduce((s, p) => s + p.items.length, 0), e.length, "una candidatura è sparita o si è duplicata"); assert.ok(parti.every((p) => p.items.length > 0), "una parte vuota compare");
    for (const p of parti) { const stato = c.SEZIONI_CANDIDATURE.find((d) => d.id === p.id).stato; assert.ok(p.items.every((x) => x.status === stato), `«${p.titolo}» contiene una candidatura di un altro stato`); }
    assert.deepEqual(parti.map((p) => p.id), c.SEZIONI_CANDIDATURE.map((d) => d.id).filter((id) => parti.some((p) => p.id === id)), "ordine");
  }
});

test("sezioniCandidature: nessuna candidatura = nessuna parte; uno stato sconosciuto non compare in nessuna parte e non rompe niente", () => {
  assert.deepEqual(c.sezioniCandidature([]), []); const strano = c.sezioniCandidature(con(["stato_di_domani", "accettata"])); assert.equal(strano.length, 1); assert.equal(strano[0].id, "match");
});

test("sezioniCandidature: match e in attesa partono aperte, non andate e ritirate chiuse; se c'è solo roba chiusa si apre tutto (una pagina di soli titoli sembrerebbe vuota)", () => {
  const aperte = (e) => Object.fromEntries(c.sezioniCandidature(con(e)).map((p) => [p.id, p.aperta]));
  assert.deepEqual(aperte(["accettata", "in_attesa", "rifiutata", "ritirata"]), { match: true, in_attesa: true, non_andate: false, ritirate: false });
  assert.deepEqual(aperte(["in_attesa", "rifiutata"]), { in_attesa: true, non_andate: false }); assert.deepEqual(aperte(["rifiutata", "ritirata"]), { non_andate: true, ritirate: true }, "senza match né attesa si aprono tutte"); assert.deepEqual(aperte(["ritirata"]), { ritirate: true });
});

test("sezioniCandidature: non modifica l'elenco ricevuto e rispetta l'ordine di arrivo dentro ogni parte", () => {
  const e = [{ id: "z", status: "accettata" }, { id: "a", status: "accettata" }, { id: "m", status: "accettata" }]; const copia = JSON.stringify(e); const parti = c.sezioniCandidature(e);
  assert.equal(JSON.stringify(e), copia); assert.deepEqual(parti[0].items.map((x) => x.id), ["z", "a", "m"]);
});

test("barra dell'inquilino: la voce si chiama «I tuoi match», porta alla stessa pagina di prima e ha il simbolo nuovo; quella del proprietario non cambia", () => {
  const n = leggiFile("src", "components", "Navigation.tsx"); const tenant = n.slice(n.indexOf("const TENANT_TABS"), n.indexOf("const OWNER_TABS")); const owner = n.slice(n.indexOf("const OWNER_TABS"), n.indexOf("export function Navigation"));
  assert.match(tenant, /\{ href: "\/candidature", label: "I tuoi match", Icon: IconMatch \}/); assert.ok(!/label: "Candidature"/.test(n), "resta la vecchia etichetta"); assert.ok(!/IconChat/.test(n), "la barra usa ancora il simbolo della chat");
  assert.match(tenant, /\{ href: "\/messaggi", label: "Messaggi", Icon: IconBusta \}/, "il simbolo dei Messaggi non deve cambiare"); assert.match(owner, /label: "Database"/); assert.ok(!/I tuoi match/.test(owner), "la barra del proprietario non ha questa voce");
});

test("simbolo «I tuoi match»: esiste, è diverso da quello della chat e dalle altre voci della barra, e ha il solito reticolo 24x24", () => {
  const i = leggiFile("src", "components", "icons.tsx"); const corpo = (nome) => i.slice(i.indexOf(`export function ${nome}(`), i.indexOf("\n}\n", i.indexOf(`export function ${nome}(`)));
  const m = corpo("IconMatch"); assert.match(m, /viewBox="0 0 24 24"/); assert.match(m, /aria-hidden/); assert.ok([...m.matchAll(/<path /g)].length >= 5, "troppo semplice per una stretta di mano");
  for (const altro of ["IconChat", "IconBusta", "IconCasa", "IconDocumento", "IconPersona"]) assert.notEqual(m.match(/<path d="([^"]+)"/)[1], corpo(altro).match(/<path d="([^"]+)"/)?.[1], `uguale a ${altro}`);
  assert.ok(!/\bd="[^"]*(NaN|undefined)/.test(m), "un tratto rotto");
});

test("i testi che nominano la pagina dicono «I tuoi match» (Home, Preferiti e commenti), non più «Candidature»", () => {
  assert.match(leggiFile("src", "lib", "scelte.ts"), /TESTO_CANDIDATURA_INVIATA = "Candidatura inviata — la trovi in I tuoi match\."/); const home = leggiFile("src", "app", "(app)", "HomeClient.tsx"); assert.match(home, /testo: TESTO_CANDIDATURA_INVIATA/, "la Home usa il testo condiviso, che dice «I tuoi match»"); assert.ok(!/Candidatura inviata —/.test(home), "la Home non ha più una sua copia del testo");
  for (const f of [["src", "lib", "scelte.ts"], ["src", "app", "(app)", "HomeClient.tsx"], ["src", "app", "(app)", "actions.ts"]]) assert.ok(!/in «?"?&?q?u?o?t?;?Candidature/.test(leggiFile(...f).replace(/Candidatur[ae] inviat/g, "")), `un testo cita ancora «Candidature» in ${f.join("/")}`);
});

test("pagina: due schede accessibili (gruppo di schede, frecce), le parti ripiegabili con il conteggio, la scheda delle richieste dice la verità e non finge dati", () => {
  const p = leggiFile("src", "app", "(app)", "candidature", "CandidatureClient.tsx");
  assert.match(p, /role="tablist"/); assert.match(p, /role="tab"[\s\S]*?aria-selected=\{scheda === s\.id\}[\s\S]*?aria-controls=/); assert.equal([...p.matchAll(/role="tabpanel"/g)].length, 2); assert.match(p, /e\.key !== "ArrowRight" && e\.key !== "ArrowLeft"/); assert.match(p, /tabIndex=\{scheda === s\.id \? 0 : -1\}/);
  assert.match(p, /aria-labelledby=\{`\$\{idBase\}-candidature`\} hidden=\{scheda !== "candidature"\}/); assert.match(p, /aria-labelledby=\{`\$\{idBase\}-richieste`\} hidden=\{scheda !== "richieste"\}/, "una scheda non attiva deve essere nascosta"); assert.match(p, /<div id=\{id\} className="card-grid" hidden=\{!aperto\}>/, "una parte chiusa deve essere nascosta");
  assert.match(p, /sezioniCandidature\(candidature\)/); assert.match(p, /aria-expanded=\{aperto\}/); assert.match(p, /\{titolo\} — \{items\.length\}/); assert.match(p, /useState\(apertaAllInizio\)/);
  assert.match(p, /Nessuna richiesta dai proprietari/); assert.match(p, /Per ora i proprietari vedono solo chi si candida alle loro case, quindi non\s+ce ne sono/); assert.ok(!/IconChat/.test(p), "la pagina usa ancora il simbolo della chat");
  assert.match(p, /Torna alla Home e scorri gli annunci/); assert.ok(!/Torna su &quot;Cerca&quot;/.test(p), "rimanda a una voce «Cerca» che non esiste");
  const css = leggiFile("src", "app", "globals.css"); assert.match(css, /\.gruppo-match \.card-grid\[hidden\][\s\S]*?display: none !important;/, "una parte chiusa resterebbe visibile: la griglia vince sull'attributo hidden");
});

test("pagina: nessuna azione sulle candidature è cambiata (ritiro, chat, motivo del rifiuto, note)", () => {
  const p = leggiFile("src", "app", "(app)", "candidature", "CandidatureClient.tsx");
  assert.match(p, /\{puoRitirare\(selezionata\.status\) && \(\s+<RitiraCandidatura\s+key=\{selezionata\.id\}/, "il ritiro deve comparire dentro la candidatura in attesa");
  for (const pezzo of ["puoRitirare(selezionata.status)", "<RitiraCandidatura", "router.refresh()", "href={`/chat/${selezionata.id}`}", "Apri chat", "messaggioMotivoRifiuto(selezionata.motivo_rifiuto)", "NOTA_RITIRATA", "Il proprietario ha accettato la tua candidatura.", "Il proprietario non ha ancora valutato questa candidatura."]) assert.ok(p.includes(pezzo), `manca «${pezzo}»`);
  const pg = leggiFile("src", "app", "(app)", "candidature", "page.tsx"); assert.match(pg, /\.eq\("tenant_id", user!\.id\)/);
});
