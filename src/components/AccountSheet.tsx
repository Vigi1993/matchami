"use client";

import { useActionState, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Field } from "@/components/ui/Field";
import {
  updateNomeCognome,
  updateEmail,
  updatePassword,
  type AccountState,
} from "@/app/(app)/profilo/account-actions";
import {
  eliminaAccount,
  type EliminaState,
} from "@/app/(app)/profilo/elimina-actions";
import { CONFERMA_ELIMINAZIONE } from "@/lib/account";

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
  ruolo,
}: {
  open: boolean;
  onClose: () => void;
  nome: string | null;
  cognome: string | null;
  email: string | null;
  ruolo: "inquilino" | "proprietario";
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
      <Separatore />
      <EliminaAccount ruolo={ruolo} />
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

// ------------------------------------------------------------

/**
 * Cancellazione dell'account. Si apre in due tempi: prima la spiegazione di
 * cosa sparisce, poi il modulo con la password e la parola di conferma. Così
 * un tocco distratto non arriva mai a un modulo da inviare.
 */
function EliminaAccount({ ruolo }: { ruolo: "inquilino" | "proprietario" }) {
  const [aperto, setAperto] = useState(false);
  const [state, formAction, pending] = useActionState<EliminaState, FormData>(
    eliminaAccount,
    null
  );

  return (
    <div>
      <div className="pref-label">
        <span style={{ color: "var(--clay)" }}>Elimina l&apos;account</span>
      </div>

      {ruolo === "inquilino" ? (
        <p className="field-note" style={{ margin: "-4px 0 12px 0", lineHeight: 1.6 }}>
          Verranno eliminati <b>subito e per sempre</b>: il tuo profilo e le
          foto, la tua ricerca, le candidature, le chat, i contratti e le
          recensioni scritte su di te. Non si può annullare.
        </p>
      ) : (
        <p className="field-note" style={{ margin: "-4px 0 12px 0", lineHeight: 1.6 }}>
          Verranno eliminati <b>subito e per sempre</b>: il tuo profilo, i tuoi
          annunci con le foto, le candidature ricevute, le chat e i contratti,
          anche quelli che gli inquilini vedono: se ne hai in corso, avvisali
          prima. Restano, senza il tuo nome, le recensioni che hai scritto su
          inquilini ancora iscritti. Non si può annullare.
        </p>
      )}

      {!aperto ? (
        <button
          type="button"
          className="btn-danger-outline"
          onClick={() => setAperto(true)}
        >
          Voglio eliminare il mio account
        </button>
      ) : (
        <form action={formAction}>
          <Field label="La tua password">
            <input
              name="password_attuale"
              type="password"
              placeholder="Password attuale"
              required
              autoComplete="current-password"
              className="contract-input"
            />
          </Field>
          <Field label={`Scrivi ${CONFERMA_ELIMINAZIONE} per confermare`}>
            <input
              name="conferma"
              placeholder={CONFERMA_ELIMINAZIONE}
              required
              autoComplete="off"
              className="contract-input"
            />
            {state?.error && <p className="note-error">{state.error}</p>}
          </Field>
          <div className="flex gap-3">
            <button
              type="button"
              className="btn-danger-outline"
              style={{ borderColor: "rgba(16,21,26,.14)", color: "var(--ink)" }}
              onClick={() => setAperto(false)}
              disabled={pending}
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={pending}
              className="opp-cta"
              style={{ background: "var(--clay)" }}
            >
              {pending ? "Eliminazione..." : "Elimina per sempre"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
