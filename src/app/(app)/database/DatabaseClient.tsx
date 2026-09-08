"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import type { CandidaturaRicevuta } from "@/lib/types";
import { valutaCandidatura } from "./actions";
import { PageContainer } from "@/components/ui/PageContainer";
import { IconPersone } from "@/components/icons";

const BADGE: Record<string, string> = {
  in_attesa: "is-wait",
  accettata: "is-match",
  rifiutata: "is-off",
};
const LABEL: Record<string, string> = {
  in_attesa: "Da valutare",
  accettata: "Accettata",
  rifiutata: "Rifiutata",
};

export function DatabaseClient({
  candidature,
}: {
  candidature: CandidaturaRicevuta[];
}) {
  const [selezionata, setSelezionata] = useState<CandidaturaRicevuta | null>(
    null
  );
  const [pending, startTransition] = useTransition();
  const [aggiornate, setAggiornate] = useState<
    Record<string, "accettata" | "rifiutata">
  >({});

  function stato(c: CandidaturaRicevuta): string {
    return aggiornate[c.id] ?? c.status;
  }

  function valuta(c: CandidaturaRicevuta, nuovo: "accettata" | "rifiutata") {
    startTransition(async () => {
      const res = await valutaCandidatura(c.id, nuovo);
      if (!res?.error) {
        setAggiornate((prev) => ({ ...prev, [c.id]: nuovo }));
        setSelezionata(null);
      }
    });
  }

  const inAttesa = candidature.filter((c) => stato(c) === "in_attesa");
  const valutate = candidature.filter((c) => stato(c) !== "in_attesa");

  return (
    <PageContainer wide>
      <h1 className="screen-title">Database inquilini</h1>
      <p className="screen-sub">
        {candidature.length === 0
          ? "Le candidature ricevute sui tuoi annunci arrivano qui."
          : `${candidature.length} candidatur${candidature.length === 1 ? "a ricevuta" : "e ricevute"} · ${inAttesa.length} da valutare.`}
      </p>

      {candidature.length === 0 && (
        <div className="empty-inline">
          <IconPersone className="icon-empty" />
          <h3>Nessuna candidatura ancora</h3>
          <p>
            Appena qualcuno si candiderà su un tuo annuncio pubblicato, lo
            vedrai qui.
          </p>
        </div>
      )}

      {inAttesa.length > 0 && (
        <Gruppo
          titolo="Da valutare"
          items={inAttesa}
          onSelect={setSelezionata}
          stato={stato}
        />
      )}
      {valutate.length > 0 && (
        <Gruppo
          titolo="Valutate"
          items={valutate}
          onSelect={setSelezionata}
          stato={stato}
        />
      )}

      <Sheet
        open={selezionata !== null}
        onClose={() => setSelezionata(null)}
        title={
          selezionata
            ? `${selezionata.nome ?? "Inquilino"} ${selezionata.cognome ?? ""}`
            : "Candidatura"
        }
      >
        {selezionata && (
          <>
            {selezionata.tenant_profiles?.avatar_url && (
              <div className="flex justify-center mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selezionata.tenant_profiles.avatar_url}
                  alt={`Foto di ${selezionata.nome ?? "inquilino"}`}
                  className="w-24 h-24 rounded-full object-cover"
                />
              </div>
            )}

            <p className="sheet-sub">
              Candidatura per <b>{selezionata.listings?.titolo}</b>
            </p>

            <DettaglioRow
              label="Situazione lavorativa"
              value={selezionata.tenant_profiles?.professione ?? "—"}
            />
            <DettaglioRow
              label="Reddito dichiarato"
              value={
                selezionata.tenant_profiles?.reddito_mensile
                  ? `€${selezionata.tenant_profiles.reddito_mensile.toLocaleString("it-IT")}/mese`
                  : "—"
              }
            />
            <DettaglioRow
              label="Reddito verificato"
              value={selezionata.tenant_profiles?.verificato ? "Sì" : "No"}
            />
            {selezionata.match_pct !== null && (
              <DettaglioRow
                label="Compatibilità"
                value={`${selezionata.match_pct}%`}
              />
            )}
            {selezionata.tenant_profiles?.presentazione && (
              <div style={{ marginTop: 18 }}>
                <div className="pref-label">
                  <span>Presentazione</span>
                </div>
                <p className="note-box" style={{ marginTop: 0, fontStyle: "italic" }}>
                  &quot;{selezionata.tenant_profiles.presentazione}&quot;
                </p>
              </div>
            )}

            {stato(selezionata) === "in_attesa" ? (
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => valuta(selezionata, "rifiutata")}
                  disabled={pending}
                  className="btn-danger-outline"
                >
                  Rifiuta
                </button>
                <button
                  onClick={() => valuta(selezionata, "accettata")}
                  disabled={pending}
                  className="opp-cta"
                >
                  Accetta
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 mt-6">
                <div
                  className={
                    stato(selezionata) === "accettata" ? "note-ok" : "note-box"
                  }
                  style={{ marginTop: 0 }}
                >
                  {stato(selezionata) === "accettata"
                    ? "Hai accettato questa candidatura."
                    : "Hai rifiutato questa candidatura."}
                </div>
                {stato(selezionata) === "accettata" && (
                  <Link
                    href={`/chat/${selezionata.id}`}
                    className="opp-cta block text-center"
                  >
                    Apri chat
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </Sheet>
    </PageContainer>
  );
}

function Gruppo({
  titolo,
  items,
  onSelect,
  stato,
}: {
  titolo: string;
  items: CandidaturaRicevuta[];
  onSelect: (c: CandidaturaRicevuta) => void;
  stato: (c: CandidaturaRicevuta) => string;
}) {
  return (
    <>
      <div className="pref-label" style={{ marginTop: 20 }}>
        <span>
          {titolo} — {items.length}
        </span>
      </div>
      <div className="card-grid">
        {items.map((c) => {
          const s = stato(c);
          const iniziali = `${c.nome?.[0] ?? ""}${c.cognome?.[0] ?? ""}`.toUpperCase();
          return (
            <button key={c.id} onClick={() => onSelect(c)} className="match-card">
              {c.tenant_profiles?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.tenant_profiles.avatar_url} alt="" />
              ) : (
                <div className="mc-avatar">{iniziali || "IN"}</div>
              )}
              <div className="mc-body">
                <div className="mc-zona">
                  {c.tenant_profiles?.professione ?? "Profilo inquilino"}
                </div>
                <div className="mc-title">
                  {c.nome} {c.cognome}
                </div>
                <div className="mc-meta">
                  {c.listings?.titolo}
                  {c.match_pct !== null && ` · ${c.match_pct}% compatibile`}
                </div>
              </div>
              <div className={`mc-pct ${BADGE[s]}`}>{LABEL[s]}</div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function DettaglioRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="feat-row">
      <span className="k">{label}</span>
      <span className="v">{value}</span>
    </div>
  );
}
