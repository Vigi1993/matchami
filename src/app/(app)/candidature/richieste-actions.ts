"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { eUuid, messaggioErroreRichiesta } from "@/lib/richieste";

export type EsitoRichiesta = { ok: true; candidaturaId: string | null } | { ok: false; error: string };

/**
 * L'inquilino risponde a una richiesta di un proprietario. Tutte le regole (la richiesta è sua, non ha già risposto, la casa è
 * ancora disponibile) le controlla il database: qui si chiama e si traduce l'errore in parole.
 * Accettando nasce una candidatura già accettata, e si restituisce il suo identificativo (serve per aprire la chat).
 */
export async function rispondiRichiesta(richiestaId: string, accetta: boolean): Promise<EsitoRichiesta> {
  if (!eUuid(richiestaId) || typeof accetta !== "boolean") return { ok: false, error: messaggioErroreRichiesta("RICHIESTA_NON_TUA: x") };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: messaggioErroreRichiesta("NON_AUTENTICATO: x") };

  const { data, error } = await supabase.rpc("rispondi_richiesta_proprietario", { p_richiesta: richiestaId, p_accetta: accetta });
  if (error) return { ok: false, error: messaggioErroreRichiesta(error.message) };

  revalidatePath("/candidature");
  revalidatePath("/messaggi");
  return { ok: true, candidaturaId: typeof data === "string" ? data : null };
}

/**
 * L'inquilino sceglie se farsi trovare dai proprietari. Spento di partenza: lo accende lui, e lo può spegnere quando vuole
 * (le richieste già arrivate restano, e potrà rifiutarle).
 */
export async function impostaVisibilita(visibile: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof visibile !== "boolean") return { ok: false, error: "Scelta non valida." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Accedi di nuovo per continuare." };

  const { error } = await supabase
    .from("tenant_profiles")
    .update({ visibile_ai_proprietari: visibile, visibile_dal: visibile ? new Date().toISOString() : null })
    .eq("profile_id", user.id);
  if (error) return { ok: false, error: "Non siamo riusciti a salvare. Riprova tra poco." };

  revalidatePath("/candidature");
  revalidatePath("/profilo");
  return { ok: true };
}
