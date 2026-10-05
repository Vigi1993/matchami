import { calcolaMatchInquilino, ordinaAnnunci } from "./inquilino";
import type {
  AnnuncioPerMatch,
  Fascia,
  ProfiloRicerca,
  RisultatoInquilino,
} from "./tipi";

export type VoceMazzo<T> = T & { match: RisultatoInquilino };

export type Mazzo<T> = {
  /** annunci da mostrare, già in ordine: prima in ricerca, poi gli altri */
  mazzo: VoceMazzo<T>[];
  /** quanti annunci del mazzo (i primi) sono in ricerca */
  inRicerca: number;
  /** annunci tolti perché oltre la tolleranza sul budget */
  esclusi: number;
};

/**
 * L'inquilino ha impostato almeno un criterio di ricerca?
 *
 * Senza criteri ogni annuncio prende lo stesso punteggio pieno e la
 * percentuale non dice nulla: l'interfaccia non deve mostrarla.
 */
export function haCriteriDiRicerca(profilo: ProfiloRicerca): boolean {
  return (
    profilo.budgetMax !== null ||
    profilo.localiMin !== null ||
    profilo.mqMin !== null ||
    profilo.zone.length > 0 ||
    Object.keys(profilo.interessi).length > 0
  );
}

/**
 * Dagli annunci pubblicati al mazzo dell'inquilino: calcola il match di
 * ciascuno, toglie quelli oltre la tolleranza sul budget e ordina.
 * Gli annunci conservano tutti i loro campi, con `match` in più.
 */
export function preparaMazzo<T extends AnnuncioPerMatch>(
  annunci: T[],
  profilo: ProfiloRicerca
): Mazzo<T> {
  const voci: VoceMazzo<T>[] = annunci.map((a) => ({
    ...a,
    match: calcolaMatchInquilino(a, profilo),
  }));

  const mazzo = ordinaAnnunci(voci);

  return {
    mazzo,
    inRicerca: mazzo.filter((v) => v.match.fascia === "in_ricerca").length,
    esclusi: voci.length - mazzo.length,
  };
}

export type StatoMazzo = {
  /** annunci in ricerca: sono i primi del mazzo */
  inRicerca: number;
  /** annunci della fascia "oltre la ricerca": vengono dopo */
  oltre: number;
  finito: boolean;
  /** va mostrata la schermata di passaggio tra le due fasce */
  mostraSeparatore: boolean;
};

/**
 * Dove si trova il deck: serve a decidere cosa mostrare, in particolare
 * quando comparire la schermata di passaggio tra "in linea con la tua
 * ricerca" e "oltre la tua ricerca".
 *
 * Il separatore compare quando l'indice arriva al primo annuncio della
 * seconda fascia, anche all'inizio se nessun annuncio è in ricerca, e
 * solo finché l'inquilino non l'ha superato.
 */
export function statoMazzo(
  fasce: Fascia[],
  indice: number,
  opzioni: { mostraMatch: boolean; separatoreVisto: boolean }
): StatoMazzo {
  const inRicerca = fasce.filter((f) => f === "in_ricerca").length;
  const oltre = fasce.length - inRicerca;
  const finito = indice >= fasce.length;

  return {
    inRicerca,
    oltre,
    finito,
    mostraSeparatore:
      opzioni.mostraMatch &&
      !finito &&
      !opzioni.separatoreVisto &&
      oltre > 0 &&
      indice === inRicerca,
  };
}
