/**
 * Test delle SPIEGAZIONI che l'utente può rileggere dopo l'iscrizione: la pagina «Come funziona» (dal Profilo) e le domande frequenti, per ruolo.
 * Nati da un difetto vero: la FAQ diceva che l'affidabilità «combina le recensioni» con le verifiche, mentre le recensioni sono separate dal
 * punteggio. Le regole: i NUMERI vengono dalle stesse costanti del calcolo (mai scritti a mano), le spiegazioni sono per ruolo, e la pagina si apre dal Profilo.
 * Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { caricaTs, radice } from "./carica-ts.mjs";

const richiedi = createRequire(import.meta.url); const React = richiedi("react"); const { renderToStaticMarkup } = richiedi("react-dom/server");
const g = caricaTs(path.join(radice, "src", "lib", "guida-testi.ts")); const cfg = caricaTs(path.join(radice, "src", "lib", "match", "config.ts")); const aff = caricaTs(path.join(radice, "src", "lib", "affidabilita.ts")); const rec = caricaTs(path.join(radice, "src", "lib", "recensioni.ts"));
const leggi = (...p) => fs.readFileSync(path.join(radice, ...p), "utf8").replace(/\r\n/g, "\n");
const tutto = (ruolo) => g.testiGuida(ruolo).blocchi.flatMap((b) => [b.titolo, ...b.paragrafi, ...(b.pesi ?? []).flatMap((p) => [p.etichetta, p.valore])]).join(" ");
const faq = (ruolo) => g.domandeFrequenti(ruolo).map((d) => `${d.q} ${d.a}`).join(" ");
const id = (ruolo) => g.testiGuida(ruolo).blocchi.map((b) => b.id);

test("guida: i blocchi sono quelli giusti per ruolo, nell'ordine (l'inquilino non legge dei possibili match, il proprietario sì)", () => {
  assert.deepEqual(id("inquilino"), ["cosa", "match", "affidabilita", "recensioni", "documenti"]); assert.deepEqual(id("proprietario"), ["cosa", "match", "possibili", "affidabilita", "recensioni", "ordinamento", "documenti"]);
  for (const r of ["inquilino", "proprietario"]) for (const b of g.testiGuida(r).blocchi) { assert.ok(b.titolo.length > 5 && b.paragrafi.length >= 1 && b.paragrafi.every((p) => p.length > 20), `${r}/${b.id}`); }
  assert.ok(g.testiGuida("inquilino").blocchi.find((b) => b.id === "match").pesi.length === 5, "i cinque pesi del match dell'inquilino"); assert.ok(!g.testiGuida("proprietario").blocchi.find((b) => b.id === "match").pesi, "il proprietario non ha pesi: ha criteri scelti da lui");
});

test("guida: nessuna frase del percorso di iscrizione («alla fine di questi passaggi», «schede») nella versione che si rilegge", () => {
  for (const r of ["inquilino", "proprietario"]) { const t = tutto(r); for (const vietata of ["alla fine di questi passaggi", "durante questi passaggi", "Cosa facciamo adesso", " schede, pochi minuti"]) assert.ok(!t.includes(vietata), `${r}: «${vietata}»`); }
});

test("guida inquilino: i pesi, la tolleranza sul budget, i massimi e le etichette sono quelli del calcolo vero", () => {
  const t = tutto("inquilino"); const p = cfg.PESI_INQUILINO; const s = cfg.PESI_INQUILINO_SENZA_CARATTERISTICHE;
  for (const [k, e] of [["budget", "Budget"], ["zona", "Zona"], ["locali", "Locali"], ["mq", "Metri quadri"], ["caratteristiche", "Caratteristiche"]]) assert.ok(t.includes(`${e} ${p[k]} punti`), `peso di ${e}: ${p[k]}`);
  assert.ok(t.includes(`valgono ${s.budget}, ${s.zona}, ${s.locali} e ${s.mq}`), "i pesi senza caratteristiche"); assert.ok(t.includes(`per un totale di ${Object.values(p).reduce((a, b) => a + b, 0)} punti`));
  assert.ok(t.includes(`fino al ${Math.round(cfg.TOLLERANZA_BUDGET * 100)}% più del tuo budget`) && t.includes(`di oltre il ${Math.round(cfg.TOLLERANZA_BUDGET * 100)}%`), "la tolleranza sul budget"); assert.ok(t.includes(`Il massimo è ${cfg.PUNTEGGIO_MAX}`));
  for (const e of cfg.SOGLIE_ETICHETTE) assert.ok(t.includes(`da ${e.da} «${e.etichetta}»`), e.etichetta); assert.ok(t.includes(`«${cfg.ETICHETTA_MINIMA}»`));
  assert.ok(t.includes(`pesi`) || t.includes(`un peso da ${cfg.PESO_MIN} a ${cfg.PESO_MAX}`), "il peso delle caratteristiche preferite"); assert.ok(t.includes(`prendi il ${Math.round(cfg.PUNTI_DATO_MANCANTE * 100)}% dei punti`), "dato mancante dell'annuncio");
  for (const x of ["in linea con la tua ricerca", "oltre la tua ricerca", "esclusa", "necessarie", "preferite"]) assert.ok(t.includes(x), `manca «${x}»`);
});

test("guida proprietario: i criteri, le soglie, i pesi e i limiti sono quelli del calcolo vero; il bloccato, il «non indicato» e l'assenza di criteri sulla famiglia sono detti", () => {
  const t = tutto("proprietario"); const { min, max, predefinita } = cfg.SOGLIA_REDDITO_CANONE;
  for (const x of ["reddito rispetto al canone", "garante o fideiussione", "profilo verificato", "profilo completo", "nessun protesto"]) assert.ok(t.includes(x), `criterio «${x}»`);
  assert.ok(t.includes(`dal ${min}% al ${max}% del reddito del nucleo, di partenza ${predefinita}%`), "soglia del reddito"); assert.ok(t.includes(`da ${cfg.SOGLIA_PROFILO_COMPLETO}% dei campi`), "profilo completo"); assert.ok(t.includes(`un peso da ${cfg.PESO_MIN} a ${cfg.PESO_MAX} (di partenza ${cfg.PESO_PREDEFINITO})`), "pesi");
  for (const x of ["bloccata", "«non indicato»", "Senza nessun criterio non c'è una percentuale", "composizione della famiglia", "tipologia, budget (tra il minimo e il massimo), zona, locali, metri quadri e le caratteristiche necessarie", "pubblicata e verificata", "non si può contattare", "Chi non ha il dato", "resta sempre in fondo"]) assert.ok(t.replace(/\s+/g, " ").includes(x), `manca «${x}»`);
});

test("affidabilità e recensioni: i punti sono quelli veri, le recensioni sono dette A PARTE (era sbagliato nella FAQ), il badge ha le regole vere", () => {
  const p = aff.PUNTI_AFFIDABILITA;
  for (const r of ["inquilino", "proprietario"]) {
    const f = faq(r); assert.ok(f.includes(`reddito verificato +${p.reddito}`) && f.includes(`nessun protesto +${p.protesti}`) && f.includes(`garante o fideiussione +${p.garanzia}`) && f.includes(`tolgono ${p.protesti}`), `${r}: punti`); assert.ok(f.includes(`da ${aff.PUNTEGGIO_MINIMO} a ${aff.PUNTEGGIO_MASSIMO}`));
    assert.ok(f.includes("Le recensioni NON ne fanno parte"), `${r}: le recensioni non sono nell'affidabilità`); assert.ok(!/Combina le recensioni/.test(f), `${r}: la frase sbagliata di prima`);
    for (const t of [tutto(r), f]) { assert.ok(t.includes(`almeno ${rec.AUTORI_DIVERSI_MINIMI} recensioni positive (${rec.VOTO_POSITIVO_MINIMO}-${rec.VOTO_MASSIMO} stelle) di proprietari diversi negli ultimi ${rec.ANNI_VALIDITA} anni`), `${r}: regola del badge`); assert.ok(t.includes(`nessuna negativa (${rec.VOTO_NEGATIVO_MASSIMO} stelle o meno)`)); assert.ok(t.includes(`«${rec.NOME_BADGE_RACCOMANDATO}»`)); assert.ok(t.includes("Non entrano nell'affidabilità né nella percentuale di match")); }
  }
});

test("domande frequenti: per ruolo (bonus e detrazioni solo all'inquilino, i possibili match e l'ordinamento solo al proprietario), senza domande doppie", () => {
  const qi = g.domandeFrequenti("inquilino").map((d) => d.q), qp = g.domandeFrequenti("proprietario").map((d) => d.q);
  for (const x of ["Come funziona il match", "Come funziona il voto di affidabilità"]) { assert.ok(qi.includes(x) && qp.includes(x), x); } for (const x of ["Bonus giovani per l'affitto", "Detrazioni 730 per l'affitto", "Contributi comunali per l'affitto", "Perché vedo una casa «oltre la tua ricerca»?"]) { assert.ok(qi.includes(x), `inquilino: ${x}`); assert.ok(!qp.includes(x), `proprietario non deve vedere: ${x}`); }
  for (const x of ["Perché vedo pochi possibili match?", "Come ordino le persone nel Database"]) { assert.ok(qp.includes(x), `proprietario: ${x}`); assert.ok(!qi.includes(x), `inquilino non deve vedere: ${x}`); }
  assert.equal(new Set(qi).size, qi.length); assert.equal(new Set(qp).size, qp.length); for (const r of ["inquilino", "proprietario"]) assert.ok(g.domandeFrequenti(r).every((d) => d.q && d.a.length > 40));
  assert.ok(qi.includes("Cos'è la fideiussione bancaria/assicurativa") && qp.includes("Cos'è la fideiussione bancaria/assicurativa"), "la fideiussione serve a entrambi (è un criterio del proprietario)");
});

test("nessun numero scritto a mano nelle frasi di match, affidabilità e recensioni (tutti da costanti); le voci fiscali hanno i loro", () => {
  const src = leggi("src", "lib", "guida-testi.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); const fino = src.indexOf("const FAQ_BONUS"); const dopo = src.indexOf("function domandaAffidabilita");
  assert.ok(fino > 0 && dopo > fino); const parte = src.slice(0, fino) + src.slice(dopo);
  const stringhe = [...parte.matchAll(/`((?:[^`\\]|\\.)*)`|"((?:[^"\\]|\\.)*)"/g)].map((m) => (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, "")).filter((x) => !x.startsWith("@/"));
  const conCifre = stringhe.filter((x) => /\d/.test(x)); assert.deepEqual(conCifre, [], "numeri scritti a mano: " + conCifre.join(" | "));
});

test("la pagina «Come funziona» si apre dal Profilo di entrambi, mostra la versione del ruolo e non legge né scrive dati (solo il ruolo)", () => {
  const prop = leggi("src", "app", "(app)", "profilo", "OwnerProfiloClient.tsx"), ten = leggi("src", "app", "(app)", "profilo", "ProfiloClient.tsx");
  assert.match(prop, /<RigaComeFunziona ruolo="proprietario" \/>/); assert.match(ten, /<RigaComeFunziona ruolo="inquilino" \/>/); assert.match(ten, /<FaqSheet open=\{sheetAperta === "faq"\} onClose=\{\(\) => setSheetAperta\(null\)\} \/>/, "la FAQ dell'inquilino è quella di sempre");
  const riga = leggi("src", "components", "RigaComeFunziona.tsx"); assert.match(riga, /router\.push\("\/come-funziona"\)/); assert.match(riga, /title="Come funziona"/);
  const pag = leggi("src", "app", "(app)", "come-funziona", "page.tsx"); assert.match(pag, /select\("ruolo"\)/); assert.match(pag, /const ruolo = profilo\?\.ruolo === "proprietario" \? "proprietario" : "inquilino";/, "la versione dipende dal ruolo di chi apre"); assert.match(pag, /ruolo === "proprietario" \? "Match, affidabilità e recensioni: cosa vedi/, "anche il sottotitolo"); assert.ok(!/\.(insert|update|upsert|delete)\(|\.rpc\(/.test(pag), "la pagina non scrive"); assert.match(pag, /<GuidaComeFunziona ruolo=\{ruolo\} \/>/); assert.match(pag, /href="\/profilo"/, "si torna al Profilo"); assert.match(pag, /if \(!user\) redirect\("\/login"\)/);
  const comp = leggi("src", "components", "GuidaComeFunziona.tsx"); assert.match(comp, /testiGuida\(ruolo\)/); assert.match(comp, /aria-labelledby=\{`guida-\$\{b\.id\}`\}/);
});

test("pagina disegnata: i titoli dei blocchi, i pesi in elenco e il collegamento per tornare al Profilo (versione inquilino e proprietario)", () => {
  const comp = caricaTs(path.join(radice, "src", "components", "GuidaComeFunziona.tsx"));
  const i = renderToStaticMarkup(React.createElement(comp.GuidaComeFunziona, { ruolo: "inquilino" })), p = renderToStaticMarkup(React.createElement(comp.GuidaComeFunziona, { ruolo: "proprietario" }));
  assert.match(i, /aria-label="Quanto pesa ogni parte del match"/); assert.ok(!/Quanto pesa ogni parte/.test(p)); assert.match(i, /Match: quanto una casa va bene per te/); assert.match(p, /Match: quanto un inquilino va bene per la tua casa/); assert.match(p, /Possibili match: chi cerca una casa come la tua/); assert.ok(!/Possibili match/.test(i));
  for (const h of [i, p]) { assert.match(h, /Affidabilità/); assert.match(h, /aria-label="Le fasce di affidabilità"/); assert.match(h, /Recensioni e badge «Inquilino raccomandato»/); assert.match(h, /<li class="piu">/); }
  assert.equal([...i.matchAll(/<h2 /g)].length, 5); assert.equal([...p.matchAll(/<h2 /g)].length, 7);
});

test("stile: «Come funziona» ha il ritorno al Profilo (44 px, 15 px) e riusa lo stile del benvenuto", () => {
  const css = leggi("src", "app", "globals.css"); assert.match(css, /\.guida-indietro \{[^}]*min-height: 44px;[^}]*font-size: 15px;/); assert.match(css, /\.guida-pagina \{/); assert.match(css, /\.intro-voci \{/, "lo stile del benvenuto c'è ancora");
});

// ============================================================ scadenza delle verifiche e reddito del nucleo (migrazione 0040)
const sca = caricaTs(path.join(radice, "src", "lib", "scadenze-verifiche.ts")); const inf = caricaTs(path.join(radice, "src", "content", "informativa.ts")); const ben = caricaTs(path.join(radice, "src", "lib", "benvenuto-testi.ts"));

test("scadenza: la guida e le domande frequenti dicono quanto valgono le verifiche (i numeri sono quelli veri) e che il reddito conta in proporzione, per ruolo", () => {
  const m = sca.VALIDITA_MESI;
  for (const r of ["inquilino", "proprietario"]) {
    const f = faq(r); assert.ok(f.includes(`reddito ${m.reddito} mesi, protesti ${m.protesti}`), `${r}: la FAQ sull'affidabilità`); assert.ok(f.includes("in proporzione a quanto del reddito del nucleo dichiarato è documentato"), `${r}: proporzione`);
    const t = tutto(r); assert.ok(t.includes(`reddito ${m.reddito} mesi, i protesti ${m.protesti}`) || t.includes(`reddito ${m.reddito} mesi, protesti ${m.protesti}`), `${r}: la guida lo dice`); assert.ok(t.includes("proporzione") || t.includes("coprono") || t.includes("copre"), `${r}: la guida parla della copertura`);
  }
  assert.ok(faq("inquilino").includes("ti avvisiamo prima")); assert.ok(faq("proprietario").includes("sulla scheda la vedi come «scaduta»")); assert.ok(!faq("proprietario").includes("ti avvisiamo prima"), "il proprietario non viene avvisato delle scadenze di un altro");
  assert.ok(tutto("inquilino").includes("serve la prova di ognuna, e solo con il suo consenso"), "documenti di altre persone: con il consenso"); assert.ok(tutto("inquilino").includes("Ogni tre mesi ti chiediamo di confermare che la tua situazione non è cambiata")); assert.equal(sca.CONFERMA_OGNI_GIORNI, 90, "«ogni tre mesi» = 90 giorni");
});

test("benvenuto: lo dice in breve, con i numeri veri, per ruolo (restando nei limiti di brevità della pagina)", () => {
  const m = sca.VALIDITA_MESI; const i = ben.testiIntro("inquilino").blocchi.flatMap((b) => b.paragrafi).join(" "), p = ben.testiIntro("proprietario").blocchi.flatMap((b) => b.paragrafi).join(" ");
  assert.ok(i.includes(`il reddito vale ${m.reddito} mesi, i protesti ${m.protesti}`)); assert.ok(i.includes("serve la prova di ognuna, con il suo consenso")); assert.ok(p.includes(`reddito ${m.reddito} mesi, protesti ${m.protesti}`)); assert.ok(p.includes("se è scaduta non conta"));
});

test("informativa 23: dice che le verifiche scadono (con gli stessi numeri), che i documenti di altre persone si caricano solo con il loro consenso, gli importi dello staff, la cancellazione dei sostituiti; la 22 resta equivalente (testo provvisorio)", () => {
  const t = JSON.stringify(inf.INFORMATIVA); assert.equal(inf.INFORMATIVA.versione, "2026-10-provvisoria-23"); assert.deepEqual([...inf.INFORMATIVA.equivalenti], ["2026-10-provvisoria-22"]);
  assert.equal(sca.VALIDITA_MESI.reddito, 6, "se cambia, va cambiata la frase «sei mesi per il reddito»"); assert.equal(sca.VALIDITA_MESI.protesti, 3, "se cambia, va cambiata la frase «tre per i protesti»");
  for (const x of ["la sua scadenza (sei mesi per il reddito, tre per i protesti)", "più persone hanno un reddito, chiediamo una prova del reddito per ognuna", "solo se quella persona è d'accordo che il suo documento sia caricato e controllato da noi", "non caricare i documenti di nessuno senza il suo consenso", "il nostro staff scrive l'importo mensile che dimostra", "quanta parte del reddito del nucleo che hai dichiarato è documentata", "Una verifica vale per un periodo: sei mesi per il reddito, tre per i protesti", "i punti del reddito sono in proporzione alla parte documentata", "Ogni tre mesi ti chiediamo di confermare che la tua situazione non è cambiata", "il mese in cui è stata fatta e quanta parte del reddito del nucleo è documentata (in percentuale, non gli importi)", "i documenti sostituiti vengono cancellati"]) assert.ok(t.includes(x), `manca «${x}»`);
});
