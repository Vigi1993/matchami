import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  const altroId = isTenant ? listing!.owner_id : candidatura.tenant_id;
  const { data: altroProfilo } = await supabase
    .from("profiles")
    .select("nome, cognome")
    .eq("id", altroId)
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
