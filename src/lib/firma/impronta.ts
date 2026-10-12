/**
 * L'impronta di un documento: un SHA-256 del suo testo intero, calcolato su una forma CANONICA (chiavi in ordine,
 * nessuno spazio di formattazione, testo normalizzato). Lo stesso documento dà sempre la stessa impronta; basta
 * cambiare una virgola, un nome o un importo perché cambi. Serve a sapere COSA si è firmato e a vedere se il
 * contratto è cambiato dopo.
 *
 * SOLO codice del server (usa node:crypto).
 */
import { createHash } from "node:crypto";
import type { DocumentoContratto } from "@/lib/contratto/tipi";

/** JSON con le chiavi in ordine: due oggetti uguali producono lo stesso testo qualunque sia l'ordine di costruzione. */
export function jsonCanonico(valore: unknown): string {
  if (valore === null || typeof valore !== "object") {
    if (typeof valore === "string") return JSON.stringify(valore.normalize("NFC"));
    if (typeof valore === "number" && !Number.isFinite(valore)) return "null";
    return JSON.stringify(valore === undefined ? null : valore);
  }
  if (Array.isArray(valore)) return `[${valore.map((v) => jsonCanonico(v)).join(",")}]`;
  const o = valore as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${jsonCanonico(o[k])}`)
    .join(",")}}`;
}

/** L'impronta (64 caratteri esadecimali minuscoli) di tutto ciò che il documento dice. */
export function improntaDocumento(documento: DocumentoContratto): string {
  return createHash("sha256").update(jsonCanonico(documento), "utf8").digest("hex");
}
