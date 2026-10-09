import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { INFORMATIVA } from "@/content/informativa";
import { haAccettatoInformativa } from "@/lib/informativa";
import { ChatClient } from "./ChatClient";
import type { Messaggio } from "@/lib/types";
import type { PostoLibero, VisitaCandidatura } from "@/lib/visite";
import { conVista } from "@/lib/mappe";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // La chat sta fuori dal gruppo (app), quindi il blocco va ripetuto qui.
  if (!(await haAccettatoInformativa(supabase, user!.id, INFORMATIVA.versione))) {
    redirect(`/informativa/accetta?next=${encodeURIComponent(`/chat/${id}`)}`);
  }

  const { data: candidatura } = await supabase
    .from("candidature")
    .select("id, tenant_id, status, listings(owner_id, titolo)")
    .eq("id", id)
    .single();

  if (!candidatura) redirect("/");

  const listing = candidatura.listings as unknown as {
    owner_id: string;
    titolo: string;
  } | null;

  const isTenant = candidatura.tenant_id === user!.id;
  const isOwner = listing?.owner_id === user!.id;

  // Se non sei una delle due parti, o la candidatura non è (ancora) un
  // match, non c'è chat da vedere.
  if ((!isTenant && !isOwner) || candidatura.status !== "accettata") {
    redirect("/");
  }

  // Il nome dell'altra persona. L'inquilino legge il profilo del proprietario
  // dopo il match; il proprietario legge quello dell'inquilino solo dalla
  // vista `candidati_del_proprietario`, non più dalla tabella dei profili.
  const { data: altroProfilo } = isTenant
    ? await supabase.from("profiles").select("nome, cognome").eq("id", listing!.owner_id).single()
    : await supabase
        .from("candidati_del_proprietario")
        .select("nome, cognome")
        .eq("candidatura_id", id)
        .single();

  const { data: messaggi } = await supabase
    .from("messaggi")
    .select("id, mittente_id, testo, created_at")
    .eq("candidatura_id", id)
    .order("created_at", { ascending: true });

  // Le visite di questo match, e per l'inquilino i posti tra cui scegliere. Se una lettura
  // non riesce, la chat si apre lo stesso: il pannello dirà che non ci sono posti.
  const [{ data: visite }, { data: posti }, { data: indirizzi }] = await Promise.all([
    supabase.rpc("visite_della_candidatura", { p_candidatura: id }),
    isTenant
      ? supabase.rpc("posti_liberi_per_candidatura", { p_candidatura: id })
      : Promise.resolve({ data: [] as PostoLibero[] }),
    // L'indirizzo preciso dell'immobile: lo dà il database solo al proprietario e a chi ha un
    // match ACCETTATO su quell'immobile. Per chiunque altro non c'è niente.
    supabase.rpc("indirizzo_per_candidatura", { p_candidatura: id }),
  ]);
  const primoIndirizzo = Array.isArray(indirizzi) && indirizzi.length > 0 ? indirizzi[0] : null;

  const altroNome =
    `${altroProfilo?.nome ?? ""} ${altroProfilo?.cognome ?? ""}`.trim() ||
    "Utente";

  return (
    <ChatClient
      candidaturaId={id}
      userId={user!.id}
      altroNome={altroNome}
      titoloAnnuncio={listing?.titolo ?? ""}
      ruolo={isTenant ? "inquilino" : "proprietario"}
      visite={(visite ?? []) as VisitaCandidatura[]}
      posti={(posti ?? []) as PostoLibero[]}
      indirizzo={primoIndirizzo ? conVista(primoIndirizzo) : null}
      messaggiIniziali={(messaggi ?? []) as Messaggio[]}
    />
  );
}
