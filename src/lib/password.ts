/**
 * Regole per scegliere una nuova password, in un posto solo: le usano
 * sia "Account e accesso" sia il recupero della password.
 *
 * Restituisce il messaggio da mostrare, oppure `null` se va bene.
 */
export const PASSWORD_MIN = 8;

// bcrypt, che Supabase usa per conservare le password, guarda solo i
// primi 72 byte: oltre quel limite il resto non conterebbe niente.
export const PASSWORD_MAX_BYTE = 72;

export function validaNuovaPassword(nuova: string, ripeti: string): string | null {
  if (nuova.length < PASSWORD_MIN) {
    return `La nuova password deve avere almeno ${PASSWORD_MIN} caratteri.`;
  }
  if (new TextEncoder().encode(nuova).length > PASSWORD_MAX_BYTE) {
    return `La nuova password è troppo lunga: al massimo ${PASSWORD_MAX_BYTE} caratteri.`;
  }
  if (nuova !== ripeti) {
    return "Le due password non coincidono.";
  }
  return null;
}
