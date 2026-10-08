import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/PageContainer";
import { TESTO_NOTA_PREFERITI, sottotitoloPreferiti, type Preferito } from "@/lib/scelte";
import { PreferitiClient } from "./PreferitiClient";

export default async function PreferitiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // i preferiti sono una cosa da inquilini
  const { data: profilo } = await supabase.from("profiles").select("ruolo").eq("id", user!.id).single();
  if (profilo?.ruolo === "proprietario") redirect("/");

  // gli annunci salvati e ancora disponibili, dal più recente, con la prima foto
  const { data, error } = await supabase.rpc("elenco_preferiti");
  const preferiti = (error ? [] : data ?? []) as Preferito[];

  return (
    <PageContainer>
      <h1 className="screen-title">Preferiti</h1>
      <p className="screen-sub">{error ? "Non sono riuscito a caricarli." : sottotitoloPreferiti(preferiti.length)}</p>
      <PreferitiClient preferiti={preferiti} errore={Boolean(error)} />
      <p className="field-note" style={{ marginTop: 18 }}>
        {TESTO_NOTA_PREFERITI}
      </p>
    </PageContainer>
  );
}
