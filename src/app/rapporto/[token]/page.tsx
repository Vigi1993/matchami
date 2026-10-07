import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CorniceScura } from "@/components/CorniceScura";
import { RispostaForm } from "./RispostaForm";
import { ruoloControparte } from "@/lib/rapporti";
import type { RuoloRapporto } from "@/lib/rapporti";
import { èTokenRapporto } from "@/lib/uuid";

type RichiestaPubblica = {
  nome_creatore: string;
  ruolo_creatore: RuoloRapporto;
  immobile: string | null;
  periodo_da: string;
  periodo_a: string | null;
  stato: "in_attesa" | "confermata" | "rifiutata";
  scaduta: boolean;
  mia: boolean | null;
};

function periodoTesto(da: string, a: string | null): string {
  const f = (d: string) =>
    new Date(d + "T00:00:00Z").toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });
  return a ? `da ${f(da)} a ${f(a)}` : `da ${f(da)}, ancora in corso`;
}

/**
 * La pagina che apre chi riceve il link di una richiesta di rapporto.
 * Mostra i dati principali, NON il contratto, e fa confermare o rifiutare.
 */
export default async function RapportoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const nonValido = (
    <CorniceScura titolo="Link non valido">
      <p>
        Questa richiesta non esiste. Controlla di aver aperto il link per
        intero: a volte i messaggi lo spezzano su due righe.
      </p>
    </CorniceScura>
  );
  // il token arriva dall'indirizzo: si controlla la forma prima di interrogare il database
  if (!èTokenRapporto(token)) return nonValido;

  const supabase = await createClient();
  const { data } = await supabase.rpc("richiesta_rapporto_pubblica", { p_token: token });
  const r = (data?.[0] ?? null) as RichiestaPubblica | null;
  if (!r) return nonValido;

  if (r.stato === "confermata" || r.stato === "rifiutata") {
    return (
      <CorniceScura titolo="Richiesta già risolta">
        <p>
          {r.stato === "confermata"
            ? "A questa richiesta è già stata data risposta: l'affitto è stato confermato."
            : "A questa richiesta è già stata data risposta: l'affitto è stato rifiutato."}
        </p>
      </CorniceScura>
    );
  }
  if (r.scaduta) {
    return (
      <CorniceScura titolo="Richiesta scaduta">
        <p>
          Questa richiesta aveva più di 30 giorni. Chiedi a {r.nome_creatore} di
          crearne una nuova.
        </p>
      </CorniceScura>
    );
  }

  const necessario = ruoloControparte(r.ruolo_creatore);
  const riepilogo = (
    <>
      <p>
        <b>{r.nome_creatore}</b> dichiara di aver avuto con te un affitto come{" "}
        {r.ruolo_creatore}
        {r.immobile ? `, per ${r.immobile}` : ""}, {periodoTesto(r.periodo_da, r.periodo_a)}.
      </p>
      <p>
        Su MatchAmI un affitto vale per i feedback solo se lo confermano
        entrambe le persone e se il contratto, che vede soltanto il team di
        MatchAmI, risulta in regola.
      </p>
    </>
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <CorniceScura titolo={`${r.nome_creatore} ti ha scritto`}>
        {riepilogo}
        <p>
          Per rispondere serve un account da <b>{necessario}</b>. Accedi o
          registrati, poi torna a questo link.
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(`/rapporto/${token}`)}`}
          className="login-cta"
          style={{ display: "block", textAlign: "center", marginTop: 8 }}
        >
          Accedi o registrati
        </Link>
      </CorniceScura>
    );
  }

  if (r.mia) {
    return (
      <CorniceScura titolo="È la tua richiesta">
        <p>
          Hai creato tu questa richiesta: la conferma spetta all&apos;altra
          persona. Mandale questo link e aspetta che risponda.
        </p>
      </CorniceScura>
    );
  }

  const { data: profilo } = await supabase.from("profiles").select("ruolo").eq("id", user.id).single();
  if (profilo?.ruolo !== necessario) {
    return (
      <CorniceScura titolo={`Serve un account da ${necessario}`}>
        {riepilogo}
        <p>
          Il tuo account è registrato come {profilo?.ruolo ?? "altro"}, quindi non
          può rispondere a questa richiesta. Esci e accedi con l&apos;account
          giusto.
        </p>
      </CorniceScura>
    );
  }

  // Se la richiesta l'ha creata un inquilino, l'immobile è descritto a
  // parole: tocca al proprietario dire quale dei suoi è.
  let immobili: { id: string; titolo: string; zona: string }[] | null = null;
  if (necessario === "proprietario") {
    const { data: miei } = await supabase
      .from("listings")
      .select("id, titolo, zona")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    immobili = (miei ?? []) as { id: string; titolo: string; zona: string }[];
  }

  return (
    <CorniceScura titolo={`${r.nome_creatore} ti ha scritto`}>
      {riepilogo}
      <p>È corretto?</p>
      <RispostaForm token={token} immobili={immobili} />
    </CorniceScura>
  );
}
