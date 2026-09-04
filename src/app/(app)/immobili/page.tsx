import { createClient } from "@/lib/supabase/server";
import { ImmobiliClient } from "./ImmobiliClient";
import type { ImmobileDettaglio } from "@/lib/types";

export default async function ImmobiliPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: listings }, { data: candidature }] = await Promise.all([
    supabase
      .from("listings")
      .select(
        "id, titolo, descrizione, zona, prezzo, locali, mq, attributi, pubblicato, listing_photos(url)"
      )
      .eq("owner_id", user!.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("candidature")
      .select("id, listing_id, listings!inner(owner_id)")
      .eq("listings.owner_id", user!.id),
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
    fotoUrl: (l.listing_photos as { url: string }[])?.[0]?.url ?? null,
    nCandidature: nCandidaturePerListing.get(l.id) ?? 0,
  }));

  return <ImmobiliClient immobili={immobili} />;
}
