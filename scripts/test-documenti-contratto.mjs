/**
 * Test dell'archivio dei documenti di un contratto (src/lib/documenti-contratto.ts, src/lib/archivio.ts
 * e i collegamenti con la migrazione 0028). Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const dc = caricaTs(path.join(radice, "src", "lib", "documenti-contratto.ts"));
const ar = caricaTs(path.join(radice, "src", "lib", "archivio.ts"));
const ac = caricaTs(path.join(radice, "src", "lib", "account.ts"));
const v = caricaTs(path.join(radice, "src", "lib", "verifica.ts"));
const { INFORMATIVA } = caricaTs(path.join(radice, "src", "content", "informativa.ts"));
// con i ritorni a capo di Windows normalizzati: un'estrazione di git può usarli
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const sql = leggi("supabase", "migrations", "0028_documenti_contratto.sql");

// con lettere esadecimali: un identificativo di sole cifre non cambia con toUpperCase() e le prove sul maiuscolo sarebbero vuote
const U1 = "a1111111-1111-4111-8111-11111111111a", U2 = "b2222222-2222-4222-8222-22222222222b", ID = "c3333333-3333-4333-8333-33333333333c";
const PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const testo = (s) => Uint8Array.from(Buffer.from(s, "utf8"));

// ============================================================ i tipi e i limiti
test("tipi di documento: i cinque, con un'etichetta, e solo quelli sono validi", () => {
  assert.deepEqual(dc.TIPI_DOCUMENTO.map((t) => t.id), ["ape", "planimetria", "ricevuta", "registrazione", "altro"]);
  for (const t of dc.TIPI_DOCUMENTO) { assert.equal(dc.tipoDocumentoValido(t.id), true); assert.ok(t.etichetta.length > 3); assert.equal(dc.etichettaTipo(t.id), t.etichetta); }
  for (const x of ["", "APE", "boh", "__proto__", "constructor", "toString", null, undefined, 5, {}, ["ape"], "ape "]) assert.equal(dc.tipoDocumentoValido(x), false, JSON.stringify(x));
  assert.equal(dc.etichettaTipo("sconosciuto"), "Documento");
});

test("regole rispecchiate: i tipi, il limite di 30, i 10 MB, i 200 caratteri e i tipi di file sono quelli della migrazione", () => {
  const tipi = sql.match(/tipo\s+text not null check \(tipo in \(([^)]*)\)\)/)[1].match(/'([^']+)'/g).map((x) => x.replaceAll("'", ""));
  assert.deepEqual(tipi, dc.TIPI_DOCUMENTO.map((t) => t.id), "i tipi del database e dell'app sono diversi");
  assert.match(sql, /\) >= 30 then\s+raise exception 'TROPPI_DOCUMENTI'/); assert.equal(dc.LIMITI_DOCUMENTI.maxPerContratto, 30);
  assert.match(sql, /between 1 and 10485760/); assert.equal(dc.LIMITI_DOCUMENTI.maxByte, 10485760);
  assert.match(sql, /char_length\(nome_file\) between 1 and 200/); assert.equal(dc.LIMITI_DOCUMENTI.maxNome, 200);
  const mime = sql.match(/allowed_mime_types = array\[([^\]]*)\]/)[1].match(/'([^']+)'/g).map((x) => x.replaceAll("'", "")); assert.deepEqual(mime.sort(), ["application/pdf", "image/jpeg", "image/png"]);
  assert.match(sql, /file_size_limit = 10485760/);
});

// ============================================================ cosa c'è DAVVERO dentro il file
test("riconoscere il file dai primi byte: PDF, JPEG e PNG", () => {
  assert.deepEqual(dc.riconosciFile(PDF), { tipo_file: "application/pdf", estensione: "pdf" }); assert.deepEqual(dc.riconosciFile(JPG), { tipo_file: "image/jpeg", estensione: "jpg" }); assert.deepEqual(dc.riconosciFile(PNG), { tipo_file: "image/png", estensione: "png" });
  assert.equal(dc.riconosciFile(Uint8Array.from([...PDF, ...new Array(1000).fill(7)])).estensione, "pdf", "ciò che segue non conta");
});

test("un file che si finge un altro non passa: testo, HTML, script, SVG, zip, eseguibili, vuoto", () => {
  const finti = { html: testo("<html><script>alert(1)</script></html>"), svg: testo('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), js: testo("alert(1)"), zip: Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0]), exe: Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0]), elf: Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 2, 1]), gif: testo("GIF89a....."), vuoto: new Uint8Array(0), corto: Uint8Array.from([0x25, 0x50, 0x44]) };
  for (const [nome, b] of Object.entries(finti)) assert.equal(dc.riconosciFile(b), null, nome);
  for (const x of [null, undefined]) assert.equal(dc.riconosciFile(x), null);
});

test("il file deve COMINCIARE come un PDF/JPEG/PNG: una firma nel mezzo, o preceduta da altro, non conta", () => {
  assert.equal(dc.riconosciFile(Uint8Array.from([0x20, ...PDF])), null, "uno spazio prima di %PDF-"); assert.equal(dc.riconosciFile(Uint8Array.from([...testo("<html>"), ...PDF])), null, "HTML seguito da %PDF-");
  assert.equal(dc.riconosciFile(Uint8Array.from([0xff, 0xd8, 0x00, 0xe0])), null, "JPEG con il terzo byte sbagliato"); assert.equal(dc.riconosciFile(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b])), null, "PNG con l'ultimo byte sbagliato");
  assert.equal(dc.riconosciFile(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2e])), null, "%PDF. e non %PDF-");
});

test("mai errori: qualunque sequenza di byte dà un tipo o nulla (3000 prove casuali, e tutte le lunghezze corte)", () => {
  let seme = 4242; const rnd = () => (seme = (seme * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 3000; i++) { const b = Uint8Array.from({ length: Math.floor(rnd() * 20) }, () => Math.floor(rnd() * 256)); assert.doesNotThrow(() => dc.riconosciFile(b)); const r = dc.riconosciFile(b); assert.ok(r === null || ["pdf", "jpg", "png"].includes(r.estensione)); }
  for (let n = 0; n <= 8; n++) assert.doesNotThrow(() => dc.riconosciFile(PNG.slice(0, n)));
});

// ============================================================ il percorso
test("percorso: <utente>/<id>.<estensione>, piatto, in minuscolo; identificativi o estensioni sbagliati non si costruiscono", () => {
  assert.equal(dc.percorsoArchivio({ userId: U1, id: ID, estensione: "pdf" }), `${U1}/${ID}.pdf`); assert.equal(dc.percorsoArchivio({ userId: U1.toUpperCase(), id: ID.toUpperCase(), estensione: "jpg" }), `${U1}/${ID}.jpg`);
  for (const x of [{ userId: "x", id: ID, estensione: "pdf" }, { userId: U1, id: "../x", estensione: "pdf" }, { userId: U1, id: ID, estensione: "exe" }, { userId: U1, id: ID, estensione: "jpeg" }, { userId: U1, id: ID, estensione: "" }, { userId: `${U1}/${U2}`, id: ID, estensione: "pdf" }]) assert.throws(() => dc.percorsoArchivio(x), JSON.stringify(x));
});

test("percorso: è «della persona» solo se sta nella sua cartella, ed è fatto esattamente così", () => {
  assert.equal(dc.percorsoDiUtente(`${U1}/${ID}.pdf`, U1), true); assert.equal(dc.percorsoDiUtente(`${U1}/${ID}.png`, U1), true); assert.equal(dc.percorsoDiUtente(`${U1}/${ID}.jpg`, U1), true);
  for (const p of [`${U2}/${ID}.pdf`, `${U1}/${ID}.PDF`, `${U1}/${ID}.jpeg`, `${U1}/${ID}.svg`, `${U1}/${ID}.pdf.exe`, `${U1}/../${U2}/${ID}.pdf`, `${U1}/${U1}/${ID}.pdf`, `${U1}/nome-libero.pdf`, `${U1}/${ID}`, `/${U1}/${ID}.pdf`, `${U1}/${ID}.pdf\n`, `${U1.toUpperCase()}/${ID}.pdf`, "", null, undefined, 5, {}]) assert.equal(dc.percorsoDiUtente(p, U1), false, JSON.stringify(p));
  for (const u of ["", "x", "../x", null, undefined]) assert.equal(dc.percorsoDiUtente(`${U1}/${ID}.pdf`, u), false, JSON.stringify(u));
});

test("percorso: la regola dell'app e quella del database danno lo stesso verdetto su una serie di casi", () => {
  const re = sql.match(/percorso\s+text not null unique\s+check \(percorso ~ '([^']+)'\)/)[1]; const db = new RegExp(re);
  const casi = [`${U1}/${ID}.pdf`, `${U1}/${ID}.jpg`, `${U1}/${ID}.png`, `${U1}/${ID}.jpeg`, `${U1}/${ID}.PDF`, `${U1}/${ID}.svg`, `${U1}/${ID}`, `${U1}/${U2}/${ID}.pdf`, `${U1}/../${ID}.pdf`, `${U1}/x.pdf`, `${ID}.pdf`, `${U1}/${ID}.pdf.exe`, `${U1}/${ID}.pdf\n`];
  for (const c of casi) { const appOk = dc.percorsoDiUtente(c, U1); const dbOk = db.test(c); assert.equal(appOk, dbOk, `«${c}»: app ${appOk}, database ${dbOk}`); }
});

// ============================================================ il nome del file
test("nome pulito: spazi ridotti, caratteri di controllo e separatori di cartelle tolti, al massimo 200 caratteri (non byte)", () => {
  assert.equal(dc.nomeFilePulito("  ricevuta   ottobre \n.pdf"), "ricevuta ottobre .pdf"); assert.equal(dc.nomeFilePulito("a/b\\c"), "a_b_c"); assert.equal(dc.nomeFilePulito("a\u0000b\u202ec"), "a b c"); assert.equal(dc.nomeFilePulito("../../etc/passwd"), ".._.._etc_passwd");
  assert.equal([...dc.nomeFilePulito("x".repeat(500))].length, 200); assert.equal([...dc.nomeFilePulito("💥".repeat(500))].length, 200, "per punti di codice");
  for (const x of [null, undefined, 5, {}, []]) assert.equal(dc.nomeFilePulito(x), "");
});

test("nome per lo scaricamento: l'intestazione non si può rompere, qualunque nome si scelga (2000 nomi casuali)", () => {
  const cattivi = ['a"; filename="x.exe', "a\r\nSet-Cookie: s=1", "a\nContent-Type: text/html", "../../x", "a;b", "é à ü ñ", "💥", "Łukasz", "", "   ", ".pdf", "a.html", "nome.exe.pdf"];
  for (const n of cattivi) { const r = dc.nomeDaScaricare(n, "pdf"); assert.match(r.ascii, /^[A-Za-z0-9._ -]+$/, `ascii di «${n}»: ${r.ascii}`); assert.ok(!/["\r\n;\\/]/.test(r.ascii)); assert.ok(!/[\s"';()*]/.test(r.utf8.replace(/%20/g, "")) , `utf8 di «${n}»: ${r.utf8}`); assert.match(r.ascii, /\.pdf$/); assert.match(r.utf8, /\.pdf$/); }
  let seme = 7; const rnd = () => (seme = (seme * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 2000; i++) { const n = Array.from({ length: Math.floor(rnd() * 30) }, () => String.fromCodePoint(rnd() < 0.5 ? 32 + Math.floor(rnd() * 95) : Math.floor(rnd() * 0x2000))).join(""); const r = dc.nomeDaScaricare(n, "png"); assert.match(r.ascii, /^[A-Za-z0-9._ -]+\.png$/, JSON.stringify(n)); assert.ok(!/[\r\n"]/.test(r.utf8)); }
});

test("nome per lo scaricamento: l'estensione è quella VERA del file, non quella scritta da chi ha caricato", () => {
  assert.equal(dc.nomeDaScaricare("ricevuta.html", "pdf").ascii, "ricevuta.pdf"); assert.equal(dc.nomeDaScaricare("foto.exe", "jpg").ascii, "foto.jpg"); assert.equal(dc.nomeDaScaricare("x", "boh").ascii, "x.bin");
  assert.equal(dc.nomeDaScaricare("Ricevuta d'ottobre à.pdf", "pdf").ascii, "Ricevuta d_ottobre a.pdf"); assert.match(dc.nomeDaScaricare("Ricevuta d'ottobre à.pdf", "pdf").utf8, /^Ricevuta%20d%27ottobre%20%C3%A0\.pdf$/);
});

test("file scelto: tipo, vuoto, troppo grande, senza nome", () => {
  const ok = { type: "application/pdf", size: 1000, name: "a.pdf" }; assert.equal(dc.validaFileScelto(ok), null);
  assert.match(dc.validaFileScelto({ ...ok, type: "text/html" }), /PDF/); assert.match(dc.validaFileScelto({ ...ok, size: 0 }), /vuoto/); assert.match(dc.validaFileScelto({ ...ok, size: 10 * 1024 * 1024 + 1 }), /10 MB/);
  assert.equal(dc.validaFileScelto({ ...ok, size: 10 * 1024 * 1024 }), null, "10 MB esatti vanno bene"); assert.match(dc.validaFileScelto({ ...ok, name: "" }), /nome/); assert.match(dc.validaFileScelto({ ...ok, name: "   " }), /nome/);
  assert.equal(dc.estensioneDichiarata("application/pdf"), "pdf"); assert.equal(dc.estensioneDichiarata("image/jpeg"), "jpg"); assert.equal(dc.estensioneDichiarata("image/png"), "png"); for (const t of ["image/svg+xml", "text/html", "", "constructor"]) assert.equal(dc.estensioneDichiarata(t), null, t);
});

// ============================================================ testi e raggruppamenti
test("dimensione: byte, KB, MB con la virgola, e valori strani", () => {
  assert.equal(dc.formattaDimensione(0), "0 B"); assert.equal(dc.formattaDimensione(1023), "1023 B"); assert.equal(dc.formattaDimensione(1024), "1 KB"); assert.equal(dc.formattaDimensione(870 * 1024), "870 KB"); assert.equal(dc.formattaDimensione(1.5 * 1024 * 1024), "1,5 MB"); assert.equal(dc.formattaDimensione(10 * 1024 * 1024), "10,0 MB");
  for (const x of [-1, NaN, Infinity, "5", null, undefined]) assert.equal(dc.formattaDimensione(x), "", String(x));
});

test("chi ha caricato: a ruoli, mai un nome, e «da te» per i propri", () => {
  assert.equal(dc.chiHaCaricato({ mio: true, da_ruolo: "locatore" }), "Caricato da te"); assert.equal(dc.chiHaCaricato({ mio: false, da_ruolo: "locatore" }), "Caricato dal proprietario"); assert.equal(dc.chiHaCaricato({ mio: false, da_ruolo: "conduttore" }), "Caricato dall'inquilino");
});

test("raggruppare per contratto: dal più recente, senza toccare l'elenco ricevuto, e senza righe rotte", () => {
  const d = (id, c, t) => ({ id, contratto_id: c, tipo: "altro", nome_file: "x", dimensione: 1, tipo_file: "application/pdf", created_at: t, mio: true, da_ruolo: "locatore" });
  const righe = [d("a", "K1", "2026-10-01T10:00:00Z"), d("b", "K2", "2026-10-02T10:00:00Z"), d("c", "K1", "2026-10-03T10:00:00Z")]; const copia = JSON.stringify(righe);
  const g = dc.raggruppaPerContratto(righe); assert.deepEqual(g.K1.map((x) => x.id), ["c", "a"]); assert.deepEqual(g.K2.map((x) => x.id), ["b"]); assert.equal(JSON.stringify(righe), copia);
  assert.deepEqual(dc.raggruppaPerContratto(null), {}); assert.deepEqual(dc.raggruppaPerContratto([null, {}, { contratto_id: 5 }]), {});
});

test("posti rimasti: da 30 a 0, mai negativi", () => { assert.equal(dc.postiRimasti(0), 30); assert.equal(dc.postiRimasti(29), 1); assert.equal(dc.postiRimasti(30), 0); assert.equal(dc.postiRimasti(99), 0); assert.equal(dc.postiRimasti(-3), 30); });

test("testi: non presumono il genere di nessuno", () => { for (const t of [dc.TESTO_ARCHIVIO, dc.TESTO_LIMITE_RAGGIUNTO, ...dc.TIPI_DOCUMENTO.map((x) => x.etichetta)]) assert.ok(!/\b(lui|lei)\b/i.test(t), t); });

// ============================================================ gli errori
test("errori: ogni codice che la migrazione può sollevare ha una frase sua, e un errore sul nome non prende la frase dell'errore sul file", () => {
  const G = v.messaggioErroreVerifica("qualcosa di sconosciuto");
  const codici = [...new Set([...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]))]; for (const c of ["CONTRATTO_NON_TUO", "TIPO_DOCUMENTO_NON_VALIDO", "NOME_FILE_NON_VALIDO", "FILE_NON_VALIDO", "TROPPI_DOCUMENTI", "DOCUMENTO_NON_TUO"]) assert.ok(codici.includes(c), c);
  for (const c of codici) { const f = v.messaggioErroreVerifica(`ERROR: ${c} (P0001)`); assert.notEqual(f, G, `${c} non ha un messaggio`); assert.ok(!f.includes(c), c); }
  assert.match(v.messaggioErroreVerifica("NOME_FILE_NON_VALIDO"), /nome del file/); assert.match(v.messaggioErroreVerifica("FILE_NON_VALIDO"), /PDF, un JPG o un PNG fino a 10 MB/);
  assert.notEqual(v.messaggioErroreVerifica("NOME_FILE_NON_VALIDO"), v.messaggioErroreVerifica("FILE_NON_VALIDO"));
  assert.match(v.messaggioErroreVerifica("TROPPI_DOCUMENTI"), /30 documenti/);
});

// ============================================================ la coda dei file
function finto({ elenco = [], erroreElenco = null, erroriRimozione = {}, erroreEliminati = null, lancia = false } = {}) {
  const reg = { rpc: [], rimossi: [], ordine: [] };
  return {
    reg,
    rpc: async (nome, args) => { reg.rpc.push([nome, args]); if (nome === "file_da_eliminare_elenco") { reg.ordine.push("elenco"); if (lancia) throw new Error("boom"); return { data: elenco, error: erroreElenco ? { message: erroreElenco } : null }; } if (nome === "file_eliminati") { reg.ordine.push("file_eliminati"); return { data: args.p_ids.length, error: erroreEliminati ? { message: erroreEliminati } : null }; } return { data: null, error: null }; },
    storage: { from: (bucket) => ({ remove: async (p) => { reg.ordine.push("remove:" + bucket); reg.rimossi.push([bucket, p]); if (erroriRimozione[bucket]) return { error: { message: "no" } }; return { error: null }; } }) },
  };
}
const riga = (id, bucket = "documenti-contratto", percorso = `${U1}/${id}.pdf`) => ({ id, bucket, percorso });

test("coda: si tolgono i file dall'archivio e SOLO DOPO si cancellano le righe", async () => {
  const f = finto({ elenco: [riga("a"), riga("b")] }); const r = await ar.svuotaCodaFile(f);
  assert.deepEqual(r, { letti: 2, rimossi: 2, errori: 0 }); assert.deepEqual(f.reg.ordine, ["elenco", "remove:documenti-contratto", "file_eliminati"]);
  assert.deepEqual(f.reg.rimossi, [["documenti-contratto", [`${U1}/a.pdf`, `${U1}/b.pdf`]]]); assert.deepEqual(f.reg.rpc[1], ["file_eliminati", { p_ids: ["a", "b"] }]);
});

test("coda: se togliere un file non riesce, la sua riga RESTA (il giro dopo riprova), e gli altri archivi vanno avanti", async () => {
  const f = finto({ elenco: [riga("a", "documenti-contratto"), riga("b", "altro-archivio")], erroriRimozione: { "documenti-contratto": true } }); const r = await ar.svuotaCodaFile(f);
  assert.deepEqual(r, { letti: 2, rimossi: 1, errori: 1 }); assert.deepEqual(f.reg.rpc.at(-1), ["file_eliminati", { p_ids: ["b"] }], "la riga di «a» non doveva essere cancellata");
  const tutti = finto({ elenco: [riga("a")], erroriRimozione: { "documenti-contratto": true } }); await ar.svuotaCodaFile(tutti); assert.ok(!tutti.reg.rpc.some((x) => x[0] === "file_eliminati"), "nessuna riga va cancellata se nessun file è stato tolto");
});

test("coda: vuota non fa niente; errori, risposte strane ed eccezioni non lanciano mai", async () => {
  const v1 = finto({ elenco: [] }); assert.deepEqual(await ar.svuotaCodaFile(v1), { letti: 0, rimossi: 0, errori: 0 }); assert.deepEqual(v1.reg.ordine, ["elenco"]);
  assert.deepEqual(await ar.svuotaCodaFile(finto({ erroreElenco: "giù" })), { letti: 0, rimossi: 0, errori: 1 }); assert.deepEqual(await ar.svuotaCodaFile({ ...finto(), rpc: async () => ({ data: "boh", error: null }) }), { letti: 0, rimossi: 0, errori: 1 });
  await assert.doesNotReject(async () => ar.svuotaCodaFile(finto({ lancia: true }))); assert.equal((await ar.svuotaCodaFile(finto({ lancia: true }))).errori, 1);
  const rotte = finto({ elenco: [null, {}, { id: 5, bucket: "x", percorso: "y" }, { id: "a", bucket: 5, percorso: "y" }, riga("ok")] }); assert.equal((await ar.svuotaCodaFile(rotte)).rimossi, 1, "solo la riga valida");
  const eliminati = finto({ elenco: [riga("a")], erroreEliminati: "giù" }); assert.deepEqual(await ar.svuotaCodaFile(eliminati), { letti: 1, rimossi: 0, errori: 1 });
});

test("coda: il limite chiesto al database è quello dato (100 di base), e i file si raggruppano per archivio", async () => {
  const f = finto({ elenco: [riga("a", "uno"), riga("b", "due"), riga("c", "uno")] }); await ar.svuotaCodaFile(f, 7); assert.deepEqual(f.reg.rpc[0], ["file_da_eliminare_elenco", { p_max: 7 }]); assert.equal(ar.MASSIMO_PER_GIRO, 100);
  assert.equal(f.reg.rimossi.length, 2); assert.deepEqual(f.reg.rimossi.find((x) => x[0] === "uno")[1].length, 2);
});

// ============================================================ coerenza con la migrazione e con il resto dell'app
test("cancellazione dell'account: l'archivio dei documenti dei contratti è nell'elenco di quelli da svuotare", () => {
  assert.ok(ac.BUCKET_FILE_UTENTE.includes("documenti-contratto")); assert.equal(dc.BUCKET_DOCUMENTI_CONTRATTO, "documenti-contratto");
  const e = leggi("src", "app", "(app)", "profilo", "elimina-actions.ts"); const i = e.indexOf("deleteUser(user.id)"); const j = e.indexOf("svuotaCodaFile(admin)"); assert.ok(i > 0 && j > i, "la coda si svuota DOPO aver cancellato l'utente (le righe cadono a cascata e la riempiono)");
});

test("migrazione: i file del contratto sono visibili solo a chi li ha caricati (tre regole, tutte sulla propria cartella)", () => {
  const regole = [...sql.matchAll(/create policy "documenti-contratto: [^"]+" on storage\.objects\s+for (\w+) to authenticated\s+(with check|using) \(([^;]*)\);/g)];
  assert.deepEqual(regole.map((m) => m[1]).sort(), ["delete", "insert", "select"]); for (const m of regole) { assert.match(m[3], /bucket_id = 'documenti-contratto'/); assert.match(m[3], /\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/); assert.ok(!/contratti|candidature|listings|is_staff/.test(m[3]), "una regola dell'archivio guarda altre tabelle: l'accesso tra le parti deve passare solo dal server"); }
  assert.ok(!/for update/.test(sql.match(/create policy[\s\S]*?;/g).join("")), "esiste una regola di modifica"); assert.ok(!/for all/.test(sql.replace(/--[^\n]*/g, "")), "una regola per tutto");
});

