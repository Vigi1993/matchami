/**
 * Test dei preferiti e degli scarti (src/lib/scelte.ts). Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const s = caricaTs(path.join(radice, "src", "lib", "scelte.ts"));
const v = caricaTs(path.join(radice, "src", "lib", "verifica.ts"));
const sql = fs.readFileSync(path.join(radice, "supabase", "migrations", "0023_preferiti.sql"), "utf8");
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8");

const sc = (id, tipo = "scartato") => ({ listingId: id, tipo });

// ------------------------------------------------------------
// La storia (su cui si regge «annulla»)
// ------------------------------------------------------------

test("storia: ogni scelta si aggiunge in fondo, senza modificare quella di partenza", () => {
  const a = [sc("1")]; const copia = JSON.parse(JSON.stringify(a));
  const b = s.registra(a, sc("2", "preferito"));
  assert.deepEqual(b, [sc("1"), sc("2", "preferito")]);
  assert.deepEqual(a, copia);
});

test("storia: oltre il limite si dimenticano le più vecchie, non le più recenti", () => {
  let storia = [];
  for (let i = 0; i < 80; i++) storia = s.registra(storia, sc("a" + i));
  assert.equal(storia.length, s.MASSIMO_STORIA);
  assert.equal(storia[0].listingId, "a30");
  assert.equal(storia[storia.length - 1].listingId, "a79");
});

test("storia: l'ultima scelta, e vuota se non ce ne sono", () => {
  assert.equal(s.ultimaScelta([]), null);
  assert.deepEqual(s.ultimaScelta([sc("1"), sc("2", "preferito")]), sc("2", "preferito"));
});

test("annulla: toglie l'ultima e dice quale era; ripetuto torna indietro un passo alla volta", () => {
  let storia = [sc("1"), sc("2", "preferito"), sc("3")];
  const ordine = [];
  for (let i = 0; i < 3; i++) { const r = s.annullaUltima(storia); ordine.push(r.annullata.listingId); storia = r.storia; }
  assert.deepEqual(ordine, ["3", "2", "1"]);
  assert.deepEqual(storia, []);
});

test("annulla: con la storia vuota non fa niente e non crolla", () => {
  const r = s.annullaUltima([]);
  assert.deepEqual(r, { storia: [], annullata: null });
});

test("annulla: l'elenco di partenza non si modifica", () => {
  const a = [sc("1"), sc("2")]; const copia = JSON.parse(JSON.stringify(a));
  s.annullaUltima(a); assert.deepEqual(a, copia);
});

test("dopo una candidatura la storia riparte da zero: non si torna indietro oltre quel punto", () => {
  assert.deepEqual(s.svuota(), []);
});

// ------------------------------------------------------------
// Gli annunci nascosti: si rimettono in una query, quindi devono essere identificativi veri
// ------------------------------------------------------------

const U1 = "11111111-1111-1111-1111-111111111111", U2 = "22222222-2222-2222-2222-222222222222";

test("nascosti: un elenco di identificativi, e la forma con l'oggetto", () => {
  assert.deepEqual(s.idsNascosti([U1, U2]), [U1, U2]);
  assert.deepEqual(s.idsNascosti([{ annunci_nascosti: U1 }, { annunci_nascosti: U2 }]), [U1, U2]);
  assert.deepEqual(s.idsNascosti([U1, { annunci_nascosti: U2 }]), [U1, U2]);
});

test("nascosti: niente doppioni, e un valore che non è un identificativo si scarta", () => {
  assert.deepEqual(s.idsNascosti([U1, U1, U2, U1]), [U1, U2]);
  for (const cattivo of ["", "x", "1", "null", "11111111-1111-1111-1111-11111111111", "11111111-1111-1111-1111-1111111111111", 42, null, undefined, {}, [], true]) {
    assert.deepEqual(s.idsNascosti([cattivo]), [], JSON.stringify(cattivo));
  }
});

test("nascosti: un valore costruito per rompere una query non passa mai", () => {
  // gli identificativi finiscono dentro un filtro «not in (...)»: un testo qualunque lo altererebbe
  for (const x of ["1),(2", `${U1}),id.neq.(x`, `${U1}' or '1'='1`, `${U1}\n${U2}`, `${U1},${U2}`, "'; drop table listings; --"]) {
    assert.deepEqual(s.idsNascosti([x]), [], x);
  }
  for (const id of s.idsNascosti([U1, "x),(y", U2])) assert.match(id, /^[0-9a-f-]{36}$/i);
});

test("nascosti: non è un elenco (errore del database, nullo, testo): nessun annuncio nascosto, nessun crollo", () => {
  for (const x of [null, undefined, "boh", 42, {}, { error: "x" }]) assert.deepEqual(s.idsNascosti(x), [], String(x));
});

test("nascosti: l'identificativo maiuscolo è accettato, una lettera fuori dall'esadecimale no", () => {
  assert.equal(s.idsNascosti(["AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA"]).length, 1);
  assert.equal(s.idsNascosti(["GGGGGGGG-GGGG-GGGG-GGGG-GGGGGGGGGGGG"]).length, 0);
});

// ------------------------------------------------------------
// Testi
// ------------------------------------------------------------

test("riga del Profilo: nessuno, uno, più, e valori strani", () => {
  assert.equal(s.sottotitoloPreferiti(0), "Salva gli annunci che ti interessano, per scegliere con calma");
  assert.equal(s.sottotitoloPreferiti(1), "1 annuncio salvato");
  assert.equal(s.sottotitoloPreferiti(7), "7 annunci salvati");
  // un valore che non è un numero finito e positivo vale zero, mai «NaN annunci» o «Infinity annunci»
  for (const x of [-3, NaN, Infinity, null, undefined, "5"]) assert.equal(s.sottotitoloPreferiti(x), s.sottotitoloPreferiti(0), String(x));
  assert.equal(s.sottotitoloPreferiti(2.9), "2 annunci salvati");
});

test("testi: non presumono il genere e parlano dei 30 giorni giusti", () => {
  const tutto = [s.TESTO_SALVATO, s.TESTO_PREFERITO_TOLTO, s.TESTO_SCARTO_ANNULLATO, s.TESTO_DOVE_SONO, s.TESTO_NESSUN_PREFERITO, s.TESTO_NOTA_PREFERITI, s.TITOLO_TUTTI_SCELTI, s.sottotitoloPreferiti(0)].join(" ");
  assert.ok(!/\b(lui|lei|interessato|interessata|candidato|candidata)\b/i.test(tutto), tutto);
  assert.match(s.TESTO_DOVE_SONO, /dopo 30 giorni/);
  assert.match(s.TESTO_NOTA_PREFERITI, /dopo 30 giorni/);
});

// ------------------------------------------------------------
// La migrazione e le chiamate
// ------------------------------------------------------------

test("regole rispecchiate: i 30 giorni e il tetto di 100 sono quelli della migrazione", () => {
  assert.equal(s.GIORNI_SCARTO, 30);
  // tre usi: la pulizia in «scarta», la pulizia in «salva», e la finestra di «annunci_nascosti»
  assert.equal((sql.match(/interval '30 days'/g) ?? []).length, 3, "i 30 giorni della migrazione non sono più tre");
  assert.equal(s.MASSIMO_PREFERITI, 100);
  assert.match(sql, /where tenant_id = auth\.uid\(\) and tipo = 'preferito'\) >= 100/);
});

const GENERICO = v.messaggioErroreVerifica("qualcosa di sconosciuto");

test("errori: ogni codice che la migrazione può sollevare ha una frase sua, senza codici dentro", () => {
  const codici = [...new Set([...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]))];
  assert.ok(codici.length >= 5, `trovati solo ${codici.length}`);
  for (const c of codici) {
    const frase = v.messaggioErroreVerifica(`ERROR: ${c} (P0001)`);
    assert.notEqual(frase, GENERICO, `il codice ${c} non ha un messaggio`);
    assert.ok(!frase.includes(c), c);
  }
  assert.match(v.messaggioErroreVerifica("TROPPI_PREFERITI"), /100 preferiti/);
});

function filiDiCodice(dir = path.join(radice, "src")) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith("__")) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? filiDiCodice(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

test("chiamate: ogni chiamata a una funzione delle scelte porta esattamente i parametri della migrazione", () => {
  const funzioni = new Map();
  for (const m of sql.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)/g)) funzioni.set(m[1], [...m[2].matchAll(/\b(p_\w+)\s/g)].map((x) => x[1]).sort());
  const nomi = ["scarta_annuncio", "salva_preferito", "annulla_scelta", "annunci_nascosti", "elenco_preferiti", "numero_preferiti"];
  for (const n of nomi) assert.ok(funzioni.has(n), `la migrazione non definisce ${n}`);
  const trovate = new Map(nomi.map((n) => [n, 0]));
  for (const file of filiDiCodice()) {
    const codice = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const nome of nomi) {
      for (const m of codice.matchAll(new RegExp(`"${nome}"\\s*(?:,\\s*\\{([^}]*)\\}|\\))`, "g"))) {
        const usati = m[1] === undefined ? [] : [...m[1].matchAll(/\b(p_\w+)\s*:/g)].map((x) => x[1]).sort();
        assert.deepEqual(usati, funzioni.get(nome), `${path.relative(radice, file)} chiama ${nome} con ${JSON.stringify(usati)}, la migrazione vuole ${JSON.stringify(funzioni.get(nome))}`);
        trovate.set(nome, trovate.get(nome) + 1);
      }
    }
  }
  for (const [nome, n] of trovate) assert.ok(n >= 1, `nessuna chiamata a ${nome} nel codice`);
});

test("migrazione: nessuna scrittura diretta, e una sola regola di lettura: le proprie scelte", () => {
  assert.match(sql, /revoke insert, update, delete on scelte_annunci from authenticated;/);
  assert.match(sql, /for select using \(tenant_id = auth\.uid\(\)\)/);
  assert.ok(!/for (insert|update|delete|all)\b/.test(sql), "c'è una policy di scrittura");
});

test("privacy: la logica delle scelte non ha accesso alla rete né al browser", () => {
  const c = leggi("src", "lib", "scelte.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const vietato of [/\bimport\s+(?!type)/, /\bfetch\(/, /XMLHttpRequest/, /localStorage/, /sessionStorage/, /supabase/i, /console\./]) assert.ok(!vietato.test(c), `${vietato}`);
});
