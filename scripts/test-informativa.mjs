/**
 * Test dell'informativa sulla privacy (src/content/informativa.ts e
 * src/lib/informativa.ts). Si lancia con:   npm test
 *
 * Servono a una cosa sola: far sì che il documento provvisorio non diventi
 * per sbaglio qualcosa che non è. Controllano che
 *   - la versione abbia la forma che il database accetta;
 *   - il testo provvisorio non affermi niente di legale, e si dichiari tale;
 *   - un testo definitivo non porti con sé segnaposto o avvisi provvisori;
 *   - ciò che il testo dice dei file corrisponda a come sono davvero
 *     configurati i bucket.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const { INFORMATIVA, SEGNAPOSTO } = caricaTs(path.join(radice, "src", "content", "informativa.ts"));
const { versioneValida, REGOLA_VERSIONE } = caricaTs(path.join(radice, "src", "lib", "informativa.ts"));
const migrazioni = path.join(radice, "supabase", "migrations");

// ------------------------------------------------------------
// Le regole, scritte una volta: si applicano al testo vero e a testi finti
// ------------------------------------------------------------

/** Frasi che farebbero sembrare legale un testo che non lo è. */
const AFFERMAZIONI_LEGALI = [
  /\bGDPR\b/i, /regolamento\s*\(?ue\)?/i, /\bconform[ei]\b|\bconformit/i, /in regola con/i,
  /base giuridica/i, /legittimo interesse/i, /\bai sensi\b/i, /\ba norma di legge\b/i,
  /d\.?\s?lgs/i, /garante per la protezione/i, /\bart\.\s?\d/i,
  /garantiam/i, /totalmente sicur/i, /massima sicurezza/i,
];

/** Ogni stringa di testo di un'informativa, per cercarci dentro. */
function tutteLeStringhe(c) {
  const fuori = [c.titolo ?? "", c.avviso ?? ""];
  const dentro = c.sezioni.flatMap((s) => [s.titolo, ...(s.paragrafi ?? []), ...(s.elenco ?? [])]);
  return [...fuori, ...dentro];
}

/** Restituisce l'elenco dei problemi di un contenuto: vuoto se va bene. */
function problemi(c) {
  const p = [];
  if (!versioneValida(c.versione)) p.push(`versione non valida: ${c.versione}`);

  const titoli = c.sezioni.map((s) => s.titolo);
  if (new Set(titoli).size !== titoli.length) p.push("due sezioni con lo stesso titolo");
  for (const s of c.sezioni) {
    if (!s.titolo?.trim()) p.push("sezione senza titolo");
    if (!(s.paragrafi?.length || s.elenco?.length)) p.push(`sezione vuota: ${s.titolo}`);
  }
  // l'avviso può essere vuoto (in un testo definitivo non c'è): si controllano titolo e sezioni
  const voci = [c.titolo ?? "", ...c.sezioni.flatMap((s) => [s.titolo, ...(s.paragrafi ?? []), ...(s.elenco ?? [])])];
  for (const t of voci) if (!t.trim()) p.push("una voce di testo è vuota");

  if (c.provvisoria) {
    if (!c.avviso?.trim()) p.push("provvisoria ma senza avviso");
    if (!/provvisori/i.test(c.avviso ?? "")) p.push("l'avviso non dice che è provvisorio");
    if (!/dati di prova/i.test(c.avviso ?? "")) p.push("l'avviso non dice di usare dati di prova");
    for (const t of tutteLeStringhe(c)) {
      for (const re of AFFERMAZIONI_LEGALI) if (re.test(t)) p.push(`affermazione legale in un testo provvisorio (${re}): "${t.slice(0, 60)}…"`);
    }
  } else {
    // un testo definitivo non può portarsi dietro i resti del provvisorio
    for (const t of tutteLeStringhe(c)) if (t.includes(SEGNAPOSTO)) p.push(`segnaposto rimasto in un testo definitivo: "${t.slice(0, 60)}…"`);
    if (/documento provvisorio|dati di prova/i.test(c.avviso ?? "")) p.push("avviso provvisorio in un testo definitivo");
  }
  return p;
}

const contenuto = (o = {}) => ({
  versione: "2026-10-prova-1", provvisoria: true, titolo: "T", aggiornata: "x",
  avviso: "Documento provvisorio per il prototipo. Usa solo dati di prova.",
  sezioni: [{ titolo: "A", paragrafi: ["Un testo."] }, { titolo: "B", elenco: ["Una voce."] }],
  ...o,
});

