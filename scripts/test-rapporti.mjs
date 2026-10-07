/**
 * Test dei rapporti di locazione dichiarati e confermati (src/lib/rapporti.ts).
 * Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const r = caricaTs(path.join(radice, "src", "lib", "rapporti.ts"));
const v = caricaTs(path.join(radice, "src", "lib", "verifica.ts"));
const {
  descriviRapporto, descriviRichiesta, ruoloControparte, linkRichiesta,
  messaggioRichiesta, validaPeriodo, validaIndirizzo,
} = r;
const { percorsoDocumento, messaggioErroreVerifica } = v;
const { èUuid, èTokenRapporto } = caricaTs(path.join(radice, "src", "lib", "uuid.ts"));

// ---------------- stati ----------------
test("rapporto: ogni stato ha un'etichetta e un tono diversi", () => {
  const stati = ["da_verificare", "verificato", "respinto"].map((s) => descriviRapporto(s, null));
  assert.deepEqual(stati.map((d) => d.tono), ["attesa", "ok", "respinto"]);
  assert.equal(new Set(stati.map((d) => d.etichetta)).size, 3);
});

test("rapporto respinto: se c'è una nota dice cosa fare, senza inventare un motivo", () => {
  assert.match(descriviRapporto("respinto", "Il contratto non riporta il nome").testo, /ritirare la richiesta/);
  assert.ok(!/nome/.test(descriviRapporto("respinto", "Il contratto non riporta il nome").testo), "la nota si mostra a parte, non dentro la frase");
  assert.doesNotMatch(descriviRapporto("respinto", null).testo, /ritirare/);
});

test("richiesta: in attesa, confermata, rifiutata e scaduta si distinguono", () => {
  assert.equal(descriviRichiesta("in_attesa", false).etichetta, "In attesa di conferma");
  assert.equal(descriviRichiesta("in_attesa", true).etichetta, "Scaduta");
  assert.equal(descriviRichiesta("rifiutata", false).etichetta, "Rifiutata");
  assert.equal(descriviRichiesta("confermata", false).etichetta, "Confermata");
  assert.equal(descriviRichiesta("rifiutata", true).etichetta, "Rifiutata", "una richiesta già risolta non diventa 'scaduta'");
});

test("richiesta: non promette notifiche che non esistono", () => {
  for (const s of ["in_attesa", "confermata", "rifiutata"]) {
    const t = descriviRichiesta(s, false).testo;
    assert.ok(!/ti avviseremo|riceverai (un'|una )?(email|notifica)/i.test(t), t);
  }
});

test("la controparte ha sempre il ruolo opposto", () => {
  assert.equal(ruoloControparte("inquilino"), "proprietario");
  assert.equal(ruoloControparte("proprietario"), "inquilino");
});

// ---------------- link e messaggio ----------------
test("link: porta alla pagina del rapporto, senza doppie barre", () => {
  assert.equal(linkRichiesta("https://matchami.vercel.app", "abc123"), "https://matchami.vercel.app/rapporto/abc123");
  assert.equal(linkRichiesta("https://matchami.vercel.app/", "abc123"), "https://matchami.vercel.app/rapporto/abc123");
  assert.equal(linkRichiesta("https://matchami.vercel.app///", "abc"), "https://matchami.vercel.app/rapporto/abc");
});

test("link: un token ostile non può cambiare il percorso", () => {
  const l = linkRichiesta("https://sito.it", "../../admin?x=1#");
  assert.equal(new URL(l).pathname.split("/").length, 3, l);
  assert.equal(new URL(l).host, "sito.it");
});

test("messaggio: dice cosa succede, compreso che il contratto non si vede", () => {
  const m = messaggioRichiesta({ nomeCreatore: "Tina Rossi", ruolo: "inquilino", link: "https://s.it/rapporto/x" });
  assert.match(m, /Sono Tina Rossi/);
  assert.match(m, /non il contratto/);
  assert.match(m, /https:\/\/s\.it\/rapporto\/x$/);
  assert.match(m, /come inquilino/);
  assert.match(messaggioRichiesta({ nomeCreatore: null, ruolo: "proprietario", link: "x" }), /come proprietario/);
  assert.ok(!messaggioRichiesta({ nomeCreatore: null, ruolo: "proprietario", link: "x" }).includes("Sono "));
});

// ---------------- periodo e indirizzo ----------------
const OGGI = "2026-10-06";
test("periodo: l'affitto deve essere già cominciato", () => {
  assert.equal(validaPeriodo("2023-01-01", "", OGGI), null);
  assert.equal(validaPeriodo(OGGI, "", OGGI), null, "oggi va bene");
  assert.match(validaPeriodo("2026-10-07", "", OGGI), /futura/);
  assert.match(validaPeriodo("2099-01-01", "", OGGI), /futura/);
});

test("periodo: la fine non precede l'inizio, ed è facoltativa", () => {
  assert.equal(validaPeriodo("2023-01-01", "2023-01-01", OGGI), null, "stesso giorno va bene");
  assert.equal(validaPeriodo("2023-01-01", "2024-12-31", OGGI), null);
  assert.equal(validaPeriodo("2023-01-01", "   ", OGGI), null, "spazi = ancora in corso");
  assert.match(validaPeriodo("2023-06-01", "2023-01-01", OGGI), /prima dell'inizio/);
});

test("periodo: date non valide o scritte male vengono rifiutate", () => {
  for (const da of ["", "ieri", "01/01/2023", "2023-13-45", "2023-1-1", "2023-02-30x"]) {
    assert.notEqual(validaPeriodo(da, "", OGGI), null, da);
  }
  assert.match(validaPeriodo("2023-01-01", "boh", OGGI), /non è valida/);
});

test("indirizzo: da 3 a 200 caratteri veri", () => {
  assert.equal(validaIndirizzo("Via Roma 1, Milano"), null);
  assert.equal(validaIndirizzo("abc"), null);
  assert.notEqual(validaIndirizzo("ab"), null);
  assert.notEqual(validaIndirizzo("     "), null, "solo spazi non vale");
  assert.equal(validaIndirizzo("x".repeat(200)), null);
  assert.notEqual(validaIndirizzo("x".repeat(201)), null);
});

// ---------------- percorso del contratto ----------------
const U = "11111111-2222-3333-4444-555555555555";
test("percorso del contratto: nella cartella di chi lo carica e chiamato 'contratto-'", () => {
  const p = percorsoDocumento({ userId: U, tipo: "contratto", listingId: null, estensione: "pdf", id: "abc1" });
  assert.equal(p, `${U}/contratto-abc1.pdf`);
  // è la forma che la funzione del database richiede: uid/contratto-...
  assert.ok(p.startsWith(`${U}/contratto-`));
});

test("percorso del contratto: un immobile eventualmente passato non entra nel nome", () => {
  const p = percorsoDocumento({ userId: U, tipo: "contratto", listingId: "aaaa-bbbb", estensione: "pdf", id: "1" });
  assert.ok(!p.includes("aaaa"), p);
});

test("percorso del contratto: nessun input esce dalla propria cartella", () => {
  for (const a of ["../x", "a/b", "..\\x", "%2e%2e", "a\nb"]) {
    const p = percorsoDocumento({ userId: U, tipo: "contratto", listingId: null, estensione: a, id: a });
    assert.ok(p.startsWith(U + "/contratto-") && !p.slice(U.length + 1).includes("/") && !p.includes(".."), p);
  }
});

// ---------------- errori ----------------
test("errori: ogni codice dei rapporti ha una frase, senza testo tecnico", () => {
  const codici = ["RAPPORTO_INESISTENTE", "INDIRIZZO_NON_VALIDO", "PERIODO_NON_VALIDO", "PERCORSO_NON_VALIDO", "FILE_NON_TROVATO", "TROPPE_RICHIESTE", "RICHIESTA_INESISTENTE", "RICHIESTA_GIA_RISPOSTA", "RICHIESTA_SCADUTA", "RICHIESTA_TUA", "STESSO_RUOLO", "RAPPORTO_ESISTENTE"];
  for (const c of codici) {
    const m = messaggioErroreVerifica("ERROR: " + c + " (P0001)");
    assert.ok(!m.includes(c) && !/ERROR|P0001|Riprova\.$/.test(m) , `${c} -> ${m}`);
  }
});

test("errori: chi risponde con il ruolo sbagliato capisce cosa serve", () => {
  const m = messaggioErroreVerifica("STESSO_RUOLO");
  assert.match(m, /inquilino/); assert.match(m, /proprietario/);
});

// ---------------- feedback: tag e messaggi ----------------
const tra = (testo, apertura, chiusura) => {
  const i = testo.indexOf(apertura); assert.ok(i >= 0, "non trovato: " + apertura);
  const j = testo.indexOf(chiusura, i); assert.ok(j > i, "non chiuso: " + chiusura);
  return testo.slice(i + apertura.length, j);
};
const stringhe = (testo) => [...testo.matchAll(/'((?:[^']|'')*)'|"((?:[^"\\]|\\.)*)"/g)].map((m) => (m[1] ?? m[2]).replace(/''/g, "'"));

test("i TAG dell'app e del database sono la stessa lista", () => {
  // Se divergono, l'app mostra una qualità che il database rifiuta (o viceversa).
  const app = stringhe(tra(fs.readFileSync(path.join(radice, "src", "lib", "constants.ts"), "utf8"), "TAG_RECENSIONE = [", "] as const"));
  const migrazione = fs.readFileSync(path.join(radice, "supabase", "migrations", "0014_recensione_da_rapporto.sql"), "utf8");
  const db = stringhe(tra(migrazione, "tag_recensione_ammessi()\nreturns text[]", "];").replace(/^[\s\S]*?array\[/, ""));
  assert.equal(app.length, 6, "l'app dovrebbe avere 6 tag, ne ha " + app.length);
  assert.deepEqual([...db].sort(), [...app].sort(), "le due liste divergono");
});

test("i dati di prova usano solo tag ammessi (altrimenti il vincolo li rifiuterebbe)", () => {
  const app = stringhe(tra(fs.readFileSync(path.join(radice, "src", "lib", "constants.ts"), "utf8"), "TAG_RECENSIONE = [", "] as const"));
  const seed = fs.readFileSync(path.join(radice, "supabase", "migrations", "seed_demo_data.sql"), "utf8");
  const usati = stringhe(tra(seed, "insert into recensioni", ";")).filter((x) => !/^\s*$/.test(x) && !/^(tenant_id|autore_id|voto|tag)$/.test(x));
  const tag = usati.filter((x) => x.length > 8);
  assert.ok(tag.length >= 1, "non ho trovato tag nel seed");
  for (const t of tag) assert.ok(app.includes(t), `il seed usa un tag fuori lista: "${t}"`);
});

test("feedback: ogni errore della funzione ha una frase sua, mai quella generica", () => {
  const codici = ["RAPPORTO_NON_TUO", "VOTO_NON_VALIDO", "TAG_NON_VALIDI", "PROPRIETARIO_NON_VERIFICATO", "RAPPORTO_NON_VERIFICATO", "RAPPORTO_GIA_RECENSITO"];
  const frasi = codici.map((c) => messaggioErroreVerifica("ERROR: " + c + " (P0001)"));
  for (let i = 0; i < codici.length; i++) {
    assert.ok(!/Riprova\.$/.test(frasi[i]) && !frasi[i].includes(codici[i]), `${codici[i]} -> ${frasi[i]}`);
  }
  assert.equal(new Set(frasi).size, codici.length, "due codici diversi mostrano la stessa frase: una corrispondenza per sottostringa li confonde");
});

test("feedback: il messaggio per chi riprova una recensione è chiaro", () => {
  assert.match(messaggioErroreVerifica("RAPPORTO_GIA_RECENSITO"), /già lasciato/);
  assert.match(messaggioErroreVerifica("VOTO_NON_VALIDO"), /da 1 a 5/);
});

// ---------------- token e id che arrivano dall'indirizzo ----------------
test("token del rapporto: solo 32 caratteri esadecimali minuscoli", () => {
  assert.equal(èTokenRapporto("0123456789abcdef0123456789abcdef"), true);
  assert.equal(èTokenRapporto("ffffffffffffffffffffffffffffffff"), true);
  const cattivi = [
    "", "abc", "0123456789ABCDEF0123456789ABCDEF",            // maiuscole
    "0123456789abcdef0123456789abcde",                          // 31
    "0123456789abcdef0123456789abcdef0",                        // 33
    "0123456789abcdef-123456789abcdef",                         // con un trattino
    "0123456789abcdef0123456789abcdeg",                         // lettera fuori dall'alfabeto esadecimale
    "0123456789abcdef0123456789abcde\n",                        // a capo finale
    " 0123456789abcdef0123456789abcdef",
    "x\"),or=(id.not.is.null", "../../etc/passwd", "%2e%2e%2f",
  ];
  for (const c of cattivi) assert.equal(èTokenRapporto(c), false, JSON.stringify(c));
});

test("UUID: la forma standard e basta", () => {
  assert.equal(èUuid("55555555-5555-5555-5555-555555555555"), true);
  assert.equal(èUuid("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"), true, "le maiuscole sono valide in un UUID");
  for (const c of ["", "abc", "55555555555555555555555555555555", "55555555-5555-5555-5555-55555555555", "55555555-5555-5555-5555-5555555555555",
                   "55555555-5555-5555-5555-55555555555g", "x\"),or=(a", "55555555-5555-5555-5555-555555555555\n", "../x"]) {
    assert.equal(èUuid(c), false, JSON.stringify(c));
  }
});

// ---------------- pronomi ----------------
test("i testi dei rapporti non presumono il genere di nessuno", () => {
  const file = [
    "src/lib/rapporti.ts", "src/lib/verifica.ts", "src/components/RapportiPanel.tsx",
    "src/components/CorniceScura.tsx", "src/components/FormFeedback.tsx", "src/app/staff/actions.ts",
    "src/app/invito/[token]/InvitoClient.tsx",
    "src/components/VerificaRedditoPanel.tsx", "src/components/SelettoreFile.tsx",
    "src/lib/verifica-inquilino.ts", "src/content/informativa.ts",
    "src/lib/notifiche.ts", "src/components/RigaNovita.tsx", "src/app/(app)/notifiche/NotificheLista.tsx",
    "src/app/staff/inquilini/[id]/page.tsx", "src/app/staff/inquilini/[id]/EsitoInquilinoForm.tsx",
  ].map((f) => path.join(radice, f));
  // tutte le pagine e i moduli delle cartelle nuove, compresi i sottolivelli
  const visita = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name); if (e.isDirectory()) visita(p); else if (/\.tsx?$/.test(e.name)) file.push(p); } };
  for (const c of ["src/app/rapporto", "src/app/staff/rapporti"]) visita(path.join(radice, c));
  assert.ok(file.length >= 10, "la scansione deve vedere i file nuovi, ne ha trovati " + file.length);
  for (const f of file) {
    const testo = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const pezzi = [...testo.matchAll(/>([^<>{}]*)</g)].map((m) => m[1])
      .concat([...testo.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]));
    for (const t of pezzi) {
      assert.ok(!/\b(lui|lei)\b/i.test(t) && !/\bgli (riconosci|dai|scrivi|vedi|hai|mand)\w*/i.test(t) && !/\bche gli\b/i.test(t) && !/\bche le (hai|ha)\b/i.test(t), `${path.basename(f)}: "${t.trim()}"`);
    }
  }
});
