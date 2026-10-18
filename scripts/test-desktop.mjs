/**
 * Test della VERSIONE PER COMPUTER (da 1024 px in su).
 * Il vincolo: la versione per telefono (e per tablet in verticale) NON cambia. Per questo tutto ciò che riguarda il computer sta in un solo blocco,
 * l'ULTIMO del foglio di stile, fatto solo di livelli «@media (min-width: …px)» da 1024 px in su. Questi test lo tengono così:
 *  - nessuna regola fuori da un livello, nessun livello sotto i 1024 px, nessun «!important»;
 *  - le composizioni a più colonne (Home a due colonne, liste a due colonne, case affiancate) partono da 1280 px, dove stanno nello spazio
 *    (a 1024 px uscirebbero dallo schermo: è già successo);
 *  - i due contenitori del benvenuto sono invisibili sul telefono (display: contents);
 *  - ogni classe usata dal blocco esiste davvero (nel codice o nel foglio prima del blocco).
 * Il confronto delle schermate prima/dopo a 390, 430, 768 e 1000 px si fa a mano nel browser. Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { radice } from "./carica-ts.mjs";

const css = fs.readFileSync(path.join(radice, "src", "app", "globals.css"), "utf8");
const MARCA = "VERSIONE PER COMPUTER (da 1024 px in su)";
const inizio = css.lastIndexOf("/* ====", css.indexOf(MARCA));
const prima = css.slice(0, inizio);
const blocco = css.slice(inizio);

/** Divide il blocco in elementi di primo livello: commenti, livelli «@media» e regole nude. */
function primoLivello(testo) {
  const out = []; let i = 0;
  while (i < testo.length) {
    if (/\s/.test(testo[i])) { i++; continue; }
    if (testo.startsWith("/*", i)) { const f = testo.indexOf("*/", i) + 2; out.push({ tipo: "commento", testo: testo.slice(i, f) }); i = f; continue; }
    const aperta = testo.indexOf("{", i); if (aperta < 0) break;
    let prof = 1, j = aperta + 1;
    while (j < testo.length && prof > 0) { if (testo[j] === "{") prof++; else if (testo[j] === "}") prof--; j++; }
    const intestazione = testo.slice(i, aperta).trim();
    out.push({ tipo: intestazione.startsWith("@media") ? "livello" : "regola", intestazione, corpo: testo.slice(aperta + 1, j - 1) }); i = j;
  }
  return out;
}
const elementi = primoLivello(blocco); const livelli = elementi.filter((e) => e.tipo === "livello"); const larghezza = (e) => Number(/min-width:\s*(\d+)px/.exec(e.intestazione)?.[1]);

test("computer: il blocco c'è, è l'ultimo del foglio ed è fatto SOLO di livelli da 1024 px in su (niente fuori dai livelli)", () => {
  assert.ok(inizio > 0 && blocco.includes(MARCA), "il blocco per computer manca");
  assert.equal(elementi.filter((e) => e.tipo === "regola").length, 0, "regole fuori da un livello: si applicherebbero anche al telefono");
  assert.ok(livelli.length >= 3, "ci aspettiamo almeno i livelli 1024, 1280 e 1440");
  for (const l of livelli) assert.match(l.intestazione, /^@media \(min-width: \d+px\)$/, "solo livelli «min-width»: " + l.intestazione);
  for (const l of livelli) assert.ok(larghezza(l) >= 1024, "nessun livello sotto i 1024 px: " + l.intestazione);
});

test("computer: i livelli sono in ordine crescente e senza ripetizioni (1024, 1280, 1440, 1760)", () => {
  const w = livelli.map(larghezza);
  assert.deepEqual(w, [...new Set(w)].sort((a, b) => a - b), "ordine e ripetizioni");
  assert.deepEqual(w, [1024, 1280, 1440, 1760]);
});

test("computer: nessun «!important» (non si vince una regola con la forza)", () => {
  assert.ok(!/!important/.test(blocco));
});

test("computer: la parte del foglio PRIMA del blocco non contiene nessun livello da 1024 px in su (il telefono non ne risente)", () => {
  assert.ok(!/@media \(min-width: (1024|1[1-9]\d\d|[2-9]\d\d\d)px\)/.test(prima), "livelli da computer fuori dal blocco");
});

