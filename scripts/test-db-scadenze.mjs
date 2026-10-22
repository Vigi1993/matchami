/**
 * Prova la migrazione 0040 (le verifiche SCADONO; il reddito del nucleo si documenta persona per persona) su un PostgreSQL VERO: applica lo stub di
 * Supabase e tutte le migrazioni su un database nuovo, poi esegue scripts/db/scadenze.sql (102 controlli con identità diverse: inquilino, proprietario, staff, anonimo).
 *
 * Gira solo se è impostata la variabile MATCHAMI_PSQL, con il comando psql da usare (un utente che può creare database), per esempio:
 *     MATCHAMI_PSQL="psql -h localhost -U postgres"  npm test
 * Senza, quei controlli si saltano (e lo dicono). Gli altri test (questo file compreso) controllano comunque che il file delle prove sia tutto lì e che
 * i valori di validità del database e del codice siano gli stessi.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { caricaTs, radice } from "./carica-ts.mjs";

const psqlCmd = process.env.MATCHAMI_PSQL;
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const sql = leggi("scripts", "db", "scadenze.sql"); const mig = leggi("supabase", "migrations", "0040_scadenza_verifiche.sql");
const sc = caricaTs(path.join(radice, "src", "lib", "scadenze-verifiche.ts"));

test("le prove SQL sono tutte presenti (nessun controllo tolto), con i temi che contano", () => {
  const controlli = [...sql.matchAll(/select t\.(ok|fallisce)\(/g)].length; assert.ok(controlli >= 100, `controlli nel file: ${controlli}`);
  assert.match(sql, /select t\.ok\(\(select count\(\*\) from t\.esiti\) = 101,/, "l'autocontrollo sul numero di prove");
  const testo = sql.replaceAll("''", "'");
  for (const tema of ["S25 verificato: il nucleo verificato è 1.500 € su 3.000 dichiarati", "S35 durante il rinnovo la verifica vecchia VALE ancora", "S38 rinnovo respinto: la verifica vecchia resta valida", "S46 la scadenza si CALCOLA alla lettura", "S47 il proprietario vede «non verificato» e «scaduto»", "S51 cambiare quante persone hanno un reddito azzera", "S57 il nucleo verificato è 1.500", "S61 finché la verifica vale, la risposta non si cambia", "S67 durante il rinnovo la verifica vecchia vale ancora", "S74 e la conferma NON allunga la scadenza", "S78 una persona non può lanciare i promemoria", "S81 rilanciato subito non ne crea altri", "S10 un documento con un importo «verificato» scritto dalla persona viene rifiutato"]) assert.ok(testo.includes(tema), `manca la prova «${tema}»`);
  assert.ok(fs.existsSync(path.join(radice, "scripts", "db", "stub-supabase.sql")));
});

test("i valori della migrazione e del codice sono gli stessi: validità (6 e 3 mesi), preavviso (30 giorni), soglie dei promemoria (30, 7, 0), persone del nucleo (6)", () => {
  assert.match(mig, /when 'reddito' then interval '6 months' when 'protesti' then interval '3 months'/); assert.equal(sc.VALIDITA_MESI.reddito, 6); assert.equal(sc.VALIDITA_MESI.protesti, 3);
  assert.ok(mig.includes(`now() + interval '${sc.PREAVVISO_GIORNI[0]} days'`), "il rinnovo si apre negli ultimi 30 giorni, come la fase «in scadenza»"); assert.equal([...mig.matchAll(/interval '30 days'/g)].length, 2, "uno per il reddito e uno per i protesti");
  assert.match(mig, /coalesce\(v_t\.reddito_nucleo_verificato, 0\) >= 0\.95 \* /, "la regola «tutto documentato»: 95%"); assert.equal(1 - sc.TOLLERANZA_COPERTURA, 0.95, "è la stessa soglia del codice");
  assert.match(mig, /soglia integer not null check \(soglia in \(30, 7, 0\)\)/); assert.deepEqual([...sc.PREAVVISO_GIORNI], [30, 7]);
  assert.match(mig, /elsif v_giorni <= 7 then v_soglia := 7;\s+elsif v_giorni <= 30 then v_soglia := 30;/, "i promemoria usano le stesse soglie del codice");
  assert.equal([...mig.matchAll(/least\(6, greatest\(1, coalesce\(v_t\.redditi_nucleo, 1\)\)\)/g)].length, 2, "il limite di 6 persone, in richiesta e in esito"); assert.equal(sc.PERCETTORI_MASSIMI, 6); assert.match(mig, /persona between 1 and 6/);
  assert.match(mig, /< 20\s+and importo_verificato is null/, "limite documenti: 20"); assert.equal(caricaTs(path.join(radice, "src", "lib", "verifica-inquilino.ts")).LIMITE_DOCUMENTI, 20, "il limite documenti del codice è quello del database");
});

test("la migrazione 0040 non tocca ciò che non deve: nessun «drop table», nessun «delete» senza condizione, solo funzioni e colonne dichiarate", () => {
  const senzaCommenti = mig.replace(/^\s*--.*$/gm, "");
  assert.ok(!/drop table/i.test(senzaCommenti)); assert.ok(!/truncate/i.test(senzaCommenti));
  for (const m of senzaCommenti.matchAll(/delete from ([a-z_]+)([^;]*);/gi)) assert.match(m[2], /where/i, `delete senza condizione su ${m[1]}`);
  for (const m of senzaCommenti.matchAll(/drop function if exists public\.([a-z_]+)\(([^)]*)\)/gi)) assert.ok(["esito_verifica_inquilino", "inquilini_da_verificare", "protesti_da_verificare", "dati_per_verifica_inquilino"].includes(m[1]), `funzione tolta: ${m[1]}`);
  assert.match(senzaCommenti, /revoke all on function public\.promemoria_scadenze_verifiche\(\) from public, anon, authenticated;[\s\S]*grant execute on function public\.promemoria_scadenze_verifiche\(\) to service_role;/, "i promemoria solo dal server");
  assert.match(senzaCommenti, /alter table promemoria_verifiche|alter table promemoria_verifiche enable row level security/); assert.match(senzaCommenti, /revoke all on promemoria_verifiche from anon, authenticated/);
});

test("migrazione 0040 su PostgreSQL vero: tutti i 102 controlli passano e la migrazione si può rieseguire", { skip: psqlCmd ? false : "imposta MATCHAMI_PSQL per eseguire le prove SQL su un PostgreSQL vero" }, () => {
  const [bin, ...args] = psqlCmd.split(/\s+/); const db = "matchami_test_scadenze"; const esegui = (extra, opzioni = {}) => spawnSync(bin, [...args, "-X", "-q", ...extra], { encoding: "utf8", ...opzioni }); const nullo = path.join(os.tmpdir(), `matchami-scadenze-${process.pid}.txt`);
  const migrazioni = fs.readdirSync(path.join(radice, "supabase", "migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort(); assert.ok(migrazioni.includes("0040_scadenza_verifiche.sql"));
  try {
    let r = esegui(["-d", "postgres", "-c", `drop database if exists ${db}`, "-c", `create database ${db}`]); assert.equal(r.status, 0, "non riesco a creare il database di prova: " + r.stderr);
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "scripts", "db", "stub-supabase.sql")]); assert.equal(r.status, 0, "lo stub di Supabase non si applica: " + r.stderr);
    for (const m of migrazioni) { r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", m)]); assert.equal(r.status, 0, `la migrazione ${m} non si applica: ${r.stderr.slice(0, 300)}`); }
    r = esegui(["-d", db, "-o", nullo, "-f", path.join(radice, "scripts", "db", "scadenze.sql")]); fs.rmSync(nullo, { force: true });
    assert.ok(!/CONTROLLO FALLITO/.test(r.stderr), "un controllo è fallito:\n" + r.stderr.split("\n").filter((l) => /FALLITO|ERROR/.test(l)).slice(0, 4).join("\n")); assert.equal(r.status, 0, r.stderr.slice(0, 500));
    const riusciti = (r.stderr.match(/NOTICE:\s+OK:/g) ?? []).length; assert.equal(riusciti, 102, `controlli riusciti: ${riusciti}`);
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", "0040_scadenza_verifiche.sql")]); assert.equal(r.status, 0, "rieseguire la 0040 non deve dare errori: " + r.stderr.slice(0, 300));
  } finally { esegui(["-d", "postgres", "-c", `drop database if exists ${db}`]); }
});

test("migrazione 0040: chi era già verificato prima ha una verifica che vale 6 mesi e tutto il nucleo documentato (dati di prova esistenti), e i protesti scadono 3 mesi dopo la data di verifica", { skip: psqlCmd ? false : "imposta MATCHAMI_PSQL per eseguire le prove SQL su un PostgreSQL vero" }, () => {
  const [bin, ...args] = psqlCmd.split(/\s+/); const db = "matchami_test_scadenze_dati"; const esegui = (extra) => spawnSync(bin, [...args, "-X", "-q", ...extra], { encoding: "utf8" });
  const migrazioni = fs.readdirSync(path.join(radice, "supabase", "migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  try {
    let r = esegui(["-d", "postgres", "-c", `drop database if exists ${db}`, "-c", `create database ${db}`]); assert.equal(r.status, 0, r.stderr);
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "scripts", "db", "stub-supabase.sql")]); assert.equal(r.status, 0, r.stderr);
    for (const m of migrazioni.filter((f) => f < "0040")) { r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", m)]); assert.equal(r.status, 0, `${m}: ${r.stderr.slice(0, 200)}`); }
    // due inquilini già verificati con le regole di prima, uno senza verifica
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-c", `insert into auth.users (id, email, raw_user_meta_data) values ('11111111-0000-0000-0000-000000000001', 'a@x.it', '{"ruolo":"inquilino","nome":"A","cognome":"P","privacy_accettata":true}'), ('11111111-0000-0000-0000-000000000002', 'b@x.it', '{"ruolo":"inquilino","nome":"B","cognome":"P","privacy_accettata":true}'), ('11111111-0000-0000-0000-000000000003', 'c@x.it', '{"ruolo":"inquilino","nome":"C","cognome":"P","privacy_accettata":true}')`, "-c", `update tenant_profiles set verificato = true, verifica_stato = 'verificato', reddito_mensile = 1500, reddito_nucleo = 2800, protesti_verifica_stato = 'verificato', protesti_verificati_at = now() - interval '5 months' where profile_id = '11111111-0000-0000-0000-000000000001'`, "-c", `update tenant_profiles set verificato = true, verifica_stato = 'verificato', reddito_mensile = 1700 where profile_id = '11111111-0000-0000-0000-000000000002'`]); assert.equal(r.status, 0, r.stderr);
    r = esegui(["-d", db, "-v", "ON_ERROR_STOP=1", "-f", path.join(radice, "supabase", "migrations", "0040_scadenza_verifiche.sql")]); assert.equal(r.status, 0, r.stderr.slice(0, 300));
    const q = (s) => spawnSync(bin, [...args, "-X", "-At", "-d", db, "-c", s], { encoding: "utf8" }).stdout.trim();
    assert.equal(q(`select count(*) from tenant_profiles where verificato and reddito_valido(tenant_profiles) and reddito_scade_il between now() + interval '6 months' - interval '1 minute' and now() + interval '6 months' + interval '1 minute'`), "2", "i due già verificati hanno 6 mesi pieni da ora");
    assert.equal(q(`select reddito_nucleo_verificato from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001'`), "2800", "nucleo dichiarato = verificato");
    assert.equal(q(`select reddito_nucleo_verificato from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000002'`), "1700", "senza reddito del nucleo vale quello personale");
    assert.equal(q(`select protesti_scade_il between now() - interval '2 months 1 day' and now() - interval '1 month 27 days' from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001'`), "t", "i protesti verificati 5 mesi fa, a 3 mesi, sono già scaduti: onesto");
    assert.equal(q(`select not protesti_validi(t) from tenant_profiles t where profile_id = '11111111-0000-0000-0000-000000000001'`), "t");
    assert.equal(q(`select reddito_scade_il is null and protesti_scade_il is null from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000003'`), "t", "chi non era verificato non lo diventa");
  } finally { esegui(["-d", "postgres", "-c", `drop database if exists ${db}`]); }
});
