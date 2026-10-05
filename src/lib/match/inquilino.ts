import { ATTR_VOCAB } from "../constants";
import {
  CURVA_BUDGET,
  PENALITA,
  PESI_INQUILINO,
  PESI_INQUILINO_SENZA_CARATTERISTICHE,
  PUNTI_DATO_MANCANTE,
  TOLLERANZA_BUDGET,
} from "./config";
import { etichettaPer, euro, limita } from "./comuni";
import type {
  AnnuncioPerMatch,
  Fascia,
  ProfiloRicerca,
  RisultatoInquilino,
  VoceCriterio,
} from "./tipi";

// Margine per i confronti sui numeri in virgola mobile (es. 1650 contro
// 1500 * 1,10, che in floating point vale 1650,0000000000002).
const EPS = 1e-9;

/**
 * Quanto una casa va bene a un inquilino.
 *
 * Funzione pura: non legge né scrive nel database. Cinque componenti
 * pesati (budget, zona, locali, metratura, caratteristiche), una
 * fascia che decide DOVE compare l'annuncio nel mazzo, e una
 * spiegazione voce per voce.
 *
 * Regole sui dati mancanti:
 *  - criterio non impostato dall'inquilino (budget, zone, minimi
 *    vuoti): nessuna preferenza, punti pieni;
 *  - dato mancante nell'ANNUNCIO (locali, metratura): punti neutri e un
 *    avviso, senza cambiare fascia. L'inquilino non può compilare
 *    l'annuncio e non va punito;
 *  - caratteristica non spuntata nell'annuncio: considerata assente.
 *    Non si distingue "assente" da "non compilata" perché il database
 *    non conserva la differenza.
 */
