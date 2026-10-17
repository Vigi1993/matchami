/**
 * Un importo mensile scritto a mano accanto alla barra (reddito): sempre un numero intero tra 0 e un massimo.
 * Il valore di partenza è 0 (= «non indicato»). Logica pura: si prova con `npm test`.
 */

/** Il massimo che si può scrivere a mano (la barra arriva meno in alto: serve a non fermare chi guadagna di più). */
export const IMPORTO_MASSIMO = 100000;

/** Da ciò che la persona scrive (anche «1.800», «1800,50», «», «abc», «-5») a un intero tra 0 e il massimo. Ciò che non è un numero vale 0. */
export function importoDaTesto(testo: unknown, massimo: number = IMPORTO_MASSIMO): number {
  const limite = Number.isFinite(massimo) && massimo > 0 ? Math.floor(massimo) : IMPORTO_MASSIMO;
  if (typeof testo !== "string" && typeof testo !== "number") return 0;
  const pulito = String(testo).trim().replace(/\s+/g, "");
  if (pulito === "") return 0;
  // «1.800» è milleottocento (il punto separa le migliaia), «1800,50» è milleottocento e cinquanta centesimi: i centesimi si arrotondano
  const normale = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(pulito) ? pulito.replace(/\./g, "").replace(",", ".") : pulito.replace(",", ".");
  const n = Number(normale);
  if (!Number.isFinite(n)) return 0;
  return Math.min(limite, Math.max(0, Math.round(n)));
}

/** La posizione della barra: l'importo, ma mai oltre la fine della barra (se si è scritta una cifra più alta la barra resta in fondo). */
export function posizioneBarra(importo: number, massimoBarra: number): number {
  if (!Number.isFinite(importo) || importo < 0) return 0;
  return Math.min(importo, massimoBarra);
}
