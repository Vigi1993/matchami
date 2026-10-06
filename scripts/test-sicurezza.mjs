/**
 * Test dei controlli di sicurezza che non dipendono dal database:
 * percorsi interni e motivi di rifiuto. Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { caricaTs, radice } from "./carica-ts.mjs";

const { percorsoInterno } = caricaTs(path.join(radice, "src", "lib", "percorso.ts"));
const { MOTIVI_RIFIUTO, motivoRifiutoValido, messaggioMotivoRifiuto } = caricaTs(
  path.join(radice, "src", "lib", "motivi-rifiuto.ts")
);

// ============================================================
// Percorsi interni
// ============================================================

test("percorsoInterno: accetta i percorsi del sito", () => {
  for (const ok of ["/", "/profilo", "/invito/abc123", "/invito/abc?x=1&y=2", "/reset-password", "/chat/uuid-123"]) {
    assert.equal(percorsoInterno(ok), ok);
  }
});

test("percorsoInterno: il caso che apriva il redirect, '@evil.com' e simili", () => {
  // con `${origin}${next}` questi finivano su un altro sito
  for (const attacco of ["@evil.com", ".evil.com", "evil.com", "https://evil.com", "http://evil.com/x", "javascript:alert(1)", "data:text/html,x"]) {
    assert.equal(percorsoInterno(attacco), "/", `non doveva passare: ${attacco}`);
  }
});

test("percorsoInterno: barre doppie e rovesciate, che i browser trattano da indirizzo assoluto", () => {
  for (const attacco of ["//evil.com", "///evil.com", "/\\evil.com", "/\\/evil.com", "/ok\\evil", "\\evil.com"]) {
    assert.equal(percorsoInterno(attacco), "/", `non doveva passare: ${JSON.stringify(attacco)}`);
  }
});

test("percorsoInterno: caratteri di controllo e a capo", () => {
  for (const attacco of ["/ok\nSet-Cookie: x=1", "/ok\rx", "/ok\tx", "/ok\u0000x", "/\u007f"]) {
    assert.equal(percorsoInterno(attacco), "/", `non doveva passare: ${JSON.stringify(attacco)}`);
  }
});

test("percorsoInterno: vuoto, null, non stringhe e valori enormi tornano alla riserva", () => {
  for (const x of [undefined, null, "", 42, {}, [], "/" + "a".repeat(600)]) {
    assert.equal(percorsoInterno(x), "/");
  }
  assert.equal(percorsoInterno(undefined, "/profilo"), "/profilo");
  assert.equal(percorsoInterno("@evil.com", "/profilo"), "/profilo");
});

test("percorsoInterno: le barre codificate restano nel sito e quindi passano", () => {
  // "%2f%2fevil.com" non è una barra doppia per il browser: resta un percorso
  const p = "/%2f%2fevil.com";
  assert.equal(percorsoInterno(p), p);
  assert.equal(new URL("https://sito.it" + p).host, "sito.it");
});

test("percorsoInterno: ciò che accetta non può mai cambiare sito", () => {
  const candidati = ["/", "/a", "/a?b=c", "/a#frag", "/%40evil.com", "/@evil.com", "/.evil.com", "/a/../b", "/?next=//evil.com"];
  for (const c of candidati) {
    const risultato = percorsoInterno(c);
    if (risultato !== "/" || c === "/") {
      assert.equal(new URL("https://sito.it" + risultato).host, "sito.it", `usciva dal sito: ${c}`);
    }
  }
});

// ============================================================
// Motivi del rifiuto
// ============================================================

test("motivi del rifiuto: cinque, con chiavi uniche e un testo per ciascuno", () => {
  assert.equal(MOTIVI_RIFIUTO.length, 5);
  assert.equal(new Set(MOTIVI_RIFIUTO.map((m) => m.chiave)).size, 5);
  for (const m of MOTIVI_RIFIUTO) {
    assert.ok(m.scelta.length > 3 && m.messaggio.length > 3);
  }
});

test("motivoRifiutoValido: solo le chiavi della lista, niente testo libero", () => {
  for (const m of MOTIVI_RIFIUTO) assert.equal(motivoRifiutoValido(m.chiave), true);
  for (const x of ["libero", "ALTRO_CANDIDATO", "", null, undefined, 5, {}, "constructor", "toString", "__proto__"]) {
    assert.equal(motivoRifiutoValido(x), false, `non doveva valere: ${String(x)}`);
  }
});

test("messaggioMotivoRifiuto: un valore sconosciuto non mostra mai niente di strano", () => {
  assert.equal(messaggioMotivoRifiuto("altro_candidato"), "Il proprietario ha scelto un altro candidato.");
  for (const x of [null, undefined, "boh", "<script>", 3]) {
    assert.equal(messaggioMotivoRifiuto(x), "Il proprietario non ha indicato un motivo.");
  }
});

test("nessun motivo di rifiuto parla di caratteristiche personali", () => {
  const testo = MOTIVI_RIFIUTO.map((m) => m.scelta + " " + m.messaggio).join(" ").toLowerCase();
  for (const parola of ["figli", "famiglia", "nazional", "etnia", "religion", "età", "sesso", "genere", "straniero", "origine"]) {
    assert.ok(!testo.includes(parola), `compare "${parola}"`);
  }
});

// ============================================================
// Regole sulla nuova password
// ============================================================

const { validaNuovaPassword } = caricaTs(path.join(radice, "src", "lib", "password.ts"));
const { messaggioErroreAccesso } = caricaTs(path.join(radice, "src", "lib", "recupero.ts"));

test("validaNuovaPassword: i tre casi che l'interfaccia deve distinguere", () => {
  assert.equal(validaNuovaPassword("passwordok1", "passwordok1"), null);
  assert.equal(validaNuovaPassword("corta", "corta"), "La nuova password deve avere almeno 8 caratteri.");
  assert.equal(validaNuovaPassword("passwordlunga1", "passwordlunga2"), "Le due password non coincidono.");
});

test("validaNuovaPassword: i limiti sono esatti", () => {
  assert.equal(validaNuovaPassword("1234567", "1234567") !== null, true, "7 caratteri non bastano");
  assert.equal(validaNuovaPassword("12345678", "12345678"), null, "8 sì");
  const a72 = "a".repeat(72);
  assert.equal(validaNuovaPassword(a72, a72), null, "72 byte sì");
  const a73 = "a".repeat(73);
  assert.match(validaNuovaPassword(a73, a73), /troppo lunga/, "73 no");
});

test("validaNuovaPassword: il limite è in byte, non in caratteri", () => {
  // 40 lettere accentate sono 40 caratteri ma 80 byte: bcrypt ne guarderebbe 72
  const accentata = "è".repeat(40);
  assert.match(validaNuovaPassword(accentata, accentata), /troppo lunga/);
});

test("validaNuovaPassword: l'ordine dei controlli non nasconde il problema più grave", () => {
  // corta e diversa: si dice prima che è corta
  assert.match(validaNuovaPassword("abc", "xyz"), /almeno 8/);
});

test("messaggioErroreAccesso: il caso più frequente è il link aperto da un altro browser", () => {
  const m = messaggioErroreAccesso("PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser");
  assert.match(m, /stesso browser/);
  assert.ok(!/PKCE|verifier|storage/i.test(m), "niente gergo tecnico");
});

test("messaggioErroreAccesso: link scaduto o già usato, e qualunque altra cosa", () => {
  assert.match(messaggioErroreAccesso("Email link is invalid or has expired"), /scaduto/);
  assert.match(messaggioErroreAccesso("One-time token already been used"), /scaduto/);
  for (const x of [undefined, null, "", "errore sconosciuto xyz"]) {
    const m = messaggioErroreAccesso(x);
    assert.match(m, /Riprova/);
    assert.ok(!/xyz/.test(m), "un messaggio sconosciuto non viene mostrato tale e quale");
  }
});
