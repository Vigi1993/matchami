/**
 * Test della verifica del reddito dell'inquilino (src/lib/verifica-inquilino.ts
 * e le parti di src/lib/verifica.ts che usa). Si lancia con:   npm test
 *
 * Oltre alla logica, tengono allineati l'app e la migrazione 0018: il limite
 * di documenti, i tipi ammessi, i nomi dei file e i codici di errore.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const v = caricaTs(path.join(radice, "src", "lib", "verifica-inquilino.ts"));
const base = caricaTs(path.join(radice, "src", "lib", "verifica.ts"));
const sql = fs.readFileSync(path.join(radice, "supabase", "migrations", "0018_verifica_inquilino.sql"), "utf8");

const UID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const dati = (o = {}) => ({ professione: "Dipendente", reddito_mensile: 1800, ...o });
const docs = (...tipi) => tipi.map((tipo) => ({ tipo }));

// ------------------------------------------------------------
// Cosa dire alla persona
// ------------------------------------------------------------

test("stato: verificato dice cosa vedono i proprietari e che decade", () => {
  const d = v.descriviStatoInquilino("verificato", null);
  assert.equal(d.titolo, "Reddito verificato");
  assert.equal(d.tono, "ok");
  assert.match(d.testo, /la verifica decade e va rifatta/);
});

test("stato: in verifica spiega che i documenti non si tolgono ma si possono aggiungere", () => {
  const d = v.descriviStatoInquilino("in_verifica", null);
  assert.equal(d.tono, "attesa");
  assert.match(d.testo, /non puoi toglierli/);
  assert.match(d.testo, /aggiungerne altri/);
});

test("stato: non avviata, senza nota, invita a cominciare", () => {
  const d = v.descriviStatoInquilino("non_avviata", null);
  assert.equal(d.tono, "neutro");
  assert.match(d.testo, /Carica un documento d'identità e una prova del reddito/);
});

test("stato: dopo un rifiuto mostra la nota dello staff e dice di correggere", () => {
  const d = v.descriviStatoInquilino("non_avviata", "La busta paga è illeggibile");
  assert.equal(d.tono, "no");
  assert.equal(d.titolo, "Verifica non riuscita");
  assert.match(d.testo, /La busta paga è illeggibile/);
  assert.match(d.testo, /invia di nuovo/);
});

test("stato: una nota fatta di soli spazi non conta come nota", () => {
  for (const nota of ["", "   ", "\n\t"]) {
    assert.equal(v.descriviStatoInquilino("non_avviata", nota).tono, "neutro", JSON.stringify(nota));
  }
});

test("stato: la nota di un reddito decaduto (scritta dal database) si legge come un rifiuto", () => {
  const nota = "Hai modificato lavoro o reddito dopo la verifica: va rifatta.";
  assert.ok(sql.includes(nota), "la frase che il database scrive deve essere quella che l'app si aspetta");
  assert.equal(v.descriviStatoInquilino("non_avviata", nota).tono, "no");
});

test("riga del profilo: un testo per ogni stato", () => {
  assert.equal(v.rigaProfilo("non_avviata", null).titolo, "Verifica il tuo reddito");
  assert.equal(v.rigaProfilo("non_avviata", null).cta, "Inizia");
  assert.equal(v.rigaProfilo("non_avviata", "x").titolo, "La verifica non è riuscita");
  assert.equal(v.rigaProfilo("in_verifica", null).titolo, "Reddito in verifica");
  assert.equal(v.rigaProfilo("verificato", null).titolo, "Reddito verificato");
});

// ------------------------------------------------------------
// Cosa manca, cosa si può fare
// ------------------------------------------------------------

test("manca: con tutto, niente", () => {
  assert.deepEqual(v.cosaMancaInquilino({ documenti: docs("identita", "reddito"), dati: dati() }), []);
});

test("manca: ogni elemento mancante è nominato", () => {
  const m = v.cosaMancaInquilino({ documenti: [], dati: dati({ professione: null, reddito_mensile: null }) });
  assert.equal(m.length, 4);
  assert.ok(m.some((x) => /lavoro/.test(x)) && m.some((x) => /reddito mensile/.test(x)));
  assert.ok(m.some((x) => /identità/.test(x)) && m.some((x) => /prova del reddito/.test(x)));
});

test("manca: servono entrambi i tipi di documento, non basta uno", () => {
  assert.equal(v.cosaMancaInquilino({ documenti: docs("identita"), dati: dati() }).length, 1);
  assert.equal(v.cosaMancaInquilino({ documenti: docs("reddito"), dati: dati() }).length, 1);
  // più file dello stesso tipo non sostituiscono l'altro tipo
  assert.equal(v.cosaMancaInquilino({ documenti: docs("reddito", "reddito", "reddito"), dati: dati() }).length, 1);
});

test("manca: professione vuota o di soli spazi, e reddito zero o negativo, contano come mancanti", () => {
  for (const professione of [null, "", "   "]) {
    assert.ok(v.cosaMancaInquilino({ documenti: docs("identita", "reddito"), dati: dati({ professione }) }).length >= 1, JSON.stringify(professione));
  }
  for (const reddito_mensile of [null, 0, -100]) {
    assert.ok(v.cosaMancaInquilino({ documenti: docs("identita", "reddito"), dati: dati({ reddito_mensile }) }).length >= 1, String(reddito_mensile));
  }
});

test("invio: possibile solo da «non avviata» e con tutto", () => {
  const tutto = { documenti: docs("identita", "reddito"), dati: dati() };
  assert.equal(v.puoInviareInquilino({ ...tutto, stato: "non_avviata" }), true);
  assert.equal(v.puoInviareInquilino({ ...tutto, stato: "in_verifica" }), false);
  assert.equal(v.puoInviareInquilino({ ...tutto, stato: "verificato" }), false);
  assert.equal(v.puoInviareInquilino({ stato: "non_avviata", documenti: docs("identita"), dati: dati() }), false);
});

test("documenti: si tolgono solo prima dell'invio", () => {
  assert.equal(v.puoTogliereDocumenti("non_avviata"), true);
  assert.equal(v.puoTogliereDocumenti("in_verifica"), false);
  assert.equal(v.puoTogliereDocumenti("verificato"), false);
});

test("documenti: il limite è quello del database", () => {
  const m = sql.match(/select count\(\*\) from documenti_inquilino d where d\.tenant_id = auth\.uid\(\)\) < (\d+)/);
  assert.ok(m, "non trovo il limite nella policy della migrazione");
  assert.equal(v.LIMITE_DOCUMENTI, Number(m[1]));
  assert.equal(v.puoAggiungereDocumento(v.LIMITE_DOCUMENTI - 1), true);
  assert.equal(v.puoAggiungereDocumento(v.LIMITE_DOCUMENTI), false);
  assert.equal(v.puoAggiungereDocumento(v.LIMITE_DOCUMENTI + 5), false);
});

test("documenti: i tipi dell'app sono quelli del database", () => {
  const m = sql.match(/tipo text not null check \(tipo in \(([^)]*)\)\)/);
  assert.ok(m, "non trovo il vincolo sul tipo");
  const nelDb = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
  assert.deepEqual([...v.TIPI_DOCUMENTO_INQUILINO].sort(), nelDb);
  for (const t of v.TIPI_DOCUMENTO_INQUILINO) {
    assert.ok(v.ETICHETTE_DOCUMENTO[t] && v.AIUTO_DOCUMENTO[t], `manca l'etichetta o l'aiuto per ${t}`);
  }
});

// ------------------------------------------------------------
// I nomi dei file: ciò che il database richiede
// ------------------------------------------------------------

const percorso = (tipo, o = {}) =>
  base.percorsoDocumento({ userId: UID, tipo, listingId: null, estensione: "pdf", id: "11111111-2222-3333-4444-555555555555", ...o });

/** La regola della policy di inserimento: percorso like uid || '/inquilino-' || tipo || '-%' */
const comePolicy = (p, tipo) => new RegExp(`^${UID}/inquilino-${tipo}-.*$`).test(p);

