"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { INFORMATIVA } from "@/content/informativa";
import { percorsoInterno } from "@/lib/percorso";

export type AccettaState = { error?: string } | null;

/**
 * Registra l'accettazione della versione in vigore.
 *
 * La versione NON arriva dal modulo: si prende dal file di contenuto, sul
 * server, così nessuno può accettare una versione diversa da quella che gli
 * è stata mostrata. La data la mette il database.
 */
export async function accettaInformativa(
  _prev: AccettaState,
  formData: FormData
): Promise<AccettaState> {
  if (formData.get("letto") !== "on") {
    return { error: "Per continuare spunta la casella." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Devi accedere per continuare." };

  const { error } = await supabase.rpc("accetta_informativa", {
    p_versione: INFORMATIVA.versione,
  });
  if (error) {
    console.error("accettaInformativa:", error.message);
    return { error: "Non è stato possibile registrare l'accettazione. Riprova." };
  }

  redirect(percorsoInterno(String(formData.get("next") || ""), "/"));
}
