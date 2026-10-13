import {
  CURVA_BUDGET,
  PENALITA,
  PESI_INQUILINO,
  PESI_INQUILINO_SENZA_CARATTERISTICHE,
  PUNTI_DATO_MANCANTE,
  TOLLERANZA_BUDGET,
} from "./config";
import { etichettaPer, euro, limita } from "./comuni";
import { criteriDaInteressi, normalizzaCriteriRicerca, valutaCriterio } from "./criteri-ricerca";
import type {
  AnnuncioPerMatch,
  Fascia,
  MotivoEsclusione,
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
 *  - caratteristica sì/no non spuntata nell'annuncio: considerata assente.
 *    Non si distingue "assente" da "non compilata" perché il database
 *    non conserva la differenza;
 *  - caratteristica CON VALORE (bagni, piano…) che l'annuncio non indica:
 *    punti neutri e un avviso; se era NECESSARIA la casa resta ma "oltre
 *    la ricerca", segnata (mai data per buona, mai nascosta per una
 *    dimenticanza del proprietario).
 *
 * Una caratteristica NECESSARIA che l'annuncio non rispetta lo fa
 * SPARIRE dal mazzo (fascia `escluso`, motivo `necessaria`). Anche una
 * tipologia diversa da quella cercata lo esclude.
 */
