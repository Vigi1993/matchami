/**
 * La classe energetica (APE) di un immobile: i valori ammessi, la lettura
 * dell'indice di prestazione e il testo da mostrare. Logica pura, senza database.
 * Le regole sono quelle della migrazione 0026: un test le tiene allineate.
 */

/** Dalla migliore alla peggiore. */
export const CLASSI_ENERGETICHE = ["A4", "A3", "A2", "A1", "B", "C", "D", "E", "F", "G"] as const;
export type ClasseEnergetica = (typeof CLASSI_ENERGETICHE)[number];

export function classeValida(x: unknown): x is ClasseEnergetica {
  return typeof x === "string" && (CLASSI_ENERGETICHE as readonly string[]).includes(x);
}

/** kWh/m²·anno. Lo stesso intervallo del database. */
export const LIMITI_EP = { min: 0, max: 999.99 } as const;

export type EsitoEp = { ok: true; valore: number | null } | { ok: false; errore: string };

/**
 * Legge l'indice di prestazione energetica scritto da una persona: vuoto vuol dire «non
 * indicato»; si accetta la virgola come separatore decimale; si arrotonda a due decimali.
 */
export function leggiEp(input: unknown): EsitoEp {
  if (input === null || input === undefined) return { ok: true, valore: null };
  const testo = String(input).trim();
  if (testo === "") return { ok: true, valore: null };

  // solo cifre con un separatore decimale: niente notazioni scientifiche, spazi dentro o segni
  if (!/^[0-9]+([.,][0-9]+)?$/.test(testo)) {
    return { ok: false, errore: "L'indice di prestazione energetica è un numero, per esempio 95,5." };
  }
  const n = Math.round(Number(testo.replace(",", ".")) * 100) / 100;
  if (!Number.isFinite(n) || n < LIMITI_EP.min || n > LIMITI_EP.max) {
    return { ok: false, errore: `L'indice di prestazione energetica va da ${LIMITI_EP.min} a ${String(LIMITI_EP.max).replace(".", ",")} kWh/m²·anno.` };
  }
  return { ok: true, valore: n };
}

export type EsitoClasse = { ok: true; valore: ClasseEnergetica | null } | { ok: false; errore: string };

/** Legge la classe da un modulo: vuota = non indicata. Qualunque altra cosa non nella lista è un errore. */
export function leggiClasse(input: unknown): EsitoClasse {
  if (input === null || input === undefined) return { ok: true, valore: null };
  const testo = String(input).trim();
  if (testo === "") return { ok: true, valore: null };
  if (!classeValida(testo)) return { ok: false, errore: "La classe energetica non è valida." };
  return { ok: true, valore: testo };
}

export type TonoClasse = "ottima" | "buona" | "media" | "scarsa";

/** Un giudizio a parole, per colorare e per chi non conosce la scala. */
export function tonoClasse(c: ClasseEnergetica): TonoClasse {
  if (c === "A4" || c === "A3" || c === "A2" || c === "A1") return "ottima";
  if (c === "B" || c === "C") return "buona";
  if (c === "D" || c === "E") return "media";
  return "scarsa";
}

const FORMATO_EP = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

/** «B · 95,5 kWh/m²·anno», «B», o «Non indicata». */
export function testoClasse(classe: unknown, ep?: unknown): string {
  if (!classeValida(classe)) return "Non indicata";
  const n = typeof ep === "number" && Number.isFinite(ep) ? ep : typeof ep === "string" && ep.trim() !== "" && Number.isFinite(Number(ep)) ? Number(ep) : null;
  return n === null ? classe : `${classe} · ${FORMATO_EP.format(n)} kWh/m²·anno`;
}
