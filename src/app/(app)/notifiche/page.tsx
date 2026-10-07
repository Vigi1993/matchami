import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/PageContainer";
import type { Notifica } from "@/lib/notifiche";
import { NotificheLista } from "./NotificheLista";

export default async function NotifichePage() {
  const supabase = await createClient();

  // Le ultime 50: la pulizia periodica toglie quelle vecchie, e non serve
  // scorrere all'infinito. La sicurezza del database fa vedere solo le proprie.
  const { data } = await supabase
    .from("notifiche")
    .select("id, tipo, dati, link, letta_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <PageContainer>
      <h1 className="screen-title">Novità</h1>
      <p className="screen-sub">Gli esiti delle verifiche e le risposte che ti riguardano.</p>
      <NotificheLista notifiche={(data ?? []) as Notifica[]} />
    </PageContainer>
  );
}
