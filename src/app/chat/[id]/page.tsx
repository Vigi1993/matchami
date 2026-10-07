import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { INFORMATIVA } from "@/content/informativa";
import { haAccettatoInformativa } from "@/lib/informativa";
import { ChatClient } from "./ChatClient";
import type { Messaggio } from "@/lib/types";

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

  const altroNome =
    `${altroProfilo?.nome ?? ""} ${altroProfilo?.cognome ?? ""}`.trim() ||
    "Utente";

  return (
    <ChatClient
      candidaturaId={id}
      userId={user!.id}
      altroNome={altroNome}
      titoloAnnuncio={listing?.titolo ?? ""}
      messaggiIniziali={(messaggi ?? []) as Messaggio[]}
    />
  );
}
