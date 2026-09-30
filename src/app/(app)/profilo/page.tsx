import { createClient } from "@/lib/supabase/server";
import { ProfiloClient } from "./ProfiloClient";
import { OwnerProfiloClient } from "./OwnerProfiloClient";
import type { TenantProfile, OwnerProfile, Invito } from "@/lib/types";

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
      email={user!.email ?? null}
      tenant={tenant as TenantProfile}
      inviti={(inviti ?? []) as Invito[]}
      zoneIniziali={zoneIniziali}
      interessiIniziali={interessiIniziali}
      mediaRecensioni={mediaRecensioni}
      numeroRecensioni={numeroRecensioni}
      consensoMarketingIniziale={profile?.consenso_marketing ?? false}
      consensoTerziIniziale={profile?.consenso_terzi ?? false}
    />
  );
}
