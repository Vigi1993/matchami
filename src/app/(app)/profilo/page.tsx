import { VerificaRedditoPanel } from "@/components/VerificaRedditoPanel";
import type { DocumentoInquilino } from "@/lib/verifica-inquilino";
import { createClient } from "@/lib/supabase/server";
import { RapportiPanel } from "@/components/RapportiPanel";
import { caricaRapportiMiei } from "@/lib/rapporti-server";
import { ProfiloClient } from "./ProfiloClient";
import { OwnerProfiloClient } from "./OwnerProfiloClient";
import type { TenantProfile, OwnerProfile, Invito } from "@/lib/types";

export default async function ProfiloPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // le novità non lette, per la riga «Novità» in cima al profilo
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
    const { data: owner } = await supabase
      .from("owner_profiles")
      .select("*")
      .eq("profile_id", user!.id)
      .single();

    return (
      <OwnerProfiloClient
        nonLette={nonLette}
        nome={profile?.nome ?? null}
        cognome={profile?.cognome ?? null}
        email={user!.email ?? null}
        owner={owner as OwnerProfile}
        consensoMarketingIniziale={profile?.consenso_marketing ?? false}
        consensoTerziIniziale={profile?.consenso_terzi ?? false}
      />
    );
  }

  const [
    { data: tenant },
    { data: zoneRows },
    { data: interessiRows },
    { data: recensioni },
    { data: inviti },
    { data: documentiRows },
  ] = await Promise.all([
    supabase.from("tenant_profiles").select("*").eq("profile_id", user!.id).single(),
    supabase.from("tenant_zone_interesse").select("zona").eq("tenant_id", user!.id),
    supabase
      .from("tenant_interessi")
      .select("attributo_key, peso")
      .eq("tenant_id", user!.id),
    supabase.from("recensioni").select("voto").eq("tenant_id", user!.id),
    supabase
      .from("inviti_proprietario")
      .select("id, token, nome_proprietario, email_proprietario, indirizzo, periodo, stato, created_at")
      .eq("tenant_id", user!.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("documenti_inquilino")
      .select("id, tipo, percorso, nome_file")
      .eq("tenant_id", user!.id)
      .order("created_at", { ascending: true }),
  ]);

  const rapporti = await caricaRapportiMiei(supabase, user!.id);

  const zoneIniziali = (zoneRows ?? []).map((r) => r.zona as string);
  const interessiIniziali = Object.fromEntries(
    (interessiRows ?? []).map((r) => [r.attributo_key as string, r.peso as number])
  );
  const numeroRecensioni = recensioni?.length ?? 0;
  const mediaRecensioni =
    numeroRecensioni > 0
      ? recensioni!.reduce((s, r) => s + (r.voto as number), 0) / numeroRecensioni
      : null;

  return (
    <ProfiloClient
      nonLette={nonLette}
      nome={profile?.nome ?? null}
      cognome={profile?.cognome ?? null}
      email={user!.email ?? null}
      tenant={tenant as TenantProfile}
      inviti={(inviti ?? []) as Invito[]}
      affittiPanel={
        <RapportiPanel
          ruolo="inquilino"
          nomeCreatore={rapporti.nome}
          immobili={[]}
          richieste={rapporti.richieste}
          rapporti={rapporti.rapporti}
        />
      }
      verificaPanel={
        <VerificaRedditoPanel
          stato={(tenant as TenantProfile).verifica_stato}
          nota={(tenant as TenantProfile).verifica_esito_note}
          dati={{
            professione: (tenant as TenantProfile).professione,
            reddito_mensile: (tenant as TenantProfile).reddito_mensile,
          }}
          documenti={(documentiRows ?? []) as DocumentoInquilino[]}
        />
      }
      zoneIniziali={zoneIniziali}
      interessiIniziali={interessiIniziali}
      mediaRecensioni={mediaRecensioni}
      numeroRecensioni={numeroRecensioni}
      consensoMarketingIniziale={profile?.consenso_marketing ?? false}
      consensoTerziIniziale={profile?.consenso_terzi ?? false}
    />
  );
}
