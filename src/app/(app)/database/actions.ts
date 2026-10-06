"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { criteriDaRighe, valutaCandidato } from "@/lib/match";
import type { ProfiloCandidato, RigaCriterioDb } from "@/lib/match";
import { motivoRifiutoValido } from "@/lib/motivi-rifiuto";

export async function valutaCandidatura(
  candidaturaId: string,
  nuovoStato: "accettata" | "rifiutata",
  motivo?: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  // Rifiutare richiede un motivo, scelto da una lista chiusa: l'inquilino
  // ha diritto di sapere perché, e un testo libero non lo vogliamo ospitare.
  if (nuovoStato === "rifiutata" && !motivoRifiutoValido(motivo)) {
    return { error: "Scegli un motivo per il rifiuto." };
  }

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

  // La decisione si prende una volta sola: si aggiorna solo se la
  // candidatura è ancora in attesa. Il database lo impone anche da sé
  // (migrazione 0009), qui serve a dare un messaggio chiaro.
  const { data: aggiornate, error } = await supabase
    .from("candidature")
    .update({
      status: nuovoStato,
      updated_at: new Date().toISOString(),
      motivo_rifiuto: nuovoStato === "rifiutata" ? motivo : null,
      ...(fotografia
        ? {
            match_proprietario: fotografia,
            match_proprietario_at: new Date().toISOString(),
          }
        : {}),
    })
    .eq("id", candidaturaId)
    .eq("status", "in_attesa")
    .select("id");

  if (error) {
    return {
      error: error.message.includes("DECISIONE_DEFINITIVA")
        ? "Questa candidatura è già stata valutata."
        : error.message,
    };
  }
  if (!aggiornate || aggiornate.length === 0) {
    return { error: "Questa candidatura è già stata valutata." };
  }

  revalidatePath("/database");
  return { ok: true };
}
