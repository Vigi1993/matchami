"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Messaggio } from "@/lib/types";
import { IconIndietro, IconInvia } from "@/components/icons";

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
  const bottomRef = useRef<HTMLDivElement>(null);

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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [candidaturaId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messaggi]);

  async function invia() {
    const testoTrim = testo.trim();
    if (!testoTrim) return;
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

      <div className="chat-scroll">
        {messaggi.length === 0 && (
          <p className="chat-empty">
            Nessun messaggio ancora. Scrivi il primo!
          </p>
        )}
        {messaggi.map((m) => {
          const mio = m.mittente_id === userId;
          return (
            <div
              key={m.id}
              className={`chat-msg ${mio ? "mine" : "theirs"}`}
            >
              {m.testo}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          invia();
        }}
        className="chat-input-row"
      >
        <input
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          placeholder="Scrivi un messaggio..."
        />
        <button type="submit" disabled={invio || !testo.trim()} aria-label="Invia">
          <IconInvia />
        </button>
      </form>
    </div>
  );
}
