/**
 * ============================================================
 *  TEMPORANEO, SOLO PER FACILITARE I TEST
 * ============================================================
 * Con la variabile d'ambiente `SALTA_CONFERMA_EMAIL=1` l'iscrizione NON chiede di confermare l'email: l'account nasce già confermato
 * e si entra subito. Serve per provare l'app senza aspettare le email.
 *
 * COME SI ACCENDE:  mettere  SALTA_CONFERMA_EMAIL=1  in .env.local (o tra le variabili dell'ambiente di prova) e riavviare.
 * COME SI SPEGNE:   togliere la variabile (o metterla a 0) e riavviare. Il codice può restare: di partenza è SPENTO.
 *
 * NON dipende dall'impostazione «Confirm email» di Supabase: l'account si crea con la chiave di servizio, già confermato.
 * NON va MAI lasciata accesa quando l'app si apre al pubblico: chiunque potrebbe iscriversi con l'indirizzo email di un altro.
 * Quando è accesa la pagina di accesso lo dice a chiunque la guardi, e ogni iscrizione lascia una riga nel registro.
 */

/** Acceso solo con il valore ESATTO «1»: «true», «yes», vuoto o assente lasciano la verifica attiva. */
export function confermaEmailSaltata(env: Record<string, string | undefined> = process.env): boolean {
  return env.SALTA_CONFERMA_EMAIL === "1";
}

/** La frase che si vede in cima alla pagina di accesso finché l'interruttore è acceso. */
export const AVVISO_CONFERMA_SALTATA =
  "Ambiente di prova: l'email NON viene verificata all'iscrizione. Da togliere prima di aprire l'app al pubblico.";

/** Dall'errore del servizio di accesso alle parole per la persona (l'iscrizione di prova usa la chiave di servizio). */
export function messaggioErroreIscrizioneProva(messaggio: unknown): string {
  const m = typeof messaggio === "string" ? messaggio.toLowerCase() : "";
  if (m.includes("already") && (m.includes("registered") || m.includes("exists"))) return "Questo indirizzo è già registrato: vai su «Accedi».";
  if (m.includes("password") && (m.includes("weak") || m.includes("short") || m.includes("least"))) return "La password non è abbastanza forte: usane una più lunga.";
  if (m.includes("email") && (m.includes("invalid") || m.includes("valid"))) return "Inserisci un indirizzo email valido.";
  return "Non sono riuscito a creare l'account. Riprova.";
}
