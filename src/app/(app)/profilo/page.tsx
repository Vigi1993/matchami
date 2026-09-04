import { createClient } from "@/lib/supabase/server";
import { ProfiloClient } from "./ProfiloClient";
import { OwnerProfiloClient } from "./OwnerProfiloClient";
import type { TenantProfile, OwnerProfile } from "@/lib/types";

export default async function ProfiloPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
        nome={profile?.nome ?? null}
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
  ] = await Promise.all([
    supabase.from("tenant_profiles").select("*").eq("profile_id", user!.id).single(),
    supabase.from("tenant_zone_interesse").select("zona").eq("tenant_id", user!.id),
    supabase
      .from("tenant_interessi")
      .select("attributo_key, peso")
      .eq("tenant_id", user!.id),
    supabase.from("recensioni").select("voto").eq("tenant_id", user!.id),
  ]);

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
      nome={profile?.nome ?? null}
      cognome={profile?.cognome ?? null}
      tenant={tenant as TenantProfile}
      zoneIniziali={zoneIniziali}
      interessiIniziali={interessiIniziali}
      mediaRecensioni={mediaRecensioni}
      numeroRecensioni={numeroRecensioni}
      consensoMarketingIniziale={profile?.consenso_marketing ?? false}
      consensoTerziIniziale={profile?.consenso_terzi ?? false}
    />
  );
}
