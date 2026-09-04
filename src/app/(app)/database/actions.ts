"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function valutaCandidatura(
  candidaturaId: string,
  nuovoStato: "accettata" | "rifiutata"
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const { error } = await supabase
    .from("candidature")
    .update({ status: nuovoStato, updated_at: new Date().toISOString() })
    .eq("id", candidaturaId);

  if (error) return { error: error.message };

  revalidatePath("/database");
  return { ok: true };
}
