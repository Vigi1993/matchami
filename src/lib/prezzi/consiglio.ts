/**
 * Il consiglio sul prezzo: dato il canone che un proprietario sta scegliendo, dice se
 * è in linea con la zona. Logica pura, senza database né rete.
 *
 * È INDICATIVO e lo dice. Non promette niente (né «affitti prima», né «guadagni di
 * più»): confronta con una quotazione e basta. Tiene conto della classe energetica con
 * dei coefficienti PROVVISORI: che una casa efficiente valga di più di una che
 * disperde è ragionevole, ma di quanto lo deve dire una fonte vera, non questo file.
 */
import { classeValida, type ClasseEnergetica } from "../annunci/energia";
import type { RisultatoQuotazione } from "./tipi";

/** Finché è `true` i coefficienti per la classe energetica sono di prova. */
export const COEFFICIENTI_ENERGIA_PROVVISORI = true;

/** Quanto sale o scende la fascia di prezzo in base alla classe energetica. PROVVISORI. */
export const FATTORI_ENERGIA: Readonly<Record<ClasseEnergetica, number>> = {
  A4: 1.06, A3: 1.06, A2: 1.06, A1: 1.06,
  B: 1.04,
  C: 1.02,
  D: 1,
  E: 0.97,
  F: 0.94,
  G: 0.91,
};

/** Quanto sotto il minimo o sopra il massimo si resta ancora «in linea». */
export const TOLLERANZA = 0.05;

export type Fascia = "sotto" | "in_linea" | "sopra";

export type Consiglio = {
  fascia: Fascia;
  /** i canoni tipici per QUESTA casa, in euro al mese, arrotondati a 10 */
  minimo: number;
  massimo: number;
  /** il coefficiente applicato per la classe energetica (1 se non indicata) */
  fattoreEnergia: number;
  /** di quanto il canone sta fuori dalla fascia, in percentuale (0 se in linea) */
  scostamentoPct: number;
  /** la frase principale */
  testo: string;
  /** da dove vengono i numeri */
  dettaglio: string;
  /** i numeri vengono da dati di prova, o da coefficienti provvisori che hanno cambiato il risultato */
  provvisorio: boolean;
};

const FORMATO = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 });
const euro = (n: number) => FORMATO.format(n);
const arrotonda10 = (n: number) => Math.round(n / 10) * 10;

export function fattoreEnergia(classe: unknown): number {
  return classeValida(classe) ? FATTORI_ENERGIA[classe] : 1;
}

/**
 * Il consiglio, o `null` se mancano i dati per darne uno (canone, metri quadri o
 * quotazione): meglio nessun consiglio di un consiglio inventato.
 */
export function consigliaPrezzo(dati: {
  quotazione: RisultatoQuotazione | null | undefined;
  mq: number | null | undefined;
  canone: number | null | undefined;
  classe?: unknown;
}): Consiglio | null {
  const { quotazione: q, mq, canone } = dati;
  if (!q || !(q.min > 0) || !(q.max >= q.min)) return null;
  if (typeof mq !== "number" || !Number.isFinite(mq) || mq <= 0) return null;
  if (typeof canone !== "number" || !Number.isFinite(canone) || canone <= 0) return null;

  const f = fattoreEnergia(dati.classe);
  const minimo = arrotonda10(q.min * mq * f);
  const massimo = arrotonda10(q.max * mq * f);

  let fascia: Fascia = "in_linea";
  let scostamentoPct = 0;
  if (canone < minimo * (1 - TOLLERANZA)) {
    fascia = "sotto";
    scostamentoPct = Math.round(((minimo - canone) / minimo) * 100);
  } else if (canone > massimo * (1 + TOLLERANZA)) {
    fascia = "sopra";
    scostamentoPct = Math.round(((canone - massimo) / massimo) * 100);
  }

  const intervallo = `tra ${euro(minimo)} e ${euro(massimo)} € al mese`;
  const testo =
    fascia === "in_linea"
      ? `Il canone è in linea con la zona: per ${mq} m² un affitto tipico sta ${intervallo}.`
      : fascia === "sotto"
        ? `Il canone è sotto la fascia tipica della zona (${intervallo} per ${mq} m²): potresti chiedere di più.`
        : `Il canone è sopra la fascia tipica della zona (${intervallo} per ${mq} m²): potresti ricevere meno candidature.`;

  const energia = classeValida(dati.classe) && f !== 1 ? ` · classe energetica ${dati.classe} (${f > 1 ? "+" : "−"}${Math.round(Math.abs(f - 1) * 100)}%)` : "";
  const dettaglio = `${q.fonte} · ${euro(q.min)}–${euro(q.max)} € al m² al mese · ${q.aggiornamento}${energia}`;

  return { fascia, minimo, massimo, fattoreEnergia: f, scostamentoPct, testo, dettaglio, provvisorio: q.origine === "provvisoria" || (COEFFICIENTI_ENERGIA_PROVVISORI && f !== 1) };
}

export const AVVISO_INDICATIVO = "È un'indicazione, non una valutazione: il canone lo decidi tu.";
export const AVVISO_DATI_DI_PROVA = "Quotazioni di prova: non sono dati reali. Serviranno quelle dell'Agenzia delle Entrate (OMI).";
export const SENZA_QUOTAZIONE = "Per questa zona non ho ancora una quotazione.";
export const SENZA_DATI = "Indica canone e metri quadri per vedere il consiglio sul prezzo.";