// ------------------------------------------------------------
// La versione
// ------------------------------------------------------------

test("versione: la regola dell'app è identica a quella del database", () => {
  const sql = fs.readFileSync(path.join(migrazioni, "0017_accettazioni_informativa.sql"), "utf8");
  const nelDb = [...sql.matchAll(/~\s*'(\^[^']+\$)'/g)].map((m) => m[1]);
  assert.ok(nelDb.length >= 2, "la regola dovrebbe comparire nel vincolo e nella funzione");
  for (const regola of nelDb) assert.equal(REGOLA_VERSIONE.source, regola, "le due regole divergono");
  assert.match(sql, /length\(versione\) <= 60/);
});

test("versione: quella in vigore la passa", () => {
  assert.equal(versioneValida(INFORMATIVA.versione), true, INFORMATIVA.versione);
});

test("versione: forme valide e non valide", () => {
  for (const ok of ["2026-10-provvisoria-1", "2027-01-legale-1", "2027-03-legale-v2", "2026-10-a"]) assert.equal(versioneValida(ok), true, ok);
  const no = ["", "abc", "2026-10", "2026-10-", "2026-10-Provvisoria", "2026-1-x", "26-10-x", "2026-10-prov visoria",
    "2026-10-x;drop", "2026-10-x\n", " 2026-10-x", "2026-10-x'--", "2026-10-" + "a".repeat(60), "x2026-10-a"];
  for (const v of no) assert.equal(versioneValida(v), false, JSON.stringify(v));
});

// ------------------------------------------------------------
// Il contenuto vero
// ------------------------------------------------------------

test("contenuto: il testo in vigore non ha problemi", () => {
  assert.deepEqual(problemi(INFORMATIVA), []);
});

test("contenuto: il documento provvisorio si dichiara tale e non ha niente di legale", () => {
  assert.equal(INFORMATIVA.provvisoria, true, "se non è più provvisorio, il test sul testo definitivo vale al suo posto");
  assert.match(INFORMATIVA.avviso, /provvisori/i);
  assert.match(INFORMATIVA.avviso, /dati di prova/i);
  assert.match(INFORMATIVA.avviso, /legale/i);
});

test("contenuto: i punti non noti sono segnati, non inventati", () => {
  const tutto = tutteLeStringhe(INFORMATIVA).join("\n");
  assert.ok(tutto.includes(SEGNAPOSTO), "il titolare, il contatto e la regione devono restare da compilare");
  // quanti: titolare, contatto privacy, regione, contatto per i diritti
  assert.ok(tutto.split(SEGNAPOSTO).length - 1 >= 3, "dovrebbero essere almeno tre");
});

test("contenuto: i segnaposto sono scritti in un solo modo (si trovano con una ricerca)", () => {
  const tutto = tutteLeStringhe(INFORMATIVA).join("\n");
  // qualunque cosa tra parentesi quadre deve essere il segnaposto
  for (const m of tutto.matchAll(/\[[^\]]*\]/g)) assert.equal(m[0], SEGNAPOSTO, `segnaposto scritto diversamente: ${m[0]}`);
});

// ------------------------------------------------------------
// Le regole sanno riconoscere un testo sbagliato (altrimenti non valgono)
// ------------------------------------------------------------

test("regole: un contenuto sano non dà problemi", () => {
  assert.deepEqual(problemi(contenuto()), []);
});

test("regole: un testo provvisorio che si spaccia per legale viene fermato", () => {
  for (const frase of ["Il trattamento è conforme al GDPR.", "La base giuridica è il consenso.", "Ai sensi del Regolamento (UE) 2016/679.",
                       "Trattiamo i dati per legittimo interesse.", "Garantiamo la massima sicurezza.", "Come da art. 13."]) {
    const p = problemi(contenuto({ sezioni: [{ titolo: "A", paragrafi: [frase] }] }));
    assert.ok(p.some((x) => x.includes("affermazione legale")), `non ha fermato: ${frase}`);
  }
});

test("regole: 'garante' come persona che garantisce l'affitto non è un'affermazione legale", () => {
  assert.deepEqual(problemi(contenuto({ sezioni: [{ titolo: "A", elenco: ["lavoro, reddito, garante e fideiussione"] }] })), []);
});

