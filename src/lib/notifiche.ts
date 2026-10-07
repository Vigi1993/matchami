/**
 * Le notifiche dentro l'app: che testo mostrare per ogni evento, dove porta,
 * da quanto tempo è arrivata. Logica pura, senza database: si prova con
 * `npm test`.
 *
 * Le notifiche NASCONO nel database (trigger della migrazione 0019). Il database
 * salva solo il tipo e, al massimo, il titolo di un annuncio; il testo si
 * compone qui, così le parole si possono cambiare senza toccare i dati.
 */
import { percorsoInterno } from "./percorso";

/** Gli stessi tipi del vincolo sulla tabella `notifiche`: un test li tiene allineati. */
export const TIPI_NOTIFICA = [
  "candidatura_ricevuta",
  "candidatura_accettata",
  "candidatura_rifiutata",
  "immobile_verificato",
  "immobile_respinto",
  "reddito_verificato",
  "reddito_respinto",
  "affitto_verificato",
  "affitto_respinto",
  "rapporto_confermato",
  "rapporto_rifiutato",
  "feedback_ricevuto",
] as const;

export type TipoNotifica = (typeof TIPI_NOTIFICA)[number];

export type Notifica = {
  id: string;
  tipo: string;
  dati: Record<string, unknown> | null;
  link: string;
  letta_at: string | null;
  created_at: string;
};

export type TestoNotifica = { titolo: string; testo: string };

/** Il titolo di un annuncio tra virgolette, o una formula neutra se manca. */
function annuncio(dati: Record<string, unknown> | null, senza: string): string {
  const t = dati && typeof dati.titolo === "string" ? dati.titolo.trim() : "";
  return t ? `«${t}»` : senza;
}

/**
 * Cosa dire per un tipo di notifica. Un tipo sconosciuto (per esempio uno
 * aggiunto dal database prima che il codice lo conosca) non rompe la pagina:
 * si mostra una formula generica.
 */
export function descriviNotifica(
  tipo: string,
  dati: Record<string, unknown> | null
): TestoNotifica {
  switch (tipo) {
    case "candidatura_ricevuta":
      return {
        titolo: "Nuova candidatura",
        testo: `Una persona si è candidata a ${annuncio(dati, "un tuo annuncio")}.`,
      };
    case "candidatura_accettata":
      return {
        titolo: "Candidatura accettata",
        testo: `Il proprietario di ${annuncio(dati, "un annuncio")} ha accettato la tua candidatura: ora puoi scrivere in chat.`,
      };
    case "candidatura_rifiutata":
      return {
        titolo: "Candidatura non accettata",
        testo: `La tua candidatura per ${annuncio(dati, "un annuncio")} non è stata accettata. Nella scheda trovi il motivo.`,
      };
    case "immobile_verificato":
      return {
        titolo: "Immobile verificato",
        testo: `${annuncio(dati, "Il tuo immobile")} è verificato: ora è visibile agli inquilini e può ricevere candidature.`,
      };
    case "immobile_respinto":
      return {
        titolo: "Verifica dell'immobile non riuscita",
        testo: `La verifica di ${annuncio(dati, "un tuo immobile")} non è andata a buon fine. Leggi la nota e invia di nuovo.`,
      };
    case "reddito_verificato":
      return {
        titolo: "Reddito verificato",
        testo: "I proprietari ora vedono «Reddito verificato» accanto al tuo nome.",
      };
    case "reddito_respinto":
      return {
        titolo: "Verifica del reddito non riuscita",
        testo: "Leggi la nota nel Profilo, correggi i documenti e invia di nuovo.",
      };
    case "affitto_verificato":
      return {
        titolo: "Affitto verificato",
        testo: "Abbiamo verificato l'affitto dichiarato: il proprietario può ora lasciare un feedback.",
      };
    case "affitto_respinto":
      return {
        titolo: "Affitto non verificato",
        testo: "Non è stato possibile verificare l'affitto dichiarato. Trovi la nota nella sezione degli affitti.",
      };
    case "rapporto_confermato":
      return {
        titolo: "Affitto confermato",
        testo: "L'altra persona ha confermato l'affitto che hai dichiarato: ora lo controlliamo.",
      };
    case "rapporto_rifiutato":
      return {
        titolo: "Affitto non confermato",
        testo: "L'altra persona non ha confermato l'affitto che hai dichiarato.",
      };
    case "feedback_ricevuto":
      return {
        titolo: "Nuovo feedback",
        testo: "Un proprietario ha lasciato un feedback su di te.",
      };
    default:
      return { titolo: "Novità", testo: "C'è una novità nel tuo account." };
  }
}

/** Dove porta una notifica. Mai fuori dal sito, qualunque cosa ci sia nei dati. */
export function linkNotifica(n: Pick<Notifica, "link">): string {
  return percorsoInterno(n.link, "/");
}

/**
 * Da quanto tempo è arrivata, in italiano. `ora` si può passare per provarla.
 * Una data illeggibile dà una stringa vuota, non «NaN giorni fa».
 */
export function trascorso(iso: string, ora: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const minuti = Math.floor((ora - t) / 60000);
  if (minuti < 1) return "adesso"; // anche una data nel futuro (orologi non allineati)
  if (minuti < 60) return `${minuti} min fa`;
  const ore = Math.floor(minuti / 60);
  if (ore < 24) return ore === 1 ? "1 ora fa" : `${ore} ore fa`;
  const giorni = Math.floor(ore / 24);
  if (giorni === 1) return "ieri";
  if (giorni < 7) return `${giorni} giorni fa`;
  return new Date(t).toLocaleDateString("it-IT", { day: "numeric", month: "long" });
}

/** Il numero da mostrare sul segnalino: niente per zero, «99+» oltre 99. */
export function etichettaConteggio(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  const intero = Math.floor(n);
  return intero > 99 ? "99+" : String(intero);
}

/** Quante notifiche non sono ancora state lette. */
export function contaNonLette(elenco: Pick<Notifica, "letta_at">[]): number {
  return elenco.filter((n) => !n.letta_at).length;
}

/** Il sottotitolo della riga «Novità» nel Profilo. */
export function sottotitoloNovita(nonLette: number): string {
  if (nonLette <= 0) return "Nessuna novità da leggere.";
  if (nonLette === 1) return "Hai 1 novità da leggere.";
  return `Hai ${nonLette} novità da leggere.`;
}
