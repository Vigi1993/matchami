/**
 * Test dei ritocchi alla Home e al Profilo dell'inquilino: gli avvisi che spariscono da soli (bug: «Scarto annullato» restava
 * per sempre), il contatore «1 / 2» tolto, e la barra di completezza del profilo sotto il nome. Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const sc = caricaTs(path.join(radice, "src", "lib", "scelte.ts"));
const af = caricaTs(path.join(radice, "src", "lib", "affidabilita.ts"));
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const home = () => leggi("src", "app", "(app)", "HomeClient.tsx");
const profilo = () => leggi("src", "app", "(app)", "profilo", "ProfiloClient.tsx");
const css = () => leggi("src", "app", "globals.css");

// ============================================================ gli avvisi della Home
test("durata degli avvisi: sono tutti temporanei, e un errore resta più a lungo (va letto)", () => {
  assert.equal(sc.DURATA_AVVISO_MS, 4000); assert.equal(sc.DURATA_AVVISO_ERRORE_MS, 7000); assert.equal(sc.durataAvviso(false), 4000); assert.equal(sc.durataAvviso(true), 7000);
  assert.ok(sc.durataAvviso(true) > sc.durataAvviso(false)); for (const ms of [sc.durataAvviso(false), sc.durataAvviso(true)]) assert.ok(Number.isFinite(ms) && ms >= 2500 && ms <= 10000, `${ms} ms: troppo breve per leggerlo o troppo lungo per sparire`);
});

test("Home: ogni avviso sparisce da solo (timer che riparte a ogni avviso nuovo e si ferma se la Home cambia), con la durata giusta per tipo", () => {
  const h = home(); assert.match(h, /useEffect\(\(\) => \{\s+if \(!avviso\) return;\s+const t = setTimeout\(\(\) => setAvviso\(null\), durataAvviso\(avviso\.errore\)\);\s+return \(\) => clearTimeout\(t\);\s+\}, \[avviso\]\);/);
  assert.match(h, /import \{ useEffect, useRef, useState, useTransition \} from "react";/);
});

test("Home: «Scarto annullato» è un avviso come gli altri (e quindi sparisce); lo scarto e l'annullamento non toccano altro", () => {
  const h = home(); assert.match(h, /setAvviso\(\{ errore: false, testo: annullata\.tipo === "preferito" \? TESTO_PREFERITO_TOLTO : TESTO_SCARTO_ANNULLATO \}\);/);
  assert.equal(sc.TESTO_SCARTO_ANNULLATO, "Scarto annullato."); assert.equal(sc.TESTO_PREFERITO_TOLTO, "Tolto dai preferiti."); assert.match(h, /\{avviso && \(\s+<div className=\{`toast-inline \$\{avviso\.errore \? "is-no" : ""\}`\} role=\{avviso\.errore \? "alert" : "status"\}>/);
});

test("Home: «Candidatura inviata» è un avviso normale (compare e sparisce); non resta più per tutta la sessione, e non c'è più lo stato che lo teneva", () => {
  const h = home(); assert.ok(!/candidatureInviate|setCandidatureInviate/.test(h), "resta lo stato che teneva il toast per sempre"); assert.ok(!/\{!avviso && /.test(h), "resta un toast che compare quando NON c'è un avviso (cioè sempre)");
  assert.match(h, /setAvviso\(res\?\.error \? null : \{ errore: false, testo: TESTO_CANDIDATURA_INVIATA \}\);/, "se la candidatura non parte non si dice niente, come prima"); assert.match(sc.TESTO_CANDIDATURA_INVIATA, /I tuoi match/);
});

test("Home: tutti gli avvisi impostati sono temporanei per costruzione (passano da setAvviso, mai da un'altra parte dello stato)", () => {
  const h = home(); const usi = [...h.matchAll(/setAvviso\(/g)].length; assert.ok(usi >= 7, "gli avvisi dell'app sono almeno sette: " + usi); assert.equal([...h.matchAll(/useState<\{ errore: boolean; testo: string \} \| null>\(null\)/g)].length, 1, "un solo posto dove vive l'avviso");
  assert.ok(!/toast-inline/.test(h.replace(/\{avviso && \([\s\S]*?\)\}/, "")), "c'è un altro toast fuori dall'avviso, senza timer");
});

// ============================================================ il contatore «1 / 2»
test("Home: il contatore «1 / 2» in alto a destra non c'è più; la posizione nel mazzo resta solo come testo per i lettori di schermo", () => {
  const h = home(); assert.ok(!/className="counter"/.test(h), "il contatore c'è ancora"); assert.ok(!/\{index \+ 1\} \/ \{mazzo\.length\}/.test(h), "resta il numero «1 / 2»");
  assert.match(h, /\{mazzo\.length > 0 && !finito && \(\s+<p className="solo-lettori" role="status">\s+Casa \{index \+ 1\} di \{mazzo\.length\}\s+<\/p>\s+\)\}/); assert.match(h, /<div className="topbar">\s+<div className="brand">\s+Match<b>AmI<\/b>\s+<\/div>\s+<\/div>/, "in alto resta solo il marchio");
  const c = css(); assert.ok(!/\.counter\b/.test(c), "resta lo stile del contatore"); assert.match(c, /\.solo-lettori \{\s+position: absolute;\s+width: 1px;\s+height: 1px;[\s\S]*?clip: rect\(0, 0, 0, 0\);/, "il testo per i lettori di schermo deve essere davvero nascosto");
});

// ============================================================ la barra di completezza
test("completezza del profilo: da 0 a 100 per TUTTE le 512 combinazioni, e riempire un campo non la fa mai scendere", () => {
  const nomi = ["hasZone", "professione", "reddito_mensile", "reddito_nucleo", "garante", "animali", "presentazione", "nucleo", "fideiussione"];
  const da = (m) => ({ hasZone: !!(m & 1), professione: m & 2 ? "Designer" : null, reddito_mensile: m & 4 ? 2600 : null, reddito_nucleo: m & 8 ? 1200 : null, garante: m & 16 ? false : null, animali: m & 32 ? false : null, presentazione: m & 64 ? "Ciao, cerco casa a Milano." : "", nucleo: m & 128 ? "single" : null, fideiussione: m & 256 ? false : null });
  let n = 0; for (let m = 0; m < 512; m++) { n++; const v = af.computeProfileCompleteness(da(m)); const pieni = nomi.filter((_, i) => m & (1 << i)).length; assert.ok(Number.isInteger(v) && v >= 0 && v <= 100, `${m}: ${v}`); assert.equal(v, Math.round((pieni / 9) * 100), `maschera ${m}`);
    for (let i = 0; i < 9; i++) if (!(m & (1 << i))) assert.ok(af.computeProfileCompleteness(da(m | (1 << i))) >= v, `riempire il campo ${nomi[i]} fa scendere la completezza`); }
  assert.equal(n, 512); assert.equal(af.computeProfileCompleteness(da(0)), 0); assert.equal(af.computeProfileCompleteness(da(511)), 100);
});

test("completezza: una presentazione di 10 lettere o meno non conta, e solo uno spazio non è un campo compilato", () => {
  const base = { hasZone: false, professione: null, reddito_mensile: null, garante: null, animali: null, nucleo: null, fideiussione: null };
  assert.equal(af.computeProfileCompleteness({ ...base, presentazione: "0123456789" }), 0); assert.equal(af.computeProfileCompleteness({ ...base, presentazione: "           x" }), 0, "gli spazi non fanno testo"); assert.equal(af.computeProfileCompleteness({ ...base, presentazione: "01234567890" }), 11); assert.equal(af.computeProfileCompleteness({ ...base, presentazione: null }), 0); assert.equal(af.computeProfileCompleteness({ ...base, professione: "   " }), 11, "una professione di soli spazi conta come scritta: si vede in cima al Profilo, non è un errore di questo ritocco");
});

test("Profilo: la barra sta sotto il nome (nell'intestazione, dopo l'email), con «Profilo completo al N%» e gli attributi della barra di avanzamento; la riga di prima non c'è più", () => {
  const p = profilo(); const alto = p.slice(p.indexOf('<div className="avatar-row">'), p.indexOf("{/* I tuoi dati e la tua affidabilità"));
  assert.match(alto, /<div\s+className="completezza"\s+role="progressbar"\s+aria-label="Completezza del profilo"\s+aria-valuemin=\{0\}\s+aria-valuemax=\{100\}\s+aria-valuenow=\{completezza\}\s+aria-valuetext=\{`Profilo completo al \$\{completezza\}%`\}/);
  assert.match(alto, /<span className="completezza-testo">Profilo completo al \{completezza\}%<\/span>/); assert.match(alto, /<div className="completeness-fill" style=\{\{ width: `\$\{completezza\}%` \}\} \/>/);
  const ordine = ["avatar-name", "avatar-sub", "completezza", "CampanellaNovita"].map((x) => alto.indexOf(x)); assert.ok(ordine.every((x, i) => x > 0 && (i === 0 || x > ordine[i - 1])), "ordine: nome, email, barra, campanella: " + ordine.join(","));
  const inizioColonna = alto.indexOf('<div className="avatar-testo">'); const colonna = alto.slice(inizioColonna, alto.indexOf("\n        </div>\n", inizioColonna));
  assert.ok(colonna.includes('className="completezza"') && colonna.includes('className="avatar-name"') && colonna.includes('className="avatar-sub"'), "nome, email e barra devono stare nella stessa colonna: la barra non può stare accanto"); assert.ok(!colonna.includes("CampanellaNovita"), "la campanella sta fuori dalla colonna, nell'angolo"); assert.ok(!/completeness-row|% completo<\/span>/.test(p), "resta la vecchia riga");
  const c = css(); assert.ok(!/completeness-row/.test(c), "resta lo stile della vecchia riga"); assert.match(c, /\.completezza \.completeness-bar \{\s+width: 100%;/); assert.match(c, /\.completeness-bar \{\s+flex: 1;\s+height: 6px;/);
});

test("Profilo: la completezza si calcola ancora con gli stessi dati di prima (solo la posizione è cambiata)", () => {
  const p = profilo(); assert.match(p, /const completezza = computeProfileCompleteness\(\{\s+hasZone: \(ricerca\.luoghi\?\.length \?\? 0\) > 0 \|\| ricerca\.zone\.length > 0,\s+professione: tenant\.professione,/);
});
