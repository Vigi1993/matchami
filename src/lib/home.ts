/**
 * Piccole regole della Home dell'inquilino, pure e senza rete: la ricerca in una riga, la chiave che dice quando
 * il mazzo va ricominciato, i testi del pannello in alto e il suggerimento sotto la card.
 */
import type { ProfiloRicerca } from "@/lib/match";

type RicercaMinima = Pick<ProfiloRicerca, "budgetMax" | "localiMin" | "mqMin" | "zone"> &
  Partial<Pick<ProfiloRicerca, "budgetMin" | "localiMax" | "mqMax" | "tipologia" | "criteri">>;

/** Le sezioni del Profilo che si possono aprire da un collegamento (?apri=...). */
export const SEZIONI_PROFILO_APRIBILI = ["affidabilita", "dati", "ricerca", "invito", "affitti", "verifica"] as const;
export type SezioneProfilo = (typeof SEZIONI_PROFILO_APRIBILI)[number];

/** Il valore di un parametro dell'indirizzo, se è una sezione ammessa: altrimenti niente (mai un valore arbitrario). */
export function sezioneProfilo(valore: unknown): SezioneProfilo | null {
  const v = Array.isArray(valore) ? valore[0] : valore;
  return typeof v === "string" && (SEZIONI_PROFILO_APRIBILI as readonly string[]).includes(v) ? (v as SezioneProfilo) : null;
}

/** Dove si va per completare una voce del punteggio. */
export function sezionePerVoce(id: string): SezioneProfilo {
  if (id === "verifica") return "verifica";
  if (id === "recensioni") return "invito";
  return "dati";
}

/** Un intervallo in poche parole: «Da 2 locali», «2–3 locali», «Fino a 3 locali». */
function intervallo(min: number | null | undefined, max: number | null | undefined, unita: (n: number) => string, tra: (a: number, b: number) => string): string | null {
  if (min && max) return min === max ? unita(min) : tra(min, max);
  if (min) return `Da ${unita(min)}`;
  if (max) return `Fino a ${unita(max)}`;
  return null;
}

/** La ricerca in poche parole: tipologia, budget, taglio, zone e quante caratteristiche sono necessarie. Vuota senza criteri. */
export function vociRicerca(p: RicercaMinima): string[] {
  const voci: string[] = [];
  const e = (n: number) => `€${n.toLocaleString("it-IT")}`;
  if (p.tipologia === "villa") voci.push("Villa");
  if (p.budgetMin && p.budgetMax) voci.push(`${e(p.budgetMin)} – ${e(p.budgetMax)}`);
  else if (p.budgetMax) voci.push(`Fino a ${e(p.budgetMax)}`);
  else if (p.budgetMin) voci.push(`Da ${e(p.budgetMin)}`);
  const locali = intervallo(p.localiMin, p.localiMax, (n) => (n === 1 ? "1 locale" : `${n} locali`), (a, b) => `${a}–${b} locali`);
  if (locali) voci.push(locali);
  const mq = intervallo(p.mqMin, p.mqMax, (n) => `${n} m²`, (a, b) => `${a}–${b} m²`);
  if (mq) voci.push(mq);
  const zone = [...new Set((p.zone ?? []).map((z) => z.split(",")[0].trim()).filter(Boolean))];
  if (zone.length > 0) voci.push(zone.length <= 3 ? zone.join(", ") : `${zone.slice(0, 2).join(", ")} +${zone.length - 2}`);
  const necessarie = (p.criteri ?? []).filter((c) => c.necessaria).length;
  if (necessarie > 0) voci.push(necessarie === 1 ? "1 necessaria" : `${necessarie} necessarie`);
  return voci;
}

/**
 * Cambia se cambia un parametro della ricerca (e non per l'ordine delle zone). La Home congela il mazzo alla
 * prima visualizzazione: quando questa chiave cambia, il mazzo si ricomincia con quello nuovo.
 */
export function chiaveRicerca(
  p: Pick<ProfiloRicerca, "budgetMax" | "localiMin" | "mqMin" | "zone" | "interessi"> & Partial<Pick<ProfiloRicerca, "budgetMin" | "localiMax" | "mqMax" | "tipologia" | "luoghi" | "criteri">>
): string {
  const interessi = Object.entries(p.interessi ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const criteri = [...(p.criteri ?? [])].sort((a, b) => (a.chiave < b.chiave ? -1 : a.chiave > b.chiave ? 1 : 0));
  return JSON.stringify([
    p.budgetMax ?? null,
    p.localiMin ?? null,
    p.mqMin ?? null,
    [...new Set(p.zone ?? [])].sort(),
    interessi,
    p.budgetMin ?? null,
    p.localiMax ?? null,
    p.mqMax ?? null,
    p.tipologia ?? null,
    [...new Set(p.luoghi ?? [])].sort(),
    criteri,
  ]);
}

/** Il testo grande e quello piccolo del pannello sulle case. */
export function conteggioCase(i: { mostraMatch: boolean; inRicerca: number; oltre: number; totale: number }): { principale: string; secondario: string | null } {
  if (!i.mostraMatch) {
    return {
      principale: i.totale === 0 ? "Nessuna casa disponibile" : i.totale === 1 ? "1 casa disponibile" : `${i.totale} case disponibili`,
      secondario: "Imposta la ricerca per vedere quelle in linea con te",
    };
  }
  return {
    principale: i.inRicerca === 0 ? "Nessuna casa in linea con la tua ricerca" : i.inRicerca === 1 ? "1 casa in linea con la tua ricerca" : `${i.inRicerca} case in linea con la tua ricerca`,
    secondario: i.oltre > 0 ? `+ ${i.oltre} oltre la ricerca` : null,
  };
}

/** Il suggerimento sotto la card: le foto si cambiano toccando i lati; i dettagli hanno il loro pulsante. */
export function suggerimentoCard(numeroFoto: number): string {
  return numeroFoto > 1 ? "Tocca ai lati per le foto" : "Trascina per scegliere";
}

/** «3 case nascoste: non hanno le caratteristiche necessarie». `null` se non ce ne sono. */
export function testoNascoste(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  return n === 1 ? "1 casa nascosta: non ha le caratteristiche necessarie" : `${n} case nascoste: non hanno le caratteristiche necessarie`;
}
