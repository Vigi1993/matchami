import {
  ETICHETTA_MINIMA,
  PESO_MAX,
  PESO_MIN,
  PUNTEGGIO_MAX,
  SOGLIE_ETICHETTE,
} from "./config";
import type { EtichettaMatch } from "./tipi";

/** Porta un punteggio nell'intervallo 0-99, arrotondato. */
export function limita(punteggio: number): number {
  return Math.max(0, Math.min(PUNTEGGIO_MAX, Math.round(punteggio)));
}

export function etichettaPer(punteggio: number): EtichettaMatch {
  for (const s of SOGLIE_ETICHETTE) {
    if (punteggio >= s.da) return s.etichetta;
  }
  return ETICHETTA_MINIMA;
}

/** Un peso arriva dal database o da un modulo: lo riporto a 1-10. */
export function pesoValido(peso: number): number {
  if (!Number.isFinite(peso)) return PESO_MIN;
  return Math.max(PESO_MIN, Math.min(PESO_MAX, Math.round(peso)));
}

export function euro(n: number): string {
  return `€${n.toLocaleString("it-IT")}`;
}
