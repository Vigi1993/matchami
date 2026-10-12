/**
 * I dati OBBLIGATORI di un annuncio. L'ELENCO È PROVVISORIO: quali dati la
 * normativa imponga di indicare va confermato con un legale (punto 37 degli open
 * point). Per questo sta in un solo posto, e un test ricorda di rivederlo.
 *
 * Cosa significa «obbligatorio» oggi: senza questi dati non si può chiedere la
 * verifica dell'immobile (lo fa rispettare il database, migrazione 0026), e quindi
 * l'annuncio non diventa visibile. Gli immobili già verificati non si toccano.
 */

export type DatoObbligatorio = {
  chiave: "classe_energetica";
  etichetta: string;
  /** perché si chiede, in una riga */
  perche: string;
  /** come si dice a chi deve completarlo, dopo «Per inviare manca:» */
  frase: string;
};

/** Finché è `true` l'elenco non è stato confermato da un legale. */
export const ELENCO_DATI_OBBLIGATORI_PROVVISORIO = true;

export const DATI_OBBLIGATORI: readonly DatoObbligatorio[] = [
  {
    chiave: "classe_energetica",
    etichetta: "Classe energetica (APE)",
    perche: "Va indicata nell'annuncio.",
    frase: "la classe energetica dell'immobile (si indica dalla scheda dell'annuncio, in Annunci)",
  },
];

/** I dati obbligatori che mancano. Un valore nullo, assente o vuoto vale «manca». */
export function datiMancanti(annuncio: { classe_energetica?: unknown }): DatoObbligatorio[] {
  return DATI_OBBLIGATORI.filter((d) => {
    const v = (annuncio as Record<string, unknown>)[d.chiave];
    return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
  });
}
