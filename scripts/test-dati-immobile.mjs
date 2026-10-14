/**
 * Test dei dati dell'annuncio che chi cerca può filtrare (luogo, tipologia, bagni, piano, riscaldamento, tipo di contratto,
 * disponibilità): lettura controllata dal modulo, completamento dei luoghi per l'annuncio e coerenza con le migrazioni.
 * Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const di = caricaTs(path.join(radice, "src", "lib", "annunci", "dati-immobile.ts"));
const ob = caricaTs(path.join(radice, "src", "lib", "annunci", "obbligatori.ts"));
const lg = caricaTs(path.join(radice, "src", "lib", "luoghi.ts"));
const co = caricaTs(path.join(radice, "src", "lib", "constants.ts"));
// con i ritorni a capo di Windows normalizzati
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const m30 = leggi("supabase", "migrations", "0030_parametri_ricerca.sql");
const m31 = leggi("supabase", "migrations", "0031_dati_obbligatori_annuncio_2.sql");

const OGGI = "2026-10-14";
const UUID = "0a1b2c3d-1111-4222-8333-444455556666";
const leggiCampi = (campi) => di.leggiDatiImmobile((k) => (k in campi ? campi[k] : null), OGGI);
const ok = (campi) => { const r = leggiCampi(campi); assert.equal(r.ok, true, JSON.stringify(campi) + " -> " + (r.errore ?? "")); return r.dati; };
const no = (campi, re) => { const r = leggiCampi(campi); assert.equal(r.ok, false, "doveva essere rifiutato: " + JSON.stringify(campi)); if (re) assert.match(r.errore, re); return r.errore; };

// ============================================================ lettura dal modulo
test("dati vuoti: una bozza è ammessa (tutto null, tipologia «appartamento»); campi mancanti e testi vuoti o di soli spazi valgono vuoto", () => {
  assert.deepEqual(ok({}), { luogo_id: null, tipologia: "appartamento", bagni: null, piano: null, riscaldamento: null, tipo_contratto: null, disponibile_dal: null });
  assert.deepEqual(ok({ luogo_id: "", tipologia: "", bagni: "", piano: "", riscaldamento: "", tipo_contratto: "", disponibile_dal: "" }), ok({}));
  assert.deepEqual(ok({ luogo_id: "  ", bagni: "  ", piano: "   ", disponibile_dal: " " }), ok({}));
});

test("dati completi: si portano com'erano, il luogo in minuscolo e i numeri come numeri", () => {
  const d = ok({ luogo_id: UUID.toUpperCase(), tipologia: "villa", bagni: "2", piano: "0", riscaldamento: "autonomo", tipo_contratto: "studenti", disponibile_dal: "2026-12-01" });
  assert.deepEqual(d, { luogo_id: UUID, tipologia: "villa", bagni: 2, piano: 0, riscaldamento: "autonomo", tipo_contratto: "studenti", disponibile_dal: "2026-12-01" });
  assert.strictEqual(d.piano, 0, "il piano terra deve restare 0 (non null)");
});

test("il piano terra (0) e il seminterrato non si perdono; sono ammessi da -2 a 60 e non un numero in più", () => {
  assert.strictEqual(ok({ piano: "0" }).piano, 0); assert.strictEqual(ok({ piano: "-1" }).piano, -1); assert.strictEqual(ok({ piano: "-2" }).piano, -2); assert.strictEqual(ok({ piano: "60" }).piano, 60); assert.strictEqual(ok({ piano: " 7 " }).piano, 7);
  for (const x of ["-3", "61", "1.5", "7a", "a", "1e1", "--1", "999999", "0x10", "٣"]) no({ piano: x }, /piano/i);
});

test("bagni: da 1 a 10 interi; zero, negativi, decimali, testo e numeri enormi rifiutati", () => {
  for (const n of [1, 2, 9, 10]) assert.strictEqual(ok({ bagni: String(n) }).bagni, n);
  for (const x of ["0", "11", "-1", "1.5", "1,5", "due", "1e1", "100000"]) no({ bagni: x }, /bagni/i);
});

test("tipologia: appartamento o villa; il posto letto dice «per ora»; il resto è rifiutato", () => {
  assert.equal(ok({ tipologia: "appartamento" }).tipologia, "appartamento"); assert.equal(ok({ tipologia: "villa" }).tipologia, "villa"); assert.equal(ok({ tipologia: " villa " }).tipologia, "villa");
  no({ tipologia: "posto_letto" }, /per ora/i); for (const x of ["castello", "Villa", "VILLA", "monolocale", "'; drop"]) no({ tipologia: x }, /tipo di immobile/i);
});

test("riscaldamento e contratto: solo i valori ammessi (gli stessi dell'app e del database)", () => {
  for (const r of co.RISCALDAMENTI) assert.equal(ok({ riscaldamento: r.id }).riscaldamento, r.id); for (const t of co.TIPI_CONTRATTO) assert.equal(ok({ tipo_contratto: t.id }).tipo_contratto, t.id);
  for (const x of ["gas", "Autonomo", "autonomo ", "centralizzato;", "pompa di calore"]) assert.ok(x.trim() === "autonomo" || !leggiCampi({ riscaldamento: x }).ok || x === "autonomo ", x);
  no({ riscaldamento: "gas" }, /riscaldamento/i); no({ riscaldamento: "Autonomo" }, /riscaldamento/i); no({ tipo_contratto: "boh" }, /contratto/i); no({ tipo_contratto: "4+4 libero" }, /contratto/i);
});

test("luogo: un identificativo valido o vuoto; qualunque altro testo rifiutato (anche un nome di zona scritto a mano)", () => {
  assert.equal(ok({ luogo_id: UUID }).luogo_id, UUID); for (const x of ["Isola, Milano", "boh", "1", UUID + "x", "x" + UUID, UUID.slice(0, 35), "../x", "<script>", "0a1b2c3d-1111-4222-8333-44445555666g"]) no({ luogo_id: x }, /zona/i);
});

test("data di disponibilità: una data vera, dal 2020 a tre anni da oggi; il passato recente (disponibile subito) è ammesso; date impossibili no", () => {
  for (const d of ["2026-10-14", "2026-10-13", "2020-01-01", "2029-10-14", "2028-02-29"]) assert.equal(ok({ disponibile_dal: d }).disponibile_dal, d);
  for (const d of ["2019-12-31", "2029-10-15", "2099-01-01", "2026-02-31", "2026-13-01", "2026-1-1", "domani", "14/10/2026", "2026-10-14T00:00", "20261014", "2027-02-29"]) no({ disponibile_dal: d }, /data/i);
});

test("il primo errore trovato si dice, e un errore non lascia valori a metà", () => {
  const r = leggiCampi({ luogo_id: "boh", bagni: "0" }); assert.equal(r.ok, false); assert.equal("dati" in r, false); assert.match(r.errore, /zona/i);
  for (const c of [{ bagni: "x" }, { piano: "x" }, { disponibile_dal: "x" }, { tipologia: "x" }]) { const e = leggiCampi(c); assert.equal(e.ok, false); assert.ok(e.errore.endsWith(".") && e.errore.length > 10, e.errore); }
});

test("1000 moduli casuali: non danno mai errori, e ciò che viene accettato rispetta i limiti del database", () => {
  let seme = 77; const rnd = () => (seme = (seme * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const sc = (a) => a[Math.floor(rnd() * a.length)]; const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  // per ogni campo: valori validi (o vuoti) e, ogni tanto, un valore brutto
  const validi = { luogo_id: () => sc(["", UUID]), tipologia: () => sc(["", "appartamento", "villa"]), bagni: () => sc(["", String(int(1, 10))]), piano: () => sc(["", String(int(-2, 60))]), riscaldamento: () => sc(["", ...co.RISCALDAMENTI.map((x) => x.id)]), tipo_contratto: () => sc(["", ...co.TIPI_CONTRATTO.map((x) => x.id)]), disponibile_dal: () => sc(["", "2026-12-01", "2027-06-30", "2026-10-14"]) };
  const brutti = ["0", "-1", "99", "1.5", "x", "'; drop", "2026-02-30", "posto_letto", "💥", "9".repeat(50), "null", "undefined", "Isola, Milano", "gas"];
  let accettati = 0, rifiutati = 0;
  for (let i = 0; i < 1000; i++) {
    const campi = {}; for (const k of Object.keys(validi)) if (rnd() < 0.9) campi[k] = rnd() < 0.12 ? sc(brutti) : validi[k]();
    let r; assert.doesNotThrow(() => { r = leggiCampi(campi); }, JSON.stringify(campi));
    if (r.ok) { accettati++; const d = r.dati; if (d.bagni !== null) assert.ok(Number.isInteger(d.bagni) && d.bagni >= 1 && d.bagni <= 10); if (d.piano !== null) assert.ok(Number.isInteger(d.piano) && d.piano >= -2 && d.piano <= 60); assert.ok(["appartamento", "villa"].includes(d.tipologia)); if (d.disponibile_dal !== null) assert.match(d.disponibile_dal, /^\d{4}-\d{2}-\d{2}$/); } else rifiutati++;
  }
  assert.ok(accettati > 150 && rifiutati > 150, `la prova deve vedere entrambi i casi: accettati ${accettati}, rifiutati ${rifiutati}`);
});

test("piani del modulo: seminterrato, piano terra e 1°…25°, tutti ammessi dal database", () => {
  const o = di.OPZIONI_PIANO_ANNUNCIO; assert.equal(o.length, 27); assert.deepEqual(o.slice(0, 3), [{ valore: -1, etichetta: "Seminterrato" }, { valore: 0, etichetta: "Piano terra" }, { valore: 1, etichetta: "1°" }]); assert.equal(o.at(-1).etichetta, "25°"); for (const x of o) assert.strictEqual(ok({ piano: String(x.valore) }).piano, x.valore);
});

// ============================================================ il completamento per l'annuncio
const L = (id, livello, nome, parent_id = null, sigla = null) => ({ id, livello, nome, sigla, parent_id });
const LUOGHI = [L("pMI", "provincia", "Milano", null, "MI"), L("cMI", "comune", "Milano", "pMI"), L("qIsola", "quartiere", "Isola", "cMI"), L("pBG", "provincia", "Bergamo", null, "BG"), L("cBG", "comune", "Bergamo", "pBG")];

test("completamento per l'annuncio: limitato a quartieri e città, mai le province (anche scrivendo la sigla)", () => {
  const trova = (q, livelli) => lg.cercaLuoghi(q, LUOGHI, { livelli }).map((x) => x.luogo.id);
  assert.deepEqual(trova("milano", ["quartiere", "comune"]), ["cMI", "qIsola"], "la città e il suo quartiere, mai la provincia"); assert.ok(trova("milano").includes("pMI"), "senza il limite la provincia c'è"); assert.deepEqual(trova("bg", ["quartiere", "comune"]), ["cBG"], "scrivendo la sigla trova la città, non la provincia"); assert.deepEqual(trova("isola", ["comune"]), []); assert.deepEqual(trova("isola", []), []);
});

// ============================================================ coerenza con le migrazioni e il codice
test("le liste ammesse sono quelle del database e i limiti coincidono (bagni 1-10, piano -2..60)", () => {
  assert.match(m30, /bagni between 1 and 10/); assert.equal(di.LIMITI_ANNUNCIO.bagni.min, 1); assert.equal(di.LIMITI_ANNUNCIO.bagni.max, 10); assert.match(m30, /piano between -2 and 60/); assert.equal(di.LIMITI_ANNUNCIO.piano.min, -2); assert.equal(di.LIMITI_ANNUNCIO.piano.max, 60);
  const lista = (re) => [...m30.match(re)[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.deepEqual(co.RISCALDAMENTI.map((x) => x.id), lista(/listings_riscaldamento_check check \(riscaldamento is null or riscaldamento in \(([^)]*)\)/)); assert.deepEqual(co.TIPI_CONTRATTO.map((x) => x.id), lista(/listings_tipo_contratto_check check \(tipo_contratto is null or tipo_contratto in \(([^)]*)\)/));
});

test("obbligatori: i sette dati dell'app sono ESATTAMENTE quelli controllati dalla migrazione 0031, e il piano si controlla come «è nullo» (non «è zero»)", () => {
  const controlli = [...m31.matchAll(/v_listing\.(\w+) is null/g)].map((x) => x[1]); assert.deepEqual(controlli.sort(), ob.DATI_OBBLIGATORI.map((d) => d.chiave).sort());
  assert.ok(!/v_listing\.piano\s*(=|<>|!=)\s*0/.test(m31) && !/not v_listing\.piano/.test(m31), "il piano terra non deve contare come «manca»"); assert.ok(!/drop (table|column)/i.test(m31.replace(/--[^\n]*/g, "")), "la migrazione cancella qualcosa");
  assert.match(m31, /revoke all on function public\.richiedi_verifica_immobile\(uuid\) from public, anon;\s+grant execute on function public\.richiedi_verifica_immobile\(uuid\) to authenticated;/);
  // le colonne controllate esistono (le aggiunge la 0030 o la 0026)
  for (const c of controlli.filter((x) => x !== "classe_energetica")) assert.match(m30, new RegExp(`alter table listings add column if not exists ${c}\\b`), c);
});

