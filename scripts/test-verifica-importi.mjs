/**
 * Test degli IMPORTI che lo staff scrive quando verifica il reddito (e dell'anteprima di quanta parte del reddito del nucleo risulterà documentata).
 * Logica pura. Si lancia con:   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { caricaTs, radice } from "./carica-ts.mjs";

const vi = caricaTs(path.join(radice, "src", "lib", "verifica-importi.ts"));
const d = (id, persona, nome) => ({ id, persona, nome });

test("leggere un importo scritto a mano: euro, punti delle migliaia, spazi, virgola; vuoto, zero, testo, negativi e fuori scala = nessuno", () => {
  for (const [testo, atteso] of [["1500", 1500], ["1.500", 1500], ["1 500", 1500], ["€ 1.500", 1500], ["1500,00", 1500], ["1500,6", 1501], ["1500,4", 1500], [" 800 ", 800], ["100000", 100000], ["0,6", 1], ["12.345,67", 12346]]) assert.equal(vi.leggiImporto(testo), atteso, testo);
  for (const testo of ["", "  ", "0", "0,2", "-5", "abc", "12abc", "1.500,5,5", "100001", "1e3", null, undefined, "1,5,6", "--"]) assert.equal(vi.leggiImporto(testo), null, String(testo));
  assert.equal(vi.IMPORTO_MASSIMO, 100000, "è il limite del database");
});

test("dal modulo agli importi: un campo vuoto scarta la prova, uno scritto male è un errore (non si ignora), ogni persona del nucleo deve averne una", () => {
  const docs = [d("a", 1, "busta.pdf"), d("b", 2, "cu.pdf"), d("c", 2, "vecchia.pdf")];
  const ok = vi.importiDaForm({ documenti: docs, valori: { a: "1500", b: "1.600", c: "" }, redditiNucleo: 2 }); assert.deepEqual(ok, { ok: true, importi: [{ documento: "a", importo: 1500 }, { documento: "b", importo: 1600 }] });
  const male = vi.importiDaForm({ documenti: docs, valori: { a: "1500", b: "mille", c: "" }, redditiNucleo: 2 }); assert.equal(male.ok, false); assert.match(male.errore, /L'importo di «cu\.pdf» non è valido/);
  const manca = vi.importiDaForm({ documenti: docs, valori: { a: "1500" }, redditiNucleo: 2 }); assert.equal(manca.ok, false); assert.match(manca.errore, /Manca l'importo della prova della persona 2 di 2/);
  const nessuno = vi.importiDaForm({ documenti: docs, valori: {}, redditiNucleo: 2 }); assert.match(nessuno.errore, /almeno una prova del reddito, oppure respingi/);
  const una = vi.importiDaForm({ documenti: [d("a", 1, "x.pdf")], valori: { a: "0" }, redditiNucleo: 1 }); assert.equal(una.ok, false, "lo zero non è un importo");
  const unaOk = vi.importiDaForm({ documenti: [d("a", 1)], valori: { a: "1500" }, redditiNucleo: undefined }); assert.equal(unaOk.ok, true, "senza il numero dei redditi: una persona");
  assert.match(vi.importiDaForm({ documenti: [d("a", 1)], valori: { a: "x" }, redditiNucleo: 1 }).errore, /«un documento»/, "senza nome del file si dice comunque");
  const persona1 = vi.importiDaForm({ documenti: docs, valori: { b: "1600" }, redditiNucleo: 2 }); assert.match(persona1.errore, /persona 1 di 2/);
  assert.match(vi.importiDaForm({ documenti: [d("a", 1)], valori: {}, redditiNucleo: 1 }).errore, /almeno una prova/);
  assert.match(vi.importiDaForm({ documenti: [d("a", 2)], valori: { a: "900" }, redditiNucleo: 1 }).errore, /Manca l'importo della prova del reddito\./, "una prova di una persona fuori dal nucleo non copre la prima");
});

test("somma del nucleo: per ogni persona UNA prova (la più alta), sommate; le persone fuori dal nucleo e gli importi illeggibili non contano", () => {
  const docs = [d("a1", 1), d("a2", 1), d("b", 2), d("c", 3)];
  assert.equal(vi.sommaNucleo({ documenti: docs, valori: { a1: "1400", a2: "1500", b: "1600", c: "900" }, redditiNucleo: 2 }), 3100); assert.equal(vi.sommaNucleo({ documenti: docs, valori: { a1: "1400", a2: "1500", b: "1600", c: "900" }, redditiNucleo: 3 }), 4000, "con tre redditi conta anche la terza");
  assert.equal(vi.sommaNucleo({ documenti: docs, valori: { a1: "abc", a2: "", b: "1600" }, redditiNucleo: 2 }), 1600); assert.equal(vi.sommaNucleo({ documenti: docs, valori: {}, redditiNucleo: 2 }), 0); assert.equal(vi.sommaNucleo({ documenti: [d("x", 0)], valori: { x: "500" }, redditiNucleo: 1 }), 0, "la persona 0 non esiste");
});

test("anteprima per lo staff: «€1500 verificati su €3000 dichiarati (50%)», tutto documentato, o l'invito a scrivere gli importi", () => {
  const base = { documenti: [d("a", 1)], redditiNucleo: 1, redditoNucleo: 3000, redditoMensile: 1500 };
  const meta = vi.anteprimaCopertura({ ...base, valori: { a: "1500" } }); assert.deepEqual([meta.testo, meta.completa, meta.somma], ["€1500 verificati su €3000 dichiarati (50%)", false, 1500]);
  const tutto = vi.anteprimaCopertura({ ...base, valori: { a: "3000" } }); assert.deepEqual([tutto.testo, tutto.completa], ["€3000 verificati: tutto il reddito dichiarato", true]); assert.equal(vi.anteprimaCopertura({ ...base, valori: { a: "2900" } }).completa, true, "dal 95% in su");
  assert.match(vi.anteprimaCopertura({ ...base, valori: {} }).testo, /Scrivi gli importi/); const senzaNucleo = vi.anteprimaCopertura({ ...base, redditoNucleo: null, valori: { a: "1500" } }); assert.equal(senzaNucleo.completa, true, "senza reddito del nucleo si confronta con quello personale (1.500)");
});
