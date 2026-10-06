/**
 * Perché un proprietario rifiuta una candidatura.
 *
 * È una lista CHIUSA, non un testo libero: l'inquilino rifiutato merita di
 * sapere perché, ma un campo libero permetterebbe di scrivere motivazioni
 * che non vorreste ospitare. L'ultima voce è una scelta consapevole di non
 * dire, così rifiutare resta sempre possibile.
 */
export const MOTIVI_RIFIUTO = [
  {
    chiave: "altro_candidato",
    scelta: "Ho scelto un altro candidato",
    messaggio: "Il proprietario ha scelto un altro candidato.",
  },
  {
    chiave: "criteri",
    scelta: "Non rispondeva ai criteri richiesti",
    messaggio:
      "Il profilo non rispondeva ai criteri richiesti per questo annuncio.",
  },
  {
    chiave: "reddito",
    scelta: "Reddito non adeguato al canone",
    messaggio: "Il reddito dichiarato non era adeguato al canone.",
  },
  {
    chiave: "profilo_incompleto",
    scelta: "Profilo incompleto",
    messaggio:
      "Il profilo era incompleto: completarlo aumenta le possibilità.",
  },
  {
    chiave: "non_indicato",
    scelta: "Preferisco non indicarlo",
    messaggio: "Il proprietario non ha indicato un motivo.",
  },
] as const;

export type ChiaveMotivoRifiuto = (typeof MOTIVI_RIFIUTO)[number]["chiave"];

export function motivoRifiutoValido(
  valore: unknown
): valore is ChiaveMotivoRifiuto {
  return (
    typeof valore === "string" &&
    MOTIVI_RIFIUTO.some((m) => m.chiave === valore)
  );
}

/** Il testo che l'inquilino legge. Per un valore sconosciuto o assente, nessun motivo. */
export function messaggioMotivoRifiuto(valore: unknown): string {
  const motivo = MOTIVI_RIFIUTO.find((m) => m.chiave === valore);
  return motivo ? motivo.messaggio : "Il proprietario non ha indicato un motivo.";
}
