/**
 * Le firme dei miei contratti, per le pagine: una chiamata per le firme e, per i contratti che ne hanno almeno
 * una, il calcolo dell'impronta del documento di OGGI (serve a vedere se una firma è superata).
 *
 * SOLO codice del server.
 */
import { componiContratto } from "@/lib/contratto";
import { datiDaRiga } from "@/lib/contratto/dati";
import type { RigaContratto } from "@/lib/contratto/tipi";
import { improntaDocumento } from "./impronta";
import type { FirmaContratto } from "./tipi";

type Rpc = { rpc(nome: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };

export type FirmeDelContratto = { firme: FirmaContratto[]; improntaAttuale: string | null };

export async function caricaFirme(supabase: Rpc): Promise<Record<string, FirmeDelContratto>> {
  const { data, error } = await supabase.rpc("firme_dei_miei_contratti");
  if (error || !Array.isArray(data)) return {};

  const perContratto: Record<string, FirmaContratto[]> = {};
  for (const r of data as FirmaContratto[]) {
    if (r && typeof r.contratto_id === "string") (perContratto[r.contratto_id] ??= []).push(r);
  }

  const fuori: Record<string, FirmeDelContratto> = {};
  await Promise.all(
    Object.entries(perContratto).map(async ([id, firme]) => {
      let impronta: string | null = null;
      try {
        const { data: righe, error: e } = await supabase.rpc("dati_contratto", { p_contratto: id });
        const dati = e ? null : datiDaRiga((Array.isArray(righe) ? righe[0] : null) as Partial<RigaContratto> | null);
        if (dati) impronta = improntaDocumento(componiContratto(dati));
      } catch {
        // se non si riesce a calcolare, la firma non si dichiara né valida né superata
      }
      fuori[id] = { firme, improntaAttuale: impronta };
    })
  );
  return fuori;
}
