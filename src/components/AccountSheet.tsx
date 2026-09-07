"use client";

import { useActionState } from "react";
import { Sheet } from "@/components/Sheet";
import { Field } from "@/components/ui/Field";
import {
  updateNomeCognome,
  updateEmail,
  updatePassword,
  type AccountState,
} from "@/app/(app)/profilo/account-actions";

/**
 * "Account e accesso": tre form indipendenti (nome, email, password),
 * uno per operazione, ciascuno con il proprio stato. Usata identica dal
 * profilo inquilino e da quello proprietario.
 */
export function AccountSheet({
  open,
  onClose,
  nome,
  cognome,
  email,
}: {
  open: boolean;
  onClose: () => void;
  nome: string | null;
  cognome: string | null;
  email: string | null;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Account e accesso">
      <p className="sheet-sub">
        Nome, indirizzo email e password con cui accedi a MatchAmI. Ogni
        blocco si salva per conto suo.
      </p>

      <FormNome nome={nome} cognome={cognome} />
      <Separatore />
      <FormEmail email={email} />
      <Separatore />
      <FormPassword />
    </Sheet>
  );
}

function Separatore() {
  return (
    <div
      style={{
        borderTop: "1px solid rgba(16,21,26,0.08)",
        margin: "26px 0",
      }}
    />
  );
}

function Esito({ state }: { state: AccountState }) {
  if (state?.error) return <p className="note-error">{state.error}</p>;
  if (state?.ok)
    return <p className="note-ok">{state.messaggio ?? "Salvato."}</p>;
  return null;
}

// ------------------------------------------------------------

function FormNome({
  nome,
  cognome,
}: {
  nome: string | null;
  cognome: string | null;
}) {
  const [state, formAction, pending] = useActionState<AccountState, FormData>(
    updateNomeCognome,
    null
  );

  return (
    <form action={formAction}>
      <Field label="Nome e cognome">
        <div className="flex gap-2">
          <input
            name="nome"
            defaultValue={nome ?? ""}
            placeholder="Nome"
            className="contract-input"
          />
          <input
            name="cognome"
            defaultValue={cognome ?? ""}
            placeholder="Cognome"
            className="contract-input"
          />
        </div>
        <Esito state={state} />
      </Field>
      <button type="submit" disabled={pending} className="opp-cta">
        {pending ? "Salvataggio..." : "Salva nome"}
      </button>
    </form>
  );
}

// ------------------------------------------------------------

function FormEmail({ email }: { email: string | null }) {
  const [state, formAction, pending] = useActionState<AccountState, FormData>(
    updateEmail,
    null
  );

  return (
    <form action={formAction}>
      <Field label="Email di accesso">
        <p className="field-note" style={{ margin: "-4px 0 10px 0" }}>
          Attuale: <b>{email ?? "—"}</b>. Dopo il salvataggio ti arriverà un
          link di conferma al nuovo indirizzo: il cambio vale solo da quel
          momento.
        </p>
        <input
          name="email"
          type="email"
          placeholder="Nuova email"
          required
          className="contract-input"
        />
        <input
          name="password_attuale"
          type="password"
          placeholder="Password attuale"
          required
          className="contract-input"
        />
        <Esito state={state} />
      </Field>
      <button type="submit" disabled={pending} className="opp-cta">
        {pending ? "Invio in corso..." : "Cambia email"}
      </button>
    </form>
  );
}

// ------------------------------------------------------------

function FormPassword() {
  const [state, formAction, pending] = useActionState<AccountState, FormData>(
    updatePassword,
    null
  );

  return (
    <form action={formAction}>
      <Field label="Password">
        <input
          name="password_attuale"
          type="password"
          placeholder="Password attuale"
          required
          className="contract-input"
        />
        <input
          name="password_nuova"
          type="password"
          placeholder="Nuova password (min. 8 caratteri)"
          required
          className="contract-input"
        />
        <input
          name="password_ripeti"
          type="password"
          placeholder="Ripeti la nuova password"
          required
          className="contract-input"
        />
        <Esito state={state} />
      </Field>
      <button type="submit" disabled={pending} className="opp-cta">
        {pending ? "Salvataggio..." : "Cambia password"}
      </button>
    </form>
  );
}
