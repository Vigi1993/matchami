/**
 * Test delle email per le notifiche (src/lib/email). Si lancia con:   npm test
 *
 * Contengono il CONTRATTO di ogni fornitore di invio: girano su tutti quelli
 * registrati, quindi chi ne aggiunge uno vero li ritrova pronti.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const mod = caricaTs(path.join(radice, "src", "lib", "email", "modello.ts"));
const notifiche = caricaTs(path.join(radice, "src", "lib", "notifiche.ts"));
const reg = caricaTs(path.join(radice, "src", "lib", "email", "index.ts"));
const invio = caricaTs(path.join(radice, "src", "lib", "email", "invio.ts"));
const cron = caricaTs(path.join(radice, "src", "lib", "email", "cron.ts"));
const v = caricaTs(path.join(radice, "src", "lib", "verifica.ts"));
const { INFORMATIVA } = caricaTs(path.join(radice, "src", "content", "informativa.ts"));
const sql = fs.readFileSync(path.join(radice, "supabase", "migrations", "0025_email_notifiche.sql"), "utf8");
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8");

const BASE = "https://matchami.example.com";
const TOKEN = "a".repeat(32) + "0123456789abcdef".repeat(2);
let n = 0;
const notifica = (o = {}) => ({ id: "n" + ++n, tipo: "candidatura_ricevuta", dati: { titolo: "Bilocale Isola" }, link: "/database", created_at: "2026-10-08T10:00:00Z", ...o });
const compone = (o = {}) => mod.componiRiepilogo({ nome: "Marco Rossi", notifiche: [notifica()], urlApp: BASE, token: TOKEN, ...o });

// ============================================================ piccole funzioni
test("token: 64 caratteri esadecimali minuscoli, come li genera il database", () => {
  assert.equal(mod.tokenValido(TOKEN), true);
  for (const x of ["", "abc", TOKEN + "0", TOKEN.slice(1), TOKEN.toUpperCase(), "g".repeat(64), null, undefined, 42, {}, TOKEN + "\n"]) assert.equal(mod.tokenValido(x), false, JSON.stringify(x));
  assert.match(sql, /p_token !~ '\^\[0-9a-f\]\{64\}\$'/, "la regola del database è diversa da quella dell'app");
});

test("escape: tutto ciò che in HTML ha un significato diventa testo", () => {
  assert.equal(mod.escapaHtml(`<a href="x" onclick='y'>&</a>`), "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  assert.equal(mod.escapaHtml(null), ""); assert.equal(mod.escapaHtml(undefined), ""); assert.equal(mod.escapaHtml(42), "42");
  assert.equal(mod.escapaHtml("&amp;"), "&amp;amp;", "un'entità già scritta non si lascia passare");
});

test("nome per il saluto: il primo, pulito, al massimo 40 caratteri; nullo se manca", () => {
  assert.equal(mod.nomeBreve("Marco Rossi"), "Marco"); assert.equal(mod.nomeBreve("  maria  "), "maria"); assert.equal(mod.nomeBreve("Marco\nBcc: x@y.it"), "Marco");
  assert.equal(mod.nomeBreve("a".repeat(100)).length, 40); assert.equal(mod.nomeBreve("\u200bMarco"), "Marco");
  for (const x of [null, undefined, "", "   ", "\n\t", 42, {}]) assert.equal(mod.nomeBreve(x), null, JSON.stringify(x));
});

test("indirizzo dell'app: https, senza percorso né credenziali; http solo in locale", () => {
  assert.equal(mod.indirizzoBase("https://matchami.vercel.app/"), "https://matchami.vercel.app");
  assert.equal(mod.indirizzoBase("https://matchami.vercel.app/qualcosa?x=1#y"), "https://matchami.vercel.app");
  assert.equal(mod.indirizzoBase("http://localhost:3000"), "http://localhost:3000"); assert.equal(mod.indirizzoBase("http://127.0.0.1:3000/x"), "http://127.0.0.1:3000");
  for (const x of ["http://matchami.vercel.app", "https://u:p@matchami.vercel.app", "javascript:alert(1)", "ftp://x.it", "matchami.vercel.app", "", "  ", null, undefined, 42]) assert.equal(mod.indirizzoBase(x), null, JSON.stringify(x));
});

test("oggetto: generico, singolare e plurale", () => {
  assert.equal(mod.oggettoRiepilogo(1), "Una novità su MatchAmI"); assert.equal(mod.oggettoRiepilogo(3), "3 novità su MatchAmI");
});

test("«altre»: una sola o più", () => { assert.equal(mod.frasePerLeAltre(1), "…e un'altra novità."); assert.equal(mod.frasePerLeAltre(5), "…e altre 5 novità."); });

// ============================================================ l'email
test("email: saluto, introduzione, voce con titolo, testo e indirizzo assoluto dentro l'app", () => {
  const e = compone();
  assert.match(e.testo, /^Ciao Marco,\n\nhai una novità su MatchAmI:/);
  const atteso = notifiche.descriviNotifica("candidatura_ricevuta", { titolo: "Bilocale Isola" });
  assert.ok(e.testo.includes(`• ${atteso.titolo}\n  ${atteso.testo}\n  https://matchami.example.com/database`), e.testo);
  assert.match(e.testo, /Apri tutte le novità: https:\/\/matchami\.example\.com\/notifiche/);
  assert.ok(e.html.includes(atteso.titolo)); assert.match(e.html, /href="https:\/\/matchami\.example\.com\/database"/);
});

test("email: più novità, e senza nome il saluto resta cortese", () => {
  const e = compone({ nome: null, notifiche: [notifica(), notifica({ tipo: "candidatura_accettata" })] });
  assert.match(e.testo, /^Ciao,\n\nhai 2 novità su MatchAmI:/); assert.equal(e.oggetto, "2 novità su MatchAmI");
});

test("email: in fondo dice perché si riceve e come smettere", () => {
  const e = compone();
  assert.match(e.testo, /Ricevi questa email perché hai un account su MatchAmI\./); assert.match(e.testo, new RegExp(`Per smettere di riceverle: ${BASE}/email/disiscrivi/${TOKEN}`));
  assert.match(e.html, /Smetti di riceverle/); assert.equal(e.urlDisiscrizione, `${BASE}/email/disiscrivi/${TOKEN}`);
});

test("intestazioni: «annulla iscrizione» con un clic (RFC 8058), che porta all'indirizzo per i programmi di posta", () => {
  const e = compone();
  assert.equal(e.urlUnClic, `${BASE}/api/email/disiscrivi/${TOKEN}`);
  assert.equal(e.intestazioni["List-Unsubscribe"], `<${BASE}/api/email/disiscrivi/${TOKEN}>`); assert.equal(e.intestazioni["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

test("l'oggetto è generico: non nomina annunci, persone, date", () => {
  const e = compone({ notifiche: [notifica({ dati: { titolo: "Villa segretissima" } }), notifica({ tipo: "visita_prenotata", dati: { titolo: "Attico", quando: "2026-10-12T08:00:00+00:00" } })] });
  assert.ok(!/Villa|Attico|lunedì|Marco|Rossi/.test(e.oggetto), e.oggetto);
});

test("le visite portano giorno e ora in ora di Roma", () => {
  const e = compone({ notifiche: [notifica({ tipo: "visita_prenotata", dati: { titolo: "Attico", quando: "2026-10-12T08:00:00+00:00" } })] });
  assert.match(e.testo, /«Attico»: lunedì 12 ottobre · 10:00\./);
});

test("HTML: ciò che scrive un altro (il titolo di un annuncio, il nome) non può inserire codice né link", () => {
  const cattivi = ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', "<a href='https://evil.example'>clic</a>", "&lt;b&gt;", "'; DROP TABLE x; --", "<svg onload=alert(1)>"];
  const TAG_DEL_MODELLO = /<\/?(div|p|ul|li|b|br|a|hr)(\s[^<>]*)?>/g;
  for (const t of cattivi) {
    const e = compone({ notifiche: [notifica({ dati: { titolo: t } })], nome: t });
    const senzaTag = e.html.replace(TAG_DEL_MODELLO, "");
    assert.ok(!senzaTag.includes("<"), `resta un «<» che non viene dal modello per «${t}»: ${senzaTag.slice(0, 300)}`);
    assert.ok(!/<(script|img|svg|iframe)/i.test(e.html), t);
    for (const h of [...e.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])) assert.ok(h.startsWith(BASE + "/"), `link inatteso: ${h}`);
  }
  assert.ok(compone({ notifiche: [notifica({ dati: { titolo: "<b>x</b>" } })] }).html.includes("&lt;b&gt;x&lt;/b&gt;"));
});

test("HTML: ogni link va dritto all'app: nessun altro indirizzo, nessun servizio che registri i clic", () => {
  const e = compone({ notifiche: [notifica(), notifica({ tipo: "visita_annullata", dati: { titolo: "X", quando: "2026-10-12T08:00:00+00:00" }, link: "/chat/abc-123" })] });
  const href = [...e.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(href.length >= 4); for (const h of href) assert.ok(h.startsWith(BASE + "/"), `link fuori dall'app: ${h}`);
});

test("HTML: nessuna immagine, nessuno script, nessun pixel di tracciamento, nessun parametro di tracciamento", () => {
  const e = compone();
  for (const vietato of [/<img/i, /<script/i, /<iframe/i, /<link/i, /<style/i, /pixel/i, /utm_/i, /track/i, /beacon/i]) assert.ok(!vietato.test(e.html), `${vietato} in ${e.html}`);
  assert.ok(!/utm_|track/i.test(e.testo));
});

test("un link ostile (anche se il database dovrebbe impedirlo) non porta fuori dall'app", () => {
  for (const link of ["https://evil.example/x", "//evil.example/x", "javascript:alert(1)", "/../..//evil.example", "\\\\evil.example", "", "database"]) {
    const e = compone({ notifiche: [notifica({ link })] });
    for (const h of [...e.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])) assert.equal(new URL(h).host, new URL(BASE).host, `${JSON.stringify(link)} → ${h}`);
    for (const riga of e.testo.split("\n").filter((r) => /https?:/.test(r))) { const url = riga.match(/https?:\/\/\S+/)[0]; assert.equal(new URL(url).host, new URL(BASE).host, `${JSON.stringify(link)} → ${url}`); }
  }
});

test("molte novità: se ne mostrano 20 e si dice quante restano", () => {
  const e = compone({ notifiche: Array.from({ length: 27 }, () => notifica()) });
  assert.equal((e.testo.match(/^• /gm) ?? []).length, 20); assert.match(e.testo, /…e altre 7 novità\./); assert.match(e.testo, /hai 27 novità/); assert.equal(e.oggetto, "27 novità su MatchAmI");
  const una = compone({ notifiche: Array.from({ length: 21 }, () => notifica()) }); assert.match(una.testo, /…e un'altra novità\./); assert.match(una.html, /…e un&#39;altra novità\./);
  assert.equal(compone({ notifiche: Array.from({ length: 20 }, () => notifica()) }).testo.includes("…e"), false, "con 20 non si dice «altre»");
  assert.equal(mod.MASSIMO_NOTIFICHE_IN_UNA_EMAIL, 20); assert.match(sql, /c\.pos <= 20/, "il tetto dell'app e quello del database sono diversi");
});

test("un tipo di notifica sconosciuto non rompe l'email", () => {
  const e = compone({ notifiche: [notifica({ tipo: "tipo_di_domani", dati: null })] }); assert.ok(e.testo.length > 50); assert.ok(!/undefined|null/.test(e.testo));
});

test("indirizzo dell'app o codice non validi: errore, mai un'email con un link rotto", () => {
  assert.throws(() => compone({ urlApp: "non un indirizzo" }), /non valido/); assert.throws(() => compone({ urlApp: "http://matchami.it" }), /non valido/);
  assert.throws(() => compone({ token: "corto" }), /non valido/); assert.throws(() => compone({ token: TOKEN + "x" }), /non valido/);
});

test("il testo non presume il genere di nessuno e non nomina persone (le notifiche non contengono nomi)", () => {
  const e = compone({ nome: null, notifiche: [notifica(), notifica({ tipo: "candidatura_rifiutata" }), notifica({ tipo: "feedback_ricevuto" })] });
  assert.ok(!/\b(lui|lei|caro|cara|gentile|iscritto|iscritta)\b/i.test(e.testo), e.testo);
});

// ============================================================ il registro dei fornitori e il CONTRATTO
const finteDipendenze = () => { const chiamate = []; return { chiamate, depositaProva: async (...a) => { chiamate.push(a); } }; };
const MESSAGGIO = { a: "persona@dominio-di-prova.it", oggetto: "Una novità su MatchAmI", testo: "Ciao,\n\nuna novità", html: "<p>Ciao</p>", intestazioni: { "List-Unsubscribe": `<${BASE}/api/email/disiscrivi/${TOKEN}>` } };

test("registro: senza configurazione il provvisorio; un nome sbagliato è un errore che dice quali ci sono", () => {
  for (const x of [undefined, null, "", "  ", "provvisorio", " provvisorio "]) assert.equal(reg.fornitoreEmail(x, finteDipendenze()).id, "provvisorio", JSON.stringify(x));
  assert.throws(() => reg.fornitoreEmail("sendgrid", finteDipendenze()), (e) => /«sendgrid»/.test(e.message) && /provvisorio/.test(e.message));
});

test("registro: i nomi che esistono in ogni oggetto JavaScript non passano per fornitori", () => {
  for (const x of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "prototype"]) assert.throws(() => reg.fornitoreEmail(x, finteDipendenze()), /sconosciuto/, x);
});

for (const nome of Object.keys(reg.FORNITORI_EMAIL)) {
  test(`contratto [${nome}]: identificativo uguale al nome registrato, origine ammessa`, () => {
    const f = reg.fornitoreEmail(nome, finteDipendenze()); assert.equal(f.id, nome); assert.ok(["provvisoria", "fornitore"].includes(f.origine)); assert.match(f.id, /^[a-z][a-z0-9_-]*$/);
  });
  test(`contratto [${nome}]: invia() restituisce un esito, mai un errore, anche con contenuti strani`, async () => {
    const f = reg.fornitoreEmail(nome, finteDipendenze());
    for (const m of [MESSAGGIO, { ...MESSAGGIO, oggetto: "💥".repeat(100), testo: "x".repeat(100000), html: "<".repeat(5000) }, { ...MESSAGGIO, a: "", intestazioni: {} }]) {
      const e = await f.invia(m, { userId: "u1" }); assert.ok(e && typeof e.ok === "boolean", JSON.stringify(e)); if (!e.ok) { assert.equal(typeof e.errore, "string"); assert.equal(typeof e.definitivo, "boolean"); }
    }
  });
  test(`contratto [${nome}]: se le sue dipendenze falliscono restituisce un errore, non lo lancia, e non rivela l'indirizzo`, async () => {
    const f = reg.fornitoreEmail(nome, { depositaProva: async () => { throw new Error("errore con persona@dominio-di-prova.it dentro"); } });
    const e = await f.invia(MESSAGGIO, { userId: "u1" }); if (!e.ok) assert.ok(!/persona@/.test(e.errore), e.errore);
  });
  test(`contratto [${nome}]: l'esito d'errore dice se riprovare serve o no`, async () => {
    const f = reg.fornitoreEmail(nome, { depositaProva: async () => { throw new Error("x"); } }); const e = await f.invia(MESSAGGIO, { userId: "u1" });
    if (f.origine === "provvisoria") { assert.equal(e.ok, false); assert.equal(e.definitivo, false, "un errore del deposito si può riprovare"); }
  });
}

test("fornitore provvisorio: scrive una copia di prova con oggetto e testo, e NON l'indirizzo né l'HTML", async () => {
  const d = finteDipendenze(); const f = reg.fornitoreEmail("provvisorio", d); const e = await f.invia(MESSAGGIO, { userId: "u1" });
  assert.deepEqual(e, { ok: true }); assert.equal(d.chiamate.length, 1); assert.deepEqual(d.chiamate[0], ["u1", MESSAGGIO.oggetto, MESSAGGIO.testo]);
  assert.ok(!JSON.stringify(d.chiamate).includes("persona@"), "l'indirizzo è finito nella copia");
  assert.equal(f.origine, "provvisoria");
});

test("fornitore provvisorio: non usa l'indirizzo del destinatario (privacy, sul testo)", () => {
  const c = leggi("src", "lib", "email", "provvisorio.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(!/messaggio\.a\b|\.a\b\s*[,)]/.test(c), "il fornitore provvisorio legge l'indirizzo"); assert.ok(!/console\./.test(c));
});

test("informativa: finché i fornitori sono provvisori dice che le email non partono; con uno vero va rivista", () => {
  const tutto = JSON.stringify(INFORMATIVA);
  const veri = Object.keys(reg.FORNITORI_EMAIL).filter((k) => reg.fornitoreEmail(k, finteDipendenze()).origine === "fornitore");
  if (veri.length === 0) assert.match(tutto, /Per ora le email non partono davvero/);
  else { assert.ok(!/Per ora le email non partono davvero/.test(tutto), `c'è un fornitore vero (${veri.join(", ")}) ma il testo dice che le email non partono`); assert.match(tutto, /servizio di invio email/); }
});

// ============================================================ l'invio, con dei finti
function ambiente({ righe = [], reclama = null, invia = null, annulla = null, registra = null, base = BASE } = {}) {
  const registro = { reclama: [], annulla: [], registra: [], invia: [] };
  const deposito = {
    async reclama(max) { registro.reclama.push(max); return reclama ? reclama() : { ok: true, righe }; },
    async annulla(ids, def) { registro.annulla.push([ids, def]); if (annulla) throw annulla; },
    async registra(e) { registro.registra.push(e); if (registra) throw registra; },
  };
  const fornitore = { id: "finto", origine: "fornitore", async invia(m, c) { registro.invia.push([m, c]); return invia ? invia(m, c) : { ok: true }; } };
  return { registro, esegui: (o = {}) => invio.eseguiInvio({ deposito, fornitore, urlApp: base, ...o }) };
}
const riga = (id, email, ns = 2, extra = {}) => ({ user_id: id, email, nome: "Ugo", token: TOKEN, notifiche: Array.from({ length: ns }, () => notifica()), ...extra });

test("invio: compone un'email per persona, la passa al fornitore con l'indirizzo e l'identificativo, e registra l'esito", async () => {
  const a = ambiente({ righe: [riga("u1", "uno@prova.it"), riga("u2", "due@prova.it", 3)] }); const r = await a.esegui();
  assert.deepEqual(r, { utenti: 2, notifiche: 5, inviate: 2, fallite: 0 });
  assert.equal(a.registro.invia.length, 2); assert.equal(a.registro.invia[0][0].a, "uno@prova.it"); assert.equal(a.registro.invia[0][1].userId, "u1"); assert.match(a.registro.invia[0][0].oggetto, /novità su MatchAmI|Una novità/);
  assert.deepEqual(a.registro.registra.map((x) => [x.userId, x.esito, x.n, x.fornitore]), [["u1", "inviata", 2, "finto"], ["u2", "inviata", 3, "finto"]]);
  assert.equal(a.registro.annulla.length, 0);
});

test("invio: chiede al database al massimo 50 persone per giro, o quante gliene si dicono", async () => {
  const a = ambiente(); await a.esegui(); await a.esegui({ max: 7 }); assert.deepEqual(a.registro.reclama, [50, 7]); assert.equal(invio.MASSIMO_PERSONE_PER_GIRO, 50); assert.match(sql, /p_max_utenti integer default 50/);
});

test("invio: nessuna notifica da mandare: niente fornitore, niente registro", async () => {
  const a = ambiente(); const r = await a.esegui(); assert.deepEqual(r, { utenti: 0, notifiche: 0, inviate: 0, fallite: 0 }); assert.equal(a.registro.invia.length, 0); assert.equal(a.registro.registra.length, 0);
});

test("invio: se il fornitore rifiuta, le notifiche tornano in coda e il registro dice «fallita»", async () => {
  const a = ambiente({ righe: [riga("u1", "uno@prova.it", 2)], invia: () => ({ ok: false, errore: "servizio non raggiungibile", definitivo: false }) }); const r = await a.esegui();
  assert.deepEqual(r, { utenti: 1, notifiche: 2, inviate: 0, fallite: 1 }); assert.equal(a.registro.annulla.length, 1); assert.equal(a.registro.annulla[0][0].length, 2); assert.equal(a.registro.annulla[0][1], false);
  assert.deepEqual([a.registro.registra[0].esito, a.registro.registra[0].errore], ["fallita", "servizio non raggiungibile"]);
});

test("invio: un errore DEFINITIVO (indirizzo inesistente) si segnala come tale al database", async () => {
  const a = ambiente({ righe: [riga("u1", "x@prova.it")], invia: () => ({ ok: false, errore: "indirizzo inesistente", definitivo: true }) }); await a.esegui(); assert.equal(a.registro.annulla[0][1], true);
});

test("invio: un fornitore che LANCIA un errore vale come un rifiuto che si può riprovare, senza fermare l'invio", async () => {
  const a = ambiente({ righe: [riga("u1", "uno@prova.it"), riga("u2", "due@prova.it")], invia: (m) => { if (m.a === "uno@prova.it") throw new Error("boom"); return { ok: true }; } });
  const r = await a.esegui(); assert.deepEqual([r.inviate, r.fallite], [1, 1]); assert.equal(a.registro.annulla[0][1], false);
});

test("invio: le persone sono indipendenti: una che fallisce non impedisce le altre", async () => {
  const a = ambiente({ righe: [riga("u1", "a@p.it"), riga("u2", "b@p.it"), riga("u3", "c@p.it")], invia: (m) => (m.a === "b@p.it" ? { ok: false, errore: "no", definitivo: false } : { ok: true }) });
  const r = await a.esegui(); assert.deepEqual([r.inviate, r.fallite], [2, 1]); assert.deepEqual(a.registro.registra.map((x) => x.esito), ["inviata", "fallita", "inviata"]);
});

test("invio: un'email che non si riesce a comporre (codice rovinato) vale come un errore di quella persona, e il resto prosegue", async () => {
  const a = ambiente({ righe: [riga("u1", "a@p.it", 1, { token: "rovinato" }), riga("u2", "b@p.it")] }); const r = await a.esegui(); assert.deepEqual([r.inviate, r.fallite], [1, 1]); assert.equal(a.registro.invia.length, 1, "non ha mandato un'email con un link rotto");
});

test("invio: l'errore NON contiene l'indirizzo di nessuno, né nel registro né nel riepilogo", async () => {
  const a = ambiente({ righe: [riga("u1", "persona@dominio-di-prova.it")], invia: () => ({ ok: false, errore: "Mailbox <persona@dominio-di-prova.it> unavailable; contact admin@servizio.example", definitivo: false }) });
  const r = await a.esegui(); const tutto = JSON.stringify([r, a.registro.registra]); assert.ok(!/@/.test(tutto), tutto); assert.match(a.registro.registra[0].errore, /\[indirizzo\]/);
  const b = ambiente({ righe: [riga("u1", "persona@dominio-di-prova.it")], invia: () => { throw new Error("rifiutato: persona@dominio-di-prova.it"); } }); await b.esegui(); assert.ok(!/@/.test(JSON.stringify(b.registro.registra)), "l'errore lanciato ha rivelato l'indirizzo");
});

test("invio: il riepilogo non contiene indirizzi né nomi", async () => {
  const a = ambiente({ righe: [riga("u1", "persona@dominio-di-prova.it")] }); const r = await a.esegui(); assert.ok(!/persona|Ugo|@/.test(JSON.stringify(r)), JSON.stringify(r));
});

test("invio: se non si riescono a leggere le notifiche, si ferma e lo dice", async () => {
  const a = ambiente({ reclama: () => ({ ok: false, errore: "database giù" }) }); const r = await a.esegui(); assert.match(r.fermato, /Non è stato possibile leggere/); assert.equal(a.registro.invia.length, 0); assert.ok(!/giù/.test(JSON.stringify(r)), "ha lasciato passare l'errore tecnico");
});

test("invio: con l'indirizzo dell'app non valido si ferma PRIMA di toccare le notifiche (altrimenti resterebbero segnate come inviate)", async () => {
  for (const base of ["", "http://matchami.it", "boh", undefined]) { const a = ambiente({ righe: [riga("u1", "a@p.it")], base }); const r = await a.esegui({ urlApp: base }); assert.match(r.fermato, /non configurato o non valido/, String(base)); assert.equal(a.registro.reclama.length, 0, `ha reclamato con l'indirizzo ${JSON.stringify(base)}`); assert.equal(a.registro.invia.length, 0); }
});

test("invio: se annullare o registrare non riesce, il resto prosegue e non si lancia un errore", async () => {
  const a = ambiente({ righe: [riga("u1", "a@p.it"), riga("u2", "b@p.it")], invia: (m) => (m.a === "a@p.it" ? { ok: false, errore: "no", definitivo: false } : { ok: true }), annulla: new Error("giù"), registra: new Error("giù") });
  await assert.doesNotReject(async () => { const r = await a.esegui(); assert.deepEqual([r.inviate, r.fallite], [1, 1]); });
});

test("invio: prima si reclama, poi si manda (mai il contrario: si segnerebbe come inviato dopo)", async () => {
  const ordine = []; const f = { id: "f", origine: "fornitore", async invia() { ordine.push("invia"); return { ok: true }; } };
  const d = { async reclama() { ordine.push("reclama"); return { ok: true, righe: [riga("u1", "a@p.it")] }; }, async annulla() {}, async registra() { ordine.push("registra"); } };
  await invio.eseguiInvio({ deposito: d, fornitore: f, urlApp: BASE }); assert.deepEqual(ordine, ["reclama", "invia", "registra"]);
});

test("senzaIndirizzi: toglie ciò che somiglia a un indirizzo, accorcia, e regge valori strani", () => {
  assert.equal(invio.senzaIndirizzi("errore per a.b+c@d.co.uk, riprova"), "errore per [indirizzo], riprova");
  assert.equal(invio.senzaIndirizzi("x@y e z@w"), "[indirizzo] e [indirizzo]"); assert.equal(invio.senzaIndirizzi("nessun indirizzo qui"), "nessun indirizzo qui");
  assert.equal(invio.senzaIndirizzi("a".repeat(500)).length, 300); assert.equal(invio.senzaIndirizzi(null), ""); assert.equal(invio.senzaIndirizzi(undefined), ""); assert.equal(invio.senzaIndirizzi(42), "42");
  assert.ok(!/@/.test(invio.senzaIndirizzi("<utente@dominio.it>")), "tra parentesi angolari");
});

// ============================================================ chi può far partire l'invio
const SEGRETO = "s3gret0-lungo-abbastanza-1234";
test("autorizzazione: con il segreto giusto passa", () => { assert.equal(cron.autorizzaCron(`Bearer ${SEGRETO}`, SEGRETO), "ok"); });
test("autorizzazione: segreto assente o troppo corto vale «non configurato», anche con l'intestazione che coincide", () => {
  for (const s of [undefined, null, "", "corto", "a".repeat(15)]) assert.equal(cron.autorizzaCron(`Bearer ${s}`, s), "non_configurato", JSON.stringify(s));
  assert.equal(cron.autorizzaCron("Bearer " + "a".repeat(16), "a".repeat(16)), "ok", "16 caratteri bastano");
});
test("autorizzazione: intestazione mancante, sbagliata o in forma diversa: rifiutata", () => {
  for (const h of [null, undefined, "", SEGRETO, `bearer ${SEGRETO}`, `Bearer  ${SEGRETO}`, `Bearer ${SEGRETO} `, `Bearer ${SEGRETO}x`, `Bearer ${SEGRETO.slice(1)}`, "Bearer ", "Bearer", `Basic ${SEGRETO}`, 42, {}]) assert.equal(cron.autorizzaCron(h, SEGRETO), "rifiutato", JSON.stringify(h));
});
test("autorizzazione: un segreto con caratteri speciali o Unicode funziona, e lunghezze diverse non lanciano errori", () => {
  const sp = "p@ss/w0rd+=&?lungo-abbastanza"; assert.equal(cron.autorizzaCron(`Bearer ${sp}`, sp), "ok"); const u = "segreto-con-è-à-€-abbastanza-lungo"; assert.equal(cron.autorizzaCron(`Bearer ${u}`, u), "ok");
  assert.doesNotThrow(() => cron.autorizzaCron("Bearer x", SEGRETO)); assert.doesNotThrow(() => cron.autorizzaCron(`Bearer ${"x".repeat(5000)}`, SEGRETO));
});
test("autorizzazione: il confronto è a tempo costante: si CHIAMA timingSafeEqual, e il segreto non si confronta mai con == o ===", () => {
  // senza commenti né import: la parola nell'import o in un commento non conta, serve la chiamata
  const c = leggi("src", "lib", "email", "cron.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/^import[^\n]*\n/gm, "");
  assert.match(c, /timingSafeEqual\(\s*dato\s*,\s*atteso\s*\)/, "manca la chiamata a timingSafeEqual");
  for (const vietato of [/segreto\s*={2,3}/, /={2,3}\s*segreto/, /dato\s*={2,3}/, /atteso\s*={2,3}/, /m\[1\]\s*={2,3}/, /\.toString\(\)\s*={2,3}/, /\.localeCompare\(/, /\.includes\(\s*segreto/, /\.startsWith\(\s*segreto/]) assert.ok(!vietato.test(c), `il segreto si confronta con ${vietato}`);
});

// ============================================================ coerenza con la migrazione
function filiDiCodice(dir = path.join(radice, "src")) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => { if (e.name.startsWith("__")) return []; const p = path.join(dir, e.name); return e.isDirectory() ? filiDiCodice(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : []; });
}
test("chiamate: ogni chiamata a una funzione delle email porta esattamente i parametri della migrazione", () => {
  const funzioni = new Map(); for (const m of sql.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)/g)) funzioni.set(m[1], [...m[2].matchAll(/\b(p_\w+)\s/g)].map((x) => x[1]).sort());
  const nomi = ["preferenze_email_mie", "imposta_email_notifiche", "reclama_notifiche_email", "annulla_invio_email", "registra_esito_email", "deposita_email_di_prova", "disiscrivi_email", "email_di_prova_staff", "registro_email_staff"];
  for (const nome of nomi) assert.ok(funzioni.has(nome), `la migrazione non definisce ${nome}`);
  const trovate = new Map(nomi.map((x) => [x, 0]));
  for (const file of filiDiCodice()) {
    const codice = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const nome of nomi) for (const m of codice.matchAll(new RegExp(`"${nome}"\\s*(?:,\\s*\\{([^}]*)\\}|\\))`, "g"))) {
      const usati = m[1] === undefined ? [] : [...m[1].matchAll(/\b(p_\w+)\s*:/g)].map((x) => x[1]).sort();
      assert.deepEqual(usati, funzioni.get(nome), `${path.relative(radice, file)} chiama ${nome} con ${JSON.stringify(usati)}, la migrazione vuole ${JSON.stringify(funzioni.get(nome))}`); trovate.set(nome, trovate.get(nome) + 1);
    }
  }
  for (const [nome, k] of trovate) assert.ok(k >= 1, `nessuna chiamata a ${nome} nel codice`);
});

test("migrazione: le funzioni dell'invio sono SOLO del ruolo di servizio, e le tabelle non hanno permessi diretti", () => {
  for (const f of ["reclama_notifiche_email(integer)", "annulla_invio_email(uuid[], boolean)", "registra_esito_email(uuid, text, text, integer, text)", "deposita_email_di_prova(uuid, text, text)", "disiscrivi_email(text)"]) {
    assert.ok(sql.includes(`public.${f}`), f);
  }
  assert.match(sql, /revoke all on function\s+public\.reclama_notifiche_email\(integer\),[\s\S]*?from public, anon, authenticated;/); assert.match(sql, /grant execute on function\s+public\.reclama_notifiche_email\(integer\),[\s\S]*?to service_role;/);
  for (const t of ["preferenze_email", "registro_email", "email_di_prova"]) { assert.match(sql, new RegExp(`alter table ${t} enable row level security;`)); assert.match(sql, new RegExp(`revoke all on ${t} from anon, authenticated;`)); }
  assert.ok(!/create policy[^;]*(preferenze_email|registro_email|email_di_prova)/.test(sql), "c'è una policy sulle tabelle delle email");
});

test("migrazione: le condizioni sulle notifiche stanno DENTRO il blocco, non fuori (altrimenti due invii mandano la stessa notifica)", () => {
  const blocco = sql.match(/bloccate as \(([\s\S]*?)\),\s*marcate as/)[1];
  assert.match(blocco, /email_inviata_at is null/); assert.match(blocco, /email_tentativi < 3/); assert.match(blocco, /letta_at is null/); assert.match(blocco, /for update of n skip locked/);
  assert.match(sql, /where n\.id = b\.id\s+and n\.email_inviata_at is null/);
});

test("migrazione: il registro non ha colonne con contenuto o indirizzi, e le notifiche già esistenti non generano email", () => {
  const registro = sql.match(/create table if not exists registro_email \(([\s\S]*?)\n\);/)[1]; assert.ok(!/email\s+text|indirizzo|testo|oggetto|html|dati/i.test(registro.replace(/n_notifiche/g, "")), registro);
  assert.match(sql, /update notifiche set email_inviata_at = now\(\);/);
  assert.match(sql, /if not exists \(\s*select 1 from information_schema\.columns/, "l'aggiornamento delle notifiche esistenti deve avvenire una volta sola");
});

test("errori: ogni codice che la migrazione può sollevare ha una frase sua", () => {
  const G = v.messaggioErroreVerifica("qualcosa di sconosciuto");
  for (const c of [...new Set([...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]))]) { const f = v.messaggioErroreVerifica(`ERROR: ${c} (P0001)`); assert.notEqual(f, G, `${c} non ha un messaggio`); assert.ok(!f.includes(c)); }
});

test("privacy: la cartella delle email non ha accesso alla rete, né legge variabili d'ambiente, né scrive nei log", () => {
  for (const f of ["tipi.ts", "modello.ts", "provvisorio.ts", "invio.ts"]) {
    const c = leggi("src", "lib", "email", f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const vietato of [/\bfetch\(/, /XMLHttpRequest/, /process\.env/, /console\./, /supabase/i, /localStorage/, /\bimport\s+(?!type)(?![^;]*from\s+"\.\.?\/)/]) assert.ok(!vietato.test(c), `${f} usa ${vietato}`);
  }
});

// ============================================================ i percorsi pubblici e i gestori
test("middleware: la disiscrizione e l'invio sono pubblici, e SOLO quelli (non tutto «/api» né tutto «/email»)", () => {
  const m = leggi("src", "lib", "supabase", "middleware.ts"); const elenco = m.match(/const PUBLIC_PATHS = \[([^\]]*)\]/)[1];
  const voci = [...elenco.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.ok(voci.includes("/email/disiscrivi") && voci.includes("/api/email/"), voci.join());
  for (const troppo of ["/api", "/api/", "/email", "/email/", "/"]) assert.ok(!voci.includes(troppo), `il percorso pubblico «${troppo}» è troppo largo`);
  // un percorso vicino ma diverso non diventa pubblico per via del prefisso
  for (const privato of ["/api/emails", "/api/altro", "/emailx", "/staff/email"]) assert.ok(!voci.some((p) => privato.startsWith(p)), `${privato} risulterebbe pubblico`);
});

test("gestori: le due route sono dinamiche (mai in cache) e l'invio controlla il segreto prima di tutto", () => {
  const invia = leggi("src", "app", "api", "email", "invia", "route.ts"), un = leggi("src", "app", "api", "email", "disiscrivi", "[token]", "route.ts");
  for (const c of [invia, un]) assert.match(c, /export const dynamic = "force-dynamic"/);
  assert.match(invia, /Cache-Control": "no-store"/);
  const iAut = invia.indexOf("autorizzaCron("), iServ = invia.indexOf("eseguiInvioDaAmbiente(urlApp)"); assert.ok(iAut > 0 && iServ > iAut, "l'autorizzazione deve venire prima dell'invio");
  assert.ok(!/console\./.test(invia + un), "le route scrivono nei log");
});

test("gestori: la disiscrizione espone solo POST", () => {
  const un = leggi("src", "app", "api", "email", "disiscrivi", "[token]", "route.ts"); const metodi = [...un.matchAll(/export (?:async )?(?:function|const) (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)].map((m) => m[1]);
  assert.deepEqual(metodi, ["POST"], `metodi esposti: ${metodi.join(", ")}`);
});

test("staff: l'invio a mano controlla che sia lo staff PRIMA di fare qualunque altra cosa", () => {
  const a = leggi("src", "app", "staff", "email", "actions.ts"); const corpo = a.slice(a.indexOf("export async function eseguiInvioManuale"));
  assert.ok(corpo.indexOf("await richiediStaff()") > 0 && corpo.indexOf("await richiediStaff()") < corpo.indexOf("eseguiInvioDaAmbiente"), "il controllo dello staff deve venire per primo");
});

test("la chiave di servizio resta sul server: nessun componente client importa il client di servizio né le funzioni dell'invio", () => {
  for (const f of filiDiCodice()) {
    const c = fs.readFileSync(f, "utf8");
    if (/^["']use client["']/.test(c.trimStart())) assert.ok(!/supabase\/admin|lib\/email\/servizio|CRON_SECRET/.test(c), `${path.relative(radice, f)} è un componente client e importa codice del server`);
  }
});

test("la pagina della disiscrizione non cambia niente da sola: serve un clic di conferma (un modulo con azione)", () => {
  const p = leggi("src", "app", "email", "disiscrivi", "[token]", "page.tsx"); assert.match(p, /<form action=\{disiscrivi\.bind\(null, token\)\}>/); assert.ok(!/rpc\(|clienteAmministratore/.test(p), "la pagina (GET) chiama il database");
});
