/**
 * Test della pulizia del Profilo dell'inquilino (nome in alto, campanella delle novità) e dello spostamento di «Dichiara un
 * affitto» e «Invita il tuo proprietario» in «Gestione affitto». Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { caricaTs, radice } from "./carica-ts.mjs";

const richiedi = createRequire(import.meta.url);
const React = richiedi("react");
const { renderToStaticMarkup } = richiedi("react-dom/server");
const pe = caricaTs(path.join(radice, "src", "lib", "persona.ts"));
const nt = caricaTs(path.join(radice, "src", "lib", "notifiche.ts"));
const gs = caricaTs(path.join(radice, "src", "lib", "gestione.ts"));
const camp = caricaTs(path.join(radice, "src", "components", "CampanellaNovita.tsx"));
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const profiloClient = () => leggi("src", "app", "(app)", "profilo", "ProfiloClient.tsx");
const gestioneClient = () => leggi("src", "app", "(app)", "gestione", "GestioneClient.tsx");

// ============================================================ nome e iniziali
test("nome completo: nome e cognome insieme, uno solo se manca l'altro, vuoto se mancano entrambi; spazi ripuliti", () => {
  assert.equal(pe.nomeCompleto("Tina", "Rossi"), "Tina Rossi"); assert.equal(pe.nomeCompleto("Tina", null), "Tina"); assert.equal(pe.nomeCompleto(null, "Rossi"), "Rossi"); assert.equal(pe.nomeCompleto(null, null), "");
  assert.equal(pe.nomeCompleto("  Tina  ", " Rossi  Bianchi "), "Tina Rossi Bianchi"); for (const x of [undefined, 5, {}, [], "   ", ""]) assert.equal(pe.nomeCompleto(x, x), "", String(x));
});

test("iniziali: nome e cognome (TR); con una parte sola le sue prime due lettere (TI); senza niente «?»; sempre maiuscole e senza spezzare le lettere speciali", () => {
  assert.equal(pe.iniziali("Tina", "Rossi"), "TR"); assert.equal(pe.iniziali("tina", "rossi"), "TR"); assert.equal(pe.iniziali("Tina", null), "TI"); assert.equal(pe.iniziali(null, "Rossi"), "RO"); assert.equal(pe.iniziali("A", null), "A"); assert.equal(pe.iniziali(null, null), "?"); assert.equal(pe.iniziali("  ", "  "), "?");
  assert.equal(pe.iniziali("Émile", "Zola"), "ÉZ"); assert.equal(Array.from(pe.iniziali("𝒜nna", "Rossi")).length, 2, "una lettera fuori dal piano base non si spezza (si conta per lettere, non per unità)"); for (const x of [undefined, 5, {}, []]) assert.equal(pe.iniziali(x, x), "?");
  let seme = 3; const rnd = () => (seme = (seme * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const lettere = "abcdeèéòàùçñ ,.'-9";
  for (let i = 0; i < 500; i++) { const a = Array.from({ length: Math.floor(rnd() * 6) }, () => lettere[Math.floor(rnd() * lettere.length)]).join(""); const b = Array.from({ length: Math.floor(rnd() * 6) }, () => lettere[Math.floor(rnd() * lettere.length)]).join(""); const r = pe.iniziali(a, b); assert.ok(Array.from(r).length >= 1 && Array.from(r).length <= 2, `«${a}» «${b}» → «${r}»`); assert.equal(r, r.toUpperCase()); }
});

// ============================================================ la campanella
test("campanella: porta alle novità, ha un nome per chi usa un lettore di schermo, e mostra il numero solo se ce ne sono (99+ oltre 99)", () => {
  const html = (n) => renderToStaticMarkup(React.createElement(camp.CampanellaNovita, { nonLette: n }));
  const zero = html(0); assert.match(zero, /href="\/notifiche"/); assert.match(zero, /aria-label="Novità\. Nessuna novità da leggere\."/); assert.ok(!/campanella-numero/.test(zero) && !/con-novita/.test(zero), "con zero novità non c'è né numero né aspetto di avviso");
  const tre = html(3); assert.match(tre, /aria-label="Novità\. Hai 3 novità da leggere\."/); assert.match(tre, /class="campanella con-novita"/); assert.match(tre, /<span class="campanella-numero" aria-hidden="true">3<\/span>/);
  assert.match(html(1), /Hai 1 novità da leggere\./); assert.match(html(150), />99\+<\/span>/); for (const strano of [-4, NaN, undefined]) assert.ok(!/campanella-numero/.test(html(strano)), String(strano));
});

// ============================================================ il Profilo dell'inquilino
test("Profilo: in alto il nome (titolo della pagina), le iniziali nell'avatar, l'email sotto e la campanella nell'angolo; niente più «In cerca a Milano»", () => {
  const p = profiloClient(); const alto = p.slice(p.indexOf('<div className="avatar-row">'), p.indexOf("{/* I tuoi dati e la tua affidabilità"));
  assert.match(alto, /iniziali\(nome, cognome\)/); assert.match(alto, /<h1 className="avatar-name">\{nomeCompleto\(nome, cognome\) \|\| "Il tuo profilo"\}<\/h1>/); assert.match(alto, /\{email && <div className="avatar-sub">\{email\}<\/div>\}/); assert.match(alto, /<CampanellaNovita nonLette=\{nonLette\} \/>/);
  assert.ok(alto.indexOf("avatar-name") < alto.indexOf("CampanellaNovita"), "la campanella sta dopo il nome, nell'angolo"); assert.ok(!/In cerca a Milano/.test(p), "una frase falsa da quando c'è anche Bergamo"); assert.ok(!/\(nome \?\? "\?"\)\.slice/.test(p), "le iniziali sono ancora quelle vecchie");
});

test("Profilo: la riga «Novità» non c'è più per l'inquilino (resta quella del proprietario), né le righe e le schede di affitti e inviti", () => {
  const p = profiloClient(); assert.ok(!/RigaNovita/.test(p), "la riga Novità è ancora nel Profilo dell'inquilino"); assert.match(leggi("src", "app", "(app)", "profilo", "OwnerProfiloClient.tsx"), /<RigaNovita /, "la riga del proprietario non va toccata");
  for (const vietato of ["I tuoi affitti", "Invita il tuo proprietario", "InvitaProprietarioSheet", "affittiPanel", "inviti:", "inviti,", 'sheetAperta === "invito"', 'sheetAperta === "affitti"', "IconPersone", "IconDocumento"]) assert.ok(!p.includes(vietato), `nel Profilo resta «${vietato}»`);
  for (const resta of ["Preferiti", 'title="La tua ricerca"', 'title="Account e accesso"', 'title="Privacy e consensi"', 'title="FAQ e bonus affitto"', "<DatiSheet", "<RicercaSheet"]) assert.ok(p.includes(resta) || leggi("src", "components", "RigaPreferiti.tsx").includes("Preferiti"), `è sparito «${resta}»`);
});

test("pagina Profilo: non carica più gli inviti né gli affitti, e i vecchi collegamenti (?apri=affitti / ?apri=invito) portano in Gestione affitto", () => {
  const pg = leggi("src", "app", "(app)", "profilo", "page.tsx"); for (const vietato of ["inviti_proprietario", "caricaRapportiMiei", "RapportiPanel", "affittiPanel", "inviti="]) assert.ok(!pg.includes(vietato), `la pagina carica ancora «${vietato}»`);
  assert.match(pg, /const apri = \(await searchParams\)\.apri;\s+if \(apri === "affitti" \|\| apri === "invito"\) redirect\(`\/gestione\?apri=\$\{apri\}`\);/); assert.ok(pg.indexOf("OwnerProfiloClient") < pg.indexOf("redirect("), "il rimando vale solo per l'inquilino: il proprietario ha già il suo ritorno prima");
});

// ============================================================ Gestione affitto: le due righe
test("sezioni apribili di Gestione affitto: solo «affitti» e «invito»; ogni altro valore non apre niente", () => {
  assert.deepEqual([...gs.SEZIONI_GESTIONE_APRIBILI], ["affitti", "invito"]); assert.equal(gs.sezioneGestione("affitti"), "affitti"); assert.equal(gs.sezioneGestione("invito"), "invito"); assert.equal(gs.sezioneGestione(["invito", "affitti"]), "invito");
  for (const x of ["", "Affitti", "affitti ", "dati", "verifica", "__proto__", "constructor", "<x>", null, undefined, 5, {}, [], [""]]) assert.equal(gs.sezioneGestione(x), null, JSON.stringify(x));
});

test("Gestione affitto: le righe «Dichiara un affitto» e «Invita il tuo proprietario» ci sono, aprono le schede giuste e si aprono anche da un collegamento", () => {
  const g = gestioneClient(); assert.match(g, /title="Dichiara un affitto"[\s\S]*?onClick=\{\(\) => setAffittiAperto\(true\)\}/); assert.match(g, /title="Invita il tuo proprietario"[\s\S]*?onClick=\{\(\) => setInvitoAperto\(true\)\}/);
  assert.match(g, /<Sheet open=\{affittiAperto\} onClose=\{\(\) => setAffittiAperto\(false\)\} title="I tuoi affitti">\s+\{affittiPanel\}/); assert.match(g, /<InvitaProprietarioSheet open=\{invitoAperto\} onClose=\{\(\) => setInvitoAperto\(false\)\} nomeInquilino=\{nomeInquilino\} inviti=\{inviti\} \/>/);
  assert.match(g, /useState\(aperturaIniziale === "affitti"\)/); assert.match(g, /useState\(aperturaIniziale === "invito"\)/); assert.match(g, /cta=\{inviti\.some\(\(i\) => i\.stato === "inviato"\) \? "Gestisci gli inviti" : "Manda l'invito"\}/);
  const ordine = ["I tuoi contratti", "Affitti e recensioni", "Bollette e utenze"].map((t) => g.indexOf(t)); assert.ok(ordine.every((x, i) => x > 0 && (i === 0 || x > ordine[i - 1])), "ordine delle parti: contratti, affitti e recensioni, bollette");
});

test("pagina Gestione affitto: carica gli inviti, il nome e gli affitti (prima li caricava il Profilo) e li passa al client", () => {
  const pg = leggi("src", "app", "(app)", "gestione", "page.tsx"); assert.match(pg, /from\("inviti_proprietario"\)[\s\S]*?\.eq\("tenant_id", user!\.id\)/); assert.match(pg, /caricaRapportiMiei\(supabase, user!\.id\)/); assert.match(pg, /from\("profiles"\)\.select\("nome"\)\.eq\("id", user!\.id\)/);
  assert.match(pg, /aperturaIniziale=\{sezioneGestione\(\(await searchParams\)\.apri\)\}/); assert.match(pg, /<RapportiPanel\s+ruolo="inquilino"/); for (const prop of ["nomeInquilino=", "inviti=", "affittiPanel="]) assert.ok(pg.includes(prop), prop);
});

// ============================================================ le notifiche sugli affitti
test("notifiche: le quattro sugli affitti dell'inquilino portano a Gestione affitto (anche quelle già create); le altre e quelle del proprietario non cambiano", () => {
  for (const tipo of ["affitto_verificato", "affitto_respinto", "rapporto_confermato", "rapporto_rifiutato"]) assert.equal(nt.linkNotifica({ tipo, link: "/profilo" }), "/gestione?apri=affitti", tipo);
  for (const tipo of ["reddito_verificato", "reddito_respinto", "feedback_ricevuto", "candidatura_accettata", "qualcosa_di_nuovo"]) assert.equal(nt.linkNotifica({ tipo, link: "/profilo" }), "/profilo", `${tipo} deve restare nel Profilo`);
  for (const tipo of ["affitto_verificato", "affitto_respinto", "rapporto_confermato", "rapporto_rifiutato"]) assert.equal(nt.linkNotifica({ tipo, link: "/gestione-affitti" }), "/gestione-affitti", `${tipo} del proprietario non cambia`);
  assert.equal(nt.linkNotifica({ link: "/profilo" }), "/profilo", "senza il tipo non si sa: resta com'è"); assert.deepEqual([...nt.TIPI_NOTIFICA_AFFITTI_INQUILINO].sort(), ["affitto_respinto", "affitto_verificato", "rapporto_confermato", "rapporto_rifiutato"]);
});

test("notifiche: il link resta sempre dentro il sito, anche per i tipi spostati; la lista passa tutta la notifica (serve il tipo)", () => {
  for (const cattivo of ["//evil.example", "https://evil.example", "/\\evil", "javascript:alert(1)", "", null, undefined]) for (const tipo of ["affitto_verificato", "reddito_verificato"]) { const l = nt.linkNotifica({ tipo, link: cattivo }); assert.ok(l.startsWith("/") && !l.startsWith("//") && !l.includes("evil"), `${tipo} ${cattivo} → ${l}`); }
  assert.match(leggi("src", "app", "(app)", "notifiche", "NotificheLista.tsx"), /router\.push\(linkNotifica\(n\)\)/);
});

test("le notifiche degli affitti non si correggono nel database: il sistema le corregge in lettura (nessuna migrazione dalla 0031 in poi le tocca)", () => {
  const cartella = path.join(radice, "supabase", "migrations"); const nuove = fs.readdirSync(cartella).filter((f) => /^\d{4}_.*\.sql$/.test(f) && f > "0031").sort(); assert.ok(nuove.length >= 2, "dalla 0031 in poi ci sono almeno la 0032 e la 0033");
  for (const f of nuove) { const m = fs.readFileSync(path.join(cartella, f), "utf8"); assert.ok(!/crea_notifica\([^;]*'(affitto_|rapporto_)/.test(m), `${f} non deve creare notifiche degli affitti`); assert.ok(!/update\s+notifiche\b/i.test(m), `${f} non deve riscrivere i dati delle notifiche già salvate`); }
});

// ============================================================ le frasi che non sono più vere
test("nessuna frase dice più che il voto del proprietario «entra nel» o «fa parte del» punteggio (le recensioni stanno a parte), né che affitti e inviti stanno nel Profilo", () => {
  const cartella = path.join(radice, "src"); const trovate = [];
  const visita = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) visita(p); else if (/\.(ts|tsx)$/.test(e.name)) { const t = fs.readFileSync(p, "utf8").replace(/\s+/g, " "); for (const re of [/entra nel punteggio/, /conta sul tuo punteggio/, /alza il tuo punteggio/, /fa parte del punteggio/, /fa parte del\s*punteggio di affidabilità/, /da «?"?&?q?u?o?t?;?I tuoi affitti&?q?u?o?t?;?»?"?, nel tuo profilo/]) if (re.test(t)) trovate.push(`${path.relative(cartella, p)}: ${re}`); } } };
  visita(cartella); assert.deepEqual(trovate, [], "frasi ormai false: " + trovate.join(" | "));
});

test("frasi nuove: feedback, pagina del proprietario invitato e scheda degli inviti dicono che il voto sta tra le recensioni, accanto al punteggio; i contratti si dichiarano da «Dichiara un affitto»", () => {
  const f = leggi("src", "components", "FormFeedback.tsx").replace(/\s+/g, " "); assert.match(f, /Il voto, da 1 a 5 stelle, compare tra le recensioni di questa persona, accanto al suo punteggio di affidabilità/);
  const i = leggi("src", "app", "invito", "[token]", "InvitoClient.tsx").replace(/\s+/g, " "); assert.match(i, /da oggi compare tra le recensioni di \{inquilino\}/); assert.match(i, /compare tra le recensioni di \{inquilino\}, accanto al suo punteggio di affidabilità/);
  const s = leggi("src", "components", "InvitaProprietarioSheet.tsx").replace(/\s+/g, " "); assert.match(s, /compare tra le tue recensioni, accanto al tuo punteggio di affidabilità/); assert.match(s, /&quot;Dichiara un affitto&quot;, in Gestione affitto/); assert.ok(!/nel tuo profilo/.test(s));
  const g = gestioneClient().replace(/\s+/g, " "); assert.match(g, /il proprietario potrà lasciarti una recensione/); assert.match(g, /la recensione compare accanto al tuo punteggio di affidabilità/);
});
