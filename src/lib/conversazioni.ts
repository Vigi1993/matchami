/**
 * L'elenco delle conversazioni: cosa mostrare di ciascuna, come si abbrevia
 * l'ultimo messaggio, quanti ne mancano da leggere. Logica pura, senza
 * database: si prova con `npm test`.
 *
 * L'elenco lo compone la funzione `elenco_conversazioni` del database
 * (migrazione 0021), che restituisce già l'anteprima di al più 140 caratteri.
 */
import { etichettaConteggio } from "./notifiche";

export type Conversazione = {
  candidatura_id: string;
  titolo: string;
  altro_nome: string;
  ultimo_testo: string | null;
  ultimo_at: string | null;
  /** L'ultimo messaggio l'ho scritto io. Nullo se non ce ne sono. */
  ultimo_mio: boolean | null;
  non_letti: number;
};

/** Quanti caratteri dell'ultimo messaggio si mostrano nell'elenco. */
export const LUNGHEZZA_ANTEPRIMA = 90;

/** Quanti ne restituisce al massimo la funzione del database (anche il testo è accorciato lì). */
export const LUNGHEZZA_DATABASE = 140;

/**
 * Una riga di anteprima: a capo e spazi ridotti a uno solo, «Tu: » davanti se
 * l'ho scritto io, accorciata su un confine di parola con i puntini. Una
 * conversazione senza messaggi lo dice.
 */
export function anteprimaMessaggio(
  c: Pick<Conversazione, "ultimo_testo" | "ultimo_mio">
): string {
  const grezzo = typeof c.ultimo_testo === "string" ? c.ultimo_testo : "";
  const testo = grezzo.replace(/\s+/g, " ").trim();
  if (!testo) return "Nessun messaggio ancora";

  const prefisso = c.ultimo_mio ? "Tu: " : "";
  const spazio = LUNGHEZZA_ANTEPRIMA - prefisso.length;
  // Si lavora sui caratteri veri, non sulle unità del testo: un'emoji vale uno e
  // non si taglia a metà (altrimenti nell'elenco comparirebbe un carattere rotto).
  const caratteri = Array.from(testo);
  // il database accorcia a 140: se il testo è arrivato a quel limite, ce n'è forse altro
  const troncatoAlDatabase = Array.from(grezzo).length >= LUNGHEZZA_DATABASE;

  if (caratteri.length <= spazio && !troncatoAlDatabase) return prefisso + testo;

  let corto = caratteri.slice(0, spazio).join("");
  // si taglia su una parola intera, se ce n'è una ragionevolmente vicina
  const ultimoSpazio = corto.lastIndexOf(" ");
  if (caratteri.length > spazio && ultimoSpazio > Array.from(corto).length * 0.6) corto = corto.slice(0, ultimoSpazio);
  return prefisso + corto.replace(/[\s.,;:!?-]+$/u, "") + "…";
}

/** Le iniziali per il cerchietto: al massimo due lettere, mai vuote. */
export function iniziali(nome: string | null | undefined): string {
  const parole = (typeof nome === "string" ? nome : "")
    .trim()
    .split(/\s+/)
    .filter((p) => /\p{L}/u.test(p));
  if (parole.length === 0) return "?";
  const prime = parole.length === 1 ? parole[0].slice(0, 1) : parole[0].slice(0, 1) + parole[parole.length - 1].slice(0, 1);
  return prime.toUpperCase();
}

/** Quanti messaggi mancano da leggere, in tutte le conversazioni. */
export function totaleNonLetti(elenco: Pick<Conversazione, "non_letti">[]): number {
  return elenco.reduce((somma, c) => somma + (Number.isFinite(c.non_letti) && c.non_letti > 0 ? Math.floor(c.non_letti) : 0), 0);
}

/** Il numero sul segnalino di una conversazione: niente per zero, «99+» oltre 99. */
export function etichettaNonLetti(n: number): string {
  return etichettaConteggio(n);
}

/** La riga sotto il titolo della pagina. */
export function sottotitoloMessaggi(elenco: Pick<Conversazione, "non_letti">[]): string {
  const n = elenco.length;
  if (n === 0) return "Le tue conversazioni arrivano qui.";
  const nonLetti = totaleNonLetti(elenco);
  const base = n === 1 ? "1 conversazione" : `${n} conversazioni`;
  if (nonLetti === 0) return `${base}, tutte lette.`;
  return `${base} · ${nonLetti} ${nonLetti === 1 ? "messaggio" : "messaggi"} da leggere.`;
}

/** Cosa dire quando non ci sono conversazioni: dipende da chi è. */
export function testoNessunaConversazione(ruolo: "inquilino" | "proprietario" | string): string {
  return ruolo === "proprietario"
    ? "Le chat si aprono quando accetti la candidatura di un inquilino."
    : "Le chat si aprono quando un proprietario accetta la tua candidatura.";
}

/** La descrizione per chi usa un lettore di schermo. */
export function descrizioneConversazione(c: Pick<Conversazione, "altro_nome" | "titolo" | "non_letti">): string {
  const base = `Conversazione con ${c.altro_nome} su ${c.titolo}`;
  if (c.non_letti <= 0) return base;
  return `${base}, ${c.non_letti} ${c.non_letti === 1 ? "messaggio non letto" : "messaggi non letti"}`;
}
