"use client";

import { Suspense, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signup, login } from "./actions";
import { IconCasa, IconPalazzo } from "@/components/icons";

type Ruolo = "inquilino" | "proprietario";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const erroreConferma = searchParams.get("errore");

  const [tab, setTab] = useState<"registrati" | "accedi">("registrati");
  const [ruolo, setRuolo] = useState<Ruolo>("inquilino");

  const [signupState, signupAction, signupPending] = useActionState(
    signup,
    null
  );
  const [loginState, loginAction, loginPending] = useActionState(login, null);

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
        <h1 className="login-title">Il nuovo modo di affittare casa.</h1>
        <p className="login-tag">
          Ogni casa ha un inquilino perfetto che la aspetta. Scorri, matcha,
          affitta. Tutto verificato, su MatchAmI.
        </p>

        {erroreConferma && (
          <p className="login-error mb-4">
            Conferma email non riuscita: {erroreConferma}
          </p>
        )}

        {/* Tab Registrati / Accedi */}
        <div className="login-switch">
          <button
            type="button"
            onClick={() => setTab("registrati")}
            className={tab === "registrati" ? "on" : ""}
          >
            Registrati
          </button>
          <button
            type="button"
            onClick={() => setTab("accedi")}
            className={tab === "accedi" ? "on" : ""}
          >
            Accedi
          </button>
        </div>

        {tab === "registrati" ? (
          <form action={signupAction} className="flex flex-col gap-3">
            <div className="role-row mb-1">
              <RoleCard
                label="Cerco casa"
                sublabel="Affitto come inquilino"
                selected={ruolo === "inquilino"}
                onClick={() => setRuolo("inquilino")}
                icon={<IconCasa />}
              />
              <RoleCard
                label="Ho un immobile"
                sublabel="Voglio metterlo in affitto"
                selected={ruolo === "proprietario"}
                onClick={() => setRuolo("proprietario")}
                icon={<IconPalazzo />}
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

            <label className="login-consent mt-1">
              <input type="checkbox" name="privacy" className="mt-0.5" />
              Accetto il trattamento dei dati necessario al funzionamento di
              MatchAmI (privacy policy).
            </label>

            {signupState?.error && (
              <p className="login-error">{signupState.error}</p>
            )}

            <button type="submit" disabled={signupPending} className="login-cta mt-2">
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
              <p className="login-error">{loginState.error}</p>
            )}

            <button type="submit" disabled={loginPending} className="login-cta mt-2">
              {loginPending ? "Accesso..." : "Accedi"}
            </button>
          </form>
        )}

        <p className="login-fine">
          Dopo la registrazione ti chiederemo se cerchi casa o hai un immobile
          da mettere in affitto.
        </p>
      </div>
    </main>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="login-input" />;
}

function RoleCard({
  label,
  sublabel,
  selected,
  onClick,
  icon,
}: {
  label: string;
  sublabel: string;
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`login-role-card ${selected ? "on" : ""}`}
    >
      {icon}
      <div className="rt">{label}</div>
      <div className="rs">{sublabel}</div>
    </button>
  );
}
