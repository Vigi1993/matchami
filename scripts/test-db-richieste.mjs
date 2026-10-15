/**
 * Prova la migrazione 0032 (richieste dei proprietari) su un PostgreSQL VERO: applica lo stub di Supabase e tutte le migrazioni
 * su un database nuovo, poi esegue scripts/db/richieste.sql (68 controlli con identità diverse: inquilino, proprietario, anonimo).
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
  const controlli = [...sql.matchAll(/select t\.(ok|fallisce)\(/g)].length; assert.ok(controlli >= 66, `controlli nel file: ${controlli}`);
  assert.match(sql, /select t\.ok\(\(select count\(\*\) from t\.esiti\) = 67,/, "l'autocontrollo sul numero di prove"); assert.ok(fs.existsSync(path.join(radice, "scripts", "db", "stub-supabase.sql")));
  const testo = sql.replaceAll("''", "'"); // nel file gli apostrofi sono raddoppiati
  for (const tema of ["04 chi non ha fatto l'accesso", "09 a chi non ha dato il consenso no", "23 a chi si è già candidato", "25 un inquilino non può scrivere richieste a mano", "30 un proprietario non può scrivere richieste a mano", "39 nasce una candidatura GIÀ ACCETTATA", "42 e NON una finta", "45 la chat si apre", "52 dopo un rifiuto", "54 chi ritira il consenso", "58 dopo venti richieste"]) assert.ok(testo.includes(tema), `manca il controllo «${tema}»`);
});

test("migrazione 0032 su PostgreSQL vero: tutti i 68 controlli passano", { skip: psqlCmd ? false : "imposta MATCHAMI_PSQL per eseguire le prove SQL su un PostgreSQL vero" }, () => {
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
    const riusciti = (r.stderr.match(/NOTICE:\s+OK:/g) ?? []).length; assert.equal(riusciti, 68, `controlli riusciti: ${riusciti}`);
  } finally { esegui(["-d", "postgres", "-c", `drop database if exists ${db}`]); }
});
