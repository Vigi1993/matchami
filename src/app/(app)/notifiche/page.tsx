import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/PageContainer";
import type { Notifica } from "@/lib/notifiche";
import { NotificheLista } from "./NotificheLista";
import { PreferenzeEmail } from "@/components/PreferenzeEmail";

export default async function NotifichePage() {
  const supabase = await createClient();

  // Le ultime 50: la pulizia periodica toglie quelle vecchie, e non serve
  // scorrere all'infinito. La sicurezza del database fa vedere solo le proprie.
  const { data } = await supabase
    .from("notifiche")
    .select("id, tipo, dati, link, letta_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  // Se la domanda non riesce si mostrano le email come attive (è l'impostazione di partenza).
  const { data: emailAttive } = await supabase.rpc("preferenze_email_mie");

  return (
    <PageContainer>
      <h1 className="screen-title">Novità</h1>
      <p className="screen-sub">Gli esiti delle verifiche e le risposte che ti riguardano.</p>
      <PreferenzeEmail attive={emailAttive !== false} />
      <NotificheLista notifiche={(data ?? []) as Notifica[]} />
    </PageContainer>
  );
}
