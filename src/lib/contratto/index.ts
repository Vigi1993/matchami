/**
 * Il solo punto in cui si decide QUALE modello di contratto si usa.
 *
 * PER METTERE UN MODELLO VALIDATO DA UN LEGALE (punto 4)
 *   1. si scrive un file in questa cartella che rispetta `ModelloContratto` (vedi tipi.ts),
 *      con `origine: "validato"` e `validazione: { da, data }` (chi lo ha validato e quando);
 *   2. lo si registra qui sotto in `MODELLI_CONTRATTO`;
 *   3. si imposta CONTRATTO_MODELLO con il suo `id`.
 * Solo allora la filigrana «bozza di prova» sparisce dal PDF: la decide questo registro,
 * non il modello, quindi un modello non può dichiararsi validato da solo. Un modello
 * «validato» senza `validazione` non si registra: `componiContratto` lancia un errore.
 * I test del contratto (scripts/test-contratto.mjs) girano su ogni modello registrato.
 */
import { modelloProvvisorio } from "./modello-provvisorio";
import type { DatiContratto, DocumentoContratto, ModelloContratto } from "./tipi";

export const MODELLI_CONTRATTO: Readonly<Record<string, ModelloContratto>> = {
  [modelloProvvisorio.id]: modelloProvvisorio,
};

export const MODELLO_CONTRATTO_PREDEFINITO = modelloProvvisorio.id;

/** Un nome sbagliato è un errore di configurazione e si dice, non si ripiega in silenzio. */
export function modelloContratto(nome?: string | null): ModelloContratto {
  const scelto = (nome ?? process.env.CONTRATTO_MODELLO ?? "").trim() || MODELLO_CONTRATTO_PREDEFINITO;
  const m = Object.prototype.hasOwnProperty.call(MODELLI_CONTRATTO, scelto) ? MODELLI_CONTRATTO[scelto] : undefined;
  if (!m) throw new Error(`Modello di contratto sconosciuto: «${scelto}». Quelli disponibili: ${Object.keys(MODELLI_CONTRATTO).join(", ")}.`);
  return m;
}

/** I difetti di un modello che si vuole registrare: l'elenco vuoto vuol dire che va bene. */
export function difettiDelModello(m: ModelloContratto): string[] {
  const d: string[] = [];
  if (!/^[a-z][a-z0-9_-]*$/.test(m.id)) d.push("l'identificativo non è valido");
  if (!m.versione || !String(m.versione).trim()) d.push("manca la versione");
  if (m.origine !== "provvisorio" && m.origine !== "validato") d.push("l'origine non è ammessa");
  if (m.origine === "validato") {
    if (!m.validazione || !m.validazione.da?.trim() || !m.validazione.data?.trim()) d.push("un modello validato deve dire da chi e quando è stato validato");
  }
  return d;
}

/**
 * Compone il documento. Il «bozza» lo decide QUI: è vero per ogni modello non validato, e
 * un modello non può cambiarlo. Un modello con difetti non si usa.
 */
export function componiContratto(dati: DatiContratto, nome?: string | null, modello?: ModelloContratto): DocumentoContratto {
  const m = modello ?? modelloContratto(nome);
  const difetti = difettiDelModello(m);
  if (difetti.length > 0) throw new Error(`Modello di contratto «${m.id}» non utilizzabile: ${difetti.join("; ")}.`);

  const d = m.genera(dati);
  return { ...d, modello: { id: m.id, versione: m.versione, origine: m.origine }, bozza: m.origine !== "validato" };
}

export type { DatiContratto, DocumentoContratto, ModelloContratto, RigaContratto } from "./tipi";
