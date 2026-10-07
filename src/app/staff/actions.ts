"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { richiediStaff, èUuid } from "@/lib/staff";
import { messaggioErroreVerifica } from "@/lib/verifica";

export type EsitoState = { error?: string } | null;

/**
 * Verifica o respinge un immobile. Il controllo dei permessi sta in tre
 * posti: qui, nel layout, e soprattutto nella funzione del database, che
 * risponde NON_STAFF a chiunque non lo sia. Questa azione si può chiamare
 * da sola, senza passare dalla pagina.
 */
export async function decidiVerifica(
  _prev: EsitoState,
  formData: FormData
): Promise<EsitoState> {
  const supabase = await richiediStaff();

  const id = String(formData.get("id") || "");
  const esito = String(formData.get("esito") || "");
  const nota = String(formData.get("nota") || "").trim();

  if (!èUuid(id)) return { error: "Immobile non valido." };
  if (esito !== "verifica" && esito !== "respingi") return { error: "Scelta non valida." };
  if (esito === "respingi" && nota.length < 3) {
    return { error: messaggioErroreVerifica("NOTA_OBBLIGATORIA") };
  }

  const { error } = await supabase.rpc("esito_verifica_immobile", {
    p_listing: id,
    p_verificato: esito === "verifica",
    p_note: esito === "respingi" ? nota : null,
  });
  if (error) return { error: messaggioErroreVerifica(error.message) };

  revalidatePath("/staff");
  revalidatePath("/");
  redirect("/staff");
}

/**
 * Verifica o respinge un rapporto di locazione già confermato dalle due
 * parti. Stessi controlli di `decidiVerifica`: permessi qui, nel layout e
 * nella funzione del database.
 */
export async function decidiRapporto(
  _prev: EsitoState,
  formData: FormData
): Promise<EsitoState> {
  const supabase = await richiediStaff();

  const id = String(formData.get("id") || "");
  const esito = String(formData.get("esito") || "");
  const nota = String(formData.get("nota") || "").trim();

  if (!èUuid(id)) return { error: "Affitto non valido." };
  if (esito !== "verifica" && esito !== "respingi") return { error: "Scelta non valida." };
  if (esito === "respingi" && nota.length < 3) {
    return { error: messaggioErroreVerifica("NOTA_OBBLIGATORIA") };
  }

  const { error } = await supabase.rpc("esito_rapporto", {
    p_rapporto: id,
    p_verificato: esito === "verifica",
    p_note: esito === "respingi" ? nota : null,
  });
  if (error) return { error: messaggioErroreVerifica(error.message) };

  revalidatePath("/staff");
  redirect("/staff");
}
