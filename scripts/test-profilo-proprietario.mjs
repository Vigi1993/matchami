/**
 * Test del Profilo del proprietario: il nome in alto con la campanella delle novità nell'angolo (come per l'inquilino) e niente «I tuoi
 * dati»: tipo di proprietario, numero di immobili e obiettivo non li usava nessuna parte dell'app. Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const inf = caricaTs(path.join(radice, "src", "content", "informativa.ts"));
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const prop = senzaCommenti(leggi("src", "app", "(app)", "profilo", "OwnerProfiloClient.tsx"));
const tenant = senzaCommenti(leggi("src", "app", "(app)", "profilo", "ProfiloClient.tsx"));

test("intestazione: nome (e cognome) in alto come titolo, email sotto, iniziali nell'avatar, campanella delle novità nell'angolo; non più «Il tuo profilo» e «Proprietario a Milano»", () => {
  assert.match(prop, /<div className="avatar-row">\s+<div className="avatar">\{iniziali\(nome, cognome\)\}<\/div>\s+<div className="avatar-testo">\s+<h1 className="avatar-name">\{nomeCompleto\(nome, cognome\) \|\| "Il tuo profilo"\}<\/h1>\s+\{email && <div className="avatar-sub">\{email\}<\/div>\}\s+<\/div>\s+<CampanellaNovita nonLette=\{nonLette\} \/>\s+<\/div>/);
  assert.ok(!/Proprietario a Milano/.test(prop) && !/avatar-name">Il tuo profilo</.test(prop)); assert.match(prop, /import \{ iniziali, nomeCompleto \} from "@\/lib\/persona";/);
  // è la STESSA intestazione dell'inquilino: stesse classi, stessi helper, stessa campanella
  for (const x of ['className="avatar-row"', 'className="avatar-testo"', 'className="avatar-name"', 'className="avatar-sub"', "<CampanellaNovita nonLette={nonLette} />"]) { assert.ok(prop.includes(x), `manca ${x}`); assert.ok(tenant.includes(x), `l'inquilino non ha ${x}: le due intestazioni non coincidono`); }
});

test("nessuna riga «Novità» (c'è la campanella) e nessun «I tuoi dati»: restano Account e accesso, Privacy e consensi, FAQ, Esci", () => {
  assert.ok(!/RigaNovita|title="Novità"/.test(prop)); for (const vietato of ["I tuoi dati", "DatiProprietarioForm", "TIPO_VOCAB", "OBIETTIVO_VOCAB", "datiAperto", "Tipo di proprietario", "immobili gestiti", "Affittare velocemente", "updateDatiProprietario", "useActionState"]) assert.ok(!prop.includes(vietato), `resta «${vietato}»`);
  const titoli = [...prop.matchAll(/(?<![a-zA-Z])title="([^"]+)"/g)].map((m) => m[1]); assert.deepEqual(titoli, ["Account e accesso", "Privacy e consensi", "FAQ"]); assert.match(prop, /<form action=\{logout\} className="mt-6">\s+<button className="redo-link"[^>]*>\s+Esci\s+<\/button>/);
  for (const x of ["<AccountSheet", "<PrivacySheet", "<FaqSheet"]) assert.ok(prop.includes(x), `manca ${x}`); assert.ok(!/visibileProprietariIniziale/.test(prop), "il proprietario non ha la scelta di farsi trovare");
});

test("i dati che non servivano non si chiedono né si salvano più: via l'azione, via la lettura dalla pagina, via il tipo; e nessun file dell'app li nomina", () => {
  assert.ok(!fs.existsSync(path.join(radice, "src", "app", "(app)", "profilo", "owner-actions.ts")), "l'azione che li salvava c'è ancora");
  const p = senzaCommenti(leggi("src", "app", "(app)", "profilo", "page.tsx")); assert.ok(!/owner_profiles|OwnerProfile|owner=/.test(p), "la pagina legge ancora il profilo del proprietario"); assert.match(p, /<OwnerProfiloClient\s+nonLette=\{nonLette\}\s+nome=\{profile\?\.nome \?\? null\}\s+cognome=\{profile\?\.cognome \?\? null\}\s+email=\{user!\.email \?\? null\}\s+consensoMarketingIniziale/);
  const trovati = []; const visita = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) visita(f); else if (/\.(ts|tsx)$/.test(e.name) && /proprietario_tipo|num_immobili|\bobiettivo\b|OwnerProfile\b/.test(senzaCommenti(fs.readFileSync(f, "utf8")).replace(/OwnerProfiloClient/g, ""))) trovati.push(path.relative(radice, f)); } };
  visita(path.join(radice, "src")); assert.deepEqual(trovati, [], "nominano ancora quei dati: " + trovati.join(", "));
});

test("la notifica dell'inquilino e quella del proprietario passano dalla stessa campanella, che porta alle notifiche e mostra il numero solo se ce ne sono", () => {
  const c = senzaCommenti(leggi("src", "components", "CampanellaNovita.tsx")); assert.match(c, /<Link href="\/notifiche" className=\{`campanella \$\{numero \? "con-novita" : ""\}`\}/); assert.match(c, /\{numero && \(/);
  assert.match(leggi("src", "app", "(app)", "profilo", "page.tsx"), /\.from\("notifiche"\)\s+\.select\("id", \{ count: "exact", head: true \}\)\s+\.is\("letta_at", null\);/, "il numero delle novità non lette si legge per entrambi i ruoli");
});

test("informativa: non elenca più tipo di proprietario, numero di immobili e obiettivo (non si raccolgono più); nuova versione, la precedente resta equivalente (si chiedono meno dati: nessuno deve riaccettare)", () => {
  const t = JSON.stringify(inf.INFORMATIVA); assert.ok(!/tipo di proprietario|numero di immobili|obiettivo/.test(t), "l'informativa nomina ancora quei dati"); assert.ok(t.includes("Se sei proprietario: gli annunci con titolo, descrizione, zona, prezzo, caratteristiche, classe energetica e foto;"));
  const n = Number(inf.INFORMATIVA.versione.match(/-(\d+)$/)[1]); assert.ok(n >= 21, inf.INFORMATIVA.versione); for (let v = 22; v < n; v++) assert.ok(inf.INFORMATIVA.equivalenti.includes(`2026-10-provvisoria-${v}`), `la ${v} deve restare equivalente`);
});

test("migrazione 0036: toglie ESATTAMENTE le tre colonne e il loro tipo (niente altro), è rieseguibile e dice che è irreversibile", () => {
  const m = leggi("supabase", "migrations", "0036_togli_dati_proprietario.sql"); const sql = m.replace(/--[^\n]*/g, "");
  assert.match(sql, /alter table owner_profiles\s+drop column if exists proprietario_tipo,\s+drop column if exists num_immobili,\s+drop column if exists obiettivo;/); assert.match(sql, /drop type if exists tipo_proprietario;/);
  assert.equal([...sql.matchAll(/drop column/g)].length, 3, "devono essere solo tre colonne"); assert.ok(!/drop table|truncate|delete from|drop column (profile_id|updated_at)|cascade/i.test(sql), "la migrazione tocca altro"); assert.match(m, /è IRREVERSIBILE/); assert.match(m, /Rieseguirla non dà errori/);
  const sqlTesti = ["scripts/db/dati-proprietario-prima.sql", "scripts/db/dati-proprietario-dopo.sql"].map((f) => leggi(...f.split("/"))).join("\n"); for (const tema of ["D1 le tre colonne non ci sono più", "D3 la tabella ha solo ciò che serve", "D4 il proprietario che aveva i dati c'è ancora", "D5 chi si iscrive come proprietario dopo la 0036"]) assert.ok(sqlTesti.replaceAll("''", "'").includes(tema), `manca il controllo «${tema}»`);
});
