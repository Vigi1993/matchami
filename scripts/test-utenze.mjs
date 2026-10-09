/**
 * Test dei collegamenti ai fornitori di utenze (src/lib/utenze.ts). Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const u = caricaTs(path.join(radice, "src", "lib", "utenze.ts"));
const { INFORMATIVA } = caricaTs(path.join(radice, "src", "content", "informativa.ts"));
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8");
const link = (o = {}) => ({ id: "x", categoria: "luce", nome: "Fornitore", descrizione: "d", url: "https://example.com/x", esempio: true, sponsorizzato: false, ...o });

// ------------------------------------------------------------
// Il catalogo
// ------------------------------------------------------------

test("catalogo: ogni categoria ha almeno un link, e gli identificativi sono unici", () => {
  const ids = u.CATALOGO_UTENZE.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length, "identificativi doppi");
  for (const c of u.CATEGORIE_UTENZE) assert.ok(u.CATALOGO_UTENZE.some((l) => l.categoria === c.id), `nessun link per ${c.id}`);
  for (const l of u.CATALOGO_UTENZE) assert.ok(u.CATEGORIE_UTENZE.some((c) => c.id === l.categoria), `categoria sconosciuta: ${l.categoria}`);
});

test("catalogo: ogni voce ha nome e descrizione, e nessuna è vuota", () => {
  for (const l of u.CATALOGO_UTENZE) { assert.ok(l.nome.trim().length > 2, l.id); assert.ok(l.descrizione.trim().length > 5, l.id); }
});

test("catalogo: ogni indirizzo è accettabile (https, senza credenziali né tracciamento)", () => {
  for (const l of u.CATALOGO_UTENZE) assert.deepEqual(u.controllaUrl(l.url), { ok: true }, `${l.id}: ${l.url}`);
});

test("catalogo: finché i link sono DI ESEMPIO stanno su domini riservati agli esempi, mai su un sito vero", () => {
  for (const l of u.CATALOGO_UTENZE) if (l.esempio) assert.ok(u.eDominioEsempio(l.url), `${l.id} è «di esempio» ma punta a ${l.url}`);
});

test("catalogo: un link con un rapporto commerciale è dichiarato sponsorizzato; e un fornitore vero non è un «esempio»", () => {
  for (const l of u.CATALOGO_UTENZE) {
    if (!l.esempio) assert.ok(!u.eDominioEsempio(l.url), `${l.id} non è un esempio ma sta su un dominio di esempio`);
    assert.equal(typeof l.sponsorizzato, "boolean", l.id);
  }
});

test("catalogo: oggi nessun link è sponsorizzato (non c'è nessun rapporto commerciale)", () => {
  assert.equal(u.haSponsorizzati(u.CATALOGO_UTENZE), false);
  assert.equal(u.haEsempi(u.CATALOGO_UTENZE), true);
});

// ------------------------------------------------------------
// Gli indirizzi
// ------------------------------------------------------------

test("indirizzi: solo https, senza credenziali, senza parametri di tracciamento", () => {
  assert.deepEqual(u.controllaUrl("https://example.com/a"), { ok: true });
  assert.deepEqual(u.controllaUrl("https://example.com/a?piano=12"), { ok: true }, "un parametro qualunque va bene");
  for (const [url, parte] of [["http://example.com/a", /https/], ["ftp://example.com/a", /https/], ["javascript:alert(1)", /https/], ["https://u:p@example.com/a", /credenziali/], ["https://example.com/a?utm_source=app", /tracciamento/], ["https://example.com/a?ref=matchami", /tracciamento/], ["https://example.com/a?affiliate_id=7", /tracciamento/], ["https://example.com/a?gclid=x", /tracciamento/], ["https://example.com/a?fbclid=x", /tracciamento/], ["https://example.com/a?clickid=1", /tracciamento/], ["https://example.com/a?partner=matchami", /tracciamento/], ["https://example.com/a?piano=1&UTM_MEDIUM=x", /tracciamento/]]) {
    const r = u.controllaUrl(url); assert.equal(r.ok, false, url); assert.match(r.motivo, parte, url);
  }
});

test("indirizzi: valori che non sono indirizzi", () => {
  for (const x of [null, undefined, 42, {}, [], "", "   ", "non un indirizzo", "//example.com/a", "example.com/a"]) assert.equal(u.controllaUrl(x).ok, false, JSON.stringify(x));
});

test("dominio di esempio: il dominio e i suoi sottodomini, ma non un dominio che gli somiglia", () => {
  for (const x of ["https://example.com/a", "https://www.example.com/a", "https://a.b.example.org/x", "https://EXAMPLE.NET/x"]) assert.equal(u.eDominioEsempio(x), true, x);
  for (const x of ["https://notexample.com/a", "https://example.com.evil.it/a", "https://example-com.it/a", "https://miosito.it/example.com", "boh", ""]) assert.equal(u.eDominioEsempio(x), false, x);
});

// ------------------------------------------------------------
// Mostrare
// ------------------------------------------------------------

test("mostrabili: un link con un indirizzo non accettabile si scarta, invece di mostrarlo", () => {
  const e = [link({ id: "ok" }), link({ id: "http", url: "http://example.com/x" }), link({ id: "trk", url: "https://example.com/x?utm_source=a" }), link({ id: "senzanome", nome: "  " })];
  assert.deepEqual(u.linkMostrabili(e).map((l) => l.id), ["ok"]);
});

test("per categoria: nell'ordine delle categorie, e senza categorie vuote", () => {
  const e = [link({ id: "i", categoria: "internet" }), link({ id: "l1", categoria: "luce" }), link({ id: "l2", categoria: "luce" })];
  const g = u.raggruppaPerCategoria(e);
  assert.deepEqual(g.map((x) => x.id), ["luce", "internet"], "il gas non ha link: non compare");
  assert.deepEqual(g[0].link.map((l) => l.id), ["l1", "l2"]);
  assert.deepEqual(u.raggruppaPerCategoria([]), []);
  assert.equal(g[0].etichetta, "Luce");
});

test("per categoria: i link scartati non compaiono nemmeno nei gruppi, e un gruppo che resta vuoto sparisce", () => {
  const g = u.raggruppaPerCategoria([link({ id: "a", categoria: "gas", url: "http://example.com/x" })]);
  assert.deepEqual(g, []);
});

test("esempi e sponsorizzati: si riconoscono, e un link scartato non conta", () => {
  assert.equal(u.haEsempi([link({ esempio: false })]), false);
  assert.equal(u.haSponsorizzati([link({ sponsorizzato: true })]), true);
  assert.equal(u.haSponsorizzati([link({ sponsorizzato: true, url: "http://x.it" })]), false);
});

// ------------------------------------------------------------
// Testi e coerenza con l'informativa
// ------------------------------------------------------------

test("testi: non promettono ciò che non c'è (attivazioni, importi, scadenze) e non presumono il genere", () => {
  const tutto = [u.SOTTOTITOLO_UTENZE, u.AVVISO_ESEMPIO, u.ETICHETTA_SPONSORIZZATO, u.NOTA_LINK_ESTERNI].join(" ");
  assert.ok(!/stato attivazion|importi|scadenz|seguire le bollette/i.test(tutto), tutto);
  assert.ok(!/\b(lui|lei)\b/i.test(tutto), tutto);
  assert.match(u.NOTA_LINK_ESTERNI, /non registra su cosa clicchi/);
});

test("informativa: dice che i link portano fuori dall'app e che non si registra su cosa si clicca; e se c'è un link sponsorizzato lo dice", () => {
  const tutto = JSON.stringify(INFORMATIVA);
  assert.match(tutto, /link ai siti di alcuni fornitori/);
  assert.match(tutto, /non registriamo su quali clicchi/);
  if (u.haSponsorizzati(u.CATALOGO_UTENZE)) assert.match(tutto, /sponsorizzat/i, "ci sono link sponsorizzati ma l'informativa non lo dice");
});

test("la schermata non registra i clic: i link sono semplici collegamenti, senza codice che li intercetti", () => {
  const c = leggi("src", "components", "LinkUtenze.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const vietato of [/onClick/, /onMouseDown/, /fetch\(/, /sendBeacon/, /supabase/i, /\.rpc\(/, /localStorage/, /ping=/]) assert.ok(!vietato.test(c), `LinkUtenze usa ${vietato}`);
  assert.match(c, /rel="noopener noreferrer"/); assert.match(c, /referrerPolicy="no-referrer"/); assert.match(c, /target="_blank"/);
});

test("privacy: la logica dei link non ha accesso alla rete né al browser", () => {
  const c = leggi("src", "lib", "utenze.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const vietato of [/\bimport\s+(?!type)/, /\bfetch\(/, /XMLHttpRequest/, /localStorage/, /supabase/i, /console\./]) assert.ok(!vietato.test(c), `${vietato}`);
});
