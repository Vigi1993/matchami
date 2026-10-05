/**
 * Pesi e soglie del calcolo del match.
 *
 * È l'UNICO posto da modificare per tarare il calcolo: la logica nei
 * file accanto legge da qui e non contiene numeri propri.
 *
 * Origine: i valori derivano dal prototipo HTML e dalle decisioni D1-D8
 * del documento "Come si calcola il match". Dove un valore è un
 * segnaposto in attesa di una scelta vostra, c'è scritto.
 */

// ------------------------------------------------------------
// Lato inquilino: quanto una casa gli va bene
// ------------------------------------------------------------

/** Peso di ogni componente, su 100. Con interessi indicati. */
export const PESI_INQUILINO = {
  budget: 32,
  zona: 20,
  locali: 16,
  mq: 12,
  caratteristiche: 20,
} as const;

/** Stessi pesi quando l'inquilino non ha indicato caratteristiche. */
export const PESI_INQUILINO_SENZA_CARATTERISTICHE = {
  budget: 40,
  zona: 25,
  locali: 20,
  mq: 15,
  caratteristiche: 0,
} as const;

/**
 * Curva del budget (D1).
 *
 * A budget si ottiene `puntiAlBudget` dei punti. Sotto budget i punti
 * salgono di un punto per ogni punto di risparmio, fino al pieno (con
 * 0,72 il pieno arriva al 28% sotto il budget). Sopra budget si scende
 * in linea retta fino a zero a `sforoAZero`.
 * È continua: una casa appena sopra il budget non può valere più di
 * una esattamente a budget, come accadeva nel prototipo.
 */
export const CURVA_BUDGET = {
  puntiAlBudget: 0.72,
  sforoAZero: 0.25,
} as const;

/**
 * Oltre questo sforamento (10% sul budget) l'annuncio non compare.
 * Entro, compare in fondo e marcato come "oltre il tuo budget" (D1, D2).
 */
export const TOLLERANZA_BUDGET = 0.1;

/** Frazione dei punti di un componente quando il minimo NON è raggiunto. */
export const PENALITA = {
  zonaFuori: 0.24,
  localiSotto: 0.2,
  /** per i m²: punti = peso * rapporto - peso * questo valore */
  mqSottoDetrazione: 0.2,
} as const;

/**
 * Punti quando il dato dell'ANNUNCIO manca (P4): l'inquilino non può
 * compilare l'annuncio, quindi non viene punito per una dimenticanza
 * del proprietario. Metà dei punti, e un avviso.
 */
export const PUNTI_DATO_MANCANTE = 0.5;

// ------------------------------------------------------------
// Lato proprietario: quanto il candidato risponde ai suoi criteri
// ------------------------------------------------------------

export const PESO_MIN = 1;
export const PESO_MAX = 10;
/** Peso proposto nel modulo quando il proprietario aggiunge un criterio. */
export const PESO_PREDEFINITO = 5;

/**
 * Soglia di partenza del criterio "reddito rispetto al canone": il
 * canone non supera questa percentuale del reddito mensile del nucleo.
 *
 * SEGNAPOSTO (D6): è un valore di partenza suggerito, la scelta
 * definitiva è dei soci. Il proprietario può cambiarlo per annuncio
 * entro questi limiti.
 */
export const SOGLIA_REDDITO_CANONE = {
  predefinita: 33,
  min: 15,
  max: 60,
} as const;

/** Un profilo vale "completo" da questa percentuale di campi compilati. */
export const SOGLIA_PROFILO_COMPLETO = 80;

// ------------------------------------------------------------
// Comuni
// ------------------------------------------------------------

/** Nessun punteggio arriva a 100: sono dati dichiarati (D8). */
export const PUNTEGGIO_MAX = 99;

/** Soglie delle etichette (D8). Sotto l'ultima: "Bassa". */
export const SOGLIE_ETICHETTE = [
  { da: 88, etichetta: "Ottima compatibilità" },
  { da: 70, etichetta: "Buona compatibilità" },
  { da: 50, etichetta: "Compatibilità parziale" },
] as const;

export const ETICHETTA_MINIMA = "Compatibilità bassa";
