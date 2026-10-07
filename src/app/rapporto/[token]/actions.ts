"use server";

import { createClient } from "@/lib/supabase/server";
import { èTokenRapporto, èUuid } from "@/lib/uuid";
import { messaggioErroreVerifica } from "@/lib/verifica";

export type RispostaState = { error?: string; fatto?: "confermata" | "rifiutata" } | null;

/**
 * Chi riceve il link conferma o rifiuta. Le regole (ruolo opposto, immobile
 * proprio, scadenza, una sola risposta) stanno nelle funzioni del database;
 * qui si controlla solo che ciò che arriva abbia la forma giusta.
 */
export async function rispondiRapporto(
  _prev: RispostaState,
  formData: FormData
): Promise<RispostaState> {
  const token = String(formData.get("token") || "");
  const esito = String(formData.get("esito") || "");
  const listing = String(formData.get("listing") || "");

  if (!èTokenRapporto(token)) return { error: messaggioErroreVerifica("RICHIESTA_INESISTENTE") };
  if (esito !== "conferma" && esito !== "rifiuta") return { error: "Scelta non valida." };
  if (listing && !èUuid(listing)) return { error: "Immobile non valido." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: messaggioErroreVerifica("NON_AUTENTICATO") };

  if (esito === "rifiuta") {
    const { error } = await supabase.rpc("rifiuta_richiesta_rapporto", { p_token: token });
    if (error) return { error: messaggioErroreVerifica(error.message) };
    return { fatto: "rifiutata" };
  }

  const { error } = await supabase.rpc("conferma_richiesta_rapporto", {
    p_token: token,
    p_listing: listing || null,
  });
  if (error) return { error: messaggioErroreVerifica(error.message) };
  return { fatto: "confermata" };
}
