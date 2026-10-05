"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  calcolaMatchInquilino,
  haCriteriDiRicerca,
  profiloRicercaDaRighe,
} from "@/lib/match";

export async function candidati(listingId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  // Fotografia di quanto la casa andava bene all'inquilino nel momento in
  // cui ha scelto: è il numero che rivede in "Candidature". La candidatura
  // non deve MAI fallire per colpa di questo calcolo: se qualcosa non va,
  // parte comunque, senza percentuale.
  let matchPct: number | null = null;
  try {
    const [{ data: annuncio }, { data: tenant }, { data: zone }, { data: interessi }] =
      await Promise.all([
        supabase
          .from("listings")
          .select("prezzo, zona, locali, mq, attributi")
          .eq("id", listingId)
          .single(),
        supabase
          .from("tenant_profiles")
          .select("budget_max, locali_min, mq_min")
          .eq("profile_id", user.id)
          .single(),
        supabase.from("tenant_zone_interesse").select("zona").eq("tenant_id", user.id),
        supabase
          .from("tenant_interessi")
          .select("attributo_key, peso")
          .eq("tenant_id", user.id),
      ]);

    if (annuncio && tenant) {
      const profilo = profiloRicercaDaRighe(tenant, zone, interessi);
      // senza criteri impostati ogni casa fa 99: non è un'informazione
      if (haCriteriDiRicerca(profilo)) {
        matchPct = calcolaMatchInquilino(annuncio, profilo).punteggio;
      }
    }
  } catch {
    matchPct = null;
  }

  // Lo stato non si sceglie: lo impone anche la policy del database, che
  // rifiuta una candidatura creata con uno stato diverso da "in_attesa".
  const { error } = await supabase.from("candidature").insert({
    listing_id: listingId,
    tenant_id: user.id,
    status: "in_attesa",
    match_pct: matchPct,
  });

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/candidature");
  return { ok: true };
}
