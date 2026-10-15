import { calcolaMatchInquilino } from "./inquilino";
import { campiMatchDaRiga, haCriteriDiRicerca, profiloRicercaDaRighe, type RigaInteresse, type RigaRicerca, type RigaZona } from "./mazzo";
import type { MappaLuoghi } from "../luoghi";
import type { AnnuncioPerMatch, ProfiloRicerca } from "./tipi";

/**
 * «Possibili inquilini»: QUANTI inquilini hanno una ricerca che combacia con un immobile, e non si sono (ancora) candidati.
 *
 * È un NUMERO, mai un elenco: l'identificativo di chi cerca serve solo qui dentro, per non contare chi si è già candidato,
 * e non esce da questa funzione. Il proprietario non vede chi sono (non c'è un consenso a farsi trovare): vede quanti sono.
 *
 * «Combacia» ha lo stesso significato della Home dell'inquilino, «in linea con la tua ricerca»: la casa rispetta TUTTI i
 * criteri (budget, zona, locali, metratura, tipologia, caratteristiche necessarie). Chi non ha impostato nessun criterio non
 * conta: con una ricerca vuota ogni casa avrebbe il punteggio pieno, e il numero non direbbe niente.
 */
export type RicercaInquilino = {
  /** serve solo a non contare chi si è già candidato: non esce mai da qui */
  tenantId: string;
  riga: RigaRicerca;
  zone: RigaZona[];
  interessi: RigaInteresse[];
};

export type AnnuncioDaConfrontare = { id: string; annuncio: AnnuncioPerMatch };

/** Dalla riga di un annuncio del database all'annuncio da confrontare con le ricerche (con i luoghi che lo contengono). */
export function annuncioDaRiga(
  l: {
    id: string;
    prezzo: number;
    zona: string;
    locali?: number | null;
    mq?: number | null;
    attributi?: Record<string, boolean> | null;
    luogo_id?: string | null;
    tipologia?: string | null;
    bagni?: number | null;
    piano?: number | null;
    riscaldamento?: string | null;
    tipo_contratto?: string | null;
    disponibile_dal?: string | null;
    classe_energetica?: string | null;
  },
  mappa: MappaLuoghi
): AnnuncioDaConfrontare {
  return {
    id: l.id,
    annuncio: { prezzo: l.prezzo, zona: l.zona, locali: l.locali ?? null, mq: l.mq ?? null, attributi: l.attributi ?? null, ...campiMatchDaRiga(l, mappa) },
  };
}

export function contaPossibiliInquilini(input: {
  annunci: readonly AnnuncioDaConfrontare[];
  ricerche: readonly RicercaInquilino[];
  /** per ogni annuncio, chi si è già candidato (non è un «possibile»: è una candidatura) */
  giaCandidati: ReadonlyMap<string, ReadonlySet<string>>;
}): Map<string, number> {
  // il profilo di ogni inquilino si costruisce una volta sola, e si scartano le ricerche vuote
  const profili: { tenantId: string; profilo: ProfiloRicerca }[] = [];
  for (const r of input.ricerche) {
    if (!r || typeof r.tenantId !== "string") continue;
    const profilo = profiloRicercaDaRighe(r.riga, r.zone, r.interessi);
    if (haCriteriDiRicerca(profilo)) profili.push({ tenantId: r.tenantId, profilo });
  }

  const conteggi = new Map<string, number>();
  for (const { id, annuncio } of input.annunci) {
    const candidati = input.giaCandidati.get(id);
    let n = 0;
    for (const { tenantId, profilo } of profili) {
      if (candidati?.has(tenantId)) continue;
      if (calcolaMatchInquilino(annuncio, profilo).fascia === "in_ricerca") n++;
    }
    conteggi.set(id, n);
  }
  return conteggi;
}
