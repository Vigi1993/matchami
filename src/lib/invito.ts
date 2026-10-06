/**
 * Regola sul feedback del proprietario invitato, lato testi e requisiti.
 *
 * La regola vera sta nel database (migrazione 0011) e non dipende da
 * questo file: qui si decide solo cosa mostrare alla persona.
 */

/** Ciò che risponde la funzione `requisiti_feedback_invito`. */
export type RequisitiFeedback = {
  proprietario_verificato: boolean;
  rapporto_verificato: boolean;
  rapporto_in_verifica: boolean;
};

export type VoceRequisito = {
  chiave: "immobile" | "contratto";
  testo: string;
  stato: "ok" | "in_verifica" | "no";
};

/**
 * Cosa ha già e cosa manca a un proprietario per poter lasciare il feedback.
 *
 * Se non si riesce a sapere (la funzione non risponde, per esempio perché la
 * migrazione non è stata eseguita) si considera che NON abbia niente: il
 * modulo non deve mai comparire per un errore.
 */
export function descriviRequisiti(
  r: RequisitiFeedback | null | undefined,
  nomeInquilino: string
): { completi: boolean; voci: VoceRequisito[] } {
  const verificato = r?.proprietario_verificato === true;
  const rapportoOk = r?.rapporto_verificato === true;
  const rapportoInVerifica = r?.rapporto_in_verifica === true;

  return {
    completi: verificato && rapportoOk,
    voci: [
      {
        chiave: "immobile",
        testo: "Un tuo immobile verificato su MatchAmI",
        stato: verificato ? "ok" : "no",
      },
      {
        chiave: "contratto",
        testo: `Un contratto verificato con ${nomeInquilino}`,
        stato: rapportoOk ? "ok" : rapportoInVerifica ? "in_verifica" : "no",
      },
    ],
  };
}

/**
 * Il messaggio che l'inquilino manda al proprietario. Dice la verità su cosa
 * serve: non "ci vuole un minuto", perché per lasciare il feedback servono un
 * immobile e un contratto verificati.
 */
export function messaggioInvito(nomeInquilino: string | null, link: string): string {
  const io = nomeInquilino ? ` Sono ${nomeInquilino}.` : "";
  return (
    `Ciao!${io} Uso MatchAmI per l'affitto e vorrei che lasciassi un commento ` +
    `su com'è andata con me come inquilino. Perché i commenti siano veri, ` +
    `MatchAmI li accetta solo da proprietari verificati: ti chiede di ` +
    `registrarti e di verificare l'immobile e il nostro contratto. ${link}`
  );
}
