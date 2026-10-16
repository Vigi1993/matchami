import { createClient } from "@/lib/supabase/server";
import { ImmobiliClient } from "./ImmobiliClient";
import type { ImmobileDettaglio } from "@/lib/types";
import type { VisitaProprietario } from "@/lib/visite";
import { conVista } from "@/lib/mappe";
import { documentiProprieta } from "@/lib/verifica";
import { quotazioniPerZone } from "@/lib/prezzi";
import { ZONE_MILANO } from "@/lib/constants";
import type { Luogo } from "@/lib/luoghi";
import type { IndirizzoConVista } from "@/lib/mappe/tipi";
import { criteriDaRighe } from "@/lib/match";
import type { RigaCriterioDb } from "@/lib/match";

export default async function ImmobiliPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: listings }, { data: candidature }, { data: visite }, { data: indirizziRighe }, { data: luoghiRighe }, { data: documenti }] = await Promise.all([
    supabase
      .from("listings")
      .select(
        "id, titolo, descrizione, zona, prezzo, locali, mq, attributi, pubblicato, classe_energetica, ep_globale, verifica_stato, verifica_esito_note, luogo_id, tipologia, bagni, piano, riscaldamento, tipo_contratto, disponibile_dal, listing_photos(url, ordine), listing_criteri(chiave, peso, modo, soglia_pct)"
      )
      .eq("owner_id", user!.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("candidature")
      .select("id, listing_id, listings!inner(owner_id)")
      .eq("listings.owner_id", user!.id),
    // i posti liberi e le prenotazioni di tutti i miei immobili, in una chiamata sola
    supabase.rpc("visite_del_proprietario"),
    // gli indirizzi dei miei immobili, con la posizione sulla mappa
    supabase.rpc("indirizzi_dei_miei_immobili"),
    // i luoghi dove si può mettere un immobile (provincia → città → quartiere)
    supabase.from("luoghi").select("id, livello, nome, sigla, parent_id"),
    // i documenti di verifica che ho già caricato: servono per dire cosa manca a ogni immobile
    supabase.from("documenti_verifica").select("id, tipo, listing_id, nome_file, percorso, created_at").eq("owner_id", user!.id),
  ]);

  const haIdentita = (documenti ?? []).some((d) => d.tipo === "identita");


  const indirizzi: Record<string, IndirizzoConVista> = {};
  for (const r of indirizziRighe ?? []) indirizzi[r.listing_id as string] = conVista(r);

  const nCandidaturePerListing = new Map<string, number>();
  for (const c of candidature ?? []) {
    const id = c.listing_id as string;
    nCandidaturePerListing.set(id, (nCandidaturePerListing.get(id) ?? 0) + 1);
  }

  // le quotazioni di tutte le zone, per il consiglio sul prezzo (se non si leggono, il consiglio non compare)
  const quotazioni = await quotazioniPerZone(ZONE_MILANO);

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
    classe_energetica: (l.classe_energetica as string | null) ?? null,
    ep_globale: l.ep_globale === null || l.ep_globale === undefined ? null : Number(l.ep_globale),
    luogo_id: (l.luogo_id as string | null) ?? null,
    tipologia: ((l.tipologia as string | null) === "villa" ? "villa" : "appartamento") as "appartamento" | "villa",
    bagni: (l.bagni as number | null) ?? null,
    piano: (l.piano as number | null) ?? null,
    riscaldamento: (l.riscaldamento as string | null) ?? null,
    tipo_contratto: (l.tipo_contratto as string | null) ?? null,
    disponibile_dal: (l.disponibile_dal as string | null) ?? null,
    verifica_stato: l.verifica_stato,
    verifica_esito_note: l.verifica_esito_note ?? null,
    foto: [...((l.listing_photos as { url: string; ordine: number }[]) ?? [])]
      .sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0))
      .map((f) => f.url),
    criteri: criteriDaRighe(l.listing_criteri as RigaCriterioDb[] | null),
    nCandidature: nCandidaturePerListing.get(l.id) ?? 0,
    documenti: documentiProprieta(documenti, l.id as string),
    nProprieta: documentiProprieta(documenti, l.id as string).length,
  }));

  return <ImmobiliClient immobili={immobili} haIdentita={haIdentita} visite={(visite ?? []) as VisitaProprietario[]} indirizzi={indirizzi} quotazioni={quotazioni} luoghi={(luoghiRighe ?? []) as Luogo[]} />;
}
