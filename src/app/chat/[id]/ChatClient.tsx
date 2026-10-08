"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Messaggio } from "@/lib/types";
import { IconIndietro, IconInvia } from "@/components/icons";
import { AvvisoMessaggio, AvvisoTruffe, ConfermaInvioRischioso } from "@/components/AvvisiChat";
import { rilevaRischioPagamento, type Rischio } from "@/lib/truffe";

export function ChatClient({
  candidaturaId,
  userId,
  altroNome,
  titoloAnnuncio,
  messaggiIniziali,
}: {
  candidaturaId: string;
  userId: string;
  altroNome: string;
  titoloAnnuncio: string;
  messaggiIniziali: Messaggio[];
}) {
  const router = useRouter();
  const [messaggi, setMessaggi] = useState<Messaggio[]>(messaggiIniziali);
  const [testo, setTesto] = useState("");
  const [invio, setInvio] = useState(false);
  // il messaggio che si sta per inviare e che parla di soldi: si chiede conferma
  const [daConfermare, setDaConfermare] = useState<Rischio | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Si segnano come letti i messaggi dell'altra persona: quando si apre la chat e ogni
  // volta che ne arriva uno mentre è aperta. La chiamata è «pigra»: parte solo
  // quando qualcuno ne attende il risultato, e `.then` è ciò che la fa partire.
  const segnaLetti = useCallback(() => {
    createClient()
      .rpc("segna_messaggi_letti", { p_candidatura: candidaturaId })
      .then(
        () => undefined,
        () => undefined
      );
  }, [candidaturaId]);

  useEffect(() => {
    segnaLetti();
  }, [segnaLetti]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-${candidaturaId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messaggi",
          filter: `candidatura_id=eq.${candidaturaId}`,
        },
        (payload) => {
          const nuovo = payload.new as Messaggio;
          setMessaggi((prev) =>
            prev.some((m) => m.id === nuovo.id) ? prev : [...prev, nuovo]
          );
          // se arriva dall'altra persona mentre la chat è aperta, è già letto
          if (nuovo.mittente_id !== userId) segnaLetti();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [candidaturaId, userId, segnaLetti]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messaggi]);

  // Il rischio dei messaggi RICEVUTI. Si calcola una volta per messaggio, non a ogni
  // battuta nel campo di testo. I propri messaggi non si segnalano: si è già avvisati prima di inviarli.
  const rischi = useMemo(
    () =>
      new Map(
        messaggi.map((m) => [m.id, m.mittente_id === userId ? null : rilevaRischioPagamento(m.testo)] as const)
      ),
    [messaggi, userId]
  );

  async function invia(conferma = false) {
    const testoTrim = testo.trim();
    if (!testoTrim) return;

    // Un consiglio, non un divieto: se il messaggio parla di soldi si chiede una conferma,
    // e «Invia comunque» lo manda così com'è.
    if (!conferma) {
      const rischio = rilevaRischioPagamento(testoTrim);
      if (rischio.livello !== "nessuno") {
        setDaConfermare(rischio);
        return;
      }
    }
    setDaConfermare(null);
    setInvio(true);
    setTesto("");

    const supabase = createClient();
    const { error } = await supabase.from("messaggi").insert({
      candidatura_id: candidaturaId,
      mittente_id: userId,
      testo: testoTrim,
    });

    setInvio(false);
    if (error) {
      setTesto(testoTrim); // rimetti il testo se l'invio fallisce
    }
  }

  return (
    <div className="chat-view">
      <div className="chat-top">
        <button onClick={() => router.back()} aria-label="Indietro" className="chat-back">
          <IconIndietro />
        </button>
        <div>
          <div className="chat-peer">{altroNome}</div>
          {titoloAnnuncio && (
            <div className="chat-listing">{titoloAnnuncio}</div>
          )}
        </div>
      </div>

      <AvvisoTruffe />

      <div className="chat-scroll">
        {messaggi.length === 0 && (
          <p className="chat-empty">
            Nessun messaggio ancora. Scrivi il primo!
          </p>
        )}
        {messaggi.map((m) => {
          const mio = m.mittente_id === userId;
          const rischio = rischi.get(m.id);
          return (
            <Fragment key={m.id}>
              <div className={`chat-msg ${mio ? "mine" : "theirs"}`}>{m.testo}</div>
              {rischio && <AvvisoMessaggio rischio={rischio} />}
            </Fragment>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {daConfermare && (
        <ConfermaInvioRischioso
          rischio={daConfermare}
          onModifica={() => setDaConfermare(null)}
          onInvia={() => invia(true)}
        />
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          invia();
        }}
        className="chat-input-row"
      >
        <input
          value={testo}
          onChange={(e) => {
            setTesto(e.target.value);
            // il testo è cambiato: la conferma riguardava quello di prima
            setDaConfermare(null);
          }}
          placeholder="Scrivi un messaggio..."
        />
        <button type="submit" disabled={invio || !testo.trim()} aria-label="Invia">
          <IconInvia />
        </button>
      </form>
    </div>
  );
}
