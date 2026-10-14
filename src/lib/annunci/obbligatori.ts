/**
 * I dati OBBLIGATORI di un annuncio. L'ELENCO È PROVVISORIO: quali dati la
 * normativa imponga di indicare va confermato con un legale (punto 37 degli open
 * point). Per questo sta in un solo posto, e un test ricorda di rivederlo.
 *
 * Cosa significa «obbligatorio» oggi: senza questi dati non si può chiedere la
 * verifica dell'immobile (lo fa rispettare il database, migrazione 0026), e quindi
 * l'annuncio non diventa visibile. Gli immobili già verificati non si toccano.
 */

/** Le colonne dell'annuncio che sono obbligatorie per chiedere la verifica. */
export type ChiaveDatoObbligatorio =
  | "classe_energetica"
  | "luogo_id"
  | "bagni"
  | "piano"
  | "riscaldamento"
  | "tipo_contratto"
  | "disponibile_dal";

export type DatoObbligatorio = {
  chiave: ChiaveDatoObbligatorio;
  etichetta: string;
  /** perché si chiede, in una riga */
  perche: string;
  /** come si dice a chi deve completarlo, dopo «Per inviare manca:» */
  frase: string;
};

/** Finché è `true` l'elenco non è stato confermato da un legale. */
export const ELENCO_DATI_OBBLIGATORI_PROVVISORIO = true;

const DOVE = "si indica dalla scheda dell'annuncio, in Annunci";

export const DATI_OBBLIGATORI: readonly DatoObbligatorio[] = [
  {
    chiave: "classe_energetica",
    etichetta: "Classe energetica (APE)",
    perche: "Va indicata nell'annuncio.",
    frase: `la classe energetica dell'immobile (${DOVE})`,
  },
  {
    chiave: "luogo_id",
    etichetta: "Dove si trova",
    perche: "Serve a farlo trovare a chi cerca in quella zona.",
    frase: `la zona scelta dall'elenco (${DOVE})`,
  },
  {
    chiave: "bagni",
    etichetta: "Numero di bagni",
    perche: "Chi cerca può chiedere un numero minimo di bagni.",
    frase: `il numero di bagni (${DOVE})`,
  },
  {
    chiave: "piano",
    etichetta: "Piano",
    perche: "Chi cerca può chiedere certi piani.",
    frase: `il piano (${DOVE})`,
  },
  {
    chiave: "riscaldamento",
    etichetta: "Riscaldamento",
    perche: "Chi cerca può chiedere un certo tipo di riscaldamento.",
    frase: `il tipo di riscaldamento (${DOVE})`,
  },
  {
    chiave: "tipo_contratto",
    etichetta: "Tipo di contratto proposto",
    perche: "Chi cerca può chiedere un certo tipo di contratto.",
    frase: `il tipo di contratto che proponi (${DOVE})`,
  },
  {
    chiave: "disponibile_dal",
    etichetta: "Disponibile dal",
    perche: "Chi cerca può chiedere una data di ingresso.",
    frase: `la data da cui l'immobile è disponibile (${DOVE})`,
  },
];

/**
 * I dati obbligatori che mancano. Un valore nullo, assente o vuoto vale «manca»; lo zero NO (il piano 0 è il piano terra).
 * `annuncio` ha le colonne dell'annuncio, con i nomi del database.
 */
export function datiMancanti(annuncio: Partial<Record<ChiaveDatoObbligatorio, unknown>>): DatoObbligatorio[] {
  return DATI_OBBLIGATORI.filter((d) => {
    const v = annuncio[d.chiave];
    return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
  });
}
