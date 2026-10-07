"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { criteriDaRighe, valutaCandidato } from "@/lib/match";
import type { RigaCriterioDb } from "@/lib/match";
import { motivoRifiutoValido } from "@/lib/motivi-rifiuto";
import { profiloDaVista } from "@/lib/candidati";
import { messaggioErroreVerifica } from "@/lib/verifica";

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

  // La valutazione si fotografa nel momento della decisione (D7): da qui in
  // poi l'inquilino può cambiare il profilo, ma il proprietario continua a
  // vedere su cosa ha deciso.
  //
  // Il calcolo NON deve mai impedire la decisione: se qualcosa va storto la
  // decisione passa lo stesso, senza fotografia.
  let valutazione: unknown = null;
  try {
    const { data: c } = await supabase
      .from("candidature")
      .select("tenant_id, listing_id, listings!inner(owner_id, prezzo)")
      .eq("id", candidaturaId)
      .single();

    const listing = c?.listings as unknown as { owner_id: string; prezzo: number } | undefined;

    if (c && listing && listing.owner_id === user.id) {
      const [{ data: vista }, { data: righeCriteri }, { data: recensioni }] = await Promise.all([
        supabase
          .from("candidati_del_proprietario")
          .select(
            "professione, reddito_mensile, reddito_nucleo, garante, fideiussione, protestato, verificato, presentazione, animali_compilato, nucleo_compilato"
          )
          .eq("candidatura_id", candidaturaId)
          .single(),
        supabase
          .from("listing_criteri")
          .select("chiave, peso, modo, soglia_pct")
          .eq("listing_id", c.listing_id),
        supabase.from("recensioni").select("voto").eq("tenant_id", c.tenant_id),
      ]);
      const voti = (recensioni ?? []).map((r) => r.voto as number);

      if (vista) {
        valutazione = valutaCandidato({
          criteri: criteriDaRighe(righeCriteri as RigaCriterioDb[] | null),
          canone: listing.prezzo,
          profilo: profiloDaVista(vista),
          mediaRecensioni: voti.length > 0 ? voti.reduce((a, b) => a + b, 0) / voti.length : null,
          numeroRecensioni: voti.length,
        });
      }
    }
  } catch {
    valutazione = null;
  }

  // La decisione passa da una funzione del database: controlla che la
  // candidatura sia del proprietario, che sia ancora in attesa, e registra
  // stato e valutazione insieme. Non c'è più un modo di modificare una
  // candidatura direttamente.
  const { error } = await supabase.rpc("decidi_candidatura", {
    p_candidatura: candidaturaId,
    p_stato: nuovoStato,
    p_motivo: nuovoStato === "rifiutata" ? motivo : null,
    p_valutazione: valutazione,
  });

  if (error) {
    // il trigger della migrazione 0009 usa un altro codice per lo stesso caso
    const messaggio = error.message.includes("DECISIONE_DEFINITIVA")
      ? "CANDIDATURA_GIA_VALUTATA"
      : error.message;
    return { error: messaggioErroreVerifica(messaggio) };
  }

  revalidatePath("/database");
  return { ok: true };
}
