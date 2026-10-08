/**
 * Test dell'elenco delle conversazioni (src/lib/conversazioni.ts). Si lancia con:   npm test
 *
 * Oltre ai testi, tengono allineati l'app e la migrazione 0021: le colonne che
 * la funzione restituisce, la lunghezza dell'anteprima, e le regole sullo stato
 * «letto».
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const c = caricaTs(path.join(radice, "src", "lib", "conversazioni.ts"));
const v = caricaTs(path.join(radice, "src", "lib", "verifica.ts"));
const sql = fs.readFileSync(path.join(radice, "supabase", "migrations", "0021_conversazioni.sql"), "utf8");

const conv = (o = {}) => ({ candidatura_id: "c1", titolo: "Bilocale Isola", altro_nome: "Olga Bianchi", ultimo_testo: "Ciao", ultimo_at: "2026-10-07T10:00:00Z", ultimo_mio: false, non_letti: 0, ...o });

// ------------------------------------------------------------
// L'anteprima
// ------------------------------------------------------------

test("anteprima: un messaggio breve resta com'è", () => {
  assert.equal(c.anteprimaMessaggio({ ultimo_testo: "Domani alle 10 va bene?", ultimo_mio: false }), "Domani alle 10 va bene?");
});

test("anteprima: se l'ho scritto io c'è «Tu: » davanti", () => {
  assert.equal(c.anteprimaMessaggio({ ultimo_testo: "Perfetto, grazie", ultimo_mio: true }), "Tu: Perfetto, grazie");
});

test("anteprima: a capo e spazi multipli diventano uno spazio solo", () => {
  assert.equal(c.anteprimaMessaggio({ ultimo_testo: "  Ciao\n\n  come   stai?\t ", ultimo_mio: false }), "Ciao come stai?");
});

test("anteprima: nessun messaggio, testo vuoto o strano: lo dice, senza «null» né «undefined»", () => {
  for (const t of [null, undefined, "", "   ", "\n\t", 42, {}, []]) {
    assert.equal(c.anteprimaMessaggio({ ultimo_testo: t, ultimo_mio: null }), "Nessun messaggio ancora", String(t));
  }
});

test("anteprima: un messaggio lungo si accorcia su una parola intera, con i puntini", () => {
  const lungo = "Buongiorno, volevo sapere se la casa è ancora disponibile e se è possibile organizzare una visita per sabato mattina";
  const a = c.anteprimaMessaggio({ ultimo_testo: lungo, ultimo_mio: false });
  assert.ok(a.endsWith("…"), a);
  assert.ok(Array.from(a).length <= c.LUNGHEZZA_ANTEPRIMA + 1, `troppo lunga: ${Array.from(a).length}`);
  assert.ok(lungo.startsWith(a.slice(0, -1)), "non è un prefisso del testo originale");
  assert.ok(!/\s…$/.test(a), "spazio prima dei puntini");
  // taglia su uno spazio: l'ultima parola mostrata è intera
  const ultimaParola = a.slice(0, -1).split(" ").pop();
  assert.ok(lungo.split(" ").includes(ultimaParola), `parola tagliata: «${ultimaParola}»`);
});

test("anteprima: se il limite cade DENTRO una parola, la parola si toglie intera (non si mostra a metà)", () => {
  // parole di 11 lettere + spazio = 12 caratteri: il limite di 90 cade sempre a metà della parola numero 8
  const testo = "parolalunga ".repeat(20).trim();
  assert.notEqual(testo[c.LUNGHEZZA_ANTEPRIMA], " ", "il caso di prova non cade dentro una parola");
  const a = c.anteprimaMessaggio({ ultimo_testo: testo, ultimo_mio: false });
  assert.ok(a.endsWith("…"));
  for (const parola of a.slice(0, -1).split(" ")) assert.equal(parola, "parolalunga", `parola tagliata: «${parola}»`);
  assert.equal(a, ("parolalunga ".repeat(7).trim()) + "…");
});

test("anteprima: con «Tu: » il testo mostrato è più corto di quanto serve per restare nel limite", () => {
  const a = c.anteprimaMessaggio({ ultimo_testo: "parola ".repeat(40), ultimo_mio: true });
  assert.ok(a.startsWith("Tu: ") && a.endsWith("…"));
  assert.ok(Array.from(a).length <= c.LUNGHEZZA_ANTEPRIMA + 1, `lunghezza ${Array.from(a).length}`);
});

test("anteprima: una parola lunghissima senza spazi si taglia comunque", () => {
  const a = c.anteprimaMessaggio({ ultimo_testo: "x".repeat(500), ultimo_mio: false });
  assert.equal(Array.from(a).length, c.LUNGHEZZA_ANTEPRIMA + 1);
  assert.ok(a.endsWith("…"));
});

test("anteprima: esattamente al limite resta intera, un carattere in più si accorcia", () => {
  const preciso = "a".repeat(c.LUNGHEZZA_ANTEPRIMA);
  assert.equal(c.anteprimaMessaggio({ ultimo_testo: preciso, ultimo_mio: false }), preciso);
  assert.ok(c.anteprimaMessaggio({ ultimo_testo: preciso + "b", ultimo_mio: false }).endsWith("…"));
});

test("anteprima: un'emoji sul confine non si taglia a metà", () => {
  // 88 caratteri, poi un'emoji (due unità di testo) a cavallo del limite
  const testo = "a".repeat(c.LUNGHEZZA_ANTEPRIMA - 1) + "👍👍👍 fine";
  const a = c.anteprimaMessaggio({ ultimo_testo: testo, ultimo_mio: false });
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(a), "carattere spezzato nell'anteprima");
  assert.ok(!a.includes("\ufffd"));
  // e un'emoji intera si mostra
  assert.equal(c.anteprimaMessaggio({ ultimo_testo: "Perfetto 👍", ultimo_mio: false }), "Perfetto 👍");
});

test("anteprima: una frase di soli emoji non rompe niente", () => {
  const e = "😀".repeat(200);
  const a = c.anteprimaMessaggio({ ultimo_testo: e, ultimo_mio: false });
  assert.ok(Array.from(a).length <= c.LUNGHEZZA_ANTEPRIMA + 1);
});

test("anteprima: un testo già accorciato dal database (140) mostra i puntini anche se dopo la pulizia sembra corto", () => {
  // 140 caratteri di cui molti spazi: puliti stanno nel limite, ma il database ha tagliato qui
  const grezzo = ("ok" + " ".repeat(8)).repeat(14);
  assert.equal(Array.from(grezzo).length, c.LUNGHEZZA_DATABASE);
  assert.ok(c.anteprimaMessaggio({ ultimo_testo: grezzo, ultimo_mio: false }).endsWith("…"));
});

test("anteprima: la lunghezza del database è quella della migrazione", () => {
  assert.match(sql, new RegExp(`left\\(ult\\.testo, ${c.LUNGHEZZA_DATABASE}\\)`));
});

test("anteprima: un titolo con codice dentro resta testo", () => {
  const t = '<img src=x onerror="alert(1)">';
  assert.ok(c.anteprimaMessaggio({ ultimo_testo: t, ultimo_mio: false }).includes("<img"));
});

// ------------------------------------------------------------
// Iniziali, conteggi, testi
// ------------------------------------------------------------

test("iniziali: nome e cognome, solo nome, nessun nome", () => {
  assert.equal(c.iniziali("Olga Bianchi"), "OB");
  assert.equal(c.iniziali("Teo"), "T");
  assert.equal(c.iniziali("Utente"), "U");
  assert.equal(c.iniziali("maria rosa bianchi"), "MB");
  assert.equal(c.iniziali("  olga   bianchi "), "OB");
  assert.equal(c.iniziali("Èlena Östberg"), "ÈÖ");
  for (const x of ["", "   ", null, undefined, "123", "---", 5]) assert.equal(c.iniziali(x), "?", String(x));
});

test("conteggio: somma i non letti e ignora valori strani", () => {
  assert.equal(c.totaleNonLetti([{ non_letti: 2 }, { non_letti: 0 }, { non_letti: 3 }]), 5);
  assert.equal(c.totaleNonLetti([]), 0);
  assert.equal(c.totaleNonLetti([{ non_letti: -4 }, { non_letti: NaN }, { non_letti: Infinity }, { non_letti: "3" }, { non_letti: 2.9 }]), 2);
});

test("segnalino: niente per zero, il numero fino a 99, poi 99+", () => {
  assert.equal(c.etichettaNonLetti(0), "");
  assert.equal(c.etichettaNonLetti(1), "1");
  assert.equal(c.etichettaNonLetti(99), "99");
  assert.equal(c.etichettaNonLetti(100), "99+");
});

test("sottotitolo: nessuna, una, più, tutte lette, singolare e plurale", () => {
  assert.equal(c.sottotitoloMessaggi([]), "Le tue conversazioni arrivano qui.");
  assert.equal(c.sottotitoloMessaggi([{ non_letti: 0 }]), "1 conversazione, tutte lette.");
  assert.equal(c.sottotitoloMessaggi([{ non_letti: 0 }, { non_letti: 0 }]), "2 conversazioni, tutte lette.");
  assert.equal(c.sottotitoloMessaggi([{ non_letti: 1 }]), "1 conversazione · 1 messaggio da leggere.");
  assert.equal(c.sottotitoloMessaggi([{ non_letti: 3 }, { non_letti: 0 }, { non_letti: 2 }]), "3 conversazioni · 5 messaggi da leggere.");
});

test("stato vuoto: parla a ciascun ruolo, e un ruolo sconosciuto non rompe niente", () => {
  assert.match(c.testoNessunaConversazione("proprietario"), /quando accetti la candidatura di un inquilino/);
  assert.match(c.testoNessunaConversazione("inquilino"), /quando un proprietario accetta la tua candidatura/);
  assert.match(c.testoNessunaConversazione("boh"), /quando un proprietario accetta la tua candidatura/);
});

test("lettore di schermo: nomina la persona, l'annuncio e i non letti", () => {
  assert.equal(c.descrizioneConversazione(conv()), "Conversazione con Olga Bianchi su Bilocale Isola");
  assert.match(c.descrizioneConversazione(conv({ non_letti: 1 })), /, 1 messaggio non letto$/);
  assert.match(c.descrizioneConversazione(conv({ non_letti: 4 })), /, 4 messaggi non letti$/);
});

test("testi: non presumono il genere di nessuno", () => {
  const tutto = [c.sottotitoloMessaggi([{ non_letti: 2 }]), c.testoNessunaConversazione("proprietario"), c.testoNessunaConversazione("inquilino"), c.anteprimaMessaggio({ ultimo_testo: null, ultimo_mio: null })].join(" ");
  assert.ok(!/\b(lui|lei|iscritto|iscritta)\b/i.test(tutto), tutto);
});

// ------------------------------------------------------------
// La migrazione
// ------------------------------------------------------------

test("migrazione: le colonne che la funzione restituisce sono quelle che l'app si aspetta", () => {
  const m = sql.match(/returns table \(([\s\S]*?)\)\s*language sql/);
  assert.ok(m, "non trovo le colonne restituite");
  const colonne = [...m[1].matchAll(/^\s*(\w+)\s/gm)].map((x) => x[1]);
  assert.deepEqual(colonne, ["candidatura_id", "titolo", "altro_nome", "ultimo_testo", "ultimo_at", "ultimo_mio", "non_letti"]);
  // le stesse chiavi del tipo dell'app
  const esempio = Object.keys(conv()).sort();
  assert.deepEqual([...colonne].sort(), esempio);
});

test("migrazione: solo le candidature accettate, solo di chi chiama", () => {
  assert.match(sql, /c\.status = 'accettata'/);
  assert.match(sql, /\(c\.tenant_id = auth\.uid\(\) or l\.owner_id = auth\.uid\(\)\)/);
  assert.match(sql, /where auth\.uid\(\) is not null/);
  assert.match(sql, /revoke all on function public\.elenco_conversazioni\(\) from public, anon;/);
});

test("migrazione: i non letti non contano i propri messaggi", () => {
  assert.match(sql, /m\.mittente_id <> auth\.uid\(\)\s+and not m\.letto/);
});

test("migrazione: «segna come letti» tocca solo i messaggi dell'altra persona", () => {
  assert.match(sql, /mittente_id <> auth\.uid\(\)\s+and not letto/);
  assert.match(sql, /raise exception 'CONVERSAZIONE_NON_TUA'/);
});

test("migrazione: chi scrive non decide lo stato «letto», e nessuno modifica i messaggi", () => {
  assert.match(sql, /new\.letto := false;/);
  assert.match(sql, /before insert on messaggi/);
  assert.match(sql, /revoke update, delete on messaggi from authenticated, anon;/);
});

test("migrazione: i messaggi vecchi si segnano letti SOLO alla prima esecuzione", () => {
  const blocco = sql.slice(sql.indexOf("-- 1. I messaggi già scritti"), sql.indexOf("-- 2. Lo stato"));
  assert.match(blocco, /if not exists \(select 1 from pg_proc where proname = 'segna_messaggi_letti'\)/);
  assert.match(blocco, /update messaggi set letto = true where letto = false/);
  // e la funzione che fa da segnale si crea DOPO, non prima
  assert.ok(sql.indexOf("create or replace function public.segna_messaggi_letti") > sql.indexOf("-- 1. I messaggi già scritti"));
});

// ------------------------------------------------------------
// Gli errori
// ------------------------------------------------------------

const GENERICO = v.messaggioErroreVerifica("qualcosa di sconosciuto");

test("errori: ogni codice che la migrazione può sollevare ha una frase sua", () => {
  const codici = [...new Set([...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]))];
  assert.ok(codici.length >= 2);
  for (const cod of codici) {
    const frase = v.messaggioErroreVerifica(`ERROR: ${cod} (P0001)`);
    assert.notEqual(frase, GENERICO, `il codice ${cod} non ha un messaggio`);
    assert.ok(!frase.includes(cod), cod);
  }
});