test("regole: un provvisorio senza avviso, o che non dice di usare dati di prova, viene fermato", () => {
  assert.ok(problemi(contenuto({ avviso: "" })).length > 0);
  assert.ok(problemi(contenuto({ avviso: "Testo di prova per il prototipo." })).some((x) => x.includes("provvisorio")));
  assert.ok(problemi(contenuto({ avviso: "Documento provvisorio per il prototipo." })).some((x) => x.includes("dati di prova")));
});

test("regole: un testo DEFINITIVO con un segnaposto rimasto viene fermato", () => {
  const p = problemi(contenuto({ provvisoria: false, avviso: "", sezioni: [{ titolo: "A", paragrafi: ["Il titolare è [da indicare]."] }] }));
  assert.ok(p.some((x) => x.includes("segnaposto rimasto")), p.join("; "));
});

test("regole: un testo definitivo con l'avviso provvisorio ancora dentro viene fermato", () => {
  const p = problemi(contenuto({ provvisoria: false }));
  assert.ok(p.some((x) => x.includes("avviso provvisorio")), p.join("; "));
});

test("regole: un testo definitivo pulito, che usa parole legali, è accettato", () => {
  // quando arriva il testo del legale, "GDPR" e "base giuridica" sono legittimi
  const p = problemi(contenuto({ provvisoria: false, avviso: "", versione: "2027-01-legale-1",
    sezioni: [{ titolo: "Base giuridica", paragrafi: ["Il trattamento è conforme al GDPR."] }] }));
  assert.deepEqual(p, []);
});

test("regole: versione sbagliata, sezioni doppie o vuote vengono fermate", () => {
  assert.ok(problemi(contenuto({ versione: "boh" })).some((x) => x.includes("versione")));
  assert.ok(problemi(contenuto({ sezioni: [{ titolo: "A", paragrafi: ["x"] }, { titolo: "A", paragrafi: ["y"] }] })).some((x) => x.includes("stesso titolo")));
  assert.ok(problemi(contenuto({ sezioni: [{ titolo: "A" }] })).some((x) => x.includes("vuota")));
  assert.ok(problemi(contenuto({ sezioni: [{ titolo: "A", paragrafi: ["  "] }] })).some((x) => x.includes("vuota")));
});

// ------------------------------------------------------------
// Ciò che il testo dice dei file corrisponde allo schema
// ------------------------------------------------------------

function bucketDelleMigrazioni() {
  const trovati = new Map();
  for (const f of fs.readdirSync(migrazioni).filter((x) => /^\d{4}_.*\.sql$/.test(x))) {
    const sql = fs.readFileSync(path.join(migrazioni, f), "utf8");
    for (const m of sql.matchAll(/insert\s+into\s+storage\.buckets[^;]*?values\s*\(\s*'([^']+)'\s*,\s*'[^']+'\s*,\s*(true|false)/gis)) {
      trovati.set(m[1], m[2].toLowerCase() === "true");
    }
  }
  return trovati;
}

