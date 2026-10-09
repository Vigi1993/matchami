"use server";

import { redirect } from "next/navigation";
import { tokenValido } from "@/lib/email/modello";
import { clienteAmministratore } from "@/lib/supabase/admin";

/** La conferma di chi ha aperto il link nell'email: disattiva, poi torna alla pagina con l'esito. */
export async function disiscrivi(token: string): Promise<void> {
  if (!tokenValido(token)) redirect("/email/disiscrivi/non-valido");

  const admin = clienteAmministratore();
  if (!admin) redirect(`/email/disiscrivi/${token}?esito=errore`);

  const { error } = await admin.rpc("disiscrivi_email", { p_token: token });
  redirect(`/email/disiscrivi/${token}?esito=${error ? "errore" : "fatto"}`);
}
