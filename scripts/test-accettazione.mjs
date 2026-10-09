/**
 * Test dell'accettazione dell'informativa (src/lib/informativa.ts). Si lancia con:   npm test
 *
 * La domanda che questi test difendono: «una volta accettata, l'informativa resta
 * accettata?». Un'accettazione che non si ricorda, o che viene chiesta a ogni
 * accesso, è un difetto, anche se ogni singola parte «funziona».
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const lib = caricaTs(path.join(radice, "src", "lib", "informativa.ts"));
const { INFORMATIVA } = caricaTs(path.join(radice, "src", "content", "informativa.ts"));
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8");

const U1 = "11111111-1111-1111-1111-111111111111", U2 = "22222222-2222-2222-2222-222222222222";
const riga = (user_id, versione, accettata_at = "2026-10-01T10:00:00Z") => ({ user_id, versione, accettata_at });

/**
 * Un finto Supabase che si comporta come PostgREST: filtri `eq` e `in`, ordine, limite, e soprattutto
 * `maybeSingle()` che dà ERRORE quando le righe sono più di una (è ciò che fa il vero).
 */
function finto(righe, { errore = null } = {}) {
  const richieste = [];
  function costruttore(tabella) {
    const filtri = []; let ordine = null, limite = null;
    const calcola = () => {
      let r = righe.filter((x) => filtri.every((f) => f(x)));
      if (ordine) r = [...r].sort((a, b) => (a[ordine.col] < b[ordine.col] ? 1 : -1) * (ordine.asc ? -1 : 1));
      return limite === null ? r : r.slice(0, limite);
    };
    const b = {
      select(c) { richieste.push(["select", tabella, c]); return b; },
      eq(col, val) { filtri.push((r) => r[col] === val); richieste.push(["eq", col, val]); return b; },
      in(col, lista) { filtri.push((r) => lista.includes(r[col])); richieste.push(["in", col, lista]); return b; },
      order(col, o) { ordine = { col, asc: o?.ascending !== false }; richieste.push(["order", col]); return b; },
      limit(n) { limite = n; richieste.push(["limit", n]); return b; },
      maybeSingle() { richieste.push(["maybeSingle"]); if (errore) return Promise.resolve({ data: null, error: { message: errore } }); const r = calcola(); if (r.length > 1) return Promise.resolve({ data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } }); return Promise.resolve({ data: r[0] ?? null, error: null }); },
      then(ok, ko) { const esito = errore ? { data: null, error: { message: errore } } : { data: calcola(), error: null }; return Promise.resolve(esito).then(ok, ko); },
    };
    return b;
  }
  return { from: costruttore, richieste };
}

const AMMESSE = lib.versioniAccettabili(INFORMATIVA);

// ------------------------------------------------------------
// Le versioni che valgono
// ------------------------------------------------------------

test("versioni accettabili: quella in vigore e le equivalenti, senza doppioni", () => {
  assert.equal(AMMESSE[0], INFORMATIVA.versione);
  assert.equal(new Set(AMMESSE).size, AMMESSE.length);
  assert.deepEqual(lib.versioniAccettabili({ versione: "a" }), ["a"]);
  assert.deepEqual(lib.versioniAccettabili({ versione: "a", equivalenti: ["b", "a", "b", "c"] }), ["a", "b", "c"]);
});

// ------------------------------------------------------------
// «Una volta accettata, resta accettata»
// ------------------------------------------------------------

test("mai accettata: non risulta accettata", async () => {
  assert.equal(await lib.haAccettatoInformativa(finto([]), U1, AMMESSE), false);
});

test("accettata la versione in vigore: risulta accettata, a ogni controllo successivo", async () => {
  const db = finto([riga(U1, INFORMATIVA.versione)]);
  for (let i = 0; i < 5; i++) assert.equal(await lib.haAccettatoInformativa(db, U1, AMMESSE), true, `controllo ${i + 1}`);
});

test("accettata una versione EQUIVALENTE (un testo provvisorio precedente): non si chiede di nuovo", async () => {
  for (const v of INFORMATIVA.equivalenti) assert.equal(await lib.haAccettatoInformativa(finto([riga(U1, v)]), U1, AMMESSE), true, v);
});

test("accettata una versione che NON è equivalente: va riaccettata", async () => {
  assert.equal(await lib.haAccettatoInformativa(finto([riga(U1, "2026-09-vecchia-1")]), U1, AMMESSE), false);
  assert.equal(await lib.haAccettatoInformativa(finto([riga(U1, "2026-10-provvisoria-99")]), U1, AMMESSE), false, "una versione futura non vale");
});

test("L'INSIDIA: chi ha accettato PIÙ versioni (quindi ha più righe) passa lo stesso", async () => {
  // con `maybeSingle()` il vero Supabase dà errore con più righe, e l'errore vale «non accettata»: la
  // persona verrebbe fermata proprio perché ha accettato più volte
  const db = finto([riga(U1, "2026-10-provvisoria-3"), riga(U1, "2026-10-provvisoria-5"), riga(U1, INFORMATIVA.versione)]);
  assert.equal(await lib.haAccettatoInformativa(db, U1, AMMESSE), true);
  assert.ok(!db.richieste.some((r) => r[0] === "maybeSingle"), "la lettura usa maybeSingle");
  assert.ok(db.richieste.some((r) => r[0] === "limit" && r[1] === 1), "la lettura non è limitata a una riga");
});

