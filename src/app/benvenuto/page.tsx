import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { INFORMATIVA } from "@/content/informativa";
import { haAccettatoInformativa, versioniAccettabili } from "@/lib/informativa";
import { passiInquilino, passiProprietario, passoDaMostrare } from "@/lib/benvenuto";
import { profiloRicercaDaRighe } from "@/lib/match";
import { documentiProprieta, immobileVerificaDa } from "@/lib/verifica";
import { quotazioniPerZone } from "@/lib/prezzi";
import { ZONE_MILANO } from "@/lib/constants";
import type { Luogo } from "@/lib/luoghi";
import type { TenantProfile } from "@/lib/types";
import type { DocumentoInquilino } from "@/lib/verifica-inquilino";
import { VerificaRedditoPanel } from "@/components/VerificaRedditoPanel";
import { VerificaProtestiPanel } from "@/components/VerificaProtestiPanel";
import { BenvenutoClient } from "./BenvenutoClient";

/**
 * Il percorso di benvenuto: dopo l'iscrizione (e l'accettazione dell'informativa) si compilano i dati che servono, una scheda alla volta.
 * Chi l'ha già completato torna nell'app. Le schede sono diverse per l'inquilino e per il proprietario.
 */
export default async function BenvenutoPage({ searchParams }: { searchParams: Promise<{ passo?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await haAccettatoInformativa(supabase, user.id, versioniAccettabili(INFORMATIVA)))) redirect("/informativa/accetta");

  // Se non si legge il profilo (o il benvenuto è già fatto) si va nell'app: meglio entrare che restare bloccati.
  const { data: profilo } = await supabase.from("profiles").select("ruolo, nome, onboarding_completato").eq("id", user.id).single();
  if (!profilo || profilo.onboarding_completato !== false) redirect("/");

  const { passo: richiesto } = await searchParams;
  const { data: luoghiRighe } = await supabase.from("luoghi").select("id, livello, nome, sigla, parent_id");
  const luoghi = (luoghiRighe ?? []) as Luogo[];

  if (profilo.ruolo === "proprietario") {
    const [{ data: case_ }, { data: documenti }] = await Promise.all([
      supabase
        .from("listings")
        .select("id, titolo, zona, verifica_stato, verifica_esito_note, classe_energetica, luogo_id, bagni, piano, riscaldamento, tipo_contratto, disponibile_dal")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true }),
      supabase.from("documenti_verifica").select("id, tipo, listing_id, nome_file, percorso, created_at").eq("owner_id", user.id),
    ]);
    const prima = (case_ ?? [])[0] ?? null;
    const proprieta = prima ? documentiProprieta(documenti, prima.id as string) : [];
    const identita = (documenti ?? []).filter((d) => d.tipo === "identita");
    const passi = passiProprietario({ nImmobili: (case_ ?? []).length, haIdentita: identita.length > 0, haProva: proprieta.length > 0 });
    const quotazioni = await quotazioniPerZone(ZONE_MILANO);
    return (
      <BenvenutoClient
        ruolo="proprietario"
        nome={profilo.nome ?? null}
        passi={passi}
        indice={passoDaMostrare(passi, richiesto)}
        haIdentita={identita.length > 0}
        nomiIdentita={identita.map((d) => (d.nome_file as string | null) ?? "Documento")}
        immobile={prima ? immobileVerificaDa({ ...(prima as Parameters<typeof immobileVerificaDa>[0]), documenti: proprieta }) : null}
        quotazioni={quotazioni}
        luoghi={luoghi}
      />
    );
  }

  const [{ data: tenant }, { data: zoneRows }, { data: interessiRows }, { data: documentiRows }] = await Promise.all([
    supabase.from("tenant_profiles").select("*").eq("profile_id", user.id).single(),
    supabase.from("tenant_zone_interesse").select("zona, luogo_id").eq("tenant_id", user.id),
    supabase.from("tenant_interessi").select("attributo_key, peso, valore, necessaria").eq("tenant_id", user.id),
    supabase.from("documenti_inquilino").select("id, tipo, percorso, nome_file").eq("tenant_id", user.id).order("created_at", { ascending: true }),
  ]);
  const t = tenant as TenantProfile;
  const documenti = (documentiRows ?? []) as DocumentoInquilino[];
  const passi = passiInquilino({
    professione: t.professione,
    redditoMensile: t.reddito_mensile,
    protestato: t.protestato,
    budgetMax: t.budget_max,
    documenti: documenti.map((d) => d.tipo),
  });

  return (
    <BenvenutoClient
      ruolo="inquilino"
      nome={profilo.nome ?? null}
      passi={passi}
      indice={passoDaMostrare(passi, richiesto)}
      tenant={t}
      ricerca={profiloRicercaDaRighe(t, zoneRows, interessiRows)}
      luoghi={luoghi}
      verificaPanel={
        <VerificaRedditoPanel
          stato={t.verifica_stato}
          nota={t.verifica_esito_note}
          dati={{ professione: t.professione, reddito_mensile: t.reddito_mensile }}
          documenti={documenti}
        />
      }
      protestiPanel={
        <VerificaProtestiPanel
          stato={t.protesti_verifica_stato ?? "non_avviata"}
          nota={t.protesti_verifica_esito_note ?? null}
          protestato={t.protestato}
          documenti={documenti}
        />
      }
    />
  );
}
