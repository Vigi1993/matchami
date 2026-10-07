/**
 * Controlli sul formato di valori che arrivano dall'indirizzo o da un
 * modulo, prima di usarli in una richiesta al database.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function èUuid(valore: string): boolean {
  return UUID.test(valore);
}

/**
 * Il link di una richiesta di rapporto: 32 caratteri esadecimali minuscoli
 * (un UUID senza trattini). Chi non ha questa forma non può essere un link
 * generato da noi.
 */
export function èTokenRapporto(valore: string): boolean {
  return /^[0-9a-f]{32}$/.test(valore);
}