test("la controprova: una lettura con maybeSingle su più righe darebbe «non accettata» (il finto lo riproduce)", async () => {
  const db = finto([riga(U1, "2026-10-provvisoria-3"), riga(U1, INFORMATIVA.versione)]);
  const { data, error } = await db.from("accettazioni_informativa").select("versione").eq("user_id", U1).in("versione", AMMESSE).maybeSingle();
  assert.equal(data, null); assert.match(error.message, /multiple/);
});

test("le accettazioni di un'altra persona non contano", async () => {
  assert.equal(await lib.haAccettatoInformativa(finto([riga(U2, INFORMATIVA.versione)]), U1, AMMESSE), false, "U1 non ha accettato niente: le righe sono di U2");
  assert.equal(await lib.haAccettatoInformativa(finto([riga(U2, INFORMATIVA.versione)]), U2, AMMESSE), true);
});

test("la lettura filtra per persona e per le sole versioni valide", async () => {
  const db = finto([riga(U1, INFORMATIVA.versione)]); await lib.haAccettatoInformativa(db, U1, AMMESSE);
  assert.ok(db.richieste.some((r) => r[0] === "eq" && r[1] === "user_id" && r[2] === U1), "manca il filtro sulla persona");
  const lista = db.richieste.find((r) => r[0] === "in" && r[1] === "versione")[2]; assert.deepEqual(lista, AMMESSE);
});

test("se la lettura non riesce si risponde NO (si ferma, invece di lasciar passare) e non si lancia un errore", async () => {
  const silenzio = console.error; console.error = () => {};
  try { assert.equal(await lib.haAccettatoInformativa(finto([riga(U1, INFORMATIVA.versione)], { errore: "boom" }), U1, AMMESSE), false); }
  finally { console.error = silenzio; }
});

test("si accetta anche una versione sola, come stringa", async () => {
  assert.equal(await lib.haAccettatoInformativa(finto([riga(U1, "x-1")]), U1, "x-1"), true);
  assert.equal(await lib.haAccettatoInformativa(finto([riga(U1, "x-1")]), U1, "x-2"), false);
});

test("la data: la più recente tra le accettazioni valide, e nulla se non c'è", async () => {
  const db = finto([riga(U1, "2026-10-provvisoria-3", "2026-10-01T10:00:00Z"), riga(U1, INFORMATIVA.versione, "2026-10-05T10:00:00Z"), riga(U1, "2026-09-vecchia-1", "2026-12-01T10:00:00Z")]);
  assert.equal(await lib.dataAccettazione(db, U1, AMMESSE), "2026-10-05T10:00:00Z", "la più recente tra le VALIDE, non tra tutte");
  assert.equal(await lib.dataAccettazione(finto([]), U1, AMMESSE), null);
  assert.equal(await lib.dataAccettazione(finto([riga(U2, INFORMATIVA.versione)]), U1, AMMESSE), null);
});

// ------------------------------------------------------------
// Il codice usa la lettura giusta, dappertutto
// ------------------------------------------------------------

function filiDiCodice(dir = path.join(radice, "src")) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith("__")) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? filiDiCodice(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

test("guardia: ogni controllo dell'accettazione passa l'elenco delle versioni valide, mai la sola versione in vigore", () => {
  let chiamate = 0;
  for (const f of filiDiCodice()) {
    if (f.endsWith(path.join("lib", "informativa.ts"))) continue;
    const codice = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const m of codice.matchAll(/haAccettatoInformativa\(([^;]*?)\)\)?\s*(?:\)|\{|;|&&|\|\|)/g)) {
      chiamate++; assert.match(m[1], /versioniAccettabili\(INFORMATIVA/, `${path.relative(radice, f)}: ${m[1].trim()}`);
    }
  }
  assert.ok(chiamate >= 5, `trovate solo ${chiamate} chiamate: il controllo non guarda niente`);
});

test("guardia: nessuno legge le accettazioni con maybeSingle, né le confronta con la sola versione in vigore", () => {
  for (const f of filiDiCodice()) {
    const codice = fs.readFileSync(f, "utf8");
    if (/accettazioni_informativa/.test(codice)) {
      const dopo = codice.slice(codice.indexOf("accettazioni_informativa"), codice.indexOf("accettazioni_informativa") + 400);
      assert.ok(!/maybeSingle|\.single\(\)/.test(dopo), `${path.relative(radice, f)} legge le accettazioni con maybeSingle/single`);
      assert.ok(!/\.eq\("versione",\s*INFORMATIVA\.versione\)/.test(codice), `${path.relative(radice, f)} confronta con la sola versione in vigore`);
    }
  }
});

test("guardia: l'accettazione registra la versione in vigore (per la traccia), non una equivalente", () => {
  const a = leggi("src", "app", "informativa", "accetta", "actions.ts");
  assert.match(a, /p_versione: INFORMATIVA\.versione/);
});

test("la guardia sa riconoscere un controllo sbagliato", () => {
  const sbagliato = "if (!(await haAccettatoInformativa(supabase, user.id, INFORMATIVA.versione))) {";
  const m = sbagliato.match(/haAccettatoInformativa\(([^;]*?)\)\)?\s*(?:\)|\{|;|&&|\|\|)/);
  assert.ok(m && !/versioniAccettabili\(INFORMATIVA/.test(m[1]));
});
