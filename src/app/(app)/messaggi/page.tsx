import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/PageContainer";
import { sottotitoloMessaggi, type Conversazione } from "@/lib/conversazioni";
import { ConversazioniLista } from "./ConversazioniLista";

export default async function MessaggiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profilo }, { data, error }] = await Promise.all([
    supabase.from("profiles").select("ruolo").eq("id", user!.id).single(),
    // Le conversazioni di chi chiama (le sole candidature accettate di cui è parte),
    // già con l'anteprima dell'ultimo messaggio e i non letti: una chiamata sola.
    supabase.rpc("elenco_conversazioni"),
  ]);

  const conversazioni = (error ? [] : data ?? []) as Conversazione[];

  return (
    <PageContainer>
      <h1 className="screen-title">Messaggi</h1>
      <p className="screen-sub">{error ? "Non sono riuscito a caricarle." : sottotitoloMessaggi(conversazioni)}</p>
      <ConversazioniLista
        conversazioni={conversazioni}
        userId={user!.id}
        ruolo={profilo?.ruolo ?? "inquilino"}
        errore={Boolean(error)}
      />
    </PageContainer>
  );
}
