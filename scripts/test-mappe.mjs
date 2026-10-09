/**
 * Test delle mappe e dell'indirizzo degli immobili (src/lib/mappe). Si lancia con:   npm test
 *
 * Contengono il CONTRATTO di ogni fornitore di mappe: girano su tutti quelli
 * registrati in `FORNITORI`, quindi chi ne aggiunge uno vero li ritrova già
 * pronti, e se il suo fornitore non li rispetta falliscono.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const ind = caricaTs(path.join(radice, "src", "lib", "mappe", "indirizzo.ts"));
const prov = caricaTs(path.join(radice, "src", "lib", "mappe", "provvisorio.ts"));
const reg = caricaTs(path.join(radice, "src", "lib", "mappe", "index.ts"));
const v = caricaTs(path.join(radice, "src", "lib", "verifica.ts"));
const sql = fs.readFileSync(path.join(radice, "supabase", "migrations", "0024_indirizzi.sql"), "utf8");
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8");

const OK = { via: "Via Garibaldi", civico: "12", cap: "20121", citta: "Milano" };

// ------------------------------------------------------------
// Pulire e controllare ciò che si scrive
// ------------------------------------------------------------

test("pulisci: spazi ridotti, ai lati niente, a capo e caratteri invisibili tolti", () => {
  assert.equal(ind.pulisci("  Via    Garibaldi \n"), "Via Garibaldi");
  assert.equal(ind.pulisci("Via\tGaribaldi\r\n12"), "Via Garibaldi 12");
  assert.equal(ind.pulisci("Via\u200bGaribaldi"), "Via Garibaldi", "spazio di larghezza zero");
  assert.equal(ind.pulisci("a\u0000b\u0007c"), "a b c");
  assert.equal(ind.pulisci("Via D’Azeglio"), "Via D’Azeglio", "l'apostrofo tipografico resta");
  for (const x of [null, undefined, 42, {}, [], true]) assert.equal(ind.pulisci(x), "", String(x));
});

test("indirizzo valido: viene pulito e restituito", () => {
  const r = ind.validaIndirizzo({ via: "  Via   Garibaldi ", civico: " 12 ", cap: " 20121 ", citta: "  Milano " });
  assert.deepEqual(r, { ok: true, indirizzo: OK });
});

test("la città si propone da sola (Milano), ma se c'è si rispetta", () => {
  assert.equal(ind.validaIndirizzo({ via: "Via Roma", civico: "1", cap: "20100" }).indirizzo.citta, "Milano");
  assert.equal(ind.validaIndirizzo({ via: "Via Roma", civico: "1", cap: "20100", citta: "   " }).indirizzo.citta, "Milano");
  assert.equal(ind.validaIndirizzo({ via: "Via Roma", civico: "1", cap: "10100", citta: "Torino" }).indirizzo.citta, "Torino");
});

test("via: da 3 a 120 caratteri, il messaggio dice cosa fare", () => {
  const e = (via) => ind.validaIndirizzo({ ...OK, via });
  assert.equal(e("Vi").ok, false); assert.match(e("Vi").errore, /Scrivi la via/);
  assert.equal(e("Via").ok, true);
  assert.equal(e("a".repeat(120)).ok, true);
  assert.equal(e("a".repeat(121)).ok, false); assert.match(e("a".repeat(121)).errore, /troppo lunga \(al massimo 120/);
  for (const x of ["", "     ", null, undefined, 5]) assert.equal(e(x).ok, false, String(x));
});

test("civico: da 1 a 12 caratteri", () => {
  const e = (civico) => ind.validaIndirizzo({ ...OK, civico });
  assert.equal(e("").ok, false); assert.match(e("").errore, /numero civico/);
  assert.equal(e("1").ok, true); assert.equal(e("12/A bis ABC").ok, true);
  assert.equal(e("1234567890123").ok, false); assert.match(e("1234567890123").errore, /al massimo 12/);
});

test("CAP: esattamente cinque cifre", () => {
  const e = (cap) => ind.validaIndirizzo({ ...OK, cap });
  assert.equal(e("20121").ok, true);
  for (const x of ["2012", "201210", "2O121", "20 121", "2012a", "", null, "٢٠١٢١", "20121\n20122"]) { assert.equal(e(x).ok, false, JSON.stringify(x)); }
  assert.match(e("2012").errore, /cinque cifre/);
});

test("città: da 2 a 60 caratteri", () => {
  const e = (citta) => ind.validaIndirizzo({ ...OK, citta });
  assert.equal(e("M").ok, false); assert.equal(e("Mi").ok, true); assert.equal(e("a".repeat(60)).ok, true); assert.equal(e("a".repeat(61)).ok, false);
});

test("un testo con codice dentro resta testo, e un testo enorme non rallenta", () => {
  const r = ind.validaIndirizzo({ ...OK, via: '<img src=x onerror="alert(1)"> Roma' });
  assert.equal(r.ok, true); assert.ok(r.indirizzo.via.includes("<img"));
  const inizio = Date.now(); ind.validaIndirizzo({ ...OK, via: "àb ".repeat(1_000_000) }); assert.ok(Date.now() - inizio < 1000, `troppo lento: ${Date.now() - inizio} ms`);
});

test("il primo errore trovato è quello mostrato, nell'ordine in cui la persona compila", () => {
  assert.match(ind.validaIndirizzo({ via: "", civico: "", cap: "", citta: "" }).errore, /la via/);
  assert.match(ind.validaIndirizzo({ via: "Via Roma", civico: "", cap: "", citta: "" }).errore, /civico/);
  assert.match(ind.validaIndirizzo({ via: "Via Roma", civico: "1", cap: "", citta: "" }).errore, /CAP/);
});

test("posizione: dentro l'Italia, numeri finiti, e nient'altro", () => {
  assert.equal(ind.posizioneValida({ latitudine: 45.46, longitudine: 9.19 }), true);
  for (const p of [{ latitudine: 34.99, longitudine: 9 }, { latitudine: 48.01, longitudine: 9 }, { latitudine: 45, longitudine: 5.99 }, { latitudine: 45, longitudine: 19.01 }, { latitudine: NaN, longitudine: 9 }, { latitudine: Infinity, longitudine: 9 }, { latitudine: "45", longitudine: 9 }, { latitudine: 45 }, {}, null, undefined, "boh"]) {
    assert.equal(ind.posizioneValida(p), false, JSON.stringify(p));
  }
  assert.equal(ind.posizioneValida({ latitudine: 35, longitudine: 6 }), true, "i bordi sono dentro, come per il database (between)");
  assert.equal(ind.posizioneValida({ latitudine: 48, longitudine: 19 }), true);
});

test("testo dell'indirizzo", () => {
  assert.equal(ind.formattaIndirizzo(OK), "Via Garibaldi 12, 20121 Milano");
});

test("chiave: lo stesso indirizzo scritto in modi diversi dà la stessa chiave", () => {
  assert.equal(ind.chiaveIndirizzo(OK), ind.chiaveIndirizzo({ via: "  VIA   GARIBALDI", civico: "12", cap: "20121", citta: "milano " }));
  assert.equal(ind.chiaveIndirizzo({ ...OK, via: "Via Càvour" }), ind.chiaveIndirizzo({ ...OK, via: "via cavour" }));
  assert.notEqual(ind.chiaveIndirizzo(OK), ind.chiaveIndirizzo({ ...OK, civico: "13" }));
});

// ------------------------------------------------------------
// Le regole sono quelle del database
// ------------------------------------------------------------

test("regole rispecchiate: i limiti dell'app sono quelli della migrazione", () => {
  assert.match(sql, /char_length\(via\) between 3 and 120/); assert.deepEqual(ind.LIMITI_INDIRIZZO.via, { min: 3, max: 120 });
  assert.match(sql, /char_length\(civico\) between 1 and 12/); assert.deepEqual(ind.LIMITI_INDIRIZZO.civico, { min: 1, max: 12 });
  assert.match(sql, /char_length\(citta\) between 2 and 60/); assert.deepEqual(ind.LIMITI_INDIRIZZO.citta, { min: 2, max: 60 });
  assert.match(sql, /cap ~ '\^\[0-9\]\{5\}\$'/);
  assert.match(sql, /latitudine between 35 and 48/); assert.match(sql, /longitudine between 6 and 19/);
  assert.deepEqual({ ...ind.LIMITI_POSIZIONE }, { latMin: 35, latMax: 48, lngMin: 6, lngMax: 19 });
  assert.match(sql, /origine_posizione in \('provvisoria', 'fornitore'\)/);
});

const GENERICO = v.messaggioErroreVerifica("qualcosa di sconosciuto");

test("errori: ogni codice che la migrazione può sollevare ha una frase sua", () => {
  const codici = [...new Set([...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]))];
  assert.equal(codici.length, 5, `i codici sono cambiati: ${codici.join(", ")}`);
  for (const c of codici) { const f = v.messaggioErroreVerifica(`ERROR: ${c} (P0001)`); assert.notEqual(f, GENERICO, `il codice ${c} non ha un messaggio`); assert.ok(!f.includes(c), c); }
});

test("migrazione: nessuna lettura diretta (nessuna policy, nessun permesso), e solo con un match accettato", () => {
  assert.match(sql, /alter table indirizzi_immobili enable row level security;/);
  assert.match(sql, /revoke all on indirizzi_immobili from anon, authenticated;/);
  assert.ok(!/create policy[^;]*indirizzi_immobili/.test(sql), "c'è una policy sulla tabella degli indirizzi");
  assert.match(sql, /and c\.status = 'accettata'\s+and \(c\.tenant_id = auth\.uid\(\) or l\.owner_id = auth\.uid\(\)\)/);
});

function filiDiCodice(dir = path.join(radice, "src")) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith("__")) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? filiDiCodice(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

test("chiamate: ogni chiamata a una funzione degli indirizzi porta esattamente i parametri della migrazione", () => {
  const funzioni = new Map();
  for (const m of sql.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)/g)) funzioni.set(m[1], [...m[2].matchAll(/\b(p_\w+)\s/g)].map((x) => x[1]).sort());
  const nomi = ["imposta_indirizzo", "rimuovi_indirizzo", "indirizzi_dei_miei_immobili", "indirizzo_per_candidatura"];
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

test("privacy: nessun codice dell'app legge la tabella degli indirizzi direttamente", () => {
  for (const f of filiDiCodice()) assert.ok(!/indirizzi_immobili/.test(fs.readFileSync(f, "utf8")), `${path.relative(radice, f)} nomina la tabella degli indirizzi`);
  for (const f of fs.readdirSync(path.join(radice, "supabase", "migrations")).filter((x) => /^\d{4}_.*\.sql$/.test(x) && x !== "0024_indirizzi.sql")) {
    assert.ok(!/indirizzi_immobili/.test(fs.readFileSync(path.join(radice, "supabase", "migrations", f), "utf8")), `${f} nomina la tabella degli indirizzi`);
  }
});

// ------------------------------------------------------------
// Il fornitore provvisorio
// ------------------------------------------------------------

test("provvisorio: lo stesso indirizzo dà sempre la stessa posizione, anche scritto in modi diversi", async () => {
  const a = await prov.fornitoreProvvisorio.geocodifica(OK, { zona: "Isola, Milano" });
  const b = await prov.fornitoreProvvisorio.geocodifica({ via: "  VIA  garibaldi", civico: "12", cap: "20121", citta: "MILANO" }, { zona: "Isola, Milano" });
  assert.deepEqual(a, b);
  assert.deepEqual(a, await prov.fornitoreProvvisorio.geocodifica(OK, { zona: "Isola, Milano" }));
});

test("provvisorio: due indirizzi diversi nella stessa zona non cadono nello stesso punto", async () => {
  const visti = new Set();
  for (let i = 1; i <= 400; i++) { const p = await prov.fornitoreProvvisorio.geocodifica({ ...OK, civico: String(i) }, { zona: "Navigli, Milano" }); visti.add(`${p.latitudine},${p.longitudine}`); }
  assert.ok(visti.size >= 395, `solo ${visti.size} posizioni diverse su 400`);
});

test("provvisorio: la posizione resta vicina al centro della zona, entro lo spostamento massimo, ed è valida", async () => {
  for (const zona of Object.keys(prov.CENTRI_ZONE)) {
    const c = prov.CENTRI_ZONE[zona];
    for (let i = 0; i < 40; i++) {
      const p = await prov.fornitoreProvvisorio.geocodifica({ via: "Via " + "abcdefghij"[i % 10] + i, civico: String(i + 1), cap: "20121", citta: "Milano" }, { zona: `${zona}, Milano` });
      assert.ok(ind.posizioneValida(p), zona);
      assert.ok(Math.abs(p.latitudine - c.latitudine) <= prov.SPOSTAMENTO_MASSIMO.latitudine + 1e-6, `${zona}: latitudine lontana`);
      assert.ok(Math.abs(p.longitudine - c.longitudine) <= prov.SPOSTAMENTO_MASSIMO.longitudine + 1e-6, `${zona}: longitudine lontana`);
    }
  }
});

test("provvisorio: ogni zona dell'app ha un centro, tutti dentro Milano", () => {
  const zone = [...leggi("src", "lib", "constants.ts").match(/ZONE_MILANO = \[([\s\S]*?)\] as const/)[1].matchAll(/"([^"]+), Milano"/g)].map((m) => m[1]);
  assert.ok(zone.length >= 13, `zone trovate: ${zone.length}`);
  for (const z of zone) assert.ok(prov.CENTRI_ZONE[z], `la zona «${z}» non ha un centro`);
  for (const [z, c] of Object.entries(prov.CENTRI_ZONE)) { assert.ok(c.latitudine > 45.4 && c.latitudine < 45.56 && c.longitudine > 9.05 && c.longitudine < 9.31, `${z} fuori da Milano`); assert.ok(zone.includes(z), `il centro «${z}» non è una zona dell'app`); }
});

test("provvisorio: una zona sconosciuta, vuota o strana usa il centro di Milano, mai un errore", async () => {
  for (const zona of ["Brera, Milano", "", null, undefined, "  ", 42, "__proto__", "constructor"]) {
    const p = await prov.fornitoreProvvisorio.geocodifica(OK, { zona });
    assert.ok(ind.posizioneValida(p), String(zona));
    assert.ok(Math.abs(p.latitudine - prov.CENTRO_MILANO.latitudine) <= prov.SPOSTAMENTO_MASSIMO.latitudine + 1e-6, String(zona));
  }
  assert.ok(ind.posizioneValida(await prov.fornitoreProvvisorio.geocodifica(OK)), "senza contesto");
});

test("provvisorio: un indirizzo vuoto non ha posizione; 5000 indirizzi si calcolano in un battito", async () => {
  assert.equal(await prov.fornitoreProvvisorio.geocodifica({ via: "", civico: "", cap: "", citta: "" }), null);
  const inizio = Date.now();
  for (let i = 0; i < 5000; i++) await prov.fornitoreProvvisorio.geocodifica({ ...OK, civico: String(i) }, { zona: "Loreto, Milano" });
  assert.ok(Date.now() - inizio < 500, `troppo lento: ${Date.now() - inizio} ms`);
});

test("provvisorio: la mappa è un segnaposto che lo dice, senza richieste esterne", () => {
  const vista = prov.fornitoreProvvisorio.vistaMappa({ latitudine: 45.46, longitudine: 9.19 }, OK);
  assert.equal(vista.tipo, "provvisoria");
  assert.match(vista.etichetta, /provvisoria/);
  assert.ok(!("url" in vista), "un segnaposto non ha un indirizzo web");
});

// ------------------------------------------------------------
// La scelta del fornitore
// ------------------------------------------------------------

test("registro: senza configurazione si usa il provvisorio", () => {
  const prima = process.env.MAPPE_PROVIDER; delete process.env.MAPPE_PROVIDER;
  try { assert.equal(reg.fornitoreMappe().id, "provvisorio"); assert.equal(reg.fornitoreMappe("").id, "provvisorio"); assert.equal(reg.fornitoreMappe("  provvisorio  ").id, "provvisorio"); }
  finally { if (prima !== undefined) process.env.MAPPE_PROVIDER = prima; }
});

test("registro: la configurazione dell'ambiente si rispetta", () => {
  const prima = process.env.MAPPE_PROVIDER; process.env.MAPPE_PROVIDER = "provvisorio";
  try { assert.equal(reg.fornitoreMappe().id, "provvisorio"); process.env.MAPPE_PROVIDER = "inesistente"; assert.throws(() => reg.fornitoreMappe(), /Fornitore di mappe sconosciuto/); }
  finally { if (prima === undefined) delete process.env.MAPPE_PROVIDER; else process.env.MAPPE_PROVIDER = prima; }
});

test("registro: un nome sbagliato è un errore che dice quali ci sono, non un ripiego silenzioso", () => {
  assert.throws(() => reg.fornitoreMappe("google"), (e) => /«google»/.test(e.message) && /provvisorio/.test(e.message));
});

test("registro: i nomi che esistono in ogni oggetto JavaScript non passano per fornitori", () => {
  for (const n of ["__proto__", "constructor", "toString", "hasOwnProperty", "prototype", "valueOf"]) assert.throws(() => reg.fornitoreMappe(n), /sconosciuto/, n);
});

// ------------------------------------------------------------
// IL CONTRATTO: gira su ogni fornitore registrato
// ------------------------------------------------------------

const INDIRIZZI_PROVA = [OK, { via: "Corso di Porta Ticinese", civico: "100/B", cap: "20123", citta: "Milano" }, { via: "Via d'Azeglio", civico: "1", cap: "20121", citta: "Milano" }, { via: "Viale Monza", civico: "300", cap: "20126", citta: "Milano" }];

for (const [nome, f] of Object.entries(reg.FORNITORI)) {
  test(`contratto [${nome}]: ha un identificativo uguale al nome con cui è registrato, e un'origine ammessa`, () => {
    assert.equal(f.id, nome);
    assert.ok(["provvisoria", "fornitore"].includes(f.origine), f.origine);
    assert.match(f.id, /^[a-z][a-z0-9_-]*$/, "l'identificativo si usa in una variabile d'ambiente");
  });

  test(`contratto [${nome}]: la geocodifica dà una posizione valida o nulla, mai un errore, e non si inventa fuori dall'Italia`, async () => {
    for (const i of INDIRIZZI_PROVA) {
      const p = await f.geocodifica(i, { zona: "Isola, Milano" });
      assert.ok(p === null || ind.posizioneValida(p), `${nome} ha restituito ${JSON.stringify(p)}`);
    }
  });

  test(`contratto [${nome}]: regge indirizzi strani e contesti mancanti senza lanciare errori`, async () => {
    const strani = [{ via: "", civico: "", cap: "", citta: "" }, { via: "💥".repeat(50), civico: "x", cap: "00000", citta: "?" }, { via: "a".repeat(5000), civico: "1", cap: "20121", citta: "Milano" }];
    for (const i of strani) { await assert.doesNotReject(async () => { const p = await f.geocodifica(i); assert.ok(p === null || ind.posizioneValida(p)); }); }
    await assert.doesNotReject(async () => f.geocodifica(OK, undefined));
    await assert.doesNotReject(async () => f.geocodifica(OK, { zona: null }));
  });

  test(`contratto [${nome}]: la vista della mappa è di un tipo noto e, se ha un indirizzo web, è sicuro`, () => {
    for (const i of INDIRIZZI_PROVA) {
      const vista = f.vistaMappa({ latitudine: 45.46, longitudine: 9.19 }, i);
      assert.ok(["provvisoria", "incorporata", "immagine"].includes(vista.tipo), vista.tipo);
      if (vista.tipo === "incorporata") { assert.match(vista.url, /^https:\/\//, "un riquadro incorporato deve essere https"); assert.ok(vista.titolo && vista.titolo.length > 0, "il riquadro deve avere un titolo (lettori di schermo)"); }
      if (vista.tipo === "immagine") { assert.match(vista.url, /^https:\/\//, "un'immagine deve essere https"); assert.ok(vista.alt && vista.alt.length > 0, "l'immagine deve avere un testo alternativo"); }
      if (vista.tipo === "provvisoria") assert.ok(vista.etichetta && vista.etichetta.length > 0);
    }
  });

  test(`contratto [${nome}]: la vista non dipende da niente di esterno e non cambia da una chiamata all'altra`, () => {
    const p = { latitudine: 45.46, longitudine: 9.19 };
    assert.deepEqual(f.vistaMappa(p, OK), f.vistaMappa(p, OK));
  });

  test(`contratto [${nome}]: un fornitore vero (origine «fornitore») impone di rivedere l'informativa`, () => {
    // quando si registra un fornitore vero, l'indirizzo esce dall'app verso un servizio esterno:
    // il testo dell'informativa lo deve dire. Il test in test-informativa.mjs lo controlla.
    assert.ok(f.origine === "provvisoria" || f.origine === "fornitore");
  });
}

test("il contratto è davvero eseguito: ci sono fornitori registrati, e il test sa riconoscerne uno che lo viola", async () => {
  assert.ok(Object.keys(reg.FORNITORI).length >= 1);
  const cattivo = { id: "x", origine: "fornitore", async geocodifica() { return { latitudine: 12, longitudine: 80 }; }, vistaMappa() { return { tipo: "incorporata", url: "http://non-sicuro", titolo: "" }; } };
  assert.ok(!ind.posizioneValida(await cattivo.geocodifica(OK)), "un fornitore che restituisce una posizione fuori dall'Italia non passa");
  assert.ok(!/^https:\/\//.test(cattivo.vistaMappa().url), "un riquadro http non passa");
});

// ------------------------------------------------------------
// Privacy
// ------------------------------------------------------------

test("privacy: la cartella delle mappe non ha accesso alla rete né al browser (finché il fornitore è provvisorio)", () => {
  for (const f of ["tipi.ts", "indirizzo.ts", "provvisorio.ts"]) {
    const c = leggi("src", "lib", "mappe", f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const vietato of [/\bfetch\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /localStorage/, /sessionStorage/, /supabase/i, /console\./, /\bimport\s+(?!type)(?![^;]*from\s+"\.\/)/]) assert.ok(!vietato.test(c), `${f} usa ${vietato}`);
  }
});

test("errori: il codice dell'indirizzo degli immobili non si scambia con quello degli affitti dichiarati", () => {
  const immobile = v.messaggioErroreVerifica("INDIRIZZO_IMMOBILE_NON_VALIDO");
  const affitto = v.messaggioErroreVerifica("INDIRIZZO_NON_VALIDO");
  assert.notEqual(immobile, affitto);
  assert.match(immobile, /CAP/);
  assert.ok(!/CAP/.test(affitto), "il messaggio degli affitti parla del CAP");
  assert.notEqual(immobile, GENERICO);
});

// ------------------------------------------------------------
// Da una riga del database a un indirizzo con la mappa pronta
// ------------------------------------------------------------

const RIGA = { via: "Via Garibaldi", civico: "12", cap: "20121", citta: "Milano", latitudine: 45.472, longitudine: 9.188, origine_posizione: "provvisoria" };

test("conVista: l'indirizzo, l'origine e la vista del fornitore", () => {
  const r = reg.conVista(RIGA);
  assert.deepEqual(r.indirizzo, OK); assert.equal(r.origine, "provvisoria"); assert.equal(r.vista.tipo, "provvisoria");
  assert.ok(!("latitudine" in r.indirizzo), "la posizione non finisce nell'indirizzo");
});

test("conVista: l'origine «fornitore» si riconosce; un valore sconosciuto vale «provvisoria»", () => {
  assert.equal(reg.conVista({ ...RIGA, origine_posizione: "fornitore" }).origine, "fornitore");
  for (const x of ["", "boh", null, undefined, "FORNITORE", 5]) assert.equal(reg.conVista({ ...RIGA, origine_posizione: x }).origine, "provvisoria", String(x));
});

test("conVista: con il fornitore configurato male l'indirizzo si vede lo stesso, senza mappa", () => {
  const prima = process.env.MAPPE_PROVIDER; process.env.MAPPE_PROVIDER = "inesistente";
  try { const r = reg.conVista(RIGA); assert.deepEqual(r.indirizzo, OK); assert.equal(r.vista, null); }
  finally { if (prima === undefined) delete process.env.MAPPE_PROVIDER; else process.env.MAPPE_PROVIDER = prima; }
});

test("conVista: restituisce solo i campi dell'indirizzo, non altri della riga", () => {
  const r = reg.conVista({ ...RIGA, listing_id: "L1", segreto: "x" });
  assert.deepEqual(Object.keys(r.indirizzo).sort(), ["cap", "citta", "civico", "via"]); assert.deepEqual(Object.keys(r).sort(), ["indirizzo", "origine", "vista"]);
});
