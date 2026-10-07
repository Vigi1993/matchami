"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  completaInvito,
  type RecensioneState,
} from "@/app/(app)/profilo/invito-actions";
import { TAG_RECENSIONE } from "@/lib/constants";

export function InvitoClient({
  token,
  inquilino,
  indirizzo,
  periodo,
}: {
  token: string;
  inquilino: string;
  indirizzo: string | null;
  periodo: string | null;
}) {
  const [state, formAction, pending] = useActionState<RecensioneState, FormData>(
    completaInvito,
    null
  );
  const [voto, setVoto] = useState(0);
  const [tag, setTag] = useState<string[]>([]);

  function toggleTag(t: string) {
    setTag((prec) =>
      prec.includes(t) ? prec.filter((x) => x !== t) : [...prec, t]
    );
  }

  if (state?.ok) {
    return (
      <main className="screen-wrap" style={{ position: "static", minHeight: "100dvh" }}>
        <div className="screen-inner">
          <div className="empty-inline" style={{ paddingTop: 90 }}>
            <h3>Grazie.</h3>
            <p>
              Il tuo commento è stato registrato e da oggi fa parte del
              punteggio di affidabilità di {inquilino}.
            </p>
            <Link href="/" className="opp-cta" style={{ textAlign: "center" }}>
              Scopri MatchAmI
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="screen-wrap" style={{ position: "static", minHeight: "100dvh" }}>
      <div className="screen-inner" style={{ maxWidth: 560 }}>
        <h1 className="screen-title">Com&apos;è andata con {inquilino}?</h1>
        <p className="screen-sub">
          {indirizzo ? `${indirizzo}` : `La casa che hai affittato a ${inquilino}`}
          {periodo ? ` · ${periodo}` : ""}. Il tuo voto entra nel punteggio di
          affidabilità, che gli altri proprietari vedono quando valutano una
          candidatura. Le qualità per ora non sono visibili ad altri.
        </p>

        <form action={formAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="voto" value={voto} />
          {tag.map((t) => (
            <input key={t} type="hidden" name="tag" value={t} />
          ))}

          <div className="pref-section">
            <div className="pref-label">
              <span>Il tuo voto</span>
            </div>
            <div className="chip-row">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setVoto(n)}
                  className={`chip ${voto === n ? "on" : ""}`}
                  style={{ minWidth: 46, textAlign: "center" }}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="field-note">1 è pessimo, 5 è ottimo.</p>
          </div>

          <div className="pref-section">
            <div className="pref-label">
              <span>Cosa riconosci a {inquilino}</span>
            </div>
            <div className="chip-row">
              {TAG_RECENSIONE.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTag(t)}
                  className={`chip ${tag.includes(t) ? "on" : ""}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="field-note">Facoltativo, scegline quante vuoi.</p>
          </div>

          {state?.error && <p className="note-error">{state.error}</p>}

          <button
            type="submit"
            disabled={pending || voto === 0}
            className="opp-cta"
          >
            {pending ? "Invio..." : "Lascia il feedback"}
          </button>

          <p className="field-note" style={{ marginTop: 14 }}>
            Una volta inviato non è più modificabile.
          </p>
        </form>
      </div>
    </main>
  );
}
