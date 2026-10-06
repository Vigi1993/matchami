/**
 * Recupero della password.
 *
 * Il link ricevuto per email porta a /auth/callback, che scambia il codice
 * con una sessione. Quella sessione è una normale sessione di accesso:
 * da sola non dice che l'utente sia arrivato da un link di recupero.
 *
 * Senza un segno distintivo, /reset-password sarebbe raggiungibile da
 * chiunque abbia una sessione aperta (un telefono lasciato sbloccato) e
 * permetterebbe di cambiare la password SENZA conoscere quella attuale,
 * aggirando il controllo che c'è in "Account e accesso".
 *
 * Il segno distintivo è questo cookie: lo imposta solo la callback, dopo
 * uno scambio di codice riuscito e solo se la destinazione è il reset, e
 * dura pochi minuti.
 */
export const COOKIE_RECUPERO = "recupero_password";
export const PERCORSO_RESET = "/reset-password";
export const DURATA_RECUPERO_SECONDI = 15 * 60;

/**
 * Traduce gli errori che la libreria di accesso restituisce, quasi sempre
 * in inglese e tecnici, in qualcosa che una persona possa usare.
 *
 * Il caso più frequente non è un guasto: il link di recupero si apre da un
 * dispositivo o da un browser diverso da quello in cui è stato richiesto
 * (si chiede dal computer e si apre l'email sul telefono). Il codice di
 * verifica resta nel browser d'origine e lì soltanto.
 */
export function messaggioErroreAccesso(messaggio: string | null | undefined): string {
  const m = (messaggio ?? "").toLowerCase();

  if (m.includes("code verifier") || m.includes("pkce")) {
    return "Apri il link dallo stesso browser e dallo stesso dispositivo da cui lo hai richiesto. Se non puoi, richiedine uno nuovo da quello che stai usando.";
  }
  if (m.includes("expired") || m.includes("invalid") || m.includes("already been used")) {
    return "Il link non è più valido o è scaduto. Richiedine uno nuovo.";
  }
  return "Non è stato possibile completare l'operazione. Riprova o richiedi un nuovo link.";
}
