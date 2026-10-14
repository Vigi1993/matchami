/**
 * La pagina «Gestione affitto» dell'inquilino: quali schede si possono aprire da un collegamento (`?apri=…`). Solo valori
 * ammessi; qualunque altra cosa non apre niente.
 */
export const SEZIONI_GESTIONE_APRIBILI = ["affitti", "invito"] as const;
export type SezioneGestione = (typeof SEZIONI_GESTIONE_APRIBILI)[number];

export function sezioneGestione(valore: unknown): SezioneGestione | null {
  const v = Array.isArray(valore) ? valore[0] : valore;
  return typeof v === "string" && (SEZIONI_GESTIONE_APRIBILI as readonly string[]).includes(v) ? (v as SezioneGestione) : null;
}
