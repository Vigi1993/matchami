/**
 * Coerenza di stile delle pagine del proprietario (Home, Database) con il resto dell'app. Nati da due difetti veri:
 *  - una classe nuova aveva lo STESSO NOME di una classe esistente (l'intestazione dei gruppi dell'inquilino): gli stili si sommavano,
 *    il titolo della casa usciva in maiuscolo spaziato e la pagina dell'inquilino cambiava senza che nessuno lo avesse deciso;
 *  - le due pagine parlavano un «dialetto» diverso dalle altre (angoli, ombre, colori, titolo e sottotitolo).
 * Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { radice } from "./carica-ts.mjs";

const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const css = leggi("src", "app", "globals.css");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat(m.split("\n").length - 1));
const MARCATORE = "Home del proprietario: la casa in grande e due tessere grandi.";
const inizio = css.indexOf(MARCATORE); const nuovo = css.slice(inizio); const vecchio = css.slice(0, inizio);
const blocco = (testo, sel) => { const m = testo.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`)); return m ? m[1] : null; };
const valore = (b, prop) => (b?.match(new RegExp(`${prop}:\\s*([^;]+);`)) ?? [])[1]?.trim();
const componenti = ["src/app/(app)/OwnerHomeClient.tsx", "src/app/(app)/database/DatabaseClient.tsx", "src/components/SchedaPersona.tsx", "src/components/SezioneApribile.tsx", "src/components/PossibiliMatch.tsx", "src/components/ConfermaAffitto.tsx", "src/components/CaricaContrattoRapporto.tsx", "src/components/RichiesteProprietari.tsx"];

test("NESSUNA classe nuova ha lo stesso nome di una classe già definita prima: gli stili si sommerebbero (è ciò che ha storpiato il Database e toccato la pagina dell'inquilino)", () => {
  const base = (testo) => { const r = new Map(); const pulito = senzaCommenti(testo); pulito.split("\n").forEach((riga) => { const m = riga.match(/^(\.[a-zA-Z][a-zA-Z0-9_-]*)(?:[\s>.:+~[][^{,]*)?(?:\s*,\s*\.[^{]*)?\s*\{/); if (m) for (const sel of riga.replace(/\s*\{.*$/, "").split(/\s*,\s*/)) { const b = sel.match(/^\.[a-zA-Z][a-zA-Z0-9_-]*/); if (b) r.set(b[0], (r.get(b[0]) ?? 0) + 1); } }); return r; };
  const prima = base(vecchio); const dopo = base(nuovo);
  // riuso VOLUTO: «.match-schede» è la barra delle schede dell'inquilino, a cui una regola nuova aggiunge solo il numero rosso sulla scheda delle richieste
  const consentiti = new Set([".match-schede"]);
  const collisioni = [...dopo.keys()].filter((c) => prima.has(c) && !consentiti.has(c)); assert.deepEqual(collisioni, [], "classi definite sia prima sia nel CSS nuovo: " + collisioni.join(", "));
});

test("le classi dell'inquilino che prima erano libere non sono state toccate: «.gruppo-testa» ha UNA sola definizione, quella originale (maiuscolo piccolo, 12 px)", () => {
  const tutte = [...css.matchAll(/(?:^|\n)\.gruppo-testa \{([^}]*)\}/g)]; assert.equal(tutte.length, 1, "più definizioni di .gruppo-testa"); const b = tutte[0][1];
  assert.match(b, /text-transform: uppercase;/); assert.match(b, /font-size: 12px;/); assert.match(b, /letter-spacing: 0\.06em;/); assert.ok(!/\bgap:|margin-bottom:/.test(b), "alla vecchia intestazione si è aggiunto spazio");
  assert.ok(tutte[0].index < inizio, "la definizione deve stare tra quelle vecchie");
});

test("ogni classe del CSS nuovo del proprietario è usata da qualche file (niente stili rimasti dai disegni precedenti)", () => {
  const classi = new Set([...senzaCommenti(nuovo).matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]+)/g)].map((m) => m[1]));
  let sorgenti = ""; const visita = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) visita(f); else if (/\.(ts|tsx)$/.test(e.name)) sorgenti += fs.readFileSync(f, "utf8") + "\n"; } }; visita(path.join(radice, "src"));
  const stati = /^(is-|con-|chiuso$|su$|fatto$|attivo$|una$|compatta$|pieno$|on$)/;
  const inutili = [...classi].filter((c) => !stati.test(c) && !new RegExp(`(?<![a-zA-Z0-9_-])${c.replace(/[-]/g, "\\-")}(?![a-zA-Z0-9_-])`).test(sorgenti)); assert.deepEqual(inutili, [], "classi mai usate: " + inutili.join(", "));
});