test("percorsi: i due tipi hanno il nome che la policy di inserimento richiede", () => {
  assert.ok(sql.includes("percorso like auth.uid()::text || '/inquilino-' || tipo || '-%'"), "la policy è cambiata: aggiorna il test e il codice");
  assert.ok(comePolicy(percorso("inquilino-identita"), "identita"), percorso("inquilino-identita"));
  assert.ok(comePolicy(percorso("inquilino-reddito"), "reddito"), percorso("inquilino-reddito"));
});

test("percorsi: un tipo non passa per l'altro", () => {
  assert.equal(comePolicy(percorso("inquilino-identita"), "reddito"), false);
  assert.equal(comePolicy(percorso("inquilino-reddito"), "identita"), false);
});

test("percorsi: i file dei proprietari e i contratti non somigliano a quelli dell'inquilino", () => {
  for (const tipo of ["identita", "proprieta", "contratto"]) {
    const p = percorso(tipo, { listingId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" });
    assert.equal(comePolicy(p, "identita"), false, p);
    assert.equal(comePolicy(p, "reddito"), false, p);
    // e la regola con cui si tolgono i file (nome che comincia per «inquilino-») non li tocca
    assert.equal(p.split("/").pop().startsWith("inquilino-"), false, p);
  }
});

test("percorsi: tutti i file dell'inquilino si possono togliere, e nient'altro", () => {
  assert.ok(sql.includes("storage.filename(name) like 'inquilino-%'"), "la regola di cancellazione è cambiata");
  for (const tipo of ["inquilino-identita", "inquilino-reddito"]) {
    assert.ok(percorso(tipo).split("/").pop().startsWith("inquilino-"), tipo);
  }
});

test("percorsi: cominciano con l'id di chi carica e non si possono deviare", () => {
  const p = percorso("inquilino-reddito", { userId: "../x/" + UID, id: "../../y" });
  assert.ok(!p.includes(".."), p);
  assert.equal((p.match(/\//g) ?? []).length, 1, "una sola cartella: " + p);
});

// ------------------------------------------------------------
// I messaggi di errore
// ------------------------------------------------------------

const GENERICO = base.messaggioErroreVerifica("qualcosa di sconosciuto");

test("errori: ogni codice che la migrazione può sollevare ha una frase sua", () => {
  const codici = [...new Set([...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]))];
  assert.ok(codici.length >= 10, `trovati solo ${codici.length} codici`);
  for (const c of codici) {
    const frase = base.messaggioErroreVerifica(`ERROR: ${c} (P0001)`);
    assert.notEqual(frase, GENERICO, `il codice ${c} non ha un messaggio: la persona vedrebbe «Riprova»`);
    assert.ok(!frase.includes(c), `${c} compare nella frase`);
  }
});

test("errori: le frasi dell'inquilino non parlano di «immobile»", () => {
  for (const c of ["NON_INQUILINO", "INQUILINO_GIA_VERIFICATO", "INQUILINO_GIA_IN_VERIFICA", "DOCUMENTI_INQUILINO_MANCANTI",
                   "DATI_PROFILO_MANCANTI", "INQUILINO_NON_IN_VERIFICA", "INQUILINO_NOTA_OBBLIGATORIA", "INQUILINO_INESISTENTE"]) {
    assert.ok(!/immobile/i.test(base.messaggioErroreVerifica(c)), `${c}: ${base.messaggioErroreVerifica(c)}`);
  }
});

test("errori: quando un codice ne contiene un altro vince il più specifico", () => {
  // INQUILINO_GIA_VERIFICATO contiene GIA_VERIFICATO: all'inquilino non deve toccare la frase dell'immobile
  assert.match(base.messaggioErroreVerifica("INQUILINO_GIA_VERIFICATO"), /reddito/);
  assert.match(base.messaggioErroreVerifica("GIA_VERIFICATO"), /immobile/);
  assert.match(base.messaggioErroreVerifica("INQUILINO_NON_IN_VERIFICA"), /persona/);
  assert.match(base.messaggioErroreVerifica("NON_IN_VERIFICA"), /immobile/);
  assert.match(base.messaggioErroreVerifica("INQUILINO_NOTA_OBBLIGATORIA"), /la persona la leggerà/);
  assert.match(base.messaggioErroreVerifica("NOTA_OBBLIGATORIA"), /il proprietario la leggerà/);
  // anche con il testo completo che manda il database
  assert.match(base.messaggioErroreVerifica("ERROR: INQUILINO_GIA_IN_VERIFICA (P0001)"), /tua richiesta/);
});

test("errori: gli errori che non sono dell'inquilino continuano a funzionare", () => {
  assert.match(base.messaggioErroreVerifica("IMMOBILE_NON_TUO"), /immobile/);
  assert.match(base.messaggioErroreVerifica("DOCUMENTI_MANCANTI"), /prova di proprietà/);
  assert.match(base.messaggioErroreVerifica("RAPPORTO_NON_VERIFICATO"), /affitto/);
  assert.match(base.messaggioErroreVerifica("NON_STAFF"), /permessi/);
  assert.equal(base.messaggioErroreVerifica(null), GENERICO);
  assert.equal(base.messaggioErroreVerifica(undefined), GENERICO);
});

test("errori: il testo tecnico non arriva mai alla persona", () => {
  const frase = base.messaggioErroreVerifica('ERROR: new row violates row-level security policy for table "documenti_inquilino"');
  assert.equal(frase, GENERICO);
});
