"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { INFORMATIVA } from "@/content/informativa";
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

  // Quando hai accettato l'informativa in vigore. La sicurezza del database
  // fa leggere a ognuno solo le proprie accettazioni.
  const [accettataAl, setAccettataAl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!open) return;
    createClient()
      .from("accettazioni_informativa")
      .select("accettata_at")
      .eq("versione", INFORMATIVA.versione)
      .maybeSingle()
      .then(({ data }) => setAccettataAl((data?.accettata_at as string | undefined) ?? null));
  }, [open]);

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(onClose, 600);
      return () => clearTimeout(t);
    }
  }, [state, onClose]);

  return (
    <Sheet open={open} onClose={onClose} title="Privacy e consensi">
      <div className="note-box" style={{ marginTop: 0, marginBottom: 16 }}>
        <b>
          Informativa sulla privacy
          {INFORMATIVA.provvisoria ? " (provvisoria)" : ""}
        </b>
        <br />
        Versione {INFORMATIVA.versione}.{" "}
        {accettataAl === undefined
          ? ""
          : accettataAl
            ? `Accettata il ${new Date(accettataAl).toLocaleDateString("it-IT", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}.`
            : "Non ancora accettata."}{" "}
        <Link href="/informativa" target="_blank" rel="noopener noreferrer" className="underline">
          Leggila
        </Link>
      </div>
      <p className="sheet-sub">
        Alcuni dati servono per far funzionare l&apos;app: sono descritti
        nell&apos;informativa. Qui puoi decidere solo sui consensi facoltativi.
      </p>
      <form action={formAction}>
        <input
          type="hidden"
          name="consenso_marketing"
          value={String(marketing)}
        />
        <input type="hidden" name="consenso_terzi" value={String(terzi)} />

        <Field label="Marketing MatchAmI">
          <p className="field-note" style={{ margin: "-4px 0 10px 0" }}>
            Email e notifiche su nuovi annunci, promozioni e novità del
            servizio.
          </p>
          <div className="chip-row">
            <Chip label="Sì" active={marketing} onClick={() => setMarketing(true)} />
            <Chip label="No" active={!marketing} onClick={() => setMarketing(false)} />
          </div>
        </Field>

        <Field label="Condivisione con partner terzi">
          <p className="field-note" style={{ margin: "-4px 0 10px 0" }}>
            Offerte di servizi collegati alla casa (utenze, assicurazioni,
            mutui) da parte di partner commerciali di MatchAmI.
          </p>
          <div className="chip-row">
            <Chip label="Sì" active={terzi} onClick={() => setTerzi(true)} />
            <Chip label="No" active={!terzi} onClick={() => setTerzi(false)} />
          </div>
        </Field>

        {state?.error && <p className="note-error">{state.error}</p>}
        {state?.ok && <p className="note-saved">Salvato.</p>}

        <Button type="submit" disabled={pending}>
          {pending ? "Salvataggio..." : "Salva preferenze"}
        </Button>
      </form>
    </Sheet>
  );
}
