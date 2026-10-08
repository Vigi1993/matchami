import { createClient } from "@/lib/supabase/server";
import { ImmobiliClient } from "./ImmobiliClient";
import type { ImmobileDettaglio } from "@/lib/types";
import type { VisitaProprietario } from "@/lib/visite";
import { criteriDaRighe } from "@/lib/match";
import type { RigaCriterioDb } from "@/lib/match";

export default async function ImmobiliPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: listings }, { data: candidature }, { data: visite }] = await Promise.all([
    supabase
      .from("listings")
      .select(
        "id, titolo, descrizione, zona, prezzo, locali, mq, attributi, pubblicato, verifica_stato, verifica_esito_note, listing_photos(url, ordine), listing_criteri(chiave, peso, modo, soglia_pct)"
      )
      .eq("owner_id", user!.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("candidature")
      .select("id, listing_id, listings!inner(owner_id)")
      .eq("listings.owner_id", user!.id),
    // i posti liberi e le prenotazioni di tutti i miei immobili, in una chiamata sola
    supabase.rpc("visite_del_proprietario"),
  ]);

  const nCandidaturePerListing = new Map<string, number>();
  for (const c of candidature ?? []) {
    const id = c.listing_id as string;
    nCandidaturePerListing.set(id, (nCandidaturePerListing.get(id) ?? 0) + 1);
  }

  const immobili: ImmobileDettaglio[] = (listings ?? []).map((l) => ({
    id: l.id,
    titolo: l.titolo,
    descrizione: l.descrizione,
    zona: l.zona,
    prezzo: l.prezzo,
    locali: l.locali,
    mq: l.mq,
    attributi: (l.attributi as Record<string, boolean>) ?? {},
    pubblicato: l.pubblicato,
    verifica_stato: l.verifica_stato,
    verifica_esito_note: l.verifica_esito_note ?? null,
    foto: [...((l.listing_photos as { url: string; ordine: number }[]) ?? [])]
      .sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0))
      .map((f) => f.url),
    criteri: criteriDaRighe(l.listing_criteri as RigaCriterioDb[] | null),
    nCandidature: nCandidaturePerListing.get(l.id) ?? 0,
  }));

  return <ImmobiliClient immobili={immobili} visite={(visite ?? []) as VisitaProprietario[]} />;
}
