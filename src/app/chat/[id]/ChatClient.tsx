"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Messaggio } from "@/lib/types";

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
    <div className="flex flex-col h-dvh bg-paper">
      <div className="bg-ink text-paper px-4 py-4 flex items-center gap-3 shrink-0">
        <button
          onClick={() => router.back()}
          aria-label="Indietro"
          className="text-paper/70 text-xl leading-none px-1"
        >
          ←
        </button>
        <div>
          <div className="font-display font-bold text-sm">{altroNome}</div>
          {titoloAnnuncio && (
            <div className="text-[11px] text-paper/50">{titoloAnnuncio}</div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2">
        {messaggi.length === 0 && (
          <p className="text-center text-xs text-ink/40 mt-8">
            Nessun messaggio ancora. Scrivi il primo!
          </p>
        )}
        {messaggi.map((m) => {
          const mio = m.mittente_id === userId;
          return (
            <div
              key={m.id}
              className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm ${
                mio
                  ? "self-end bg-moss text-paper"
                  : "self-start bg-ink/8 text-ink"
              }`}
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
        className="flex items-center gap-2 p-4 border-t border-ink/10 shrink-0"
      >
        <input
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          placeholder="Scrivi un messaggio..."
          className="flex-1 bg-ink/5 rounded-full px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-gold"
        />
        <button
          type="submit"
          disabled={invio || !testo.trim()}
          className="bg-gold text-ink font-bold px-5 py-3 rounded-full disabled:opacity-50 text-sm"
        >
          Invia
        </button>
      </form>
    </div>
  );
}
