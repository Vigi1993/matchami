/**
 * Le dipendenze installate corrispondono a package.json?
 *
 * Dopo aver applicato una patch che aggiunge o aggiorna una libreria bisogna eseguire
 * `npm ci`. Se ci si dimentica, i test che usano quella libreria falliscono con un
 * messaggio incomprensibile («test failed», senza dire perché). Questo controllo gira
 * PRIMA dei test (`pretest`) e dice in chiaro cosa manca e cosa fare.
 *
 * Si può eseguire da solo:   node scripts/controlla-dipendenze.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Una versione esatta (senza ^, ~, intervalli): solo quelle si possono confrontare con certezza. */
const ESATTA = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

export const ISTRUZIONI = "Esegui:  npm ci   e poi rilancia i test. (Se npm dà un errore di permessi su Windows, chiudi prima il server di sviluppo e l'editor.)";

/** I problemi trovati, in italiano. L'elenco vuoto vuol dire che è tutto allineato. */
export function controlla(dir = radice) {
  const problemi = [];
  const file = (...p) => path.join(dir, ...p);

  if (!fs.existsSync(file("package.json"))) return ["manca package.json"];
  const pkg = JSON.parse(fs.readFileSync(file("package.json"), "utf8"));
  const richieste = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

  for (const [nome, richiesta] of Object.entries(richieste)) {
    // un pacchetto con ambito (@pdf-lib/xxx) sta in node_modules/@pdf-lib/xxx
    const manifesto = file("node_modules", ...nome.split("/"), "package.json");
    if (!fs.existsSync(manifesto)) {
      problemi.push(`manca ${nome} (richiesta ${richiesta})`);
      continue;
    }
    const installata = JSON.parse(fs.readFileSync(manifesto, "utf8")).version;
    if (ESATTA.test(richiesta) && installata !== richiesta) {
      problemi.push(`${nome} è alla versione ${installata}, ma ne serve la ${richiesta}`);
    }
  }

  // il lock deve dire le stesse cose di package.json, altrimenti `npm ci` si rifiuta di installare
  if (!fs.existsSync(file("package-lock.json"))) {
    problemi.push("manca package-lock.json");
  } else {
    const radiceLock = JSON.parse(fs.readFileSync(file("package-lock.json"), "utf8")).packages?.[""] ?? {};
    for (const gruppo of ["dependencies", "devDependencies"]) {
      const a = pkg[gruppo] ?? {};
      const b = radiceLock[gruppo] ?? {};
      for (const nome of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (a[nome] !== b[nome]) {
          problemi.push(`package-lock.json non è allineato a package.json per ${nome} (${a[nome] ?? "assente"} contro ${b[nome] ?? "assente"}): serve npm install`);
        }
      }
    }
  }

  return problemi;
}

// eseguito da solo (come `pretest`)
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const problemi = controlla();
  if (problemi.length > 0) {
    console.error("\n✖ Le dipendenze installate non corrispondono a package.json:");
    for (const p of problemi) console.error("   - " + p);
    console.error("\n" + ISTRUZIONI + "\n");
    process.exit(1);
  }
  console.log("Dipendenze allineate a package.json.");
}
