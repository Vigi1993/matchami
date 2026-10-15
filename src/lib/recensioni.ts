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

// ============================================================ «Inquilino raccomandato»
/**
 * Il badge «Inquilino raccomandato»: si ottiene con almeno DUE recensioni positive da DUE proprietari DIVERSI, e nessuna
 * recensione negativa. Non cambia il punteggio di affidabilità (le recensioni restano a parte): dà visibilità ai proprietari.
 *
 *  - positiva: da 4 stelle in su; negativa: da 2 stelle in giù; 3 stelle è neutra (non toglie il badge, non conta per averlo);
 *  - conta chi ha scritto, non quante recensioni: due recensioni dello stesso proprietario (per due affitti) valgono una;
 *  - contano solo le recensioni degli ultimi ANNI_VALIDITA anni: col tempo il badge si perde se non si rinnova, e una
 *    recensione negativa vecchia smette di pesare;
 *  - basta UNA recensione negativa recente, di chiunque, per perderlo.
 */
export const VOTO_POSITIVO_MINIMO = 4;
export const VOTO_NEGATIVO_MASSIMO = 2;
export const AUTORI_DIVERSI_MINIMI = 2;
export const ANNI_VALIDITA = 4;
export const NOME_BADGE_RACCOMANDATO = "Inquilino raccomandato";

/** Una recensione come arriva dal database; ogni campo può mancare o essere rotto. */
export type RecensioneGrezza = { voto?: unknown; autore_id?: unknown; created_at?: unknown };

export type StatoRaccomandazione = {
  raccomandato: boolean;
  /** quanti proprietari diversi hanno scritto una recensione positiva (recente) */
  autoriPositivi: number;
  /** quanti ne mancano per il badge (0 se ci sei) */
  mancano: number;
  /** c'è una recensione negativa recente: finché c'è, il badge non si ha */
  negativa: boolean;
};

const MS_ANNO = 365.25 * 24 * 60 * 60 * 1000;

/** `ora` si può passare per provarla. Una data illeggibile o futura non esclude la recensione. */
export function statoRaccomandazione(righe: readonly RecensioneGrezza[] | null | undefined, ora: number = Date.now()): StatoRaccomandazione {
  const autori = new Set<string>();
  let negativa = false;
  // un valore che non è una lista (dati rotti) vale «nessuna recensione», non un errore
  for (const r of Array.isArray(righe) ? righe : []) {
    if (typeof r !== "object" || r === null || !votoValido(r.voto)) continue;
    const t = typeof r.created_at === "string" ? Date.parse(r.created_at) : NaN;
    if (!Number.isNaN(t) && ora - t > ANNI_VALIDITA * MS_ANNO) continue; // troppo vecchia: non conta, né in bene né in male
    if (r.voto <= VOTO_NEGATIVO_MASSIMO) negativa = true;
    else if (r.voto >= VOTO_POSITIVO_MINIMO && typeof r.autore_id === "string" && r.autore_id.trim() !== "") autori.add(r.autore_id);
  }
  const mancano = Math.max(0, AUTORI_DIVERSI_MINIMI - autori.size);
  return { raccomandato: !negativa && autori.size >= AUTORI_DIVERSI_MINIMI, autoriPositivi: autori.size, mancano, negativa };
}
