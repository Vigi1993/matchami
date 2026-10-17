/**
 * Test dell'INTERRUTTORE TEMPORANEO che salta la conferma dell'email all'iscrizione (solo per i test).
 * Ciò che conta: di partenza è SPENTO; spento, l'iscrizione è identica a prima; acceso, l'account nasce già confermato senza toccare la verifica normale;
 * non si può accendere per sbaglio; la chiave di servizio non finisce mai nel browser; lo si vede e non lo si dimentica. Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { caricaTs, radice } from "./carica-ts.mjs";

const ts = caricaTs(path.join(radice, "src", "lib", "test-iscrizione.ts"));
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const azioni = senzaCommenti(leggi("src", "app", "login", "actions.ts"));

test("l'interruttore è SPENTO di partenza e si accende solo con il valore ESATTO «1»", () => {
  assert.equal(ts.confermaEmailSaltata({}), false); assert.equal(ts.confermaEmailSaltata({ SALTA_CONFERMA_EMAIL: "1" }), true);
  for (const v of [undefined, "", "0", "true", "TRUE", "yes", "on", " 1", "1 ", "01", "11", "uno", "si"]) assert.equal(ts.confermaEmailSaltata({ SALTA_CONFERMA_EMAIL: v }), false, JSON.stringify(v));
  assert.equal(ts.confermaEmailSaltata({ ALTRA_VARIABILE: "1", NEXT_PUBLIC_SALTA_CONFERMA_EMAIL: "1" }), false, "solo il nome esatto, e mai una variabile pubblica");
  const spento = { ...process.env }; delete spento.SALTA_CONFERMA_EMAIL; assert.equal(ts.confermaEmailSaltata(spento), false);
});

test("le frasi di errore dell'iscrizione di prova sono in italiano, sensate e senza dettagli tecnici", () => {
  const m = ts.messaggioErroreIscrizioneProva;
  assert.equal(m("A user with this email address has already been registered"), "Questo indirizzo è già registrato: vai su «Accedi»."); assert.equal(m("Email address already exists"), "Questo indirizzo è già registrato: vai su «Accedi».");
  assert.match(m("Password should be at least 8 characters"), /password non è abbastanza forte/); assert.match(m("Unable to validate email address: invalid format"), /indirizzo email valido/);
  for (const x of [null, undefined, 5, {}, "", "boom: internal error at db:5432", "JWT expired"]) { assert.equal(m(x), "Non sono riuscito a creare l'account. Riprova.", JSON.stringify(x)); assert.ok(!/db|jwt|internal/i.test(m(x))); }
});

test("iscrizione SPENTA: identica a prima (privacy e password controllate, poi signUp con il link di ritorno e i dati, poi la pagina «controlla la tua email»)", () => {
  const f = azioni.slice(azioni.indexOf("export async function signup"), azioni.indexOf("async function iscrizioneSenzaConferma"));
  assert.match(f, /if \(!privacyAccettata\) \{\s+return \{ error: "Devi accettare la privacy per continuare\." \};\s+\}/); assert.match(f, /if \(password\.length < 8\) \{\s+return \{ error: "La password deve avere almeno 8 caratteri\." \};\s+\}/);
  assert.match(f, /const \{ error \} = await supabase\.auth\.signUp\(\{\s+email,\s+password,\s+options: \{[\s\S]*?emailRedirectTo: base[\s\S]*?data: \{\s+nome,\s+cognome,\s+ruolo,\s+privacy_accettata: true,\s+\},\s+\},\s+\}\);/); assert.match(f, /if \(error\) \{\s+return \{ error: error\.message \};\s+\}\s+redirect\("\/auth\/check-email"\);/);
});

test("l'interruttore scatta DOPO i controlli (privacy, password) e PRIMA di signUp: acceso, signUp non si chiama mai", () => {
  const f = azioni.slice(azioni.indexOf("export async function signup"), azioni.indexOf("async function iscrizioneSenzaConferma"));
  const iPrivacy = f.indexOf("Devi accettare la privacy"), iPass = f.indexOf("almeno 8 caratteri"), iFlag = f.indexOf("if (confermaEmailSaltata())"), iSignUp = f.indexOf("supabase.auth.signUp(");
  assert.ok(iPrivacy > 0 && iPrivacy < iPass && iPass < iFlag && iFlag < iSignUp, "ordine: privacy, password, interruttore, signUp");
  assert.match(f, /if \(confermaEmailSaltata\(\)\) \{\s+return iscrizioneSenzaConferma\(supabase, \{ email, password, nome, cognome, ruolo, next \}\);\s+\}/);
  const bypass = azioni.slice(azioni.indexOf("async function iscrizioneSenzaConferma"), azioni.indexOf("export async function login")); assert.ok(!/\.signUp\(/.test(bypass), "l'iscrizione di prova non passa dalla conferma");
});

test("iscrizione di PROVA: l'account si crea con la chiave di servizio, già confermato, con gli stessi dati di sempre; poi accesso e ritorno dove si stava andando; senza chiave dice perché", () => {
  const b = azioni.slice(azioni.indexOf("async function iscrizioneSenzaConferma"), azioni.indexOf("export async function login"));
  assert.match(b, /const admin = clienteAmministratore\(\);\s+if \(!admin\) \{\s+return \{ error: "L'iscrizione di prova richiede la chiave di servizio \(SUPABASE_SECRET_KEY\) su questo ambiente\." \};\s+\}/);
  assert.match(b, /admin\.auth\.admin\.createUser\(\{\s+email: dati\.email,\s+password: dati\.password,\s+email_confirm: true,\s+user_metadata: \{ nome: dati\.nome, cognome: dati\.cognome, ruolo: dati\.ruolo, privacy_accettata: true \},\s+\}\)/);
  assert.match(b, /if \(error\) \{\s+return \{ error: messaggioErroreIscrizioneProva\(error\.message\) \};\s+\}/); assert.match(b, /supabase\.auth\.signInWithPassword\(\{ email: dati\.email, password: dati\.password \}\)/); assert.match(b, /if \(erroreAccesso\) \{\s+return \{ error: "L'account è stato creato ma l'accesso non è riuscito: vai su «Accedi»\." \};\s+\}\s+redirect\(dati\.next\);/);
  assert.ok(b.indexOf("createUser(") < b.indexOf("signInWithPassword("), "prima l'account, poi l'accesso"); assert.match(b, /console\.warn\("ATTENZIONE: iscrizione SENZA conferma dell'email/, "ogni iscrizione di prova lascia una riga nel registro");
  assert.match(leggi("src", "app", "login", "actions.ts"), /^"use server";/, "è un file di azioni sul server"); const esportate = [...azioni.matchAll(/export (async function|const|function|let|type|class) (\w+)/g)].filter((m) => m[1] !== "type").map((m) => `${m[1]} ${m[2]}`); assert.ok(esportate.every((e) => e.startsWith("async function")), "un file «use server» può esportare solo funzioni asincrone: " + esportate.join()); assert.ok(!/export async function iscrizioneSenzaConferma/.test(azioni), "la funzione di prova non è richiamabile dal browser");
});

test("la chiave di servizio non arriva mai al browser: né la pagina di accesso né il file dell'interruttore la nominano; la variabile non è pubblica", () => {
  const pagina = leggi("src", "app", "login", "page.tsx"); assert.match(pagina, /^"use client";/); assert.ok(!/supabase\/admin|clienteAmministratore|SUPABASE_SECRET_KEY|test-iscrizione|SALTA_CONFERMA/.test(pagina), "la pagina di accesso (client) non deve conoscere né la chiave né l'interruttore");
  const lib = leggi("src", "lib", "test-iscrizione.ts"); assert.ok(!/supabase\/admin|clienteAmministratore|SECRET_KEY/.test(senzaCommenti(lib)), "il file dell'interruttore non importa la chiave"); assert.ok(!/NEXT_PUBLIC_SALTA/.test(lib.replace(/NON NEXT_PUBLIC/g, "")), "la variabile non può essere pubblica");
  const layout = leggi("src", "app", "login", "layout.tsx"); assert.ok(!/^"use client"/.test(layout), "il layout con l'avviso gira sul server");
});

test("si VEDE: finché è acceso la pagina di accesso lo dice in cima (a tutti), spento non si vede niente; l'avviso è leggibile", () => {
  const l = senzaCommenti(leggi("src", "app", "login", "layout.tsx")); assert.match(l, /\{confermaEmailSaltata\(\) && \(\s+<div className="avviso-prova" role="status">\s+\{AVVISO_CONFERMA_SALTATA\}\s+<\/div>\s+\)\}\s+\{children\}/);
  assert.match(ts.AVVISO_CONFERMA_SALTATA, /^Ambiente di prova: l'email NON viene verificata all'iscrizione\./); assert.match(ts.AVVISO_CONFERMA_SALTATA, /Da togliere prima di aprire l'app al pubblico\.$/);
  const css = leggi("src", "app", "globals.css"); const m = css.slice(css.indexOf(".avviso-prova {")); assert.match(m, /position: fixed;\s+top: 0;\s+left: 0;\s+right: 0;\s+z-index: 200;/); assert.match(m, /font-size: 15px;/); assert.match(m, /background: var\(--gold\);\s+color: var\(--ink\);/);
});

test("l'avviso si legge ad OGNI apertura della pagina (non una volta sola alla costruzione dell'app): altrimenti accendere l'interruttore dopo non lo farebbe comparire", () => {
  const l = leggi("src", "app", "login", "layout.tsx"); assert.match(l, /export const dynamic = "force-dynamic";/); assert.ok(l.indexOf('export const dynamic = "force-dynamic";') < l.indexOf("export default function LoginLayout"), "la regola sta prima del componente");
  assert.match(l, /preparata una volta sola quando si costruisce l'app/, "dice perché");
});

test("NON SI ACCENDE PER SBAGLIO: nessun file del progetto (configurazione, script, deploy) imposta SALTA_CONFERMA_EMAIL; compare solo nel codice che lo usa (azione e avviso), nella sua logica e nei suoi test", () => {
  let tracciati; try { tracciati = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: radice, encoding: "utf8" }).split("\n").filter(Boolean); } catch { tracciati = null; }
  if (!tracciati) return; // fuori da una copia git (nessun controllo possibile)
  const conLaStringa = tracciati.filter((f) => !/node_modules|\.next\//.test(f) && /\.(ts|tsx|mjs|js|json|ya?ml|md|env|toml|sh|txt)$/.test(f) || /(^|\/)\.env/.test(f)).filter((f) => { try { return fs.readFileSync(path.join(radice, f), "utf8").includes("SALTA_CONFERMA_EMAIL"); } catch { return false; } }).sort();
  assert.deepEqual(conLaStringa, ["scripts/test-iscrizione-prova.mjs", "src/app/login/actions.ts", "src/app/login/layout.tsx", "src/lib/test-iscrizione.ts"], "file che nominano l'interruttore: " + conLaStringa.join(", "));
  for (const f of tracciati.filter((f) => /(^|\/)\.env/.test(f) || /^(vercel\.json|netlify\.toml|\.github\/)/.test(f))) assert.ok(!/SALTA_CONFERMA_EMAIL\s*=\s*"?1/.test(fs.readFileSync(path.join(radice, f), "utf8")), `${f} accende l'interruttore`);
  const pkg = leggi("package.json"); assert.ok(!/SALTA_CONFERMA_EMAIL/.test(pkg), "nessuno script lo imposta");
  const doc = leggi("src", "lib", "test-iscrizione.ts"); for (const x of ["TEMPORANEO, SOLO PER FACILITARE I TEST", "COME SI ACCENDE", "COME SI SPEGNE", "NON va MAI lasciata accesa"]) assert.ok(doc.includes(x), `manca nel commento: ${x}`);
});
