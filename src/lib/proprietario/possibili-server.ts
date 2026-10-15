import { clienteAmministratore } from "@/lib/supabase/admin";
import { annuncioDaRiga, contaPossibiliInquilini, type AnnuncioDaConfrontare, type RicercaInquilino } from "@/lib/match/possibili";
import { mappaLuoghi, type Luogo } from "@/lib/luoghi";
import type { createClient } from "@/lib/supabase/server";
import type { RigaInteresse, RigaZona } from "@/lib/match";

/**
 * SOLO SUL SERVER. Legge le ricerche di TUTTI gli inquilini con la chiave di servizio (il proprietario non può leggerle:
 * la sicurezza a livello di riga lo vieta) e restituisce SOLO NUMERI: per ogni annuncio, quanti inquilini cercano una casa
 * come quella. Nessun identificativo, nome o dato personale esce da qui; l'identificativo serve dentro il conteggio solo per
 * non contare chi si è già candidato.
 *
 * Se la chiave di servizio non c'è, o una domanda non riesce, restituisce `null`: la Home non mostra il numero (meglio
 * niente che un numero sbagliato) e il resto funziona.
 *
 * Il limite sul numero di ricerche letto è un limite di scala: oltre, i numeri sarebbero per difetto. Quando ci si arriva,
 * il conteggio va spostato nel database.
 */
export const MAX_RICERCHE_LETTE = 5000;

export async function possibiliPerAnnuncio(
  annunci: readonly AnnuncioDaConfrontare[],
  giaCandidati: ReadonlyMap<string, ReadonlySet<string>>
): Promise<Map<string, number> | null> {
  if (annunci.length === 0) return new Map();
  const admin = clienteAmministratore();
  if (!admin) return null;

  const [tenant, zone, interessi] = await Promise.all([
    admin
      .from("tenant_profiles")
      .select("profile_id, budget_max, locali_min, mq_min, budget_min, locali_max, mq_max, tipologia")
      .limit(MAX_RICERCHE_LETTE),
    admin.from("tenant_zone_interesse").select("tenant_id, zona, luogo_id").limit(MAX_RICERCHE_LETTE * 20),
    admin.from("tenant_interessi").select("tenant_id, attributo_key, peso, valore, necessaria").limit(MAX_RICERCHE_LETTE * 40),
  ]);
  if (tenant.error || zone.error || interessi.error) {
    console.error("possibiliPerAnnuncio: lettura non riuscita:", tenant.error?.message ?? zone.error?.message ?? interessi.error?.message);
    return null;
  }

  const zonePer = new Map<string, RigaZona[]>();
  for (const z of zone.data ?? []) {
    const id = z.tenant_id as string;
    zonePer.set(id, [...(zonePer.get(id) ?? []), { zona: z.zona as string, luogo_id: (z.luogo_id as string | null) ?? null }]);
  }
  const interessiPer = new Map<string, RigaInteresse[]>();
  for (const i of interessi.data ?? []) {
    const id = i.tenant_id as string;
    interessiPer.set(id, [
      ...(interessiPer.get(id) ?? []),
      { attributo_key: i.attributo_key as string, peso: i.peso as number, valore: i.valore, necessaria: (i.necessaria as boolean | null) ?? null },
    ]);
  }

  const ricerche: RicercaInquilino[] = (tenant.data ?? []).map((t) => ({
    tenantId: t.profile_id as string,
    riga: {
      budget_max: (t.budget_max as number | null) ?? null,
      locali_min: (t.locali_min as number | null) ?? null,
      mq_min: (t.mq_min as number | null) ?? null,
      budget_min: (t.budget_min as number | null) ?? null,
      locali_max: (t.locali_max as number | null) ?? null,
      mq_max: (t.mq_max as number | null) ?? null,
      tipologia: (t.tipologia as string | null) ?? null,
    },
    zone: zonePer.get(t.profile_id as string) ?? [],
    interessi: interessiPer.get(t.profile_id as string) ?? [],
  }));

  return contaPossibiliInquilini({ annunci, ricerche, giaCandidati });
}

export type PossibiliPerCasa = { id: string; titolo: string; zona: string; possibili: number | null };

/**
 * Per ogni casa del proprietario che gli inquilini vedono (verificata e pubblicata): quanti inquilini cercano una casa come
 * quella. `possibili` è `null` se non si riesce a calcolare. Usa il client del PROPRIETARIO per leggere le sue case, e quello
 * di servizio solo dentro `possibiliPerAnnuncio`, che restituisce numeri.
 */
export async function possibiliPerCasaDelProprietario(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<PossibiliPerCasa[]> {
  const [{ data: case_ }, { data: candidature }, { data: luoghiRighe }] = await Promise.all([
    supabase
      .from("listings")
      .select("id, titolo, zona, prezzo, locali, mq, attributi, classe_energetica, luogo_id, tipologia, bagni, piano, riscaldamento, tipo_contratto, disponibile_dal")
      .eq("owner_id", userId)
      .eq("pubblicato", true)
      .eq("verifica_stato", "verificato")
      .order("created_at", { ascending: false }),
    supabase.from("candidature").select("listing_id, tenant_id, listings!inner(owner_id)").eq("listings.owner_id", userId),
    supabase.from("luoghi").select("id, livello, nome, sigla, parent_id"),
  ]);

  const giaCandidati = new Map<string, Set<string>>();
  for (const c of candidature ?? []) {
    const id = c.listing_id as string;
    const insieme = giaCandidati.get(id) ?? new Set<string>();
    insieme.add(c.tenant_id as string);
    giaCandidati.set(id, insieme);
  }

  const mappa = mappaLuoghi((luoghiRighe ?? []) as Luogo[]);
  const righe = case_ ?? [];
  const conteggi = await possibiliPerAnnuncio(
    righe.map((l) => annuncioDaRiga({ ...(l as Parameters<typeof annuncioDaRiga>[0]), id: l.id as string }, mappa)),
    giaCandidati
  );
  return righe.map((l) => ({ id: l.id as string, titolo: l.titolo as string, zona: l.zona as string, possibili: conteggi?.get(l.id as string) ?? null }));
}
