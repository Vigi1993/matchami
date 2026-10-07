/**
 * Test delle notifiche (src/lib/notifiche.ts). Si lancia con:   npm test
 *
 * Oltre ai testi, tengono allineati l'app e la migrazione 0019: i tipi,
 * i link che i trigger scrivono, e che ogni tipo abbia chi lo produce.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const n = caricaTs(path.join(radice, "src", "lib", "notifiche.ts"));
const sql = fs.readFileSync(path.join(radice, "supabase", "migrations", "0019_notifiche.sql"), "utf8");
// Dopo la 0019 l'elenco dei tipi e il trigger delle candidature sono stati riscritti dalla 0020
// (il ritiro di una candidatura): la verità è l'ultima definizione.
const sql0020 = fs.readFileSync(path.join(radice, "supabase", "migrations", "0020_ritira_candidatura.sql"), "utf8");

/** I tipi che il vincolo sulla tabella ammette. */
function tipiDelDatabase() {
  // l'ultima definizione del vincolo, in ordine di migrazione
  const tutte = [...(sql + "\n" + sql0020).matchAll(/check \(tipo in \(([\s\S]*?)\)\)/g)];
  assert.ok(tutte.length >= 2, "dovrei trovare il vincolo della 0019 e quello della 0020");
  return [...tutte[tutte.length - 1][1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** Il corpo di tutte le funzioni dei trigger (tutto ciò che sta dopo la sezione 4). */
const trigger =
  sql.slice(sql.indexOf("-- 4. I trigger"), sql.indexOf("-- 5. Pulizia")) +
  "\n" +
  // la 0020 riscrive la funzione delle candidature: si guarda solo da lì in poi
  sql0020.slice(sql0020.indexOf("-- 5. La notifica al proprietario"));

// ------------------------------------------------------------
// I tipi
// ------------------------------------------------------------

test("tipi: quelli dell'app sono quelli del database", () => {
  assert.deepEqual([...n.TIPI_NOTIFICA].sort(), tipiDelDatabase().sort());
});

test("tipi: ogni tipo ha un trigger che lo produce", () => {
  for (const t of tipiDelDatabase()) {
    assert.ok(trigger.includes(`'${t}'`), `nessun trigger produce «${t}»`);
  }
});

test("tipi: i trigger non producono tipi che il database rifiuterebbe", () => {
  const ammessi = new Set(tipiDelDatabase());
  const usati = new Set([
    ...[...trigger.matchAll(/crea_notifica\([^,]+,\s*'([a-z_]+)'/g)].map((m) => m[1]),
    ...[...trigger.matchAll(/v_tipo := '([a-z_]+)'/g)].map((m) => m[1]),
  ]);
  assert.ok(usati.size >= 10, `trovati solo ${usati.size} tipi nei trigger`);
  for (const t of usati) assert.ok(ammessi.has(t), `un trigger scrive «${t}», che il vincolo non ammette`);
});

// ------------------------------------------------------------
// I link
// ------------------------------------------------------------

/** Dove porta ogni percorso, e il file che lo serve. */
const ROTTE = {
  "/": ["src", "app", "(app)", "page.tsx"],
  "/database": ["src", "app", "(app)", "database", "page.tsx"],
  "/candidature": ["src", "app", "(app)", "candidature", "page.tsx"],
  "/profilo": ["src", "app", "(app)", "profilo", "page.tsx"],
  "/gestione-affitti": ["src", "app", "(app)", "gestione-affitti", "page.tsx"],
  "/chat/": ["src", "app", "chat", "[id]", "page.tsx"],
};

test("link: ogni percorso che i trigger scrivono esiste nell'app", () => {
  const letterali = new Set([
    ...[...trigger.matchAll(/'(\/[A-Za-z0-9\-/]*)'/g)].map((m) => m[1]),
    ...[...trigger.matchAll(/'(\/chat\/)' \|\|/g)].map((m) => m[1]),
  ]);
  assert.ok(letterali.size >= 5, `trovati solo ${[...letterali]}`);
  for (const l of letterali) {
    const file = ROTTE[l];
    assert.ok(file, `il trigger porta a «${l}», che non è nella mappa delle rotte: aggiorna il test e controlla che esista`);
    assert.ok(fs.existsSync(path.join(radice, ...file)), `la rotta «${l}» non esiste: ${file.join("/")}`);
  }
});

test("link: sono tutti percorsi interni che il filtro lascia passare", () => {
  for (const l of ["/", "/database", "/candidature", "/profilo", "/gestione-affitti", "/chat/c1111111-1111-1111-1111-111111111111"]) {
    assert.equal(n.linkNotifica({ link: l }), l);
  }
});

test("link: un link ostile non porta fuori dal sito", () => {
  for (const l of ["https://evil.com", "//evil.com", "@evil.com", "/\\evil.com", "javascript:alert(1)", "", "evil", "/a\nb"]) {
    assert.equal(n.linkNotifica({ link: l }), "/", JSON.stringify(l));
  }
});

// ------------------------------------------------------------
// I testi
// ------------------------------------------------------------

test("testi: ogni tipo ha un titolo e un testo suoi, mai la formula generica", () => {
  const generico = n.descriviNotifica("tipo_inesistente", {});
  const visti = new Set();
  for (const t of n.TIPI_NOTIFICA) {
    const d = n.descriviNotifica(t, { titolo: "Casa" });
    assert.ok(d.titolo.trim() && d.testo.trim(), t);
    assert.notEqual(d.titolo, generico.titolo, `«${t}» usa il titolo generico`);
    assert.ok(!/undefined|null|\[object/.test(d.titolo + d.testo), `${t}: ${d.testo}`);
    assert.ok(!visti.has(d.titolo), `due tipi con lo stesso titolo: ${d.titolo}`);
    visti.add(d.titolo);
  }
});

test("testi: un tipo sconosciuto non rompe niente", () => {
  const d = n.descriviNotifica("nuovo_tipo_di_domani", { x: 1 });
  assert.equal(d.titolo, "Novità");
  assert.ok(d.testo.length > 0);
});

test("testi: il titolo dell'annuncio compare tra virgolette, o c'è una formula neutra", () => {
  assert.match(n.descriviNotifica("candidatura_ricevuta", { titolo: "Bilocale Isola" }).testo, /«Bilocale Isola»/);
  assert.match(n.descriviNotifica("candidatura_ricevuta", {}).testo, /un tuo annuncio/);
  assert.match(n.descriviNotifica("candidatura_ricevuta", null).testo, /un tuo annuncio/);
  assert.match(n.descriviNotifica("candidatura_ricevuta", { titolo: "   " }).testo, /un tuo annuncio/);
  assert.match(n.descriviNotifica("candidatura_ricevuta", { titolo: 42 }).testo, /un tuo annuncio/);
  assert.match(n.descriviNotifica("immobile_verificato", { titolo: " Casa " }).testo, /«Casa»/);
});

test("testi: un titolo con codice dentro resta testo, non viene interpretato", () => {
  const t = '<img src=x onerror="alert(1)">';
  assert.ok(n.descriviNotifica("candidatura_ricevuta", { titolo: t }).testo.includes(t));
});

test("testi: chi decide una candidatura non presume il genere di nessuno", () => {
  for (const tipo of n.TIPI_NOTIFICA) {
    const d = n.descriviNotifica(tipo, { titolo: "Casa" });
    const testo = d.testo + " " + d.titolo;
    assert.ok(!/\b(lui|lei|candidato|iscritto|iscritta)\b/i.test(testo), `${tipo}: ${d.testo}`);
    // «candidata» va bene solo come accordo con «persona» (Una persona si è candidata): mai da sola
    for (const m of testo.matchAll(/\bcandidata\b/gi)) {
      assert.match(testo.slice(Math.max(0, m.index - 20), m.index), /persona si è $/, `${tipo}: ${d.testo}`);
    }
  }
});

test("testi: il controllo sul genere sa fermare un testo che lo presume", () => {
  const sbagliati = ["Lui si è candidato.", "Il candidato ha risposto.", "Lei ha accettato.", "Sei stato iscritto.", "Una candidata ha scritto."];
  for (const t of sbagliati) {
    const ferma = /\b(lui|lei|candidato|iscritto|iscritta)\b/i.test(t) || /(?<!persona si è )\bcandidata\b/i.test(t);
    assert.ok(ferma, `non ha fermato: ${t}`);
  }
  assert.ok(!(/\b(lui|lei|candidato|iscritto|iscritta)\b/i.test("Una persona si è candidata a «Casa».") || /(?<!persona si è )\bcandidata\b/i.test("Una persona si è candidata a «Casa».")));
});

test("testi: la notifica di rifiuto e di feedback non rivela il contenuto", () => {
  // il motivo e il voto si leggono nell'app, dove si vede chi è la persona
  const rif = n.descriviNotifica("candidatura_rifiutata", { titolo: "Casa", motivo: "reddito_basso" }).testo;
  assert.ok(!/reddito_basso|reddito/.test(rif), rif);
  const fb = n.descriviNotifica("feedback_ricevuto", { voto: 1, tag: ["x"] }).testo;
  assert.ok(!/\b1\b|voto/.test(fb), fb);
});

// ------------------------------------------------------------
// Tempo e conteggi
// ------------------------------------------------------------

const ORA = Date.parse("2026-10-07T12:00:00Z");
const fa = (ms) => new Date(ORA - ms).toISOString();
const MIN = 60000, H = 3600000, G = 86400000;

test("tempo: adesso, minuti, ore, ieri, giorni, data", () => {
  assert.equal(n.trascorso(fa(0), ORA), "adesso");
  assert.equal(n.trascorso(fa(59 * 1000), ORA), "adesso");
  assert.equal(n.trascorso(fa(1 * MIN), ORA), "1 min fa");
  assert.equal(n.trascorso(fa(59 * MIN), ORA), "59 min fa");
  assert.equal(n.trascorso(fa(60 * MIN), ORA), "1 ora fa");
  assert.equal(n.trascorso(fa(5 * H), ORA), "5 ore fa");
  assert.equal(n.trascorso(fa(23 * H + 59 * MIN), ORA), "23 ore fa");
  assert.equal(n.trascorso(fa(24 * H), ORA), "ieri");
  assert.equal(n.trascorso(fa(47 * H), ORA), "ieri");
  assert.equal(n.trascorso(fa(3 * G), ORA), "3 giorni fa");
  assert.equal(n.trascorso(fa(6 * G), ORA), "6 giorni fa");
  assert.match(n.trascorso(fa(7 * G), ORA), /^\d{1,2} \p{L}+$/u);
  assert.equal(n.trascorso("2026-09-29T12:00:00Z", ORA), "29 settembre");
});

test("tempo: una data nel futuro o illeggibile non produce frasi strane", () => {
  assert.equal(n.trascorso(fa(-10 * MIN), ORA), "adesso");
  assert.equal(n.trascorso("boh", ORA), "");
  assert.equal(n.trascorso("", ORA), "");
});

test("conteggio: niente per zero, il numero fino a 99, poi 99+", () => {
  assert.equal(n.etichettaConteggio(0), "");
  assert.equal(n.etichettaConteggio(-3), "");
  assert.equal(n.etichettaConteggio(NaN), "");
  assert.equal(n.etichettaConteggio(Infinity), "");
  assert.equal(n.etichettaConteggio(1), "1");
  assert.equal(n.etichettaConteggio(99), "99");
  assert.equal(n.etichettaConteggio(100), "99+");
  assert.equal(n.etichettaConteggio(5000), "99+");
  assert.equal(n.etichettaConteggio(3.7), "3");
});

test("conteggio: le non lette si contano dalla data di lettura", () => {
  const e = [{ letta_at: null }, { letta_at: "2026-10-07T10:00:00Z" }, { letta_at: null }];
  assert.equal(n.contaNonLette(e), 2);
  assert.equal(n.contaNonLette([]), 0);
});

test("riga del profilo: singolare, plurale e nessuna", () => {
  assert.equal(n.sottotitoloNovita(0), "Nessuna novità da leggere.");
  assert.equal(n.sottotitoloNovita(-1), "Nessuna novità da leggere.");
  assert.equal(n.sottotitoloNovita(1), "Hai 1 novità da leggere.");
  assert.equal(n.sottotitoloNovita(7), "Hai 7 novità da leggere.");
});
