import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/PageContainer";
import { GuidaComeFunziona } from "@/components/GuidaComeFunziona";

/**
 * «Come funziona»: la spiegazione di match, affidabilità e recensioni, da rileggere quando si vuole (si apre dal Profilo). Mostra la versione del ruolo di chi
 * la apre. Non legge né scrive dati: solo il ruolo.
 */
export default async function ComeFunzionaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profilo } = await supabase.from("profiles").select("ruolo").eq("id", user.id).single();
  const ruolo = profilo?.ruolo === "proprietario" ? "proprietario" : "inquilino";

  return (
    <PageContainer>
      <Link href="/profilo" className="redo-link guida-indietro">
        ‹ Torna al Profilo
      </Link>
      <h1 className="screen-title">Come funziona</h1>
      <p className="screen-sub">{ruolo === "proprietario" ? "Match, affidabilità e recensioni: cosa vedi e come si calcola." : "Match, affidabilità e recensioni: cosa vedono i proprietari e come si calcola."}</p>
      <GuidaComeFunziona ruolo={ruolo} />
    </PageContainer>
  );
}