export function calcolaMatchInquilino(
  annuncio: AnnuncioPerMatch,
  profilo: ProfiloRicerca
): RisultatoInquilino {
  // Se c'è l'elenco nuovo è l'unico che si legge; altrimenti i vecchi interessi, tutti opzionali e sì/no.
  const caratteristiche = profilo.criteri !== undefined ? normalizzaCriteriRicerca(profilo.criteri) : criteriDaInteressi(profilo.interessi);
  const haCaratteristiche = caratteristiche.some((c) => !c.necessaria);
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
  const motiviEsclusione: MotivoEsclusione[] = [];
  const escludi = (m: MotivoEsclusione) => {
    escluso = true;
    if (!motiviEsclusione.includes(m)) motiviEsclusione.push(m);
  };

  // ---------------- Tipologia: un filtro netto ----------------
  if (profilo.tipologia != null && (annuncio.tipologia ?? "appartamento") !== profilo.tipologia) escludi("tipologia");

  // ---------------- Budget ----------------
  const bMin = profilo.budgetMin ?? null;
  const etichettaBudget =
    profilo.budgetMax === null
      ? bMin === null
        ? "Budget"
        : `Budget da ${euro(bMin)}`
      : bMin === null
        ? `Budget ${euro(profilo.budgetMax)}`
        : `Budget ${euro(bMin)} – ${euro(profilo.budgetMax)}`;
  if (profilo.budgetMax === null && bMin === null) {
    punti += W.budget;
  } else if (bMin !== null && annuncio.prezzo < bMin) {
    // sotto il minimo: la casa resta, ma oltre la ricerca
    punti += W.budget * PENALITA.budgetSottoMinimo;
    fuoriRicerca = true;
    motivi.push("Sotto il tuo budget minimo");
    criteri.push({ chiave: "budget", etichetta: etichettaBudget, stato: "no", dettaglio: `${euro(annuncio.prezzo)} al mese` });
  } else if (profilo.budgetMax === null) {
    punti += W.budget;
    criteri.push({ chiave: "budget", etichetta: etichettaBudget, stato: "ok", dettaglio: `${euro(annuncio.prezzo)} al mese` });
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
        escludi("budget");
      }
    }

    criteri.push({
      chiave: "budget",
      etichetta: etichettaBudget,
      stato: p <= B ? "ok" : "no",
      dettaglio: `${euro(p)} al mese`,
    });
  }

  // ---------------- Zona ----------------
  const luoghiScelti = profilo.luoghi ?? [];
  const antenatiAnnuncio = annuncio.antenati ?? [];
  if (luoghiScelti.length > 0 && antenatiAnnuncio.length === 0 && profilo.zone.length === 0) {
    // si cerca in certi luoghi ma l'annuncio non è collegato a nessun luogo: non si può dire né sì né no
    punti += W.zona * PUNTI_DATO_MANCANTE;
    avvisi.push("Zona dell'annuncio non riconosciuta");
    criteri.push({ chiave: "zona", etichetta: "Zona preferita", stato: "non_indicato" });
  } else if (luoghiScelti.length === 0 && profilo.zone.length === 0) {
    punti += W.zona;
  } else if (
    luoghiScelti.length > 0 && antenatiAnnuncio.length > 0
      ? luoghiScelti.some((id) => antenatiAnnuncio.includes(id))
      : profilo.zone.includes(annuncio.zona)
  ) {
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
  const lMin = profilo.localiMin;
  const lMax = profilo.localiMax ?? null;
  const etichettaLocali =
    lMax === null ? `${lMin}+ locali` : lMin === null ? `fino a ${lMax} locali` : lMin === lMax ? `${lMin} locali` : `${lMin}–${lMax} locali`;
  if (lMin === null && lMax === null) {
    punti += W.locali;
  } else if (annuncio.locali === null) {
    punti += W.locali * PUNTI_DATO_MANCANTE;
    avvisi.push("Numero di locali non indicato dal proprietario");
    criteri.push({ chiave: "locali", etichetta: etichettaLocali, stato: "non_indicato" });
  } else if (lMin !== null && annuncio.locali < lMin) {
    punti += W.locali * PENALITA.localiSotto;
    fuoriRicerca = true;
    motivi.push("Meno locali del tuo minimo");
    criteri.push({ chiave: "locali", etichetta: etichettaLocali, stato: "no", dettaglio: `${annuncio.locali} locali` });
  } else if (lMax !== null && annuncio.locali > lMax) {
    punti += W.locali * PENALITA.localiSopra;
    fuoriRicerca = true;
    motivi.push("Più locali del tuo massimo");
    criteri.push({ chiave: "locali", etichetta: etichettaLocali, stato: "no", dettaglio: `${annuncio.locali} locali` });
  } else {
    punti += W.locali;
    criteri.push({ chiave: "locali", etichetta: etichettaLocali, stato: "ok" });
  }

  // ---------------- Metratura ----------------
  const qMin = profilo.mqMin;
  const qMax = profilo.mqMax ?? null;
  const etichettaMq = qMax === null ? `${qMin}+ m²` : qMin === null ? `fino a ${qMax} m²` : `${qMin}–${qMax} m²`;
  if (qMin === null && qMax === null) {
    punti += W.mq;
  } else if (annuncio.mq === null) {
    punti += W.mq * PUNTI_DATO_MANCANTE;
    avvisi.push("Metratura non indicata dal proprietario");
    criteri.push({ chiave: "mq", etichetta: etichettaMq, stato: "non_indicato" });
  } else if (qMin !== null && annuncio.mq < qMin) {
    const rapporto = annuncio.mq / qMin;
    punti += Math.max(0, W.mq * rapporto - W.mq * PENALITA.mqSottoDetrazione);
    fuoriRicerca = true;
    motivi.push("Sotto la tua metratura minima");
    criteri.push({ chiave: "mq", etichetta: etichettaMq, stato: "no", dettaglio: `${annuncio.mq} m²` });
  } else if (qMax !== null && annuncio.mq > qMax) {
    punti += W.mq * PENALITA.mqSopra;
    fuoriRicerca = true;
    motivi.push("Sopra la tua metratura massima");
    criteri.push({ chiave: "mq", etichetta: etichettaMq, stato: "no", dettaglio: `${annuncio.mq} m²` });
  } else {
    punti += W.mq;
    criteri.push({ chiave: "mq", etichetta: etichettaMq, stato: "ok" });
  }

  // ---------------- Caratteristiche ----------------
  // Le necessarie non danno punti: sono un cancello (non rispettata = la casa sparisce). Le opzionali pesano.
  const totalePesi = caratteristiche.filter((c) => !c.necessaria).reduce((somma, c) => somma + c.peso, 0);
  let ottenuto = 0;
  for (const c of caratteristiche) {
    const v = valutaCriterio(c, annuncio);
    criteri.push({
      chiave: c.chiave,
      etichetta: v.etichetta,
      stato: v.stato,
      ...(v.dettaglio ? { dettaglio: v.dettaglio } : {}),
      ...(c.necessaria ? { obbligatorio: true } : {}),
    });
    if (c.necessaria) {
      if (v.stato === "no") escludi("necessaria");
      else if (v.stato === "non_indicato") {
        // il proprietario non l'ha indicato: non si nasconde la casa, ma non si dà per buona
        fuoriRicerca = true;
        motivi.push(`${v.etichetta}: non indicato dal proprietario`);
        avvisi.push(`${v.etichetta}: dato non indicato dal proprietario`);
      }
    } else if (v.stato === "ok") ottenuto += c.peso;
    else if (v.stato === "non_indicato") {
      ottenuto += c.peso * PUNTI_DATO_MANCANTE;
      avvisi.push(`${v.etichetta}: dato non indicato dal proprietario`);
    }
  }
  if (haCaratteristiche && totalePesi > 0) punti += W.caratteristiche * (ottenuto / totalePesi);

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
    motiviEsclusione,
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
