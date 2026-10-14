/**
 * Piccolo caricatore per i test: traduce al volo i file .ts del progetto
 * (con il compilatore TypeScript già presente) e risolve gli import
 * relativi. Evita di aggiungere un framework di test come dipendenza.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

export const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const cache = new Map();

export function caricaTs(file) {
  const assoluto = path.resolve(file);
  if (cache.has(assoluto)) return cache.get(assoluto).exports;

  const sorgente = fs.readFileSync(assoluto, "utf8");
  const { outputText } = ts.transpileModule(sorgente, {
    fileName: assoluto,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      // i componenti (.tsx) si disegnano con il runtime di React
      jsx: ts.JsxEmit.ReactJSX,
    },
  });

  const modulo = { exports: {} };
  cache.set(assoluto, modulo);

  const richiedi = (spec) => {
    // l'alias @/ è la cartella src (come nel progetto)
    const interno = spec.startsWith(".") || spec.startsWith("@/");
    if (!interno) return require(spec);
    let p = spec.startsWith("@/") ? path.join(radice, "src", spec.slice(2)) : path.resolve(path.dirname(assoluto), spec);
    for (const estensione of [".ts", ".tsx"]) {
      if (fs.existsSync(p + estensione)) return caricaTs(p + estensione);
    }
    for (const indice of ["index.ts", "index.tsx"]) {
      if (fs.existsSync(path.join(p, indice))) return caricaTs(path.join(p, indice));
    }
    return caricaTs(p);
  };

  new Function("require", "module", "exports", outputText)(
    richiedi,
    modulo,
    modulo.exports
  );
  return modulo.exports;
}
