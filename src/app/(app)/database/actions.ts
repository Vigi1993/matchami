"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { criteriDaRighe, valutaCandidato } from "@/lib/match";
import type { ProfiloCandidato, RigaCriterioDb } from "@/lib/match";

export async function valutaCandidatura(
  candidaturaId: string,
  nuovoStato: "accettata" | "rifiutata"
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  // La decisione registra una fotografia del match di quel momento (D7):
  // da qui in poi l'inquilino può cambiare il profilo, ma il proprietario
  // continua a vedere su cosa ha deciso.
  //
  // Il calcolo NON deve mai impedire la decisione: se qualcosa va storto,
  // lo stato cambia lo stesso e semplicemente non c'è fotografia.
  let fotografia: Record<string, unknown> | null = null;
  try {
    const { data: c } = await supabase
      .from("candidature")
      .select(
        "tenant_id, listing_id, match_proprietario, listings!inner(owner_id, prezzo), tenant_profiles!inner(professione, reddito_mensile, reddito_nucleo, garante, fideiussione, protestato, animali, nucleo, verificato, presentazione)"
      )
      .eq("id", candidaturaId)
      .single();

    // una fotografia già scattata non si sovrascrive
    if (c && !c.match_proprietario) {
      const listing = c.listings as unknown as { owner_id: string; prezzo: number };

      if (listing.owner_id === user.id) {
        const [{ data: righeCriteri }, { data: recensioni }] = await Promise.all([
          supabase
            .from("listing_criteri")
            .select("chiave, peso, modo, soglia_pct")
            .eq("listing_id", c.listing_id),
          supabase.from("recensioni").select("voto").eq("tenant_id", c.tenant_id),
        ]);
        const voti = (recensioni ?? []).map((r) => r.voto as number);

        fotografia = valutaCandidato({
          criteri: criteriDaRighe(righeCriteri as RigaCriterioDb[] | null),
          canone: listing.prezzo,
          profilo: c.tenant_profiles as unknown as ProfiloCandidato,
          mediaRecensioni:
            voti.length > 0 ? voti.reduce((a, b) => a + b, 0) / voti.length : null,
          numeroRecensioni: voti.length,
        }) as unknown as Record<string, unknown>;
      }
    }
  } catch {
    fotografia = null;
  }

  const { error } = await supabase
    .from("candidature")
    .update({
      status: nuovoStato,
      updated_at: new Date().toISOString(),
      ...(fotografia
        ? {
            match_proprietario: fotografia,
            match_proprietario_at: new Date().toISOString(),
          }
        : {}),
    })
    .eq("id", candidaturaId);

  if (error) return { error: error.message };

  revalidatePath("/database");
  return { ok: true };
}
