import { PESO_PREDEFINITO } from "./config";
import { pesoValido } from "./comuni";
import { CATALOGO_CRITERI, sogliaValida } from "./proprietario";
import type { ChiaveCriterio, CriterioRichiesto } from "./tipi";

/** Una riga della tabella `listing_criteri`, come arriva dal database. */
export type RigaCriterioDb = {
  chiave: string;
  peso: number;
  modo: string;
  soglia_pct: number | null;
};

function èChiaveDelCatalogo(chiave: unknown): chiave is ChiaveCriterio {
  // hasOwnProperty e non `in`: con `in`, "constructor" o "toString"
  // risulterebbero chiavi valide del catalogo.
  return (
    typeof chiave === "string" &&
    Object.prototype.hasOwnProperty.call(CATALOGO_CRITERI, chiave)
  );
}

/**
 * Trasforma ciò che arriva da un modulo (JSON non fidato) in criteri
 * validi. Si fida solo del catalogo: scarta chiavi sconosciute o
 * ripetute, riporta pesi e soglie ai limiti, e un modo non riconosciuto
 * diventa "preferenziale" (il più prudente: non blocca nessuno).
 */
export function normalizzaCriteri(grezzo: unknown): CriterioRichiesto[] {
  let valore: unknown = grezzo;
  if (typeof grezzo === "string") {
    try {
      valore = JSON.parse(grezzo);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(valore)) return [];

  const viste = new Set<string>();
  const criteri: CriterioRichiesto[] = [];

  for (const r of valore) {
    if (typeof r !== "object" || r === null) continue;
    const { chiave, peso, modo, sogliaPct } = r as Record<string, unknown>;
    if (!èChiaveDelCatalogo(chiave) || viste.has(chiave)) continue;
    viste.add(chiave);

    const criterio: CriterioRichiesto = {
      chiave,
      peso: peso === undefined ? PESO_PREDEFINITO : pesoValido(Number(peso)),
      modo: modo === "obbligatorio" ? "obbligatorio" : "preferenziale",
    };
    if (chiave === "redditoCanone") {
      criterio.sogliaPct = sogliaValida(
        sogliaPct === undefined ? undefined : Number(sogliaPct)
      );
    }
    criteri.push(criterio);
  }
  return criteri;
}

/** Dalle righe del database ai criteri usati dal calcolo. */
export function criteriDaRighe(
  righe: RigaCriterioDb[] | null | undefined
): CriterioRichiesto[] {
  return normalizzaCriteri(
    (righe ?? []).map((r) => ({
      chiave: r.chiave,
      peso: r.peso,
      modo: r.modo,
      sogliaPct: r.soglia_pct ?? undefined,
    }))
  );
}

/** Dai criteri alle righe da scrivere nel database per un annuncio. */
export function righeDaCriteri(listingId: string, criteri: CriterioRichiesto[]) {
  return criteri.map((c) => ({
    listing_id: listingId,
    chiave: c.chiave,
    peso: c.peso,
    modo: c.modo,
    soglia_pct: c.chiave === "redditoCanone" ? (c.sogliaPct ?? null) : null,
  }));
}
