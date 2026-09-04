"use client";

import { useActionState, useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import {
  updatePrivacy,
  type SaveState,
} from "@/app/(app)/profilo/privacy-actions";

export function PrivacySheet({
  open,
  onClose,
  consensoMarketingIniziale,
  consensoTerziIniziale,
}: {
  open: boolean;
  onClose: () => void;
  consensoMarketingIniziale: boolean;
  consensoTerziIniziale: boolean;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    updatePrivacy,
    null
  );
  const [marketing, setMarketing] = useState(consensoMarketingIniziale);
  const [terzi, setTerzi] = useState(consensoTerziIniziale);

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(onClose, 600);
      return () => clearTimeout(t);
    }
  }, [state, onClose]);

  return (
    <Sheet open={open} onClose={onClose} title="Privacy e consensi">
      <p className="text-xs text-ink/60 mb-5">
        Il trattamento dei dati necessario al funzionamento di MatchAmI
        (creare il profilo, gestire candidature e contratti) è sempre
        attivo: senza non potremmo farti usare l&apos;app. Qui puoi
        decidere solo sui consensi facoltativi.
      </p>
      <form action={formAction} className="flex flex-col gap-5">
        <input
          type="hidden"
          name="consenso_marketing"
          value={String(marketing)}
        />
        <input type="hidden" name="consenso_terzi" value={String(terzi)} />

        <Field label="Marketing MatchAmI">
          <p className="text-xs text-ink/50 mb-2">
            Email e notifiche su nuovi annunci, promozioni e novità del
            servizio.
          </p>
          <div className="flex gap-2">
            <Chip label="Sì" active={marketing} onClick={() => setMarketing(true)} />
            <Chip label="No" active={!marketing} onClick={() => setMarketing(false)} />
          </div>
        </Field>

        <Field label="Condivisione con partner terzi">
          <p className="text-xs text-ink/50 mb-2">
            Offerte di servizi collegati alla casa (utenze, assicurazioni,
            mutui) da parte di partner commerciali di MatchAmI.
          </p>
          <div className="flex gap-2">
            <Chip label="Sì" active={terzi} onClick={() => setTerzi(true)} />
            <Chip label="No" active={!terzi} onClick={() => setTerzi(false)} />
          </div>
        </Field>

        {state?.error && <p className="text-clay text-xs">{state.error}</p>}
        {state?.ok && <p className="text-moss text-xs">Salvato.</p>}

        <Button type="submit" disabled={pending}>
          {pending ? "Salvataggio..." : "Salva preferenze"}
        </Button>
      </form>
    </Sheet>
  );
}
