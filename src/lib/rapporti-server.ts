import type { createClient } from "@/lib/supabase/server";
import type { RapportoMio, RichiestaMia, StatoRapporto, StatoRichiesta } from "@/lib/rapporti";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const TRENTA_GIORNI_MS = 30 * 24 * 3600 * 1000;

type Etichettato = { titolo?: string | null; zona?: string | null } | null | undefined;

/** Un'embed many-to-one può arrivare come oggetto o come lista di uno. */
function uno(valore: unknown): Etichettato {
  return (Array.isArray(valore) ? valore[0] : valore) as Etichettato;
}

/**
 * Le richieste che ho creato e i rapporti di cui sono una parte. La
 * sicurezza di riga fa già il filtro: qui non si aggiunge niente che
 * potrebbe far vedere di più.
 */
export async function caricaRapportiMiei(supabase: Supabase, userId: string) {
  const [{ data: richieste }, { data: rapporti }, { data: io }] = await Promise.all([
    supabase
      .from("richieste_rapporto")
      .select("id, token, stato, indirizzo, listing_id, periodo_da, periodo_a, created_at, listings(titolo, zona)")
      .eq("creato_da", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("rapporti_locazione")
      .select("id, owner_id, tenant_id, creato_da, stato, esito_note, periodo_da, periodo_a, listings(titolo, zona)")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("nome, cognome").eq("id", userId).single(),
  ]);

  // il nome dell'altra persona, che le parti di un rapporto possono leggere
  const altri = [
    ...new Set(
      (rapporti ?? []).map((r) => (r.owner_id === userId ? r.tenant_id : r.owner_id) as string)
    ),
  ];
  const { data: profili } =
    altri.length > 0
      ? await supabase.from("profiles").select("id, nome, cognome").in("id", altri)
      : { data: [] };
  const nomi = new Map(
    (profili ?? []).map((p) => [p.id as string, [p.nome, p.cognome].filter(Boolean).join(" ")])
  );

  // Quali affitti hanno già un feedback. Le recensioni si possono leggere,
  // ma il VOTO lo riporto solo a chi l'ha dato: l'inquilino sa che c'è un
  // feedback, non cosa dice.
  const idRapporti = (rapporti ?? []).map((r) => r.id as string);
  const { data: feedback } =
    idRapporti.length > 0
      ? await supabase.from("recensioni").select("rapporto_id, voto").in("rapporto_id", idRapporti)
      : { data: [] };
  const votoPerRapporto = new Map(
    (feedback ?? []).map((f) => [f.rapporto_id as string, f.voto as number])
  );

  const ora = Date.now();

  const richiesteMie: RichiestaMia[] = (richieste ?? []).map((r) => {
    const l = uno(r.listings);
    return {
      id: r.id as string,
      token: r.token as string,
      stato: r.stato as StatoRichiesta,
      immobile: r.listing_id ? (l?.titolo ?? "Il tuo immobile") : ((r.indirizzo as string | null) ?? null),
      periodo_da: r.periodo_da as string,
      periodo_a: (r.periodo_a as string | null) ?? null,
      scaduta: r.stato === "in_attesa" && ora - new Date(r.created_at as string).getTime() > TRENTA_GIORNI_MS,
    };
  });

  const rapportiMiei: RapportoMio[] = (rapporti ?? []).map((r) => {
    const l = uno(r.listings);
    const altro = (r.owner_id === userId ? r.tenant_id : r.owner_id) as string;
    return {
      id: r.id as string,
      stato: r.stato as StatoRapporto,
      esito_note: (r.esito_note as string | null) ?? null,
      periodo_da: r.periodo_da as string,
      periodo_a: (r.periodo_a as string | null) ?? null,
      immobile: l?.titolo ?? null,
      controparte: nomi.get(altro) || null,
      creatoDaMe: r.creato_da === userId,
      recensito: votoPerRapporto.has(r.id as string),
      votoDato: r.owner_id === userId ? (votoPerRapporto.get(r.id as string) ?? null) : null,
    };
  });

  return {
    richieste: richiesteMie,
    rapporti: rapportiMiei,
    nome: [io?.nome, io?.cognome].filter(Boolean).join(" ") || null,
  };
}
