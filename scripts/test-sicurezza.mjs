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

// ============================================================
// Cancellazione dell'account
// ============================================================

import fs from "node:fs";
const { CONFERMA_ELIMINAZIONE, confermaEliminazioneValida, BUCKET_FILE_UTENTE, eliminaFileUtente } =
  caricaTs(path.join(radice, "src", "lib", "account.ts"));

test("conferma: serve la parola giusta, non importa maiuscole e spazi", () => {
  assert.equal(CONFERMA_ELIMINAZIONE, "ELIMINA");
  for (const ok of ["ELIMINA", "elimina", "  Elimina  ", "eLiMiNa\n"]) assert.equal(confermaEliminazioneValida(ok), true, ok);
  for (const no of ["", " ", "ELIMINA!", "elimina tutto", "SI", "cancella", "ELIM", "E L I M I N A"]) {
    assert.equal(confermaEliminazioneValida(no), false, JSON.stringify(no));
  }
});

test("OGNI bucket creato nelle migrazioni è nella lista dei file da cancellare", () => {
  // Un bucket dimenticato lascerebbe nello Storage foto e documenti di
  // persone che hanno chiesto di essere cancellate.
  const cartella = path.join(radice, "supabase", "migrations");
  const creati = new Set();
  for (const f of fs.readdirSync(cartella).filter((x) => x.endsWith(".sql"))) {
    const sql = fs.readFileSync(path.join(cartella, f), "utf8");
    // insert into storage.buckets (id, name, public) values ('id', 'nome', ...)
    for (const m of sql.matchAll(/insert\s+into\s+storage\.buckets[^;]*?values\s*\(\s*'([^']+)'/gis)) creati.add(m[1]);
  }
  assert.ok(creati.size >= 2, "dovrei aver trovato almeno i due bucket noti, ne ho trovati " + creati.size);
  for (const b of creati) {
    assert.ok(BUCKET_FILE_UTENTE.includes(b), `il bucket "${b}" non è in BUCKET_FILE_UTENTE (src/lib/account.ts): i suoi file resterebbero dopo la cancellazione`);
  }
});

// un finto Storage: tiene i file in memoria e registra cosa gli viene chiesto
function finto(file, { erroreLista = null, erroreRimozione = null } = {}) {
  const chiamate = [];
  const admin = { storage: { from: (bucket) => ({
    list: async (cartella, opz) => {
      chiamate.push(["list", bucket, cartella]);
      if (erroreLista === bucket) return { data: null, error: { message: "boom" } };
      const dentro = (file[bucket] ?? []).filter((p) => p.startsWith(cartella + "/")).map((p) => ({ name: p.slice(cartella.length + 1) }));
      return { data: dentro.slice(0, opz?.limit ?? 100), error: null };
    },
    remove: async (percorsi) => {
      chiamate.push(["remove", bucket, percorsi.length]);
      if (erroreRimozione === bucket) return { error: { message: "boom" } };
      file[bucket] = (file[bucket] ?? []).filter((p) => !percorsi.includes(p));
      return { error: null };
    },
  }) } };
  return { admin, chiamate };
}

test("eliminaFileUtente: toglie i file della persona e solo i suoi", async () => {
  const file = {
    "avatar-inquilini": ["utente-1/a.jpg", "utente-2/b.jpg"],
    "immobili-foto": ["utente-1/c.jpg", "utente-1/d.jpg", "utente-2/e.jpg"],
  };
  const { admin } = finto(file);
  assert.equal(await eliminaFileUtente(admin, "utente-1"), null);
  assert.deepEqual(file["avatar-inquilini"], ["utente-2/b.jpg"]);
  assert.deepEqual(file["immobili-foto"], ["utente-2/e.jpg"]);
});

test("eliminaFileUtente: un prefisso simile non si porta via i file di un altro", async () => {
  // "utente-1" e "utente-10": la cartella giusta è "utente-1/", non il prefisso
  const file = { "avatar-inquilini": ["utente-1/a.jpg", "utente-10/b.jpg"], "immobili-foto": [] };
  await eliminaFileUtente(finto(file).admin, "utente-1");
  assert.deepEqual(file["avatar-inquilini"], ["utente-10/b.jpg"]);
});

test("eliminaFileUtente: più di una pagina di file si svuota tutta", async () => {
  const molti = Array.from({ length: 2500 }, (_, i) => `u/${i}.jpg`);
  const file = { "avatar-inquilini": [], "immobili-foto": molti };
  const { admin, chiamate } = finto(file);
  assert.equal(await eliminaFileUtente(admin, "u"), null);
  assert.equal(file["immobili-foto"].length, 0);
  assert.ok(chiamate.filter((c) => c[0] === "remove").length >= 3, "doveva rimuovere a gruppi");
});

test("eliminaFileUtente: nessun file, nessun errore", async () => {
  assert.equal(await eliminaFileUtente(finto({}).admin, "u"), null);
});

test("eliminaFileUtente: se lo Storage non risponde restituisce un errore, senza fingere di aver finito", async () => {
  const file = { "avatar-inquilini": ["u/a.jpg"], "immobili-foto": ["u/b.jpg"] };
  const r1 = await eliminaFileUtente(finto(file, { erroreLista: "immobili-foto" }).admin, "u");
  assert.match(r1, /immobili-foto/);
  const r2 = await eliminaFileUtente(finto({ "avatar-inquilini": ["u/a.jpg"] }, { erroreRimozione: "avatar-inquilini" }).admin, "u");
  assert.match(r2, /avatar-inquilini/);
});

test("eliminaFileUtente: lo Storage che non toglie mai i file non fa girare per sempre", async () => {
  let giri = 0;
  const admin = { storage: { from: () => ({
    list: async () => { giri++; return { data: [{ name: "a.jpg" }], error: null }; },
    remove: async () => ({ error: null }),
  }) } };
  await eliminaFileUtente(admin, "u", ["un-bucket"]);
  assert.ok(giri <= 51, "dopo " + giri + " giri non si è fermato");
});

// ============================================================
// Feedback del proprietario invitato: cosa si mostra
// ============================================================

const { descriviRequisiti, messaggioInvito } = caricaTs(path.join(radice, "src", "lib", "invito.ts"));
const req = (v, r, iv = false) => ({ proprietario_verificato: v, rapporto_verificato: r, rapporto_in_verifica: iv });

test("requisiti: il modulo compare SOLO con entrambi, in tutte e quattro le combinazioni", () => {
  assert.equal(descriviRequisiti(req(true, true), "Tina").completi, true);
  assert.equal(descriviRequisiti(req(true, false), "Tina").completi, false);
  assert.equal(descriviRequisiti(req(false, true), "Tina").completi, false);
  assert.equal(descriviRequisiti(req(false, false), "Tina").completi, false);
});

test("requisiti: se non si riesce a sapere, il modulo NON compare (si fallisce chiusi)", () => {
  for (const x of [null, undefined, {}, { proprietario_verificato: "true", rapporto_verificato: 1 }]) {
    assert.equal(descriviRequisiti(x, "Tina").completi, false, JSON.stringify(x));
  }
});

test("requisiti: ogni voce dice a che punto è, e quella del contratto nomina l'inquilino", () => {
  const d = descriviRequisiti(req(true, false, true), "Tina Rossi");
  assert.deepEqual(d.voci.map((v) => [v.chiave, v.stato]), [["immobile", "ok"], ["contratto", "in_verifica"]]);
  assert.match(d.voci[1].testo, /Tina Rossi/);
  const niente = descriviRequisiti(req(false, false), "Tina");
  assert.deepEqual(niente.voci.map((v) => v.stato), ["no", "no"]);
});

test("requisiti: un rapporto già verificato non appare mai 'in verifica'", () => {
  assert.equal(descriviRequisiti(req(true, true, true), "T").voci[1].stato, "ok");
});

test("messaggioInvito: dice la verità, con il link e senza promettere 'un minuto'", () => {
  const m = messaggioInvito("Tina", "https://sito.it/invito/abc");
  assert.match(m, /https:\/\/sito\.it\/invito\/abc$/);
  assert.match(m, /Sono Tina/);
  assert.match(m, /verificat/);
  assert.ok(!/un minuto/i.test(m), "promette un minuto");
  assert.ok(!messaggioInvito(null, "x").includes("Sono "), "senza nome non deve scrivere 'Sono'");
});

test("i testi dell'invito non presumono il genere di nessuno", () => {
  // Legge i file veri: l'inquilino può essere una donna, un uomo o altro, e un
  // "lui" o un "gli riconosci" in una pagina rivolta a un estraneo sarebbe
  // sbagliato. Controlla pronomi tonici e atoni di terza persona.
  const file = [
    path.join(radice, "src", "lib", "invito.ts"),
    path.join(radice, "src", "components", "InvitaProprietarioSheet.tsx"),
    path.join(radice, "src", "app", "invito", "[token]", "page.tsx"),
    path.join(radice, "src", "app", "invito", "[token]", "InvitoClient.tsx"),
  ];
  for (const f of file) {
    const testo = fs.readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")          // commenti a blocco
      .replace(/^\s*\/\/.*$/gm, "");               // commenti di riga
    // sia il testo tra i tag sia le stringhe di codice
    const pezzi = [...testo.matchAll(/>([^<>{}]*)</g)].map((m) => m[1])
      .concat([...testo.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]));
    for (const t of pezzi) {
      assert.ok(
        !/\b(lui|lei)\b/i.test(t) && !/\bgli (riconosci|dai|scrivi|vedi|hai)\b/i.test(t) && !/\bche gli\b/i.test(t),
        `${path.basename(f)}: "${t.trim()}"`
      );
    }
  }
  assert.ok(!/\blui\b|\blei\b/i.test(messaggioInvito("Tina", "x")));
});

