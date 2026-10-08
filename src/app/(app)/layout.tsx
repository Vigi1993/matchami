import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Navigation } from "@/components/Navigation";
import { INFORMATIVA } from "@/content/informativa";
import { haAccettatoInformativa } from "@/lib/informativa";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Chi non ha accettato la versione in vigore dell'informativa non entra:
  // quando il testo cambia, cambia la versione e tutti devono riaccettare.
  if (!(await haAccettatoInformativa(supabase, user!.id, INFORMATIVA.versione))) {
    redirect("/informativa/accetta");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("ruolo, nome")
    .eq("id", user!.id)
    .single();

  const ruolo = profile?.ruolo ?? "inquilino";

  // Quante novità non sono state lette. Se la domanda non riesce, si mostra
  // zero: un numero che manca è meglio di una pagina che non si apre.
  const { count } = await supabase
    .from("notifiche")
    .select("id", { count: "exact", head: true })
    .is("letta_at", null);

  // I messaggi dell'altra persona non ancora letti. La sicurezza del database
  // limita il conteggio alle proprie conversazioni. Come sopra: se non riesce,
  // zero, non una pagina che non si apre.
  const { count: messaggiNonLetti } = await supabase
    .from("messaggi")
    .select("id", { count: "exact", head: true })
    .eq("letto", false)
    .neq("mittente_id", user!.id);

  /*
    Come nel prototipo: un unico "telaio" da 480px centrato, alto quanto
    la viewport e senza scroll di pagina. Dentro, l'area delle schermate
    (che scorre da sola) e la tab bar fissa in basso.
  */
  return (
    <div className="app-shell">
      <div className="screens">{children}</div>
      <Navigation ruolo={ruolo} nome={profile?.nome} nonLette={count ?? 0} messaggiNonLetti={messaggiNonLetti ?? 0} />
    </div>
  );
}
