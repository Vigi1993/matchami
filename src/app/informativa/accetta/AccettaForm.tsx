"use client";

import Link from "next/link";
import { useActionState } from "react";
import { accettaInformativa, type AccettaState } from "./actions";
import { logout } from "@/app/login/actions";
import { INFORMATIVA } from "@/content/informativa";

export function AccettaForm({ destinazione }: { destinazione: string }) {
  const [state, formAction, pending] = useActionState<AccettaState, FormData>(
    accettaInformativa,
    null
  );

  return (
    <>
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={destinazione} />

        <label className="login-consent mt-1">
          <input type="checkbox" name="letto" className="mt-0.5" />
          Ho letto l&apos;informativa e accetto il trattamento dei dati che
          descrive.
        </label>

        {state?.error && <p className="login-error">{state.error}</p>}

        <button type="submit" disabled={pending} className="login-cta mt-2">
          {pending ? "Un momento..." : "Continua"}
        </button>
      </form>

      <form action={logout}>
        <button
          type="submit"
          className="login-fine"
          style={{ background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
        >
          Non accetto: esci
        </button>
      </form>

      <p className="login-fine" style={{ marginTop: 4 }}>
        <Link href="/informativa" target="_blank" rel="noopener noreferrer" className="underline">
          Leggi l&apos;informativa
        </Link>{" "}
        (versione {INFORMATIVA.versione})
      </p>
    </>
  );
}
