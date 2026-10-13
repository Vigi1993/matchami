/**
 * Le caratteristiche cercate: quali esistono, come si controllano i valori che arrivano da fuori e come si
 * valutano su un annuncio. Logica pura, nessun database.
 *
 * Due tipi: sì/no (balcone, ascensore, animali ammessi…) e CON VALORE (bagni, piano, riscaldamento, tipo di contratto,
 * data di ingresso, classe energetica minima). Ognuna è `necessaria` (se la casa non la rispetta sparisce) o opzionale
 * (pesa sul punteggio).
 */
import { ATTR_VOCAB, RISCALDAMENTI, TIPI_CONTRATTO } from "../constants";
import { CLASSI_ENERGETICHE } from "../annunci/energia";
import type { AnnuncioPerMatch, ChiaveConValore, CriterioRicerca, StatoCriterio, ValoreCriterio } from "./tipi";

/** In quest'ordine compaiono nella spiegazione e nella scheda. */
export const CHIAVI_CON_VALORE: readonly ChiaveConValore[] = ["bagni", "piano", "riscaldamento", "contratto", "ingresso", "classeEnergetica"];

export const ETICHETTE_CON_VALORE: Record<ChiaveConValore, string> = {
  bagni: "Bagni",
  piano: "Piano",
  riscaldamento: "Riscaldamento",
  contratto: "Tipo di contratto",
  ingresso: "Quando ti serve la casa",
  classeEnergetica: "Classe energetica",
};

export const LIMITI_CRITERI = { bagni: { min: 1, max: 6 }, piano: { min: -2, max: 60 }, maxCriteri: 40 } as const;

export function haValore(chiave: string): chiave is ChiaveConValore {
  return (CHIAVI_CON_VALORE as readonly string[]).includes(chiave);
}

const CHIAVE = /^[A-Za-z][A-Za-z0-9]{1,30}$/;
const intero = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

