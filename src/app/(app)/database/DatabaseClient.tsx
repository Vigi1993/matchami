"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import type { CandidaturaRicevuta } from "@/lib/types";
import { valutaCandidatura } from "./actions";
import { PageContainer } from "@/components/ui/PageContainer";

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
    <PageContainer>
      <h1 className="font-display text-xl text-ink mb-1">
        Database inquilini
      </h1>
      <p className="text-xs text-ink/50 mb-6">
        {candidature.length === 0
          ? "Le candidature ricevute sui tuoi annunci arrivano qui."
          : `${candidature.length} candidatur${candidature.length === 1 ? "a ricevuta" : "e ricevute"} · ${inAttesa.length} da valutare`}
      </p>

      {candidature.length === 0 && (
        <div className="bg-ink/5 rounded-2xl p-5 text-center">
          <h3 className="font-display font-bold text-sm text-ink mb-1">
            Nessuna candidatura ancora
          </h3>
          <p className="text-xs text-ink/50 max-w-xs mx-auto">
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
          <div className="flex flex-col gap-4">
            <div className="text-xs text-ink/50">
              Candidatura per{" "}
              <b className="text-ink">{selezionata.listings?.titolo}</b>
            </div>

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
              <div>
                <div className="text-xs text-ink/50 mb-1">Presentazione</div>
                <p className="text-sm text-ink italic">
                  &quot;{selezionata.tenant_profiles.presentazione}&quot;
                </p>
              </div>
            )}

            {stato(selezionata) === "in_attesa" ? (
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => valuta(selezionata, "rifiutata")}
                  disabled={pending}
                  className="flex-1 border-2 border-clay text-clay font-bold text-sm py-3 rounded-xl disabled:opacity-50"
                >
                  Rifiuta
                </button>
                <button
                  onClick={() => valuta(selezionata, "accettata")}
                  disabled={pending}
                  className="flex-1 bg-moss text-paper font-bold text-sm py-3 rounded-xl disabled:opacity-50"
                >
                  Accetta
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 mt-2">
                <div
                  className={`text-xs rounded-xl p-3 ${
                    stato(selezionata) === "accettata"
                      ? "bg-moss/10 text-moss"
                      : "bg-ink/5 text-ink/50"
                  }`}
                >
                  {stato(selezionata) === "accettata"
                    ? "Hai accettato questa candidatura."
                    : "Hai rifiutato questa candidatura."}
                </div>
                {stato(selezionata) === "accettata" && (
                  <Link
                    href={`/chat/${selezionata.id}`}
                    className="w-full text-center bg-moss text-paper font-bold text-sm py-3 rounded-xl"
                  >
                    Apri chat
                  </Link>
                )}
              </div>
            )}
          </div>
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
  const COLOR: Record<string, string> = {
    in_attesa: "bg-gold/20 text-[#8A6A25]",
    accettata: "bg-moss/15 text-moss",
    rifiutata: "bg-ink/10 text-ink/40",
  };
  const LABEL: Record<string, string> = {
    in_attesa: "Da valutare",
    accettata: "Accettata",
    rifiutata: "Rifiutata",
  };

  return (
    <div className="mb-6">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-ink/50">
        {titolo} · {items.length}
      </div>
      <div className="flex flex-col gap-3">
        {items.map((c) => {
          const s = stato(c);
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className="w-full text-left bg-white border border-ink/10 rounded-2xl p-4"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-display font-bold text-sm text-ink">
                  {c.nome} {c.cognome}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-1 rounded-full ${COLOR[s]}`}
                >
                  {LABEL[s]}
                </span>
              </div>
              <div className="text-xs text-ink/50">
                {c.listings?.titolo} · {c.tenant_profiles?.professione ?? "—"}
                {c.match_pct !== null && ` · ${c.match_pct}% compatibile`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DettaglioRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm border-b border-ink/10 pb-2">
      <span className="text-ink/50">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}
