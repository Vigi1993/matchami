"use client";

import { useActionState } from "react";
import { rispondiRapporto, type RispostaState } from "./actions";

export function RispostaForm({
  token,
  immobili,
}: {
  token: string;
  /** i miei immobili, se devo indicare a quale si riferisce l'affitto; vuoto se l'immobile è già noto */
  immobili: { id: string; titolo: string; zona: string }[] | null;
}) {
  const [state, formAction, pending] = useActionState<RispostaState, FormData>(
    rispondiRapporto,
    null
  );

  if (state?.fatto === "confermata") {
    return (
      <p className="login-consent" style={{ lineHeight: 1.6 }}>
        Grazie, hai confermato. Ora il team di MatchAmI controlla il contratto:
        l&apos;affitto conterrà per i feedback solo se risulta in regola.
      </p>
    );
  }
  if (state?.fatto === "rifiutata") {
    return (
      <p className="login-consent" style={{ lineHeight: 1.6 }}>
        Fatto: hai risposto che questo affitto non corrisponde. Chi lo ha
        dichiarato lo vedrà come rifiutato.
      </p>
    );
  }

  const serveImmobile = immobili !== null;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />

      {serveImmobile &&
        (immobili.length === 0 ? (
          <p className="login-error">
            Per confermare devi indicare a quale tuo immobile si riferisce, ma
            non ne hai ancora aggiunti. Aggiungine uno da Immobili e poi
            riapri questo link.
          </p>
        ) : (
          <label className="flex flex-col gap-2" style={{ fontSize: 13 }}>
            <span>A quale tuo immobile si riferisce?</span>
            <select name="listing" required className="login-input" defaultValue="">
              <option value="" disabled>
                Scegli…
              </option>
              {immobili.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.titolo} · {i.zona}
                </option>
              ))}
            </select>
          </label>
        ))}

      {state?.error && <p className="login-error">{state.error}</p>}

      <button
        type="submit"
        name="esito"
        value="conferma"
        disabled={pending || (serveImmobile && immobili.length === 0)}
        className="login-cta mt-2"
      >
        {pending ? "Un momento..." : "Confermo: è corretto"}
      </button>
      <button
        type="submit"
        name="esito"
        value="rifiuta"
        disabled={pending}
        formNoValidate
        className="login-fine"
        style={{ background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
      >
        Non corrisponde
      </button>
    </form>
  );
}
