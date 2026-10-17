"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { messaggioErroreBenvenuto } from "@/lib/benvenuto";

export type BenvenutoState = { error?: string } | null;

/**
 * Chiude il percorso di benvenuto e porta nell'app. Cosa serve per completare (i dati essenziali del ruolo) lo controlla il database
 * (funzione completa_onboarding): qui si chiama e, se manca qualcosa, si dice cosa in italiano.
 */
export async function completaBenvenuto(): Promise<BenvenutoState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: messaggioErroreBenvenuto("NON_AUTENTICATO") };

  const { error } = await supabase.rpc("completa_onboarding");
  if (error) return { error: messaggioErroreBenvenuto(error.message) };

  revalidatePath("/", "layout");
  redirect("/");
}
