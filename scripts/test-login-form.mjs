/**
 * Test del modulo di iscrizione: la riga della privacy e la scritta sotto il pulsante.
 *  - la riga della privacy è un contenitore flessibile: il testo, il collegamento e il resto erano pezzi SEPARATI dentro di esso, e ognuno si disponeva come una colonna
 *    a sé (le righe cominciavano a tre distanze diverse); ora c'è il quadratino e UN solo blocco di testo;
 *  - sotto «Crea il tuo account» non c'è più «Dopo la registrazione ti chiederemo se cerchi casa o hai un immobile…» (il ruolo si sceglie già nel modulo).
 * Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { radice } from "./carica-ts.mjs";

const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const pagina = leggi("src", "app", "login", "page.tsx"); const css = leggi("src", "app", "globals.css");
const etichetta = pagina.slice(pagina.indexOf('<label className="login-consent mt-1">'), pagina.indexOf("</label>", pagina.indexOf('<label className="login-consent mt-1">')) + "</label>".length);

test("la riga della privacy ha DUE soli pezzi dentro l'etichetta: il quadratino e un blocco di testo (niente testo o collegamenti sciolti nel contenitore flessibile)", () => {
  assert.ok(etichetta.length > 100, "etichetta non trovata");
  // tolto il blocco di testo e i commenti, nell'etichetta resta solo il quadratino
  const resto = etichetta.replace(/<span className="login-consent-testo">[\s\S]*<\/span>/, "<SPAN/>").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const interno = resto.replace(/^<label[^>]*>/, "").replace(/<\/label>$/, "").replace(/\s+/g, " ").trim();
  assert.equal(interno, '<input type="checkbox" name="privacy" className="login-consent-box" /> <SPAN/>', "dentro l'etichetta deve esserci solo il quadratino e il blocco di testo: " + interno);
  assert.equal([...etichetta.matchAll(/<span/g)].length, 1, "un solo blocco di testo");
});

test("il blocco di testo ha le parole e il collegamento di prima: «Ho letto l'informativa sulla privacy (provvisoria) e accetto il trattamento dei dati necessario al funzionamento di MatchAmI.»", () => {
  // gli a capo e gli spazi del codice non contano (in JSX si ripuliscono): si confrontano i tag, gli attributi e le parole senza spazi...
  const blocco = etichetta.slice(etichetta.indexOf("<span"), etichetta.indexOf("</span>") + 7); const senzaSpazi = (x) => x.replace(/\s+/g, "");
  assert.equal(senzaSpazi(blocco), senzaSpazi('<span className="login-consent-testo">Ho letto l&apos;<a href="/informativa" target="_blank" rel="noopener noreferrer" className="underline">informativa sulla privacy{INFORMATIVA.provvisoria ? " (provvisoria)" : ""}</a>{" "}e accetto il trattamento dei dati necessario al funzionamento di MatchAmI.</span>'));
  // ...e le frasi intere, con gli spazi, come le legge la persona
  for (const frase of ["Ho letto l&apos;", "informativa sulla privacy", "e accetto il trattamento dei dati necessario al funzionamento di", "MatchAmI."]) assert.ok(blocco.includes(frase), `manca la frase: ${frase}`);
  assert.match(etichetta, /<input type="checkbox" name="privacy" className="login-consent-box" \/>/, "il campo si chiama ancora «privacy»: l'iscrizione lo legge così");
  assert.match(leggi("src", "app", "login", "actions.ts"), /formData\.get\("privacy"\) === "on"/);
});

test("stile: il quadratino non si restringe (18 px) e il blocco di testo occupa il resto e può andare a capo (flex 1, min-width 0); il contenitore resta quello di prima", () => {
  assert.match(css, /\.login-consent-box \{\s+flex: none;\s+width: 18px;\s+height: 18px;\s+margin: 1px 0 0;\s+\}/);
  assert.match(css, /\.login-consent-testo \{\s+flex: 1;\s+min-width: 0;\s+\}/);
  assert.match(css, /\.login-consent \{\s+display: flex;\s+align-items: flex-start;\s+gap: 8px;/, "il contenitore flessibile non è cambiato");
});

test("sotto «Crea il tuo account» NON c'è più «Dopo la registrazione ti chiederemo…»: né in nessuna scheda della pagina di accesso", () => {
  assert.ok(!/Dopo la registrazione|ti chiederemo se cerchi casa|da mettere in affitto/.test(pagina), "la scritta c'è ancora");
  assert.match(pagina, /\{signupPending \? "Creazione account\.\.\." : "Crea il tuo account"\}\s+<\/button>\s+<\/form>/, "il pulsante chiude il modulo");
  assert.match(pagina, /<\/form>\s+\)\}\s+<\/div>\s+<\/main>/, "dopo i moduli non c'è nessun paragrafo: la pagina finisce lì");
  // lo stile «login-fine» resta: lo usano altre pagine (accettazione dell'informativa, risposta a un rapporto) e il recupero della password
  assert.ok(leggi("src", "app", "informativa", "accetta", "AccettaForm.tsx").includes("login-fine")); assert.match(css, /\.login-fine \{/);
});

test("la nota di visibilità per chi cerca casa resta sotto la riga della privacy (è un'altra cosa: non è la scritta tolta)", () => {
  assert.match(pagina, /\{ruolo === "inquilino" && \(\s+<p className="login-consent" style=\{\{ margin: "0 0 2px 0" \}\}>\s+Il tuo profilo sarà visibile ai proprietari con una casa adatta alla tua ricerca/);
  assert.ok(pagina.indexOf("</label>") < pagina.indexOf('Il tuo profilo sarà visibile'), "la nota sta dopo la riga della privacy");
});

// ============================================================ la conferma della password
const azioniLogin = leggi("src", "app", "login", "actions.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const fSignup = azioniLogin.slice(azioniLogin.indexOf("export async function signup"), azioniLogin.indexOf("async function iscrizioneSenzaConferma"));

test("iscrizione: si chiede di RIPETERE la password (campo «password_conferma», obbligatorio, subito sotto la password), così chi la scrive male non resta fuori dal suo account", () => {
  assert.match(pagina, /name="password"\s+type="password"\s+placeholder="Password \(min\. 8 caratteri\)"\s+autoComplete="new-password"\s+required\s+\/>\s+<Input\s+name="password_conferma"\s+type="password"\s+placeholder="Ripeti la password"\s+autoComplete="new-password"\s+required\s+\/>/);
  assert.ok(pagina.indexOf('name="password_conferma"') < pagina.indexOf('name="privacy"'), "la conferma sta prima della casella della privacy");
  assert.equal([...pagina.matchAll(/name="password_conferma"/g)].length, 1, "solo nel modulo di iscrizione (non nell'accesso)");
});

test("iscrizione: la differenza tra le due password si controlla SUL SERVER, dopo la lunghezza e PRIMA di creare l'account (anche con l'interruttore di prova)", () => {
  assert.match(fSignup, /const passwordConferma = String\(formData\.get\("password_conferma"\) \|\| ""\);/);
  assert.match(fSignup, /if \(password\.length < 8\) \{\s+return \{ error: "La password deve avere almeno 8 caratteri\." \};\s+\}\s+if \(password !== passwordConferma\) \{\s+return \{ error: "Le due password non coincidono: riscrivile\." \};\s+\}/);
  const iConferma = fSignup.indexOf("password !== passwordConferma"), iFlag = fSignup.indexOf("if (confermaEmailSaltata())"), iSignUp = fSignup.indexOf("supabase.auth.signUp(");
  assert.ok(iConferma > 0 && iConferma < iFlag && iFlag < iSignUp, "ordine: confronto, interruttore di prova, signUp"); assert.ok(!/passwordConferma/.test(azioniLogin.slice(azioniLogin.indexOf("export async function login"))), "l'accesso non c'entra");
  assert.ok(!/passwordConferma/.test(azioniLogin.slice(azioniLogin.indexOf("async function iscrizioneSenzaConferma"), azioniLogin.indexOf("export async function login"))), "la password di conferma non viaggia oltre il controllo");
});
