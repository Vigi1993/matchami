/**
 * Test della logica di verifica degli immobili (src/lib/verifica.ts).
 * Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { caricaTs, radice } from "./carica-ts.mjs";

const v = caricaTs(path.join(radice, "src", "lib", "verifica.ts"));
const {
  descriviStato, cosaManca, puoInviare, proprietarioVerificato,
  validaFileDocumento, estensioneDa, percorsoDocumento, messaggioErroreVerifica,
  DIMENSIONE_MAX_BYTE,
} = v;

const imm = (o = {}) => ({ id: "L1", titolo: "Casa", zona: "Isola", stato: "non_avviata", note: null, nProprieta: 0, ...o });

// ---------------- stati ----------------
test("stato: ogni stato dice a che punto si è, con un tono diverso", () => {
  assert.deepEqual(
    ["non_avviata", "in_verifica", "verificato"].map((s) => descriviStato(s, null).tono),
    ["da_fare", "attesa", "ok"]
  );
});

test("stato: un rifiuto con nota si legge come 'da correggere', non come 'da verificare'", () => {
  const d = descriviStato("non_avviata", "La visura non riporta il tuo nome");
  assert.equal(d.etichetta, "Da correggere");
  assert.equal(d.tono, "respinto");
  assert.equal(descriviStato("non_avviata", "   ").etichetta, "Da verificare", "una nota vuota non conta");
  assert.equal(descriviStato("non_avviata", null).etichetta, "Da verificare");
});

test("stato: non promette notifiche che non esistono", () => {
  const t = descriviStato("in_verifica", null).testo;
  assert.ok(!/ti avviseremo|riceverai (un'|una )?(email|notifica)/i.test(t), t);
});

// ---------------- cosa manca ----------------
test("invio: servono il documento d'identità e una prova di proprietà", () => {
  assert.deepEqual(cosaManca(false, imm()), ["il tuo documento d'identità", "una prova di proprietà dell'immobile (visura o atto)"]);
  assert.deepEqual(cosaManca(true, imm()), ["una prova di proprietà dell'immobile (visura o atto)"]);
  assert.deepEqual(cosaManca(false, imm({ nProprieta: 1 })), ["il tuo documento d'identità"]);
  assert.deepEqual(cosaManca(true, imm({ nProprieta: 2 })), []);
});

test("invio: si può inviare solo un immobile non ancora inviato e con tutto il necessario", () => {
  assert.equal(puoInviare(true, imm({ nProprieta: 1 })), true);
  assert.equal(puoInviare(false, imm({ nProprieta: 1 })), false);
  assert.equal(puoInviare(true, imm({ nProprieta: 0 })), false);
  assert.equal(puoInviare(true, imm({ nProprieta: 1, stato: "in_verifica" })), false);
  assert.equal(puoInviare(true, imm({ nProprieta: 1, stato: "verificato" })), false);
});

test("proprietario verificato: basta un immobile verificato, e nessuna lista non lo è", () => {
  assert.equal(proprietarioVerificato([]), false);
  assert.equal(proprietarioVerificato([imm(), imm({ stato: "in_verifica" })]), false);
  assert.equal(proprietarioVerificato([imm(), imm({ stato: "verificato" })]), true);
});

// ---------------- file ----------------
test("file: PDF, JPG e PNG fino a 10 MB", () => {
  for (const type of ["application/pdf", "image/jpeg", "image/png"]) {
    assert.equal(validaFileDocumento({ type, size: 1000 }), null, type);
  }
  assert.equal(validaFileDocumento({ type: "application/pdf", size: DIMENSIONE_MAX_BYTE }), null, "esattamente 10 MB sì");
});

test("file: tutto il resto viene rifiutato con un motivo", () => {
  for (const type of ["image/gif", "text/html", "application/zip", "image/svg+xml", "application/x-msdownload", "", "image/webp"]) {
    assert.match(validaFileDocumento({ type, size: 1000 }), /PDF/, type);
  }
  assert.match(validaFileDocumento({ type: "application/pdf", size: DIMENSIONE_MAX_BYTE + 1 }), /10 MB/);
  assert.match(validaFileDocumento({ type: "application/pdf", size: 0 }), /vuoto/);
});

test("file: i nomi che ogni oggetto eredita non diventano mai tipi ammessi", () => {
  for (const type of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
    assert.notEqual(validaFileDocumento({ type, size: 10 }), null, type);
    assert.equal(estensioneDa(type), null, type);
  }
});

test("file: un SVG o un HTML non passano mai per documenti (potrebbero contenere script)", () => {
  assert.notEqual(validaFileDocumento({ type: "image/svg+xml", size: 10 }), null);
  assert.notEqual(validaFileDocumento({ type: "text/html", size: 10 }), null);
});

test("file: l'estensione viene dal tipo, non dal nome scelto da chi carica", () => {
  assert.equal(estensioneDa("application/pdf"), "pdf");
  assert.equal(estensioneDa("image/jpeg"), "jpg");
  assert.equal(estensioneDa("image/png"), "png");
  assert.equal(estensioneDa("text/html"), null);
  assert.equal(estensioneDa("__proto__"), null);
  assert.equal(estensioneDa("constructor"), null);
});

// ---------------- percorsi ----------------
const U = "11111111-2222-3333-4444-555555555555";
const L = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

test("percorso: comincia sempre con l'id di chi carica (è ciò che il database richiede)", () => {
  assert.equal(percorsoDocumento({ userId: U, tipo: "identita", listingId: null, estensione: "pdf", id: "x1" }), `${U}/identita-x1.pdf`);
  assert.equal(percorsoDocumento({ userId: U, tipo: "proprieta", listingId: L, estensione: "jpg", id: "x2" }), `${U}/proprieta-${L}-x2.jpg`);
});

test("percorso: nessun input riesce a uscire dalla propria cartella", () => {
  const attacchi = ["../altro", "..\\altro", "a/b", "x/../y", "%2e%2e", "a b", "é", "a\nb", "/etc/passwd", "a;b"];
  for (const a of attacchi) {
    const p = percorsoDocumento({ userId: U, tipo: "proprieta", listingId: a, estensione: "pdf", id: a });
    assert.ok(p.startsWith(U + "/"), p);
    assert.ok(!p.slice(U.length + 1).includes("/"), "una sola barra, quella dopo l'id: " + p);
    assert.ok(!p.includes(".."), p);
  }
  // anche un id utente ostile non fa uscire dalla struttura
  const p = percorsoDocumento({ userId: "../x", tipo: "identita", listingId: null, estensione: "pdf", id: "1" });
  assert.ok(!p.includes(".."), p);
});

// ---------------- errori ----------------
test("errori: ogni codice del database ha una frase, e mai il testo tecnico", () => {
  for (const c of ["NON_AUTENTICATO", "IMMOBILE_NON_TUO", "GIA_VERIFICATO", "GIA_IN_VERIFICA", "DOCUMENTI_MANCANTI", "NON_STAFF", "NON_IN_VERIFICA", "NOTA_OBBLIGATORIA", "IMMOBILE_INESISTENTE"]) {
    const m = messaggioErroreVerifica("ERROR: " + c + " (P0001)");
    assert.ok(!m.includes(c) && !/ERROR|P0001/.test(m), m);
  }
  assert.match(messaggioErroreVerifica("NOTA_OBBLIGATORIA"), /scrivi cosa non va/);
  assert.match(messaggioErroreVerifica("errore sconosciuto con dettagli interni"), /Riprova/);
  assert.ok(!messaggioErroreVerifica("errore sconosciuto con dettagli interni").includes("dettagli interni"));
  assert.match(messaggioErroreVerifica(null), /Riprova/);
});
