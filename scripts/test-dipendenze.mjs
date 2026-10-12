/**
 * Test del controllo delle dipendenze (scripts/controlla-dipendenze.mjs). Si lancia con:   npm test
 *
 * Il primo test dice se QUESTO computer è allineato: se non lo è, fallisce con un messaggio che spiega
 * cosa manca e cosa fare, invece di lasciare che altri test crollino con «test failed».
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { controlla, ISTRUZIONI } from "./controlla-dipendenze.mjs";

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("le dipendenze installate corrispondono a package.json (se questo test fallisce: npm ci)", () => {
  const problemi = controlla(radice);
  assert.deepEqual(problemi, [], `\n  ${problemi.join("\n  ")}\n\n  ${ISTRUZIONI}\n`);
});

// ---- il controllo sa riconoscere i problemi: si prova su una cartella finta ----
function cartella(pkg, { lock = null, installati = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dip-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg));
  const l = lock ?? { packages: { "": { dependencies: pkg.dependencies ?? {}, devDependencies: pkg.devDependencies ?? {} } } };
  fs.writeFileSync(path.join(dir, "package-lock.json"), JSON.stringify(l));
  for (const [nome, versione] of Object.entries(installati)) {
    const d = path.join(dir, "node_modules", ...nome.split("/"));
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "package.json"), JSON.stringify({ name: nome, version: versione }));
  }
  return dir;
}
const pulisci = (dir) => fs.rmSync(dir, { recursive: true, force: true });

test("tutto allineato: nessun problema, anche con pacchetti con ambito", () => {
  const d = cartella({ dependencies: { "pdf-lib": "1.17.1", next: "16.3.8" }, devDependencies: { "@types/node": "^20", typescript: "5.9.3" } }, { installati: { "pdf-lib": "1.17.1", next: "16.3.8", "@types/node": "20.1.0", typescript: "5.9.3" } });
  try { assert.deepEqual(controlla(d), []); } finally { pulisci(d); }
});

test("un pacchetto che manca si dice per nome, con la versione richiesta", () => {
  const d = cartella({ dependencies: { "pdf-lib": "1.17.1", next: "16.3.8" } }, { installati: { next: "16.3.8" } });
  try { assert.deepEqual(controlla(d), ["manca pdf-lib (richiesta 1.17.1)"]); } finally { pulisci(d); }
});

test("una versione esatta diversa da quella installata si dice con entrambe (era il caso di un aggiornamento dimenticato)", () => {
  const d = cartella({ dependencies: { next: "16.3.8" } }, { installati: { next: "16.3.4" } });
  try { assert.deepEqual(controlla(d), ["next è alla versione 16.3.4, ma ne serve la 16.3.8"]); } finally { pulisci(d); }
});

test("un intervallo (^, ~) non si confronta: non si può sapere quale versione esatta si volesse", () => {
  const d = cartella({ dependencies: { react: "^19.0.0" } }, { installati: { react: "19.2.1" } });
  try { assert.deepEqual(controlla(d), []); } finally { pulisci(d); }
});

test("un pacchetto con ambito che manca si riconosce (@pdf-lib/standard-fonts)", () => {
  const d = cartella({ dependencies: { "@pdf-lib/standard-fonts": "1.0.0" } }, { installati: {} });
  try { assert.deepEqual(controlla(d), ["manca @pdf-lib/standard-fonts (richiesta 1.0.0)"]); } finally { pulisci(d); }
});

test("più problemi si dicono tutti insieme, non uno alla volta", () => {
  const d = cartella({ dependencies: { "pdf-lib": "1.17.1", next: "16.3.8" }, devDependencies: { jest: "29.0.0" } }, { installati: { next: "16.3.4" } });
  try { const p = controlla(d); assert.equal(p.length, 3, p.join(" | ")); } finally { pulisci(d); }
});

test("il lock non allineato a package.json si dice, e dice quale comando serve", () => {
  const d = cartella({ dependencies: { "pdf-lib": "1.17.1" } }, { lock: { packages: { "": { dependencies: {} } } }, installati: { "pdf-lib": "1.17.1" } });
  try { const p = controlla(d); assert.equal(p.length, 1); assert.match(p[0], /package-lock\.json non è allineato.*pdf-lib.*1\.17\.1 contro assente.*npm install/); } finally { pulisci(d); }
  const e = cartella({ dependencies: { next: "16.3.8" } }, { lock: { packages: { "": { dependencies: { next: "16.3.4" } } } }, installati: { next: "16.3.8" } });
  try { assert.match(controlla(e)[0], /next \(16\.3\.8 contro 16\.3\.4\)/); } finally { pulisci(e); }
});

test("senza package-lock o senza package.json lo dice, senza lanciare errori", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "dip-")); try { assert.deepEqual(controlla(d), ["manca package.json"]); fs.writeFileSync(path.join(d, "package.json"), "{}"); assert.deepEqual(controlla(d), ["manca package-lock.json"]); } finally { pulisci(d); }
});

test("le istruzioni dicono il comando, e avvertono del caso tipico di Windows (permessi)", () => { assert.match(ISTRUZIONI, /npm ci/); assert.match(ISTRUZIONI, /Windows/); });

test("npm test controlla le dipendenze PRIMA di eseguire i test (pretest), e questo file è il primo dell'elenco", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(radice, "package.json"), "utf8"));
  assert.equal(pkg.scripts.pretest, "node scripts/controlla-dipendenze.mjs");
  assert.match(pkg.scripts.test, /^node --test scripts\/test-dipendenze\.mjs /, "il test delle dipendenze deve essere il primo");
});

test("ogni libreria esterna importata da un test è dichiarata in package.json (altrimenti il test crolla su un computer che non l'ha)", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(radice, "package.json"), "utf8")); const dichiarate = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
  for (const f of fs.readdirSync(path.join(radice, "scripts")).filter((x) => /\.mjs$/.test(x))) {
    const c = fs.readFileSync(path.join(radice, "scripts", f), "utf8");
    for (const m of c.matchAll(/^import[^"'\n]*from\s+["']([^"'.][^"']*)["']/gm)) {
      if (m[1].startsWith("node:")) continue; const nome = m[1].startsWith("@") ? m[1].split("/").slice(0, 2).join("/") : m[1].split("/")[0];
      assert.ok(dichiarate.has(nome), `scripts/${f} importa «${nome}», che non è in package.json`);
    }
  }
});
