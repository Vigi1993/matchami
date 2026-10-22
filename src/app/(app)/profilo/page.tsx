import { riepilogoRecensioni, statoRaccomandazione } from "@/lib/recensioni";
import { VerificaRedditoPanel } from "@/components/VerificaRedditoPanel";
import { VerificaProtestiPanel } from "@/components/VerificaProtestiPanel";
import type { DocumentoInquilino } from "@/lib/verifica-inquilino";
import { createClient } from "@/lib/supabase/server";
import { ProfiloClient } from "./ProfiloClient";
import { sezioneProfilo } from "@/lib/home";
import { profiloRicercaDaRighe } from "@/lib/match";
import type { Luogo } from "@/lib/luoghi";
import { OwnerProfiloClient } from "./OwnerProfiloClient";
import type { TenantProfile } from "@/lib/types";
import { redirect } from "next/navigation";

export default async function ProfiloPage({ searchParams }: { searchParams: Promise<{ apri?: string | string[] }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // le novità non lette, per la campanella in cima al profilo (e per la riga «Novità» del proprietario)
  const { count: nonLetteCount } = await supabase
    .from("notifiche")
    .select("id", { count: "exact", head: true })
    .is("letta_at", null);
  const nonLette = nonLetteCount ?? 0;

  const { data: profile } = await supabase
    .from("profiles")
    .select("nome, cognome, ruolo, consenso_marketing, consenso_terzi")
    .eq("id", user!.id)
    .single();

  if (profile?.ruolo === "proprietario") {
    return (
      <OwnerProfiloClient
        nonLette={nonLette}
        nome={profile?.nome ?? null}
        cognome={profile?.cognome ?? null}
        email={user!.email ?? null}
        consensoMarketingIniziale={profile?.consenso_marketing ?? false}
        consensoTerziIniziale={profile?.consenso_terzi ?? false}
      />
    );
  }

  // Gli affitti dichiarati e gli inviti al proprietario ora stanno in «Gestione affitto»: i vecchi collegamenti ci portano.
  const apri = (await searchParams).apri;
  if (apri === "affitti" || apri === "invito") redirect(`/gestione?apri=${apri}`);

  const [
    { data: tenant },
    { data: zoneRows },
    { data: interessiRows },
    { data: recensioni },
    { data: documentiRows },
  ] = await Promise.all([
    supabase.from("tenant_profiles").select("*").eq("profile_id", user!.id).single(),
    supabase.from("tenant_zone_interesse").select("zona, luogo_id").eq("tenant_id", user!.id),
    supabase
      .from("tenant_interessi")
      .select("attributo_key, peso, valore, necessaria")
      .eq("tenant_id", user!.id),
    supabase.from("recensioni").select("voto, autore_id, created_at").eq("tenant_id", user!.id),
    supabase
      .from("documenti_inquilino")
      .select("id, tipo, percorso, nome_file, persona, importo_verificato, verificato_at")
      .eq("tenant_id", user!.id)
      .order("created_at", { ascending: true }),
  ]);

  // La ricerca com'è salvata, e i luoghi che si possono cercare (per il completamento automatico)
  const ricerca = profiloRicercaDaRighe(tenant, zoneRows, interessiRows);
  const { data: luoghiRighe } = await supabase.from("luoghi").select("id, livello, nome, sigla, parent_id");
  // le recensioni stanno a parte dal punteggio di affidabilità
  const riepilogo = riepilogoRecensioni((recensioni ?? []).map((r) => r.voto));
  const raccomandazione = statoRaccomandazione(recensioni ?? []);

  // quanti annunci ha salvato (solo quelli ancora disponibili); se non si legge, zero
  const { data: numeroPreferiti } = await supabase.rpc("numero_preferiti");

  return (
    <ProfiloClient
      aperturaIniziale={sezioneProfilo((await searchParams).apri)}
      nonLette={nonLette}
      preferiti={typeof numeroPreferiti === "number" ? numeroPreferiti : 0}
      nome={profile?.nome ?? null}
      cognome={profile?.cognome ?? null}
      email={user!.email ?? null}
      tenant={tenant as TenantProfile}
      verificaPanel={
        <VerificaRedditoPanel
          stato={(tenant as TenantProfile).verifica_stato}
          nota={(tenant as TenantProfile).verifica_esito_note}
          dati={{
            professione: (tenant as TenantProfile).professione,
            reddito_mensile: (tenant as TenantProfile).reddito_mensile,
          }}
          documenti={(documentiRows ?? []) as DocumentoInquilino[]}
          riga={tenant as TenantProfile}
        />
      }
      protestiPanel={
        <VerificaProtestiPanel
          stato={(tenant as TenantProfile).protesti_verifica_stato ?? "non_avviata"}
          nota={(tenant as TenantProfile).protesti_verifica_esito_note ?? null}
          protestato={(tenant as TenantProfile).protestato}
          documenti={(documentiRows ?? []) as DocumentoInquilino[]}
          riga={(tenant as TenantProfile)}
        />
      }
      ricerca={ricerca}
      luoghi={(luoghiRighe ?? []) as Luogo[]}
      recensioni={riepilogo}
      raccomandazione={raccomandazione}
      consensoMarketingIniziale={profile?.consenso_marketing ?? false}
      consensoTerziIniziale={profile?.consenso_terzi ?? false}
    />
  );
}
