"use client";

import { useActionState, useState } from "react";
import { signup, login } from "./actions";

type Ruolo = "inquilino" | "proprietario";

export default function LoginPage() {
  const [tab, setTab] = useState<"registrati" | "accedi">("registrati");
  const [ruolo, setRuolo] = useState<Ruolo>("inquilino");

  const [signupState, signupAction, signupPending] = useActionState(
    signup,
    null
  );
  const [loginState, loginAction, loginPending] = useActionState(login, null);

  return (
    <main className="min-h-screen bg-ink text-paper flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-display italic text-2xl text-center mb-1">
          Match<span className="text-gold not-italic">AmI</span>
        </h1>
        <p className="text-center text-paper/70 text-sm mb-8">
          Ogni casa ha un inquilino perfetto che la aspetta. Scorri, matcha,
          affitta. Tutto verificato, su MatchAmI.
        </p>

        {/* Tab Registrati / Accedi */}
        <div className="flex bg-paper/10 rounded-2xl p-1 mb-6">
          <button
            type="button"
            onClick={() => setTab("registrati")}
            className={`flex-1 text-sm font-bold py-2.5 rounded-xl transition-colors ${
              tab === "registrati"
                ? "bg-paper text-ink"
                : "text-paper/60"
            }`}
          >
            Registrati
          </button>
          <button
            type="button"
            onClick={() => setTab("accedi")}
            className={`flex-1 text-sm font-bold py-2.5 rounded-xl transition-colors ${
              tab === "accedi" ? "bg-paper text-ink" : "text-paper/60"
            }`}
          >
            Accedi
          </button>
        </div>

        {tab === "registrati" ? (
          <form action={signupAction} className="flex flex-col gap-3">
            <div className="flex gap-3 mb-1">
              <RoleCard
                label="Cerco casa"
                sublabel="Affitto come inquilino"
                selected={ruolo === "inquilino"}
                onClick={() => setRuolo("inquilino")}
              />
              <RoleCard
                label="Ho un immobile"
                sublabel="Voglio metterlo in affitto"
                selected={ruolo === "proprietario"}
                onClick={() => setRuolo("proprietario")}
              />
            </div>
            <input type="hidden" name="ruolo" value={ruolo} />

            <div className="flex gap-3">
              <Input name="nome" placeholder="Nome" />
              <Input name="cognome" placeholder="Cognome" />
            </div>
            <Input name="email" type="email" placeholder="Email" required />
            <Input
              name="password"
              type="password"
              placeholder="Password (min. 8 caratteri)"
              required
            />

            <label className="flex items-start gap-2 text-xs text-paper/70 mt-1">
              <input type="checkbox" name="privacy" className="mt-0.5" />
              Accetto il trattamento dei dati necessario al funzionamento di
              MatchAmI (privacy policy).
            </label>

            {signupState?.error && (
              <p className="text-clay text-xs">{signupState.error}</p>
            )}

            <button
              type="submit"
              disabled={signupPending}
              className="bg-gold text-ink font-bold text-sm py-3 rounded-xl mt-2 disabled:opacity-60"
            >
              {signupPending ? "Creazione account..." : "Crea il tuo account"}
            </button>
          </form>
        ) : (
          <form action={loginAction} className="flex flex-col gap-3">
            <Input name="email" type="email" placeholder="Email" required />
            <Input
              name="password"
              type="password"
              placeholder="Password"
              required
            />

            {loginState?.error && (
              <p className="text-clay text-xs">{loginState.error}</p>
            )}

            <button
              type="submit"
              disabled={loginPending}
              className="bg-gold text-ink font-bold text-sm py-3 rounded-xl mt-2 disabled:opacity-60"
            >
              {loginPending ? "Accesso..." : "Accedi"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full bg-paper/10 placeholder:text-paper/40 text-paper text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-gold"
    />
  );
}

function RoleCard({
  label,
  sublabel,
  selected,
  onClick,
}: {
  label: string;
  sublabel: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-2xl border p-3 text-left transition-colors ${
        selected
          ? "border-moss bg-moss/15"
          : "border-paper/15 bg-paper/5"
      }`}
    >
      <div className="font-display font-bold text-sm text-paper">
        {label}
      </div>
      <div className="text-[11px] text-paper/60">{sublabel}</div>
    </button>
  );
}