test("migrazione: le tabelle non hanno permessi né regole dirette, la coda è solo del servizio, e il blocco del limite c'è", () => {
  for (const t of ["documenti_contratto", "file_da_eliminare"]) { assert.match(sql, new RegExp(`alter table ${t} enable row level security;`)); assert.match(sql, new RegExp(`revoke all on ${t} from anon, authenticated;`)); }
  assert.ok(!/create policy[^;]*(documenti_contratto|file_da_eliminare)\b[^;]*on (documenti_contratto|file_da_eliminare)/.test(sql));
  assert.match(sql, /grant execute on function\s+public\.file_da_eliminare_elenco\(integer\),\s+public\.file_eliminati\(uuid\[\]\)\s+to service_role;/); assert.match(sql, /revoke all on function\s+public\.file_da_eliminare_elenco\(integer\),[\s\S]*?from public, anon, authenticated;/);
  assert.match(sql, /for update of c;/, "senza il blocco due registrazioni insieme superano il limite"); assert.match(sql, /after delete on documenti_contratto\s+for each row execute function public\.accoda_file_documento_contratto\(\)/);
  assert.match(sql, /on conflict \(id\) do update\s+set public = false/);
});

test("migrazione: nessuna funzione per le persone restituisce il percorso dei file in un elenco, e nessuna colonna ha dati personali", () => {
  const elenco = sql.match(/documenti_dei_miei_contratti\(\)\s+returns table \(([\s\S]*?)\)\s+language sql/)[1]; assert.ok(!/percorso/.test(elenco), "l'elenco espone i percorsi"); assert.ok(!/mail|telef|fiscale|nome_utente|cognome/i.test(elenco));
  assert.match(sql, /percorso_documento_contratto\(p_documento uuid\)\s+returns table \(contratto_id uuid, percorso text/);
});

function filiDiCodice(dir = path.join(radice, "src")) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => { if (e.name.startsWith("__")) return []; const p = path.join(dir, e.name); return e.isDirectory() ? filiDiCodice(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : []; }); }
const rel = (f) => path.relative(radice, f).replaceAll("\\", "/");

