"use client";

import { Suspense, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signup, login, richiediReset } from "./actions";
import { INFORMATIVA } from "@/content/informativa";
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
  const next = searchParams.get("next") ?? "/";
  const eliminato = searchParams.get("eliminato") === "1";

  const [tab, setTab] = useState<"registrati" | "accedi" | "recupero">("registrati");
  const [ruolo, setRuolo] = useState<Ruolo>("inquilino");

  const [signupState, signupAction, signupPending] = useActionState(
    signup,
    null
  );
  const [loginState, loginAction, loginPending] = useActionState(login, null);
  const [recuperoState, recuperoAction, recuperoPending] = useActionState(
    richiediReset,
    null
  );

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

        {eliminato && (
          <p className="login-consent mb-4" style={{ lineHeight: 1.55 }}>
            Il tuo account è stato eliminato, insieme ai tuoi dati. Se vuoi
            tornare, puoi registrarti di nuovo.
          </p>
        )}

        {erroreConferma && (
          <p className="login-error mb-4">
            {erroreConferma}
          </p>
        )}

        {/* Tab Registrati / Accedi (non durante il recupero della password) */}
        {tab !== "recupero" && (
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
        )}

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
            <input type="hidden" name="next" value={next} />

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
              Ho letto l&apos;
              <a
                href="/informativa"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                informativa sulla privacy
                {INFORMATIVA.provvisoria ? " (provvisoria)" : ""}
              </a>{" "}
              e accetto il trattamento dei dati necessario al funzionamento di
              MatchAmI.
            </label>

            {signupState?.error && (
              <p className="login-error">{signupState.error}</p>
            )}

            <button type="submit" disabled={signupPending} className="login-cta mt-2">
              {signupPending ? "Creazione account..." : "Crea il tuo account"}
            </button>
          </form>
        ) : tab === "recupero" ? (
          <form action={recuperoAction} className="flex flex-col gap-3">
            <h2 className="login-title" style={{ fontSize: 19, marginBottom: 2 }}>
              Recupera la password
            </h2>
            <p className="login-tag" style={{ fontSize: 13, margin: "0 0 6px 0" }}>
              Scrivi l&apos;email con cui ti sei registrato: ti mandiamo un link
              per scegliere una nuova password.
            </p>

            {recuperoState?.messaggio ? (
              <p className="login-consent" style={{ lineHeight: 1.55 }}>
                {recuperoState.messaggio}
              </p>
            ) : (
              <>
                <Input name="email" type="email" placeholder="Email" required />
                {recuperoState?.error && (
                  <p className="login-error">{recuperoState.error}</p>
                )}
                <button
                  type="submit"
                  disabled={recuperoPending}
                  className="login-cta mt-2"
                >
                  {recuperoPending ? "Invio..." : "Mandami il link"}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setTab("accedi")}
              className="login-fine"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
                marginTop: 4,
              }}
            >
              Torna all&apos;accesso
            </button>
          </form>
        ) : (
          <form action={loginAction} className="flex flex-col gap-3">
            <input type="hidden" name="next" value={next} />
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

            <button
              type="button"
              onClick={() => setTab("recupero")}
              className="login-fine"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
                marginTop: 2,
              }}
            >
              Password dimenticata?
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
