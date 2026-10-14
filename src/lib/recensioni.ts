/**
 * Le recensioni dei proprietari su un inquilino: stelle intere da 1 a 5, e la loro media. Stanno A PARTE rispetto al
 * punteggio di affidabilità: chi legge vede i due numeri affiancati.
 *
 * Si mostra SEMPRE anche quante sono («4,5 su 5 · 3 recensioni»): una sola recensione non è come dieci.
 */
export type RiepilogoRecensioni = {
  numero: number;
  /** la media arrotondata a un decimale; `null` se non ci sono recensioni */
  media: number | null;
};

export const VOTO_MINIMO = 1;
export const VOTO_MASSIMO = 5;

const votoValido = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= VOTO_MINIMO && v <= VOTO_MASSIMO;

/** Dai voti (le righe del database) al riepilogo. I valori che non sono stelle da 1 a 5 si ignorano. */
export function riepilogoRecensioni(voti: readonly unknown[] | null | undefined): RiepilogoRecensioni {
  const validi = (voti ?? []).filter(votoValido);
  if (validi.length === 0) return { numero: 0, media: null };
  const media = validi.reduce((somma, v) => somma + v, 0) / validi.length;
  return { numero: validi.length, media: Math.round(media * 10) / 10 };
}

const unDecimale = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** «4,5 su 5 · 3 recensioni», «5,0 su 5 · 1 recensione», «Nessuna recensione ancora». */
export function testoRecensioni(r: RiepilogoRecensioni): string {
  if (r.numero <= 0 || r.media === null) return "Nessuna recensione ancora";
  return `${unDecimale(r.media)} su 5 · ${r.numero} ${r.numero === 1 ? "recensione" : "recensioni"}`;
}

/** Le stelle da disegnare: «★★★★☆» (la media si arrotonda alla stella intera più vicina). */
export function stelleTesto(media: number | null): string {
  if (media === null || !Number.isFinite(media)) return "☆☆☆☆☆";
  const piene = Math.max(0, Math.min(VOTO_MASSIMO, Math.round(media)));
  return "★".repeat(piene) + "☆".repeat(VOTO_MASSIMO - piene);
}

/** Rilegge un riepilogo salvato (per esempio nella fotografia di una valutazione): `null` se la forma non è giusta. */
export function leggiRiepilogo(x: unknown): RiepilogoRecensioni | null {
  if (typeof x !== "object" || x === null) return null;
  const { numero, media } = x as Record<string, unknown>;
  if (typeof numero !== "number" || !Number.isInteger(numero) || numero < 0) return null;
  if (numero === 0) return media === null ? { numero: 0, media: null } : null;
  if (typeof media !== "number" || !Number.isFinite(media) || media < VOTO_MINIMO || media > VOTO_MASSIMO) return null;
  return { numero, media };
}