test("chiamate: ogni funzione dei documenti si chiama con esattamente i parametri della migrazione, e solo dai posti previsti", () => {
  const funzioni = new Map(); for (const m of sql.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)/g)) funzioni.set(m[1], [...m[2].matchAll(/\b(p_\w+)\s/g)].map((x) => x[1]).sort());
  const attese = { documenti_dei_miei_contratti: ["src/app/(app)/gestione-affitti/page.tsx", "src/app/(app)/gestione/page.tsx"], percorso_documento_contratto: ["src/app/(app)/contratto/[id]/documenti/[doc]/route.ts"], registra_documento_contratto: ["src/app/(app)/contratto/documenti-actions.ts"], elimina_documento_contratto: ["src/app/(app)/contratto/documenti-actions.ts"], file_da_eliminare_elenco: ["src/lib/archivio.ts"], file_eliminati: ["src/lib/archivio.ts"] };
  const trovate = Object.fromEntries(Object.keys(attese).map((k) => [k, new Set()]));
  for (const f of filiDiCodice()) { const c = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""); for (const nome of Object.keys(attese)) for (const m of c.matchAll(new RegExp(`"${nome}"\\s*(?:,\\s*\\{([^}]*)\\}|\\))`, "g"))) { assert.deepEqual([...(m[1] ?? "").matchAll(/\b(p_\w+)\s*:/g)].map((x) => x[1]).sort(), funzioni.get(nome), `${rel(f)} chiama ${nome} con parametri diversi da quelli della migrazione`); trovate[nome].add(rel(f)); } }
  for (const [nome, posti] of Object.entries(attese)) assert.deepEqual([...trovate[nome]].sort(), posti.sort(), `${nome}: chiamata da posti diversi dal previsto`);
});