/** Una data AAAA-MM-GG che esiste davvero (non il 31 febbraio). */
export function dataValida(x: unknown): x is string {
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const d = new Date(`${x}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === x;
}

function sottoinsieme(x: unknown, ammessi: readonly { id: string }[]): string[] | null {
  if (!Array.isArray(x)) return null;
  const ids = ammessi.map((a) => a.id);
  const scelti = [...new Set(x.filter((v): v is string => typeof v === "string" && ids.includes(v)))];
  return scelti.length > 0 ? scelti : null;
}

/** Il valore di un criterio con valore, ripulito; `null` se non è valido. */
export function valoreValido(chiave: ChiaveConValore, v: unknown): ValoreCriterio | null {
  if (v === null || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  switch (chiave) {
    case "bagni":
      return intero(o.min) && o.min >= LIMITI_CRITERI.bagni.min && o.min <= LIMITI_CRITERI.bagni.max ? { min: o.min } : null;
    case "piano": {
      const min = o.min ?? null;
      const max = o.max ?? null;
      const ok = (n: unknown) => n === null || (intero(n) && n >= LIMITI_CRITERI.piano.min && n <= LIMITI_CRITERI.piano.max);
      if (!ok(min) || !ok(max) || (min === null && max === null)) return null;
      if (min !== null && max !== null && (min as number) > (max as number)) return null;
      return { min: min as number | null, max: max as number | null };
    }
    case "riscaldamento": {
      const tipi = sottoinsieme(o.tipi, RISCALDAMENTI);
      return tipi ? { tipi } : null;
    }
    case "contratto": {
      const tipi = sottoinsieme(o.tipi, TIPI_CONTRATTO);
      return tipi ? { tipi } : null;
    }
    case "ingresso":
      return dataValida(o.entro) ? { entro: o.entro } : null;
    case "classeEnergetica":
      return typeof o.classe === "string" && (CLASSI_ENERGETICHE as readonly string[]).includes(o.classe) ? { classe: o.classe } : null;
  }
}

/** Un criterio che arriva da fuori (database, modulo): ripulito, oppure `null` se non si può usare. */
export function normalizzaCriterioRicerca(c: unknown): CriterioRicerca | null {
  if (c === null || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  if (typeof o.chiave !== "string" || !CHIAVE.test(o.chiave)) return null;
  const necessaria = o.necessaria === true;
  const pesoGrezzo = typeof o.peso === "number" && Number.isFinite(o.peso) ? Math.round(o.peso) : 5;
  const peso = Math.max(1, Math.min(10, pesoGrezzo));
  if (haValore(o.chiave)) {
    const valore = valoreValido(o.chiave, o.valore);
    return valore ? { chiave: o.chiave, necessaria, peso, valore } : null;
  }
  return { chiave: o.chiave, necessaria, peso, valore: null };
}

/** L'elenco ripulito: senza voci rotte né doppioni (vince la prima), nell'ordine in cui si leggono. */
export function normalizzaCriteriRicerca(lista: unknown): CriterioRicerca[] {
  if (!Array.isArray(lista)) return [];
  const viste = new Set<string>();
  const fuori: CriterioRicerca[] = [];
  for (const x of lista) {
    const c = normalizzaCriterioRicerca(x);
    if (c && !viste.has(c.chiave)) {
      viste.add(c.chiave);
      fuori.push(c);
    }
  }
  return ordinaCriteri(fuori).slice(0, LIMITI_CRITERI.maxCriteri);
}

/** Prima i sì/no nell'ordine del vocabolario, poi quelli sconosciuti, poi quelli con valore. */
export function ordinaCriteri(lista: readonly CriterioRicerca[]): CriterioRicerca[] {
  const conosciute = ATTR_VOCAB.map((a) => a.key as string);
  const booleani = lista.filter((c) => !haValore(c.chiave));
  return [
    ...conosciute.flatMap((k) => booleani.filter((c) => c.chiave === k)),
    ...booleani.filter((c) => !conosciute.includes(c.chiave)),
    ...CHIAVI_CON_VALORE.flatMap((k) => lista.filter((c) => c.chiave === k)),
  ];
}

/** Dall'elenco vecchio (chiave → peso) ai criteri: tutti opzionali e sì/no. */
export function criteriDaInteressi(interessi: Record<string, number> | null | undefined): CriterioRicerca[] {
  return ordinaCriteri(Object.entries(interessi ?? {}).map(([chiave, peso]) => ({ chiave, necessaria: false, peso, valore: null })));
}

// ------------------------------------------------------------ come si leggono

const nomePiano = (n: number) => (n === 0 ? "terra" : n < 0 ? "seminterrato" : `${n}°`);
const nomi = (ids: readonly string[], elenco: readonly { id: string; label: string }[]) =>
  ids.map((id) => elenco.find((e) => e.id === id)?.label ?? id);
export function dataInItaliano(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** «Almeno 2 bagni», «Riscaldamento autonomo o centralizzato», «Balcone»… */
export function etichettaCriterio(c: CriterioRicerca): string {
  const v = c.valore ?? {};
  switch (c.chiave) {
    case "bagni":
      return `Almeno ${v.min} ${v.min === 1 ? "bagno" : "bagni"}`;
    case "piano": {
      const min = v.min ?? null;
      const max = v.max ?? null;
      if (min !== null && max !== null) return min === max ? `Piano ${nomePiano(min)}` : `Piano da ${nomePiano(min)} a ${nomePiano(max)}`;
      return min !== null ? `Dal piano ${nomePiano(min)}` : `Fino al piano ${nomePiano(max as number)}`;
    }
    case "riscaldamento":
      return `Riscaldamento ${nomi(v.tipi ?? [], RISCALDAMENTI).join(" o ").toLowerCase()}`;
    case "contratto":
      return `Contratto ${nomi(v.tipi ?? [], TIPI_CONTRATTO).join(" o ")}`;
    case "ingresso":
      return `Disponibile entro il ${dataInItaliano(v.entro as string)}`;
    case "classeEnergetica":
      return `Classe energetica almeno ${v.classe}`;
    default:
      return ATTR_VOCAB.find((a) => a.key === c.chiave)?.label ?? c.chiave;
  }
}

type DatiAnnuncio = Pick<AnnuncioPerMatch, "attributi" | "bagni" | "piano" | "riscaldamento" | "tipoContratto" | "disponibileDal" | "classeEnergetica">;

/**
 * Come va la casa su un criterio.
 *  - sì/no: presente (ok) o no. Il database non distingue «assente» da «non compilato».
 *  - con valore: `non_indicato` se l'annuncio non ha il dato (il proprietario non l'ha compilato: non si punisce
 *    l'inquilino, ma non si dà per buona).
 */
export function valutaCriterio(c: CriterioRicerca, a: DatiAnnuncio): { stato: StatoCriterio; etichetta: string; dettaglio?: string } {
  const etichetta = etichettaCriterio(c);
  const v = c.valore ?? {};
  const esito = (ok: boolean, dettaglio?: string) => ({ stato: (ok ? "ok" : "no") as StatoCriterio, etichetta, dettaglio });
  const manca = { stato: "non_indicato" as StatoCriterio, etichetta };

  switch (c.chiave) {
    case "bagni":
      return a.bagni == null ? manca : esito(a.bagni >= (v.min as number), `${a.bagni} ${a.bagni === 1 ? "bagno" : "bagni"}`);
    case "piano": {
      if (a.piano == null) return manca;
      const ok = (v.min == null || a.piano >= v.min) && (v.max == null || a.piano <= v.max);
      return esito(ok, `Piano ${nomePiano(a.piano)}`);
    }
    case "riscaldamento":
      return a.riscaldamento == null ? manca : esito((v.tipi ?? []).includes(a.riscaldamento), nomi([a.riscaldamento], RISCALDAMENTI)[0]);
    case "contratto":
      return a.tipoContratto == null ? manca : esito((v.tipi ?? []).includes(a.tipoContratto), nomi([a.tipoContratto], TIPI_CONTRATTO)[0]);
    case "ingresso":
      return a.disponibileDal == null ? manca : esito(a.disponibileDal <= (v.entro as string), `Dal ${dataInItaliano(a.disponibileDal)}`);
    case "classeEnergetica": {
      if (a.classeEnergetica == null) return manca;
      const classi = CLASSI_ENERGETICHE as readonly string[];
      const sua = classi.indexOf(a.classeEnergetica);
      return sua < 0 ? manca : esito(sua <= classi.indexOf(v.classe as string), `Classe ${a.classeEnergetica}`);
    }
    default:
      return { stato: (a.attributi ?? {})[c.chiave] ? "ok" : "no", etichetta };
  }
}
