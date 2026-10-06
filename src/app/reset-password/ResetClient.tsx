"use client";

import { useActionState } from "react";
import { impostaNuovaPassword } from "./actions";

export function ResetClient() {
  const [state, formAction, pending] = useActionState(impostaNuovaPassword, null);

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
        <h1 className="login-title">Scegli una nuova password</h1>
        <p className="login-tag" style={{ marginBottom: 22 }}>
          Dopo il salvataggio entri direttamente nell&apos;app.
        </p>

        <form action={formAction} className="flex flex-col gap-3">
          <input
            name="password_nuova"
            type="password"
            placeholder="Nuova password (min. 8 caratteri)"
            required
            autoComplete="new-password"
            className="login-input"
          />
          <input
            name="password_ripeti"
            type="password"
            placeholder="Ripeti la nuova password"
            required
            autoComplete="new-password"
            className="login-input"
          />

          {state?.error && <p className="login-error">{state.error}</p>}

          <button type="submit" disabled={pending} className="login-cta mt-2">
            {pending ? "Salvataggio..." : "Salva la nuova password"}
          </button>
        </form>
      </div>
    </main>
  );
}