test("privacy: nessun codice dell'app nomina la tabella dei documenti o la coda (si passa solo dalle funzioni), e nessun componente conosce il percorso dei file", () => {
  for (const f of filiDiCodice()) { const c = fs.readFileSync(f, "utf8"); assert.ok(!/documenti_contratto|file_da_eliminare\b/.test(c.replace(/"file_da_eliminare_elenco"/g, "")), `${rel(f)} nomina una tabella dei documenti`); }
  const comp = leggi("src", "components", "ArchivioContratto.tsx"); assert.ok(!/\.percorso\b/.test(comp), "il componente legge il percorso di un file");
  assert.ok(!/percorso:/.test(leggi("src", "lib", "documenti-contratto.ts").match(/export type DocumentoContratto = \{[\s\S]*?\n\};/)[0]), "il tipo del documento ha il percorso");
});

test("scaricamento: i controlli nell'ordine (identificativi, accesso, informativa, solo poi i dati), e il file arriva sempre come scaricamento e bloccato", () => {
  const r = leggi("src", "app", "(app)", "contratto", "[id]", "documenti", "[doc]", "route.ts"); const i = (s) => r.indexOf(s);
  assert.ok(i("èUuid(id)") > 0 && i("èUuid(id)") < i("getUser()") && i("getUser()") < i("haAccettatoInformativa(") && i("haAccettatoInformativa(") < i('rpc("percorso_documento_contratto"') && i('rpc("percorso_documento_contratto"') < i("clienteAmministratore()") && i("clienteAmministratore()") < i(".download("), "ordine dei controlli");
  for (const h of ['"Cache-Control": "private, no-store"', '"X-Content-Type-Options": "nosniff"', "attachment; filename=", "default-src 'none'; sandbox"]) assert.ok(r.includes(h), h);
  assert.match(r, /riga\.contratto_id !== id/, "l'identificativo del contratto nell'indirizzo deve essere quello del documento"); assert.ok(!/inline/.test(r), "un documento non si apre dentro la pagina");
  assert.deepEqual([...r.matchAll(/export (?:async )?(?:function|const) (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]), ["GET"]); assert.ok(!/console\./.test(r));
});

test("azioni: ogni rifiuto, dopo che il percorso è della persona, TOGLIE il file (un file respinto non ha una riga e non finirebbe nella coda)", () => {
  const a = leggi("src", "app", "(app)", "contratto", "documenti-actions.ts"); const reg = a.slice(a.indexOf("export async function registraDocumento"), a.indexOf("export async function eliminaDocumento")); const i = (s) => reg.indexOf(s);
  assert.ok(i("percorsoDiUtente(percorso, user.id)") > 0 && i("percorsoDiUtente(percorso, user.id)") < i("const togli"), "il controllo del percorso viene prima");
  assert.ok(i("const rifiuta") > 0); assert.ok([...reg.matchAll(/return rifiuta\(/g)].length >= 7, "ci sono meno rifiuti con rimozione del previsto: " + [...reg.matchAll(/return rifiuta\(/g)].length);
  const dopo = reg.slice(i("const rifiuta")); assert.ok(!/return \{ error:/.test(dopo.replace(/return \{ ok: true \}/g, "").replace(/const rifiuta[\s\S]*?\n  \};\n/, "")), "dopo la definizione di «rifiuta» c'è un rifiuto che non passa da lì");
  assert.match(reg, /clienteAmministratore\(\)/, "se la rimozione normale non riesce si deve riprovare con la chiave di servizio");
  for (const stop of [reg.slice(0, i("const archivio"))]) assert.ok(!/togli\(\)/.test(stop), "prima del controllo del percorso non si tocca niente");
});

test("azioni: il tipo e la dimensione si decidono dal CONTENUTO letto dal server, mai da ciò che dichiara il browser", () => {
  const a = leggi("src", "app", "(app)", "contratto", "documenti-actions.ts"); const reg = a.slice(a.indexOf("export async function registraDocumento"), a.indexOf("export async function eliminaDocumento"));
  assert.match(reg, /\.download\(percorso\)/); assert.match(reg, /riconosciFile\(bytes\)/); assert.match(reg, /p_dimensione: bytes\.length/); assert.match(reg, /p_tipo_file: riconosciuto\.tipo_file/); assert.match(reg, /percorso\.endsWith\(`\.\$\{riconosciuto\.estensione\}`\)/);
  assert.ok(!/file\.type|tipoDichiarato|contentType/.test(reg), "il server si fida di un tipo dichiarato dal browser");
});

test("componente: il percorso si costruisce con l'identificativo della persona, e un file che arriva ma non si registra si toglie", () => {
  const c = leggi("src", "components", "ArchivioContratto.tsx"); assert.match(c, /percorsoArchivio\(\{ userId: user\.id, id: crypto\.randomUUID\(\), estensione \}\)/); assert.match(c, /finally \{[\s\S]*?if \(percorso\) await supabase\.storage\.from\(BUCKET_DOCUMENTI_CONTRATTO\)\.remove\(\[percorso\]\)/);
});

test("percorsi pubblici: la pulizia periodica è raggiungibile senza accesso, e SOLO quella", () => {
  const m = leggi("src", "lib", "supabase", "middleware.ts"); const voci = [...m.match(/const PUBLIC_PATHS = \[([^\]]*)\]/)[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.ok(voci.includes("/api/archivio/")); for (const troppo of ["/api", "/api/", "/api/archivio", "/contratto", "/contratto/"]) assert.ok(!voci.includes(troppo), troppo);
  const p = leggi("src", "app", "api", "archivio", "pulisci", "route.ts"); assert.ok(p.indexOf("autorizzaCron(") > 0 && p.indexOf("autorizzaCron(") < p.indexOf("clienteAmministratore()")); assert.match(p, /export const dynamic = "force-dynamic"/); assert.ok(!/console\./.test(p));
});

test("informativa: dichiara l'archivio, chi vede cosa, i limiti e che i file si tolgono; e dice come si aprono", () => {
  const t = JSON.stringify(INFORMATIVA);
  assert.match(t, /I file che carichi li vedono le due parti del contratto, e tu puoi eliminare solo i tuoi/); assert.match(t, /PDF o immagini fino a 10 MB, al massimo 30 per contratto, in un archivio privato/); assert.match(t, /Quando elimini un documento, il contratto o il tuo account, i file vengono tolti dall'archivio/); assert.match(t, /Non ne analizziamo il contenuto/); assert.match(t, /quale delle due parti l'ha caricato/);
});

test("la logica pura non ha accesso alla rete né al browser", () => {
  for (const f of ["documenti-contratto.ts", "archivio.ts"]) { const c = leggi("src", "lib", f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""); for (const vietato of [/\bfetch\(/, /localStorage/, /process\.env/, /console\./, /supabase\//]) assert.ok(!vietato.test(c), `${f} usa ${vietato}`); }
});

test("nome: i caratteri che invertono la direzione del testo si tolgono (ricevuta\u202efdp.exe appare come ricevutaexe.pdf)", () => {
  const bidi = ["\u202a", "\u202b", "\u202c", "\u202d", "\u202e", "\u2066", "\u2067", "\u2068", "\u2069"];
  for (const c of bidi) { const n = dc.nomeFilePulito(`ricevuta${c}fdp.exe`); assert.ok(!n.includes(c), `U+${c.codePointAt(0).toString(16)} è rimasto in «${n}»`); }
  const r = dc.nomeDaScaricare("ricevuta\u202efdp.exe", "pdf"); assert.match(r.ascii, /^[A-Za-z0-9._ -]+$/); assert.ok(!/%E2%80%AE/i.test(r.utf8), "la direzione è passata nell'intestazione");
});

test("nome: i caratteri di direzione si tolgono anche nei nomi delle persone e nell'indirizzo (stessa regola nei tre pulitori)", () => {
  const dati = caricaTs(path.join(radice, "src", "lib", "contratto", "dati.ts")); const ind = caricaTs(path.join(radice, "src", "lib", "mappe", "indirizzo.ts"));
  const email = caricaTs(path.join(radice, "src", "lib", "email", "modello.ts")); assert.equal(email.nomeBreve("Mario\u202eossoR"), "Mario", "il saluto di un'email: il primo nome, senza caratteri di direzione"); assert.ok(!email.nomeBreve("\u202eMario").includes("\u202e"));
  assert.equal(dati.pulisciTesto("Mario\u202eossoR"), "Mario ossoR"); assert.equal(ind.pulisci("Via\u202e Roma"), "Via Roma");
  for (const c of ["\u202a", "\u202e", "\u2066", "\u2069"]) { assert.ok(!dati.pulisciTesto(`a${c}b`).includes(c)); assert.ok(!ind.pulisci(`a${c}b`).includes(c)); assert.ok(!dc.nomeFilePulito(`a${c}b`).includes(c)); }
});