export function calcolaMatchInquilino(
  annuncio: AnnuncioPerMatch,
  profilo: ProfiloRicerca
): RisultatoInquilino {
  const interessi = profilo.interessi ?? {};
  const chiaviInteressi = Object.keys(interessi);
  const haCaratteristiche = chiaviInteressi.length > 0;
  const W = haCaratteristiche
    ? PESI_INQUILINO
    : PESI_INQUILINO_SENZA_CARATTERISTICHE;

  let punti = 0;
  let fuoriRicerca = false;
  let escluso = false;
  let sforoBudgetPct: number | null = null;
  const criteri: VoceCriterio[] = [];
  const motivi: string[] = [];
  const avvisi: string[] = [];

  // ---------------- Budget ----------------
  if (profilo.budgetMax === null) {
    punti += W.budget;
  } else {
    const B = profilo.budgetMax;
    const p = annuncio.prezzo;

    if (p <= B) {
      const margine = (B - p) / B;
      punti += W.budget * Math.min(1, CURVA_BUDGET.puntiAlBudget + margine);
    } else {
      const sforo = (p - B) / B;
      punti +=
        W.budget *
        CURVA_BUDGET.puntiAlBudget *
        Math.max(0, 1 - sforo / CURVA_BUDGET.sforoAZero);

      const pct = Math.max(1, Math.round(sforo * 100));
      sforoBudgetPct = pct;
      if (sforo <= TOLLERANZA_BUDGET + EPS) {
        fuoriRicerca = true;
        motivi.push(`Oltre il tuo budget del ${pct}%`);
      } else {
        escluso = true;
      }
    }

    criteri.push({
      chiave: "budget",
      etichetta: `Budget ${euro(B)}`,
      stato: p <= B ? "ok" : "no",
      dettaglio: `${euro(p)} al mese`,
    });
  }

  // ---------------- Zona ----------------
  if (profilo.zone.length === 0) {
    punti += W.zona;
  } else if (profilo.zone.includes(annuncio.zona)) {
    punti += W.zona;
    criteri.push({ chiave: "zona", etichetta: "Zona preferita", stato: "ok" });
  } else {
    punti += W.zona * PENALITA.zonaFuori;
    fuoriRicerca = true;
    motivi.push("Fuori dalle tue zone");
    criteri.push({
      chiave: "zona",
      etichetta: "Zona preferita",
      stato: "no",
      dettaglio: annuncio.zona,
    });
  }

  // ---------------- Locali ----------------
  if (profilo.localiMin === null) {
    punti += W.locali;
  } else if (annuncio.locali === null) {
    punti += W.locali * PUNTI_DATO_MANCANTE;
    avvisi.push("Numero di locali non indicato dal proprietario");
    criteri.push({
      chiave: "locali",
      etichetta: `${profilo.localiMin}+ locali`,
      stato: "non_indicato",
    });
  } else if (annuncio.locali >= profilo.localiMin) {
    punti += W.locali;
    criteri.push({
      chiave: "locali",
      etichetta: `${profilo.localiMin}+ locali`,
      stato: "ok",
    });
  } else {
    punti += W.locali * PENALITA.localiSotto;
    fuoriRicerca = true;
    motivi.push("Meno locali del tuo minimo");
    criteri.push({
      chiave: "locali",
      etichetta: `${profilo.localiMin}+ locali`,
      stato: "no",
      dettaglio: `${annuncio.locali} locali`,
    });
  }

  // ---------------- Metratura ----------------
  if (profilo.mqMin === null) {
    punti += W.mq;
  } else if (annuncio.mq === null) {
    punti += W.mq * PUNTI_DATO_MANCANTE;
    avvisi.push("Metratura non indicata dal proprietario");
    criteri.push({
      chiave: "mq",
      etichetta: `${profilo.mqMin}+ m²`,
      stato: "non_indicato",
    });
  } else if (annuncio.mq >= profilo.mqMin) {
    punti += W.mq;
    criteri.push({
      chiave: "mq",
      etichetta: `${profilo.mqMin}+ m²`,
      stato: "ok",
    });
  } else {
    const rapporto = annuncio.mq / profilo.mqMin;
    punti += Math.max(
      0,
      W.mq * rapporto - W.mq * PENALITA.mqSottoDetrazione
    );
    fuoriRicerca = true;
    motivi.push("Sotto la tua metratura minima");
    criteri.push({
      chiave: "mq",
      etichetta: `${profilo.mqMin}+ m²`,
      stato: "no",
      dettaglio: `${annuncio.mq} m²`,
    });
  }

  // ---------------- Caratteristiche ----------------
  if (haCaratteristiche) {
    const attributi = annuncio.attributi ?? {};
    const totale = chiaviInteressi.reduce((s, k) => s + interessi[k], 0);
    let ottenuto = 0;

    // prima nell'ordine del vocabolario, poi eventuali chiavi sconosciute
    const ordinate = [
      ...ATTR_VOCAB.map((a) => a.key as string).filter((k) =>
        chiaviInteressi.includes(k)
      ),
      ...chiaviInteressi.filter(
        (k) => !ATTR_VOCAB.some((a) => (a.key as string) === k)
      ),
    ];

    for (const k of ordinate) {
      const presente = !!attributi[k];
      if (presente) ottenuto += interessi[k];
      criteri.push({
        chiave: k,
        etichetta: ATTR_VOCAB.find((a) => a.key === k)?.label ?? k,
        stato: presente ? "ok" : "no",
      });
    }
    if (totale > 0) punti += W.caratteristiche * (ottenuto / totale);
  }

  const punteggio = limita(punti);
  const fascia: Fascia = escluso
    ? "escluso"
    : fuoriRicerca
      ? "oltre_ricerca"
      : "in_ricerca";

  return {
    punteggio,
    etichetta: etichettaPer(punteggio),
    fascia,
    sforoBudgetPct,
    criteri,
    motivi,
    avvisi,
  };
}

/**
 * Prepara il mazzo: toglie gli esclusi e ordina per fascia (prima gli
 * annunci in ricerca, poi gli altri), e dentro ogni fascia per
 * percentuale decrescente. A parità l'ordine di arrivo resta invariato.
 */
export function ordinaAnnunci<T extends { match: RisultatoInquilino }>(
  voci: T[]
): T[] {
  const ordineFascia: Record<Fascia, number> = {
    in_ricerca: 0,
    oltre_ricerca: 1,
    escluso: 2,
  };

  return voci
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => v.match.fascia !== "escluso")
    .sort(
      (a, b) =>
        ordineFascia[a.v.match.fascia] - ordineFascia[b.v.match.fascia] ||
        b.v.match.punteggio - a.v.match.punteggio ||
        a.i - b.i
    )
    .map(({ v }) => v);
}
