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
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });

  const modulo = { exports: {} };
  cache.set(assoluto, modulo);

  const richiedi = (spec) => {
    if (!spec.startsWith(".")) return require(spec);
    let p = path.resolve(path.dirname(assoluto), spec);
    if (fs.existsSync(p + ".ts")) p += ".ts";
    else if (fs.existsSync(path.join(p, "index.ts"))) p = path.join(p, "index.ts");
    return caricaTs(p);
  };

  new Function("require", "module", "exports", outputText)(
    richiedi,
    modulo,
    modulo.exports
  );
  return modulo.exports;
}
