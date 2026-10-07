import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CorniceScura } from "@/components/CorniceScura";
import { INFORMATIVA } from "@/content/informativa";
import { haAccettatoInformativa } from "@/lib/informativa";
import { percorsoInterno } from "@/lib/percorso";
import { AccettaForm } from "./AccettaForm";

/**
 * La schermata che ferma chi non ha accettato la versione in vigore
 * dell'informativa. Sta sotto /informativa, che è un percorso pubblico (il
 * testo si legge senza account): per questo controlla da sé chi sei.
 */
export default async function AccettaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destinazione = percorsoInterno(next, "/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/informativa/accetta" + (next ? `?next=${encodeURIComponent(destinazione)}` : ""))}`);
  }

  // già accettata: non c'è niente da fare qui
  if (await haAccettatoInformativa(supabase, user.id, INFORMATIVA.versione)) {
    redirect(destinazione);
  }

  return (
    <CorniceScura titolo="Prima di continuare">
      <p>
        Per usare MatchAmI devi leggere e accettare l&apos;informativa sulla
        privacy.
      </p>
      {INFORMATIVA.provvisoria && (
        <p>
          <b>È un documento provvisorio per il prototipo</b>, non
          un&apos;informativa legale: usa solo dati di prova.
        </p>
      )}
      <AccettaForm destinazione={destinazione} />
    </CorniceScura>
  );
}