test("computer: le composizioni a più colonne partono da 1280 px (a 1024 px non stanno nello spazio: la Home usciva dallo schermo)", () => {
  const livello = (n) => livelli.find((l) => larghezza(l) === n)?.corpo ?? "";
  const l1024 = livello(1024), l1280 = livello(1280);
  assert.match(l1280, /\.screen-dark\.home-inq \{\s+display: grid;/, "la Home a due colonne sta nel livello 1280");
  assert.match(l1280, /\.db-pagina \{\s+display: grid;\s+grid-template-columns: 420px minmax\(0, 1fr\);/, "elenco e dettaglio affiancati stanno nel livello 1280");
  assert.match(l1280, /\.casa-colonna \{\s+display: grid;/, "le case affiancate stanno nel livello 1280");
  for (const spia of ["display: grid;\n    grid-template-columns: minmax(440px", "grid-template-columns: 420px minmax(0, 1fr);\n    gap: 20px"]) assert.ok(!l1024.includes(spia), "composizione a più colonne nel livello 1024: " + spia.slice(0, 40));
});

test("computer: la Home a due colonne sta davvero nello spazio a 1280 px (barra laterale 248 + riempimenti + colonne + intervallo)", () => {
  const l = livelli.find((x) => larghezza(x) === 1280).corpo;
  const g = /grid-template-columns: minmax\((\d+)px, (\d+)px\) (\d+)px;/.exec(l); const gap = Number(/\.screen-dark\.home-inq \{[^}]*column-gap: (\d+)px/.exec(l)?.[1]); const pad = Number(/\.screen-dark\.home-inq \{[^}]*padding: \d+px (\d+)px/.exec(l)?.[1]);
  assert.ok(g && gap && pad, "le misure della Home si leggono");
  const minimo = 248 + 2 * pad + Number(g[1]) + Number(g[3]) + gap;
  assert.ok(minimo <= 1280, `larghezza minima necessaria ${minimo}px > 1280px: la Home uscirebbe dallo schermo`);
});

test("computer: il benvenuto ha i due contenitori nel codice e sul telefono non esistono per il disegno (display: contents)", () => {
  const jsx = fs.readFileSync(path.join(radice, "src", "app", "benvenuto", "BenvenutoClient.tsx"), "utf8");
  assert.match(jsx, /className="benvenuto-fianco"/); assert.match(jsx, /className="benvenuto-corpo"/);
  assert.match(prima, /\.benvenuto-fianco,\s+\.benvenuto-corpo \{\s+display: contents;/, "sul telefono i contenitori devono essere invisibili");
  assert.match(prima, /\.benvenuto > \*,\s+\.benvenuto-fianco > \*,\s+\.benvenuto-corpo > \* \{\s+max-width: 560px;/, "i figli dei contenitori ereditano la colonna stretta");
  const fianco = jsx.indexOf('className="benvenuto-fianco"'), corpo = jsx.indexOf('className="benvenuto-corpo"'), esci = jsx.indexOf('className="benvenuto-esci"');
  assert.ok(fianco < corpo && corpo < esci, "ordine nel codice: fianco, corpo, «Esci» (l'ordine di lettura non cambia)");
});

test("computer: i pulsanti a tutta larghezza si limitano, ma non nei moduli a comparsa, in fila o nel benvenuto", () => {
  const l = livelli.find((x) => larghezza(x) === 1024).corpo;
  assert.match(l, /\.screen-inner \.opp-cta:not\(\.sheet \*\):not\(\.db-azioni \*\):not\(\.benvenuto \*\)/);
  assert.match(l, /width: min\(100%, 440px\);/);
});

test("computer: ogni classe usata dal blocco esiste (nel codice dell'app o nel foglio prima del blocco)", () => {
  const sorgenti = []; const vai = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) vai(p); else if (/\.tsx?$/.test(f.name)) sorgenti.push(fs.readFileSync(p, "utf8")); } };
  vai(path.join(radice, "src")); const codice = sorgenti.join("\n");
  const usate = new Set([...blocco.matchAll(/\.([a-z][\w-]*)/g)].map((m) => m[1]).filter((c) => !/^\d/.test(c)));
  const orfane = [...usate].filter((c) => !new RegExp(`(?<![\\w-])${c.replace(/[-]/g, "\\-")}(?![\\w-])`).test(codice) && !new RegExp(`\\.${c}(?![\\w-])`).test(prima));
  assert.deepEqual(orfane, [], "classi senza definizione né uso: " + orfane.join(", "));
});