test("Home del proprietario: la FORMA della Home dell'inquilino (schermata scura, pannelli con gli stessi angoli del suo pannello, pulsanti a pillola con il bordo oro); Database e richieste: la forma delle schede delle altre pagine (20 px e la stessa ombra)", () => {
  const ombraStandard = valore(blocco(vecchio, ".match-card"), "box-shadow"); assert.equal(ombraStandard, "0 8px 20px rgba(16, 21, 26, 0.06)");
  const angoloHome = valore(blocco(vecchio, ".home-intro"), "border-radius"); assert.equal(angoloHome, "18px", "il pannello della Home dell'inquilino");
  for (const sel of [".casa-intro", ".tessera", ".casa-attesa", ".casa-hero"]) assert.equal(valore(blocco(nuovo, sel), "border-radius"), angoloHome, `${sel}: gli angoli del pannello della Home dell'inquilino`);
  for (const sel of [".casa-intro", ".tessera", ".casa-attesa"]) { assert.equal(valore(blocco(nuovo, sel), "background"), "var(--ink-soft)", `${sel}: pannello scuro`); assert.equal(valore(blocco(nuovo, sel), "border"), "1px solid var(--line)", `${sel}: lo stesso filetto dei pannelli scuri`); assert.equal(valore(blocco(nuovo, sel), "color"), "var(--paper)", `${sel}: testo chiaro`); }
  for (const sel of [".persona", ".richiesta"]) { assert.equal(valore(blocco(nuovo, sel), "border-radius"), "20px", `${sel}: angoli`); assert.equal(valore(blocco(nuovo, sel), "box-shadow"), ombraStandard, `${sel}: ombra diversa da quella delle altre schede`); }
  assert.equal(valore(blocco(nuovo, ".conferma-affitto"), "border-radius"), "20px");
  const pillolaHome = blocco(vecchio, ".home-intro .hi-modifica") ?? vecchio.match(/\.home-intro \.hi-modifica \{([^}]*)\}/)?.[1]; assert.ok(pillolaHome, "la pillola «Modifica ricerca» dell'inquilino");
  const invito = blocco(nuovo, ".casa-invito b"); assert.equal(valore(invito, "border"), "1px solid var(--gold)", "bordo oro come le pillole dell'inquilino"); assert.equal(valore(invito, "color"), "var(--gold)"); assert.equal(valore(invito, "background"), "rgba(201, 161, 90, 0.16)", "lo stesso fondo oro leggero"); assert.equal(valore(invito, "border-radius"), "999px");
  assert.equal(valore(blocco(nuovo, ".tessera-numero"), "color"), "var(--gold)"); assert.equal(valore(blocco(nuovo, ".tessera-vai"), "color"), "var(--gold)");
  assert.ok(!/background: var\(--moss\)/.test(blocco(nuovo, ".casa-invito") ?? ""), "il banner verde non c'è più");
  const fuori = [...senzaCommenti(nuovo.slice(0, nuovo.indexOf("/* Database: testi dei possibili match */"))).matchAll(/border-radius:\s*(\d+)px/g)].map((m) => Number(m[1])).filter((n) => n > 20 && n < 900); assert.deepEqual(fuori, [], "angoli più grandi di quelli dell'app nella Home: " + fuori.join(", "));
});

test("Home: marchio e schermata scura come la Home dell'inquilino; Database: la casa è la scheda di «Immobili» e i gruppi hanno l'intestazione dei gruppi dell'inquilino", () => {
  const home = leggi("src", "app", "(app)", "OwnerHomeClient.tsx"); const inq = leggi("src", "app", "(app)", "HomeClient.tsx");
  assert.match(home, /<div className="screen-dark casa-schermo">\s+<div className="casa-scroll">\s+<div className="casa-colonna">\s+\{\/\*[^*]*\*\/\}\s+<div className="topbar casa-topbar">\s+<div className="brand">\s+Match<b>AmI<\/b>\s+<\/div>\s+<\/div>/);
  for (const x of ['className="topbar', 'className="brand"', "Match<b>AmI</b>", "screen-dark"]) { assert.ok(home.includes(x), `la Home del proprietario non ha ${x}`); assert.ok(inq.includes(x), `la Home dell'inquilino non ha ${x}: le due Home non coincidono`); }
  assert.match(home, /<p className="casa-intro-saluto">\{saluto\(nome, ora\)\}\.<\/p>\s+<h1 className="casa-intro-titolo">\{case_\.length === 1 \? "La tua casa" : "Le tue case"\}<\/h1>/);
  const db = leggi("src", "app", "(app)", "database", "DatabaseClient.tsx"); assert.match(db, /<header className="match-card casa-intestazione">[\s\S]*?<div className="mc-body">\s+<div className="mc-zona">\{zona\}<\/div>\s+<div className="mc-title">\{g\.casa\.titolo\}<\/div>\s+<div className="mc-meta">/);
  const s = leggi("src", "components", "SezioneApribile.tsx"); assert.match(s, /<section id=\{id\} className="gruppo-match sezione-db">\s+<button type="button" className="gruppo-testa"/); assert.match(s, /\{titolo\} — \{conteggio\}/); assert.match(s, /<IconChevronSu className=\{`gruppo-freccia \$\{stato \? "" : "chiuso"\}`\} \/>/);
  const cand = leggi("src", "app", "(app)", "candidature", "CandidatureClient.tsx"); assert.match(cand, /className="gruppo-testa"/); assert.match(cand, /\{titolo\} — \{items\.length\}/, "l'intestazione dell'inquilino ha lo stesso formato");
});

test("le pagine del proprietario usano le classi dell'app per ciò che l'app ha già (titolo, scheda della casa, pulsante principale), senza ridefinirle", () => {
  for (const sel of [".screen-title", ".screen-sub", ".match-card", ".mc-zona", ".mc-title", ".mc-meta", ".opp-cta", ".gruppo-testa", ".topbar", ".brand", ".screen-dark", ".home-intro"]) assert.equal(blocco(nuovo, sel), null, `${sel} è ridefinita nel CSS nuovo: si deve riusare quella dell'app`);
  for (const f of componenti.slice(0, 2)) { const t = leggi(...f.split("/")); assert.ok(/className="[^"]*\b(screen-dark|match-card)\b/.test(t), `${f} non usa le classi dell'app`); }
});