// ============================================================
// Chiave di servizio di Supabase: si usa solo quella giusta
// ============================================================

const { controllaChiaveDiServizio, chiaveDiServizioDaAmbiente } = caricaTs(path.join(radice, "src", "lib", "chiavi.ts"));
const jwt = (ruolo) => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b({ alg: "HS256", typ: "JWT" })}.${b({ role: ruolo, iss: "supabase" })}.firma`;
};

test("chiave: la chiave segreta nuova va bene", () => {
  const r = controllaChiaveDiServizio("sb_secret_abcdef123456");
  assert.equal(r.ok, true);
  assert.equal(r.tipo, "segreta");
});

test("chiave: la vecchia service_role, in formato JWT, va ancora bene", () => {
  const r = controllaChiaveDiServizio(jwt("service_role"));
  assert.equal(r.ok, true);
  assert.equal(r.tipo, "service_role_legacy");
});

test("chiave: la chiave PUBBLICA incollata per errore viene rifiutata, con un motivo chiaro", () => {
  // Il caso più probabile: la finestra "Connect" mostra per prima questa
  const r = controllaChiaveDiServizio("sb_publishable_abcdef123456");
  assert.equal(r.ok, false);
  assert.match(r.motivo, /PUBBLICA/);
  assert.match(r.motivo, /sb_secret_/, "deve dire cosa cercare");
});

test("chiave: la vecchia anon (JWT pubblico) viene rifiutata", () => {
  const r = controllaChiaveDiServizio(jwt("anon"));
  assert.equal(r.ok, false);
  assert.match(r.motivo, /anon/);
});

test("chiave: un JWT con un ruolo qualunque non passa per service_role", () => {
  for (const ruolo of ["authenticated", "supabase_admin", "", undefined, 42]) {
    assert.equal(controllaChiaveDiServizio(jwt(ruolo)).ok, false, String(ruolo));
  }
});

test("chiave: vuota, spazi, rovinata o di un altro tipo: mai accettata", () => {
  for (const x of [undefined, null, "", "   ", "abc", "eyJ.rotto", "eyJ.eyJ.eyJ", "Bearer sb_secret_x", "sk_live_123", "sb_secret", "SB_SECRET_x"]) {
    assert.equal(controllaChiaveDiServizio(x).ok, false, JSON.stringify(x));
  }
});

test("chiave: spazi o a capo ai lati (capita copiando) non rompono una chiave giusta", () => {
  const r = controllaChiaveDiServizio("  sb_secret_abc123\n");
  assert.equal(r.ok, true);
  assert.equal(r.chiave, "sb_secret_abc123", "restituisce la chiave già pulita");
});

test("ambiente: il nome ufficiale ha la precedenza e il vecchio resta valido", () => {
  assert.equal(chiaveDiServizioDaAmbiente({ SUPABASE_SECRET_KEY: "sb_secret_nuova" }).chiave, "sb_secret_nuova");
  assert.equal(chiaveDiServizioDaAmbiente({ SUPABASE_SERVICE_ROLE_KEY: jwt("service_role") }).ok, true);
  const entrambe = chiaveDiServizioDaAmbiente({ SUPABASE_SECRET_KEY: "sb_secret_nuova", SUPABASE_SERVICE_ROLE_KEY: jwt("service_role") });
  assert.equal(entrambe.chiave, "sb_secret_nuova", "con tutte e due vince quella nuova");
});

test("ambiente: nessuna variabile, o variabile vuota, vale 'non configurata'", () => {
  assert.equal(chiaveDiServizioDaAmbiente({}).ok, false);
  assert.equal(chiaveDiServizioDaAmbiente({ SUPABASE_SECRET_KEY: "" }).ok, false);
  // vuota la nuova ma presente la vecchia: si usa la vecchia
  assert.equal(chiaveDiServizioDaAmbiente({ SUPABASE_SECRET_KEY: "  ", SUPABASE_SERVICE_ROLE_KEY: jwt("service_role") }).ok, true);
});

test("ambiente: la chiave PUBBLICA nella variabile della segreta non diventa mai la chiave di servizio", () => {
  const r = chiaveDiServizioDaAmbiente({ SUPABASE_SECRET_KEY: "sb_publishable_xyz" });
  assert.equal(r.ok, false);
  // e non ricade silenziosamente su altro
  const r2 = chiaveDiServizioDaAmbiente({ SUPABASE_SECRET_KEY: "sb_publishable_xyz", SUPABASE_SERVICE_ROLE_KEY: "" });
  assert.equal(r2.ok, false);
});

test("la chiave di servizio non è mai in una variabile NEXT_PUBLIC_ (finirebbe nel browser)", () => {
  // Legge il codice: nessun file deve leggere la chiave segreta da una variabile pubblica.
  const cartella = path.join(radice, "src");
  const trovati = [];
  const visita = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) visita(p);
    else if (/\.(ts|tsx)$/.test(e.name)) {
      const t = fs.readFileSync(p, "utf8");
      if (/NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE_ROLE)/.test(t)) trovati.push(path.relative(radice, p));
    }
  } };
  visita(cartella);
  assert.deepEqual(trovati, [], "una chiave segreta letta da NEXT_PUBLIC_: " + trovati.join(", "));
});
