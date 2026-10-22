/**
 * Prova la migrazione 0032 (richieste dei proprietari) su un PostgreSQL VERO: applica lo stub di Supabase e tutte le migrazioni
 * su un database nuovo, poi esegue scripts/db/richieste.sql (70 controlli con identità diverse: inquilino, proprietario, anonimo).
 *
 * Gira solo se è impostata la variabile MATCHAMI_PSQL, con il comando psql da usare (un utente che può creare database), per esempio:
 *     MATCHAMI_PSQL="psql -h localhost -U postgres"  npm test
 * Senza, questi controlli si saltano (e lo dicono). Gli altri test controllano comunque che il file delle prove sia tutto lì.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { radice } from "./carica-ts.mjs";

const psqlCmd = process.env.MATCHAMI_PSQL;
const sql = fs.readFileSync(path.join(radice, "scripts", "db", "richieste.sql"), "utf8");

test("le prove SQL sono tutte presenti (nessun controllo tolto), e lo stub di Supabase c'è", () => {
  const controlli = [...sql.matchAll(/select t\.(ok|fallisce)\(/g)].length; assert.ok(controlli >= 68, `controlli nel file: ${controlli}`);
  assert.match(sql, /select t\.ok\(\(select count\(\*\) from t\.esiti\) = 69,/, "l'autocontrollo sul numero di prove"); assert.ok(fs.existsSync(path.join(radice, "scripts", "db", "stub-supabase.sql")));
  const testo = sql.replaceAll("''", "'"); // nel file gli apostrofi sono raddoppiati
  for (const tema of ["01 chi si iscrive come inquilino è VISIBILE", "03b Bruno può nascondersi da solo", "04 chi non ha fatto l'accesso", "09 a chi si è nascosto no", "23 a chi si è già candidato", "25 un inquilino non può scrivere richieste a mano", "30 un proprietario non può scrivere richieste a mano", "39 nasce una candidatura GIÀ ACCETTATA", "42 e NON una finta", "45 la chat si apre", "52 dopo un rifiuto", "54 chi si nasconde dopo", "58 dopo venti richieste"]) assert.ok(testo.includes(tema), `manca il controllo «${tema}»`);
});

test("migrazione 0032 e 0033 su PostgreSQL vero: tutti i 70 controlli passano", { skip: psqlCmd ? false : "imposta MATCHAMI_PSQL per eseguire le prove SQL su un PostgreSQL vero" }, () => {
  const [bin, ...args] = psqlCmd.split(/\s+/); const db = "matchami_test_richieste"; const esegui = (extra, opzioni = {}) => spawnSync(bin, [...args, "-X", "-q", ...extra], { encoding: "utf8", ...opzioni });
  const migrazioni = fs.readdirSync(path.join(radice, "supabase", "migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  assert.ok(migrazioni.includes("0032_richieste_proprietari.sql"));
  try {
    let r = esegui(["-d", "postgres", "-c", `drop database if exists ${db}`, "-c", `create database ${db}`]); assert.equal(r.status, 0, "non riesco a creare il database di prova: " + r.stderr);
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "scripts", "db", "stub-supabase.sql")]); assert.equal(r.status, 0, "lo stub di Supabase non si applica: " + r.stderr);
    for (const m of migrazioni) { r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", m)]); assert.equal(r.status, 0, `la migrazione ${m} non si applica: ${r.stderr.slice(0, 400)}`); }
    const uscita = path.join(os.tmpdir(), `matchami-richieste-${process.pid}.txt`);
    r = esegui(["-d", db, "-o", uscita, "-f", path.join(radice, "scripts", "db", "richieste.sql")]); fs.rmSync(uscita, { force: true });
    assert.ok(!/CONTROLLO FALLITO/.test(r.stderr), "un controllo è fallito:\n" + r.stderr.split("\n").filter((l) => /FALLITO|ERROR/.test(l)).slice(0, 4).join("\n")); assert.equal(r.status, 0, r.stderr.slice(0, 500));
    const riusciti = (r.stderr.match(/NOTICE:\s+OK:/g) ?? []).length; assert.equal(riusciti, 70, `controlli riusciti: ${riusciti}`);
  } finally { esegui(["-d", "postgres", "-c", `drop database if exists ${db}`]); }
});

test("migrazione 0033 su PostgreSQL vero: chi era già iscritto diventa visibile, le date non cambiano, i nuovi sono visibili e chi si nasconde resta nascosto", { skip: psqlCmd ? false : "imposta MATCHAMI_PSQL per eseguire le prove SQL su un PostgreSQL vero" }, () => {
  const [bin, ...args] = psqlCmd.split(/\s+/); const db = "matchami_test_visibilita"; const esegui = (extra) => spawnSync(bin, [...args, "-X", "-q", ...extra], { encoding: "utf8" });
  const migrazioni = fs.readdirSync(path.join(radice, "supabase", "migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort(); const m0033 = migrazioni.find((f) => f.startsWith("0033_")); assert.ok(m0033, "manca la migrazione 0033");
  const nullo = path.join(os.tmpdir(), `matchami-vis-${process.pid}.txt`);
  try {
    let r = esegui(["-d", "postgres", "-c", `drop database if exists ${db}`, "-c", `create database ${db}`]); assert.equal(r.status, 0, r.stderr);
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "scripts", "db", "stub-supabase.sql")]); assert.equal(r.status, 0, r.stderr);
    for (const m of migrazioni.filter((f) => f < "0033")) { r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", m)]); assert.equal(r.status, 0, `${m}: ${r.stderr.slice(0, 300)}`); }
    r = esegui(["-d", db, "-o", nullo, "-f", path.join(radice, "scripts", "db", "visibilita-prima.sql")]); assert.equal(r.status, 0, "prima della 0033: " + r.stderr.slice(0, 300));
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", m0033)]); assert.equal(r.status, 0, "la 0033 non si applica: " + r.stderr.slice(0, 300));
    r = esegui(["-d", db, "-o", nullo, "-f", path.join(radice, "scripts", "db", "visibilita-dopo.sql")]); assert.ok(!/CONTROLLO FALLITO/.test(r.stderr), r.stderr.split("\n").filter((l) => /FALLITO/.test(l)).join("\n")); assert.equal(r.status, 0, r.stderr.slice(0, 300)); assert.equal((r.stderr.match(/NOTICE:\s+OK:/g) ?? []).length, 7);
    // rieseguirla non fa danni: chi si è nascosto (Dino) resta nascosto? No: la 0033 rende visibile chi non lo è. Per questo va eseguita UNA volta sola, come ogni migrazione.
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", m0033)]); assert.equal(r.status, 0, "rieseguire la 0033 non deve dare errori: " + r.stderr.slice(0, 300));
  } finally { fs.rmSync(nullo, { force: true }); esegui(["-d", "postgres", "-c", `drop database if exists ${db}`]); }
});

test("migrazione 0034 su PostgreSQL vero: annullare un match o uno scarto, i casi vietati e nessuna scorciatoia (44 controlli)", { skip: psqlCmd ? false : "imposta MATCHAMI_PSQL per eseguire le prove SQL su un PostgreSQL vero" }, () => {
  const [bin, ...args] = psqlCmd.split(/\s+/); const db = "matchami_test_riapri"; const esegui = (extra) => spawnSync(bin, [...args, "-X", "-q", ...extra], { encoding: "utf8" });
  const migrazioni = fs.readdirSync(path.join(radice, "supabase", "migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort(); assert.ok(migrazioni.includes("0034_riapri_candidatura.sql"), "manca la migrazione 0034");
  const nullo = path.join(os.tmpdir(), `matchami-riapri-${process.pid}.txt`);
  try {
    let r = esegui(["-d", "postgres", "-c", `drop database if exists ${db}`, "-c", `create database ${db}`]); assert.equal(r.status, 0, r.stderr);
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "scripts", "db", "stub-supabase.sql")]); assert.equal(r.status, 0, r.stderr);
    for (const m of migrazioni) { r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", m)]); assert.equal(r.status, 0, `la migrazione ${m} non si applica: ${r.stderr.slice(0, 300)}`); }
    r = esegui(["-d", db, "-o", nullo, "-f", path.join(radice, "scripts", "db", "riapri.sql")]); assert.ok(!/CONTROLLO FALLITO/.test(r.stderr), r.stderr.split("\n").filter((l) => /FALLITO|ERROR/.test(l)).slice(0, 4).join("\n")); assert.equal(r.status, 0, r.stderr.slice(0, 500));
    const riusciti = (r.stderr.match(/NOTICE:\s+OK:/g) ?? []).length; assert.equal(riusciti, 44, `controlli riusciti: ${riusciti}`);
  } finally { fs.rmSync(nullo, { force: true }); esegui(["-d", "postgres", "-c", `drop database if exists ${db}`]); }
});

test("migrazione 0035 su PostgreSQL vero: l'affitto nasce dal contratto con la conferma dell'inquilino, il documento per lo staff e il feedback (61 controlli)", { skip: psqlCmd ? false : "imposta MATCHAMI_PSQL per eseguire le prove SQL su un PostgreSQL vero" }, () => {
  const [bin, ...args] = psqlCmd.split(/\s+/); const db = "matchami_test_affitto"; const esegui = (extra) => spawnSync(bin, [...args, "-X", "-q", ...extra], { encoding: "utf8" });
  const migrazioni = fs.readdirSync(path.join(radice, "supabase", "migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort(); assert.ok(migrazioni.includes("0035_affitto_da_contratto.sql"), "manca la migrazione 0035");
  const nullo = path.join(os.tmpdir(), `matchami-affitto-${process.pid}.txt`);
  try {
    let r = esegui(["-d", "postgres", "-c", `drop database if exists ${db}`, "-c", `create database ${db}`]); assert.equal(r.status, 0, r.stderr);
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "scripts", "db", "stub-supabase.sql")]); assert.equal(r.status, 0, r.stderr);
    for (const m of migrazioni) { r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", m)]); assert.equal(r.status, 0, `la migrazione ${m} non si applica: ${r.stderr.slice(0, 300)}`); }
    r = esegui(["-d", db, "-o", nullo, "-f", path.join(radice, "scripts", "db", "affitto-contratto.sql")]); assert.ok(!/CONTROLLO FALLITO/.test(r.stderr), r.stderr.split("\n").filter((l) => /FALLITO|ERROR/.test(l)).slice(0, 4).join("\n")); assert.equal(r.status, 0, r.stderr.slice(0, 500));
    const riusciti = (r.stderr.match(/NOTICE:\s+OK:/g) ?? []).length; assert.equal(riusciti, 61, `controlli riusciti: ${riusciti}`);
  } finally { fs.rmSync(nullo, { force: true }); esegui(["-d", "postgres", "-c", `drop database if exists ${db}`]); }
});

test("migrazione 0036 su PostgreSQL vero: si perdono solo i tre dati del proprietario e il loro tipo; il proprietario resta, i nuovi si creano come prima; rieseguirla non dà errori", { skip: psqlCmd ? false : "imposta MATCHAMI_PSQL per eseguire le prove SQL su un PostgreSQL vero" }, () => {
  const [bin, ...args] = psqlCmd.split(/\s+/); const db = "matchami_test_dati_proprietario"; const esegui = (extra) => spawnSync(bin, [...args, "-X", "-q", ...extra], { encoding: "utf8" });
  const migrazioni = fs.readdirSync(path.join(radice, "supabase", "migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort(); const m36 = migrazioni.find((f) => f.startsWith("0036_")); assert.ok(m36, "manca la migrazione 0036");
  const nullo = path.join(os.tmpdir(), `matchami-dati-proprietario-${process.pid}.txt`);
  try {
    let r = esegui(["-d", "postgres", "-c", `drop database if exists ${db}`, "-c", `create database ${db}`]); assert.equal(r.status, 0, r.stderr);
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "scripts", "db", "stub-supabase.sql")]); assert.equal(r.status, 0, r.stderr);
    for (const m of migrazioni.filter((f) => f < "0036")) { r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", m)]); assert.equal(r.status, 0, `${m}: ${r.stderr.slice(0, 300)}`); }
    r = esegui(["-d", db, "-o", nullo, "-f", path.join(radice, "scripts", "db", "dati-proprietario-prima.sql")]); assert.equal(r.status, 0, "prima della 0036: " + r.stderr.slice(0, 300));
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", m36)]); assert.equal(r.status, 0, "la 0036 non si applica: " + r.stderr.slice(0, 300));
    r = esegui(["-d", db, "-o", nullo, "-f", path.join(radice, "scripts", "db", "dati-proprietario-dopo.sql")]); assert.ok(!/CONTROLLO FALLITO/.test(r.stderr), r.stderr.split("\n").filter((l) => /FALLITO/.test(l)).join("\n")); assert.equal(r.status, 0, r.stderr.slice(0, 300)); assert.equal((r.stderr.match(/NOTICE:\s+OK:/g) ?? []).length, 7);
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", m36)]); assert.equal(r.status, 0, "rieseguire la 0036 non deve dare errori: " + r.stderr.slice(0, 300));
  } finally { fs.rmSync(nullo, { force: true }); esegui(["-d", "postgres", "-c", `drop database if exists ${db}`]); }
});

test("migrazione 0037 su PostgreSQL vero: le case verificate senza prova di proprietà tornano «da verificare», le altre non cambiano, e da ora nessuno (nemmeno lo staff o il pannello SQL) verifica una casa senza prova; rieseguirla non dà errori", { skip: psqlCmd ? false : "imposta MATCHAMI_PSQL per eseguire le prove SQL su un PostgreSQL vero" }, () => {
  const [bin, ...args] = psqlCmd.split(/\s+/); const db = "matchami_test_verifica_prova"; const esegui = (extra) => spawnSync(bin, [...args, "-X", "-q", ...extra], { encoding: "utf8" });
  const migrazioni = fs.readdirSync(path.join(radice, "supabase", "migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort(); const m37 = migrazioni.find((f) => f.startsWith("0037_")); assert.ok(m37, "manca la migrazione 0037");
  const nullo = path.join(os.tmpdir(), `matchami-verifica-prova-${process.pid}.txt`);
  try {
    let r = esegui(["-d", "postgres", "-c", `drop database if exists ${db}`, "-c", `create database ${db}`]); assert.equal(r.status, 0, r.stderr);
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "scripts", "db", "stub-supabase.sql")]); assert.equal(r.status, 0, r.stderr);
    for (const m of migrazioni.filter((f) => f < "0037")) { r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", m)]); assert.equal(r.status, 0, `${m}: ${r.stderr.slice(0, 300)}`); }
    r = esegui(["-d", db, "-o", nullo, "-f", path.join(radice, "scripts", "db", "verifica-prova-prima.sql")]); assert.equal(r.status, 0, "prima della 0037: " + r.stderr.slice(0, 300));
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", m37)]); assert.equal(r.status, 0, "la 0037 non si applica: " + r.stderr.slice(0, 300)); assert.match(r.stderr, /tornate «da verificare»: 2/, "dice quante case ha riallineato (A ed E)");
    r = esegui(["-d", db, "-o", nullo, "-f", path.join(radice, "scripts", "db", "verifica-prova-dopo.sql")]); assert.ok(!/CONTROLLO FALLITO/.test(r.stderr), r.stderr.split("\n").filter((l) => /FALLITO/.test(l)).join("\n")); assert.equal(r.status, 0, r.stderr.slice(0, 400)); assert.equal((r.stderr.match(/NOTICE:\s+OK:/g) ?? []).length, 18);
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", m37)]); assert.equal(r.status, 0, "rieseguire la 0037 non deve dare errori: " + r.stderr.slice(0, 300)); assert.match(r.stderr, /tornate «da verificare»: 0/, "la seconda volta non c'è più niente da riallineare");
  } finally { fs.rmSync(nullo, { force: true }); esegui(["-d", "postgres", "-c", `drop database if exists ${db}`]); }
});

test("migrazione 0038 su PostgreSQL vero: la verifica dei protesti da parte dello staff (richiesta, esito, il risultato dello staff prevale, i protesti verificati non si cambiano da soli, documenti, notifiche, cosa vede il proprietario) (55 controlli)", { skip: psqlCmd ? false : "imposta MATCHAMI_PSQL per eseguire le prove SQL su un PostgreSQL vero" }, () => {
  const [bin, ...args] = psqlCmd.split(/\s+/); const db = "matchami_test_protesti"; const esegui = (extra) => spawnSync(bin, [...args, "-X", "-q", ...extra], { encoding: "utf8" });
  const migrazioni = fs.readdirSync(path.join(radice, "supabase", "migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort(); assert.ok(migrazioni.includes("0038_verifica_protesti.sql"), "manca la migrazione 0038");
  const nullo = path.join(os.tmpdir(), `matchami-protesti-${process.pid}.txt`);
  try {
    let r = esegui(["-d", "postgres", "-c", `drop database if exists ${db}`, "-c", `create database ${db}`]); assert.equal(r.status, 0, r.stderr);
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "scripts", "db", "stub-supabase.sql")]); assert.equal(r.status, 0, r.stderr);
    for (const m of migrazioni) { r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", m)]); assert.equal(r.status, 0, `la migrazione ${m} non si applica: ${r.stderr.slice(0, 300)}`); }
    r = esegui(["-d", db, "-o", nullo, "-f", path.join(radice, "scripts", "db", "protesti.sql")]); assert.ok(!/CONTROLLO FALLITO/.test(r.stderr), r.stderr.split("\n").filter((l) => /FALLITO|ERROR/.test(l)).slice(0, 4).join("\n")); assert.equal(r.status, 0, r.stderr.slice(0, 500));
    const riusciti = (r.stderr.match(/NOTICE:\s+OK:/g) ?? []).length; assert.equal(riusciti, 55, `controlli riusciti: ${riusciti}`);
    // la migrazione PIÙ RECENTE (la 0040, che ha cambiato la verifica dei protesti) si può rieseguire senza errori; le precedenti no, e non serve: riscriverebbero le funzioni con le regole vecchie
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", "0040_scadenza_verifiche.sql")]); assert.equal(r.status, 0, "rieseguire la 0040 non deve dare errori: " + r.stderr.slice(0, 300));
  } finally { fs.rmSync(nullo, { force: true }); esegui(["-d", "postgres", "-c", `drop database if exists ${db}`]); }
});

test("migrazione 0039 su PostgreSQL vero: chi era già iscritto è «completato», i nuovi no; il segno non si scrive a mano; si completa solo con i dati essenziali (inquilino: lavoro, protesti, budget; proprietario: un immobile); rieseguirla non rifà il segno a chi si è iscritto dopo", { skip: psqlCmd ? false : "imposta MATCHAMI_PSQL per eseguire le prove SQL su un PostgreSQL vero" }, () => {
  const [bin, ...args] = psqlCmd.split(/\s+/); const db = "matchami_test_benvenuto"; const esegui = (extra) => spawnSync(bin, [...args, "-X", "-q", ...extra], { encoding: "utf8" });
  const migrazioni = fs.readdirSync(path.join(radice, "supabase", "migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort(); const m39 = migrazioni.find((f) => f.startsWith("0039_")); assert.ok(m39, "manca la migrazione 0039");
  const nullo = path.join(os.tmpdir(), `matchami-benvenuto-${process.pid}.txt`);
  try {
    let r = esegui(["-d", "postgres", "-c", `drop database if exists ${db}`, "-c", `create database ${db}`]); assert.equal(r.status, 0, r.stderr);
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "scripts", "db", "stub-supabase.sql")]); assert.equal(r.status, 0, r.stderr);
    for (const m of migrazioni.filter((f) => f < "0039")) { r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", m)]); assert.equal(r.status, 0, `${m}: ${r.stderr.slice(0, 300)}`); }
    r = esegui(["-d", db, "-o", nullo, "-f", path.join(radice, "scripts", "db", "benvenuto-prima.sql")]); assert.equal(r.status, 0, "prima della 0039: " + r.stderr.slice(0, 300));
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", m39)]); assert.equal(r.status, 0, "la 0039 non si applica: " + r.stderr.slice(0, 300));
    r = esegui(["-d", db, "-o", nullo, "-f", path.join(radice, "scripts", "db", "benvenuto-dopo.sql")]); assert.ok(!/CONTROLLO FALLITO/.test(r.stderr), r.stderr.split("\n").filter((l) => /FALLITO/.test(l)).join("\n")); assert.equal(r.status, 0, r.stderr.slice(0, 400)); assert.equal((r.stderr.match(/NOTICE:\s+OK:/g) ?? []).length, 20);
    // rieseguita: il nuovo iscritto (B19) NON diventa «completato»
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", m39)]); assert.equal(r.status, 0, "rieseguire la 0039 non deve dare errori: " + r.stderr.slice(0, 300));
    r = esegui(["-d", db, "-At", "-c", "select onboarding_completato from profiles where id = 'bbbb0000-0000-0000-0000-000000000009'"]); assert.equal(r.stdout.trim(), "f", "rieseguire la migrazione non deve segnare «completato» chi si è iscritto dopo");
  } finally { fs.rmSync(nullo, { force: true }); esegui(["-d", "postgres", "-c", `drop database if exists ${db}`]); }
});
