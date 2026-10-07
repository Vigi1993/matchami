import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { InvitoClient } from "./InvitoClient";
import { redirect } from "next/navigation";
import { INFORMATIVA } from "@/content/informativa";
import { haAccettatoInformativa } from "@/lib/informativa";
import { descriviRequisiti } from "@/lib/invito";
import type { RequisitiFeedback } from "@/lib/invito";

type InvitoPubblico = {
  nome_inquilino: string | null;
  cognome_inquilino: string | null;
  nome_proprietario: string | null;
  indirizzo: string | null;
  periodo: string | null;
  stato: string;
};

export default async function InvitoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  // Funzione SQL: legge l'invito anche per chi non ha ancora un account,
  // restituendo solo i campi che servono a questa pagina.
  const { data } = await supabase.rpc("invito_pubblico", { p_token: token });
  const invito = (data?.[0] ?? null) as InvitoPubblico | null;

  if (!invito) {
    return (
      <Cornice titolo="Link non valido">
        <p>
          Questo invito non esiste. Controlla di aver aperto il link per
          intero: a volte i messaggi lo spezzano su due righe.
        </p>
      </Cornice>
    );
  }

  if (invito.stato !== "inviato") {
    return (
      <Cornice
        titolo={
          invito.stato === "completato"
            ? "Feedback già lasciato"
            : "Invito annullato"
        }
      >
        <p>
          {invito.stato === "completato"
            ? "Questo invito è già stato usato. Grazie del tempo che ci hai dedicato."
            : "Chi ti ha invitato ha annullato la richiesta."}
        </p>
      </Cornice>
    );
  }

  const inquilino = [invito.nome_inquilino, invito.cognome_inquilino]
    .filter(Boolean)
    .join(" ");

  // Chi sta guardando la pagina?
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Chi agisce da loggato deve aver accettato l'informativa in vigore.
  if (user && !(await haAccettatoInformativa(supabase, user.id, INFORMATIVA.versione))) {
    redirect(`/informativa/accetta?next=${encodeURIComponent(`/invito/${token}`)}`);
  }

  let ruolo: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("ruolo")
      .eq("id", user.id)
      .single();
    ruolo = profile?.ruolo ?? null;
  }

  // Non autenticato: prima deve registrarsi come proprietario.
  if (!user) {
    return (
      <Cornice titolo={`${inquilino} ti ha invitato`}>
        <p>
          {inquilino} ti ha chiesto un commento su com&apos;è andata come
          inquilino
          {invito.indirizzo ? ` a ${invito.indirizzo}` : ""}
          {invito.periodo ? `, ${invito.periodo}` : ""}.
        </p>
        <p>
          Su MatchAmI i commenti sono affidabili perché chi li scrive è
          verificato. Per lasciarlo servono un account proprietario, un tuo
          immobile verificato sul portale e un contratto verificato con{" "}
          {inquilino}. Puoi cominciare registrandoti.
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(`/invito/${token}`)}`}
          className="login-cta"
          style={{ display: "block", textAlign: "center", marginTop: 8 }}
        >
          Registrati come proprietario
        </Link>
      </Cornice>
    );
  }

  // Autenticato come inquilino: non può recensire.
  if (ruolo !== "proprietario") {
    return (
      <Cornice titolo="Serve un account proprietario">
        <p>
          Il tuo account è registrato come inquilino, quindi non può lasciare
          un feedback su un altro inquilino. Esci e registrati come
          proprietario con un&apos;altra email, oppure riapri questo link dal
          dispositivo del proprietario.
        </p>
      </Cornice>
    );
  }

  // Un proprietario invitato è un proprietario come gli altri: per lasciare
  // il feedback deve essere verificato e avere un contratto verificato con
  // chi lo ha invitato. La regola vera sta nel database; qui si spiega.
  const { data: righeRequisiti } = await supabase.rpc("requisiti_feedback_invito", {
    p_token: token,
  });
  const { completi, voci } = descriviRequisiti(
    (righeRequisiti?.[0] ?? null) as RequisitiFeedback | null,
    inquilino || "l'inquilino"
  );

  if (!completi) {
    return (
      <Cornice titolo="Per lasciare il feedback serve ancora qualcosa">
        <p>
          MatchAmI accetta un commento su un inquilino solo da un proprietario
          verificato, e solo se esiste un contratto verificato tra voi due.
          Vale per tutti i proprietari.
        </p>
        <ul className="requisiti">
          {voci.map((v) => (
            <li key={v.chiave} className={v.stato}>
              <span className="requisito-simbolo">
                {v.stato === "ok" ? "✓" : v.stato === "in_verifica" ? "…" : "–"}
              </span>
              <span>
                {v.testo}
                {v.stato === "in_verifica" && <small>In verifica</small>}
              </span>
            </li>
          ))}
        </ul>
        <p>
          Come si fa: l&apos;immobile lo verifichi dalla Home, caricando i
          documenti. Il contratto lo dichiara uno di voi due, {inquilino} da
          &quot;I tuoi affitti&quot; nel suo profilo oppure tu da
          &quot;Gestione affitti&quot;: l&apos;altra persona lo conferma da un
          link e poi lo controlliamo noi. Quando entrambi i punti risultano a
          posto, torna a questo link.
        </p>
      </Cornice>
    );
  }

  return (
    <InvitoClient
      token={token}
      inquilino={inquilino || "l'inquilino"}
      indirizzo={invito.indirizzo}
      periodo={invito.periodo}
    />
  );
}

/** Schermata a tutta pagina usata per tutti gli esiti senza modulo. */
function Cornice({
  titolo,
  children,
}: {
  titolo: string;
  children: React.ReactNode;
}) {
  return (
    <main className="login-view">
      <div
        className="login-bg"
        style={{ backgroundImage: "url(/login-bg.jpg)" }}
      />
      <div className="login-scrim" />
      <div className="login-content">
        <div className="login-brand">
          Match<b>AmI</b>
        </div>
        <h1 className="login-title">{titolo}</h1>
        <div className="login-tag" style={{ display: "grid", gap: 14 }}>
          {children}
        </div>
      </div>
    </main>
  );
}
