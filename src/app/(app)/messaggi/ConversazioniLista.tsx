"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  anteprimaMessaggio,
  descrizioneConversazione,
  etichettaNonLetti,
  iniziali,
  testoNessunaConversazione,
  type Conversazione,
} from "@/lib/conversazioni";
import { trascorso } from "@/lib/notifiche";

/**
 * L'elenco delle conversazioni. L'elenco lo compone il database
 * (`elenco_conversazioni`); qui si disegna e si tiene aggiornato quando
 * arriva un messaggio.
 */
export function ConversazioniLista({
  conversazioni,
  userId,
  ruolo,
  errore,
}: {
  conversazioni: Conversazione[];
  userId: string;
  ruolo: string;
  /** Il caricamento è fallito: non si finge che non ci siano conversazioni. */
  errore: boolean;
}) {
  const router = useRouter();

  // Quando l'altra persona scrive, l'elenco si ricarica. Un solo ricaricamento
  // anche se arrivano più messaggi di seguito. Ciò che scrivo io lo vedo
  // tornando qui dalla chat.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const canale = supabase
      .channel("conversazioni")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messaggi" },
        (payload) => {
          const nuovo = payload.new as { mittente_id?: string };
          if (nuovo.mittente_id === userId) return;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => router.refresh(), 400);
        }
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(canale);
    };
  }, [userId, router]);

  if (errore) {
    return (
      <div className="note-box is-no" style={{ marginTop: 0 }} role="alert">
        <b>Non è stato possibile caricare le conversazioni.</b> Riprova tra poco.
      </div>
    );
  }

  if (conversazioni.length === 0) {
    return (
      <div className="note-box" style={{ marginTop: 0 }}>
        <b>Nessuna conversazione.</b> {testoNessunaConversazione(ruolo)}
      </div>
    );
  }

  return (
    <ul className="conversazioni-lista">
      {conversazioni.map((c) => {
        const segnalino = etichettaNonLetti(c.non_letti);
        return (
          <li key={c.candidatura_id}>
            <Link
              href={`/chat/${c.candidatura_id}`}
              className={`conversazione ${c.non_letti > 0 ? "nuova" : ""}`}
              aria-label={descrizioneConversazione(c)}
            >
              <span className="mc-avatar" aria-hidden>
                {iniziali(c.altro_nome)}
              </span>
              <span className="conversazione-corpo">
                <span className="conversazione-nome">{c.altro_nome}</span>
                <span className="conversazione-annuncio">{c.titolo}</span>
                <span className="conversazione-anteprima">{anteprimaMessaggio(c)}</span>
              </span>
              <span className="conversazione-lato">
                {c.ultimo_at && <span className="conversazione-tempo">{trascorso(c.ultimo_at)}</span>}
                {segnalino && (
                  <span className="conversazione-conto" aria-hidden>
                    {segnalino}
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
