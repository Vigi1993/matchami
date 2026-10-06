/**
 * Riduce un valore arrivato dall'esterno (parametro `next` di un link,
 * campo nascosto di un modulo) a un percorso INTERNO del sito, oppure
 * al percorso di riserva.
 *
 * Serve perché `${origin}${next}` non è sicuro: con next = "@evil.com"
 * il risultato è "https://sito@evil.com", che il browser interpreta come
 * un indirizzo su evil.com. Qui si accetta solo ciò che comincia con una
 * singola "/", senza barre rovesciate né caratteri di controllo.
 */
export function percorsoInterno(
  valore: string | null | undefined,
  riserva = "/"
): string {
  if (typeof valore !== "string" || valore.length === 0) return riserva;
  if (valore.length > 500) return riserva;
  if (!valore.startsWith("/")) return riserva;
  // "//host" e "/\host" sono indirizzi assoluti mascherati
  if (valore.startsWith("//") || valore.startsWith("/\\")) return riserva;
  // nessuna barra rovesciata né carattere di controllo in nessun punto
  if (/[\\\u0000-\u001f\u007f]/.test(valore)) return riserva;
  return valore;
}
