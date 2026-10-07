"use client";

import { useActionState, useState, useTransition } from "react";
import { Sheet } from "@/components/Sheet";
import { Field } from "@/components/ui/Field";
import {
  creaInvito,
  annullaInvito,
  type InvitoState,
} from "@/app/(app)/profilo/invito-actions";
import type { Invito } from "@/lib/types";
import { messaggioInvito } from "@/lib/invito";

const STATO_LABEL: Record<Invito["stato"], string> = {
  inviato: "In attesa",
  completato: "Feedback ricevuto",
  annullato: "Annullato",
};
const STATO_BADGE: Record<Invito["stato"], string> = {
  inviato: "is-wait",
  completato: "is-match",
  annullato: "is-off",
};

export function InvitaProprietarioSheet({
  open,
  onClose,
  nomeInquilino,
  inviti,
}: {
  open: boolean;
  onClose: () => void;
  nomeInquilino: string | null;
  inviti: Invito[];
}) {
  const [state, formAction, pending] = useActionState<InvitoState, FormData>(
    creaInvito,
    null
  );
  const [annullaPending, startAnnulla] = useTransition();

  // link appena creato (arriva dalla action) oppure ricostruito da un
  // invito già presente su cui l'utente ha premuto "Rivedi il link"
  const [linkAperto, setLinkAperto] = useState<string | null>(null);
  const link = state?.link ?? linkAperto;

  return (
    <Sheet open={open} onClose={onClose} title="Invita il tuo proprietario">
      <p className="sheet-sub">
        Se hai già una casa in affitto, il tuo proprietario può lasciare un
        commento su com&apos;è andata con te, e conta sul tuo punteggio di
        affidabilità. Per tenerlo affidabile, MatchAmI lo accetta solo da
        proprietari verificati, con un immobile verificato sul portale, e solo
        se esiste un contratto verificato tra voi due. Vale anche per gli
        affitti iniziati fuori da MatchAmI. Il contratto lo dichiari tu da
        &quot;I tuoi affitti&quot;, nel tuo profilo: il proprietario lo
        conferma da un link.
      </p>

      {link ? (
        <LinkPronto
          link={link}
          nomeInquilino={nomeInquilino}
          onIndietro={() => setLinkAperto(null)}
        />
      ) : (
        <form action={formAction}>
          <Field label="Nome del proprietario">
            <input
              name="nome_proprietario"
              placeholder="Come lo chiami di solito"
              required
              className="contract-input"
            />
          </Field>

          <Field label="La sua email">
            <input
              name="email_proprietario"
              type="email"
              placeholder="Facoltativa"
              className="contract-input"
            />
            <p className="field-note">
              Non gli scriviamo noi: il link glielo mandi tu. L&apos;email
              serve per ricontattarlo se il primo messaggio si perde.
            </p>
          </Field>

          <Field label="Di quale casa si tratta">
            <input
              name="indirizzo"
              placeholder="Via e città, o come la chiamate voi"
              className="contract-input"
            />
          </Field>

          <Field label="Da quando ci abiti">
            <input
              name="periodo"
              placeholder="Es. da marzo 2023"
              className="contract-input"
            />
          </Field>

          {state?.error && <p className="note-error">{state.error}</p>}

          <button type="submit" disabled={pending} className="opp-cta">
            {pending ? "Preparo il link..." : "Crea il link d'invito"}
          </button>
        </form>
      )}

      {inviti.length > 0 && (
        <>
          <div className="pref-label" style={{ marginTop: 30 }}>
            <span>Inviti mandati — {inviti.length}</span>
          </div>

          {inviti.map((i) => (
            <div key={i.id} className="pv-row" style={{ cursor: "default" }}>
              <div className="pv-text">
                <div className="pv-label-row">
                  <b>{i.nome_proprietario}</b>
                  <span className={`mc-pct ${STATO_BADGE[i.stato]}`}>
                    {STATO_LABEL[i.stato]}
                  </span>
                </div>
                <p>
                  {i.indirizzo ?? "Casa non specificata"}
                  {i.periodo ? ` · ${i.periodo}` : ""}
                </p>

                {i.stato === "inviato" && (
                  <div className="flex gap-4">
                    <button
                      type="button"
                      className="pv-readmore"
                      onClick={() =>
                        setLinkAperto(
                          `${window.location.origin}/invito/${i.token}`
                        )
                      }
                    >
                      Rivedi il link
                    </button>
                    <button
                      type="button"
                      className="redo-link"
                      style={{ color: "var(--clay)" }}
                      disabled={annullaPending}
                      onClick={() =>
                        startAnnulla(() => {
                          void annullaInvito(i.id);
                        })
                      }
                    >
                      Annulla
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------

function LinkPronto({
  link,
  nomeInquilino,
  onIndietro,
}: {
  link: string;
  nomeInquilino: string | null;
  onIndietro: () => void;
}) {
  const [copiato, setCopiato] = useState(false);
  const testo = messaggioInvito(nomeInquilino, link);

  async function copia() {
    try {
      await navigator.clipboard.writeText(testo);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2500);
    } catch {
      setCopiato(false);
    }
  }

  function condividi() {
    if (navigator.share) {
      navigator.share({ text: testo }).catch(() => {});
    } else {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(testo)}`,
        "_blank",
        "noopener"
      );
    }
  }

  return (
    <div>
      <div className="note-ok" style={{ marginBottom: 16 }}>
        Link pronto. Mandalo tu al proprietario: arrivando da te ha molte
        più probabilità di essere aperto. Per lasciare il commento dovrà
        verificare l&apos;immobile e il vostro contratto.
      </div>

      <Field label="Il messaggio da mandare">
        <textarea readOnly value={testo} className="ob-textarea" rows={4} />
      </Field>

      <div className="flex gap-3">
        <button type="button" onClick={condividi} className="opp-cta">
          Condividi
        </button>
        <button type="button" onClick={copia} className="btn-danger-outline"
          style={{ borderColor: "rgba(16,21,26,.14)", color: "var(--ink)" }}>
          {copiato ? "Copiato" : "Copia"}
        </button>
      </div>

      <button
        type="button"
        onClick={onIndietro}
        className="redo-link"
        style={{ marginTop: 18 }}
      >
        Invita un altro proprietario
      </button>
    </div>
  );
}