test("azioni: leggono i dati con la funzione controllata, richiedono il luogo, non mandano più la zona scritta e traducono l'errore del luogo", () => {
  const a = leggi("src", "app", "(app)", "immobili", "actions.ts"); assert.equal([...a.matchAll(/leggiDatiImmobile\(\(chiave\) => formData\.get\(chiave\), new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\)/g)].length, 2, "crea e aggiorna");
  assert.equal([...a.matchAll(/if \(!dati\.dati\.luogo_id\) return \{ error: "Scegli la zona dall'elenco\." \}/g)].length, 2); assert.equal([...a.matchAll(/\.\.\.dati\.dati,/g)].length, 2); assert.ok(!/formData\.get\("zona"\)/.test(a), "legge ancora la zona scritta");
  assert.ok(!/^\s+zona,\s*$/m.test(a), "scrive ancora la zona scritta a mano"); assert.equal([...a.matchAll(/error\.message\.includes\("LUOGO_NON_VALIDO"\) \? messaggioErroreVerifica\(error\.message\)/g)].length, 2);
});

test("modulo e pagina: zona a scelta singola tra quartieri e città, i sette campi inviati, la nota su ciò che manca; la pagina legge luoghi e colonne nuove", () => {
  const c = leggi("src", "app", "(app)", "immobili", "ImmobiliClient.tsx"); assert.ok(!/ZONE_MILANO/.test(c), "usa ancora le zone scritte a mano"); assert.match(c, /<LuogoAutocomplete[\s\S]*?singolo[\s\S]*?livelli=\{\["quartiere", "comune"\]\}/);
  assert.deepEqual([...c.matchAll(/<input type="hidden" name="(luogo_id|tipologia|bagni|piano|riscaldamento|tipo_contratto|disponibile_dal)"/g)].map((m) => m[1]), ["luogo_id", "tipologia", "bagni", "piano", "riscaldamento", "tipo_contratto", "disponibile_dal"]);
  assert.match(c, /<input type="hidden" name="piano" value=\{piano\} \/>/, "il piano deve passare così com'è (lo zero conta)"); assert.match(c, /piano: piano === "" \? null : Number\(piano\)/, "la nota non deve dare il piano terra per mancante"); assert.match(c, /const mancanti = datiMancanti\(/);
  const p = leggi("src", "app", "(app)", "immobili", "page.tsx"); const elencoColonne = p.match(/\.from\("listings"\)\s*\.select\(\s*"([^"]+)"/)[1]; for (const col of ["luogo_id", "tipologia", "bagni", "piano", "riscaldamento", "tipo_contratto", "disponibile_dal"]) { assert.ok(elencoColonne.split(/,\s*/).includes(col), `la query non legge «${col}»`); assert.ok(p.includes(`${col}: `), `la pagina non passa «${col}» al modulo`); } assert.match(p, /\.eq\("owner_id", user!\.id\)/); assert.match(p, /from\("luoghi"\)\.select\("id, livello, nome, sigla, parent_id"\)/);
});

test("Home del proprietario: passa alla verifica i sette dati dell'annuncio", () => {
  const h = leggi("src", "app", "(app)", "page.tsx"); const blocco = h.slice(h.indexOf("const immobili: ImmobileVerifica[]")); for (const k of ["classe_energetica", "luogo_id", "bagni", "piano", "riscaldamento", "tipo_contratto", "disponibile_dal"]) assert.match(blocco, new RegExp(`${k}: \\(l\\.${k} as`), k); assert.match(h, /\.select\("id, titolo, zona, verifica_stato, verifica_esito_note, classe_energetica, luogo_id, bagni, piano, riscaldamento, tipo_contratto, disponibile_dal"\)/);
});