test("file: i bucket pubblici e privati sono quelli che il testo descrive", () => {
  const bucket = bucketDelleMigrazioni();
  assert.ok(bucket.size >= 3, `dovrei vedere i tre bucket noti, ne vedo ${bucket.size}`);
  const pubblici = [...bucket].filter(([, p]) => p).map(([id]) => id).sort();
  const privati = [...bucket].filter(([, p]) => !p).map(([id]) => id).sort();
  // Se questa uguaglianza cambia, il testo («foto del profilo e degli annunci con
  // indirizzo pubblico, documenti privati») va riscritto: non va lasciato com'è.
  assert.deepEqual(pubblici, ["avatar-inquilini", "immobili-foto"], "i bucket pubblici sono cambiati: aggiorna la sezione 'File e foto'");
  assert.deepEqual(privati, ["documenti-verifica"], "i bucket privati sono cambiati: aggiorna la sezione 'File e foto'");

  const tutto = tutteLeStringhe(INFORMATIVA).join("\n");
  assert.match(tutto, /non richiede l'accesso/, "il testo non dice che le foto hanno un indirizzo pubblico");
  assert.match(tutto, /link temporanei/, "il testo non dice che i documenti si aprono con link temporanei");
  assert.match(tutto, /foto del profilo/i);
  assert.match(tutto, /foto degli annunci/i);
});

test("file: i documenti d'identità, di proprietà e i contratti non sono mai descritti come pubblici", () => {
  const sezione = INFORMATIVA.sezioni.find((s) => /file e foto/i.test(s.titolo));
  assert.ok(sezione, "manca la sezione sui file");
  const testo = (sezione.paragrafi ?? []).join(" ");
  const dopo = testo.slice(testo.search(/documenti d'identità/i));
  assert.match(dopo, /non hanno mai un indirizzo pubblico/);
});

// ------------------------------------------------------------
// Il testo nomina ogni tipo di documento che l'app raccoglie
// ------------------------------------------------------------

/** Come il testo chiama ogni tipo di documento. Un tipo nuovo senza voce qui fa fallire il test. */
const NOME_NEL_TESTO = {
  identita: /documento d'identità/i,
  proprieta: /prova di proprietà/i,
  reddito: /prova del reddito/i,
};

function tipiDocumentoDelDatabase() {
  const trovati = new Set();
  for (const f of fs.readdirSync(migrazioni).filter((x) => /^\d{4}_.*\.sql$/.test(x))) {
    const sql = fs.readFileSync(path.join(migrazioni, f), "utf8");
    // create table documenti_... ( ... tipo text ... check (tipo in ('a', 'b')) ... )
    for (const t of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?documenti_\w+\s*\(([\s\S]*?)\n\);/gi)) {
      const m = t[1].match(/check\s*\(\s*tipo\s+in\s*\(([^)]*)\)/i);
      if (m) for (const v of m[1].matchAll(/'([^']+)'/g)) trovati.add(v[1]);
    }
  }
  return trovati;
}

test("documenti: il testo nomina ogni tipo di documento che il database accetta", () => {
  const tipi = tipiDocumentoDelDatabase();
  assert.ok(tipi.has("identita") && tipi.has("proprieta") && tipi.has("reddito"), `tipi trovati: ${[...tipi]}`);
  const tutto = tutteLeStringhe(INFORMATIVA).join("\n");
  for (const tipo of tipi) {
    assert.ok(NOME_NEL_TESTO[tipo], `tipo di documento nuovo («${tipo}»): descrivilo nel testo e aggiungilo a NOME_NEL_TESTO`);
    assert.match(tutto, NOME_NEL_TESTO[tipo], `il testo non nomina il tipo «${tipo}»`);
  }
});

test("documenti: il testo dice che un proprietario non vede i documenti dell'inquilino", () => {
  const tutto = tutteLeStringhe(INFORMATIVA).join("\n");
  assert.match(tutto, /Un proprietario non vede mai i documenti di un inquilino/);
  assert.match(tutto, /Non chiediamo lo stato di famiglia/);
});

test("documenti: il testo dice che la verifica del reddito non è automatica e che decade", () => {
  const tutto = tutteLeStringhe(INFORMATIVA).join("\n");
  assert.match(tutto, /non è automatica/);
  assert.match(tutto, /la verifica decade e va rifatta/);
});

// ------------------------------------------------------------
// Ciò che il testo dice della pulizia delle notifiche è vero
// ------------------------------------------------------------

/** Tutti i file di codice dell'app (non le migrazioni, non i test). */
function tuttoIlCodice(dir = path.join(radice, "src")) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? tuttoIlCodice(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

test("notifiche: il testo dice che la pulizia non è attiva solo finché nessuno la esegue", () => {
  const tutto = tutteLeStringhe(INFORMATIVA).join("\n");
  const dice_non_attiva = /pulizia non è ancora attiva/.test(tutto);
  const qualcunoLaChiama = tuttoIlCodice().some((f) => fs.readFileSync(f, "utf8").includes("pulisci_notifiche"));
  assert.equal(dice_non_attiva, !qualcunoLaChiama,
    dice_non_attiva
      ? "il testo dice che la pulizia non è attiva, ma un codice la chiama: aggiorna il testo"
      : "il testo non dice che la pulizia non è attiva, ma nessun codice la esegue: o la si attiva, o lo si dice");
});

test("notifiche: i tempi scritti nel testo sono quelli della funzione del database", () => {
  const sqlN = fs.readFileSync(path.join(migrazioni, "0019_notifiche.sql"), "utf8");
  assert.match(sqlN, /letta_at < now\(\) - interval '60 days'/);
  assert.match(sqlN, /created_at < now\(\) - interval '180 days'/);
  const tutto = tutteLeStringhe(INFORMATIVA).join("\n");
  assert.match(tutto, /60 giorni se lette e dopo 180 se non lette/);
});

test("notifiche: il testo le nomina e dice che non contengono nomi di persone", () => {
  const tutto = tutteLeStringhe(INFORMATIVA).join("\n");
  assert.match(tutto, /notifiche sulle novità del tuo account/);
  assert.match(tutto, /mai nomi di persone/);
});
