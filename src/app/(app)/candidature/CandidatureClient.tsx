"use client";

import { useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import type { CandidaturaConAnnuncio, StatoCandidatura } from "@/lib/types";

const STATO_LABEL: Record<StatoCandidatura, string> = {
  in_attesa: "Da valutare",
  accettata: "Match",
  rifiutata: "Scartata",
};

const STATO_COLOR: Record<StatoCandidatura, string> = {
  in_attesa: "bg-gold/20 text-[#8A6A25]",
  accettata: "bg-moss/15 text-moss",
  rifiutata: "bg-ink/10 text-ink/40",
};

export function CandidatureClient({
  candidature,
}: {
  candidature: CandidaturaConAnnuncio[];
}) {
  const [selezionata, setSelezionata] = useState<CandidaturaConAnnuncio | null>(
    null
  );

  const inAttesa = candidature.filter((c) => c.status === "in_attesa");
  const accettate = candidature.filter((c) => c.status === "accettata");
  const rifiutate = candidature.filter((c) => c.status === "rifiutata");

  return (
    <div className="px-5 pt-6 pb-8 max-w-md mx-auto">
      <h1 className="font-display text-xl text-ink mb-1">Le tue candidature</h1>
      <p className="text-xs text-ink/50 mb-6">
        {candidature.length === 0
          ? "Gli annunci a cui ti candidi arrivano qui."
          : `${candidature.length} candidatur${candidature.length === 1 ? "a inviata" : "e inviate"}${
              accettate.length > 0 ? ` · ${accettate.length} match` : ""
            }`}
      </p>

      {candidature.length === 0 ? (
        <div className="bg-ink/5 rounded-2xl p-4 text-xs text-ink/50">
          Ancora nessuna candidatura. Vai su Home e scorri gli annunci: le
          tue candidature e gli eventuali match finiscono qui.
        </div>
      ) : (
        <>
          {accettate.length > 0 && (
            <Gruppo
              titolo="Match"
              items={accettate}
              onSelect={setSelezionata}
            />
          )}
          {inAttesa.length > 0 && (
            <Gruppo
              titolo="Da valutare"
              items={inAttesa}
              onSelect={setSelezionata}
            />
          )}
          {rifiutate.length > 0 && (
            <Gruppo
              titolo="Scartate"
              items={rifiutate}
              onSelect={setSelezionata}
            />
          )}
        </>
      )}

      <Sheet
        open={selezionata !== null}
        onClose={() => setSelezionata(null)}
        title={selezionata?.listings?.titolo ?? "Candidatura"}
      >
        {selezionata && (
          <div className="flex flex-col gap-4">
            <span
              className={`self-start text-[10px] font-bold px-2 py-1 rounded-full ${STATO_COLOR[selezionata.status]}`}
            >
              {STATO_LABEL[selezionata.status]}
            </span>
            <DettaglioRow label="Zona" value={selezionata.listings?.zona ?? "—"} />
            <DettaglioRow
              label="Canone"
              value={
                selezionata.listings?.prezzo
                  ? `€${selezionata.listings.prezzo.toLocaleString("it-IT")}/mese`
                  : "—"
              }
            />
            <DettaglioRow
              label="Taglio"
              value={
                selezionata.listings?.locali
                  ? `${selezionata.listings.locali} locali · ${selezionata.listings.mq ?? "—"} m²`
                  : "—"
              }
            />
            {selezionata.match_pct !== null && (
              <DettaglioRow label="Compatibilità" value={`${selezionata.match_pct}%`} />
            )}

            {selezionata.status === "accettata" && (
              <div className="flex flex-col gap-2 mt-2">
                <div className="bg-moss/10 text-moss text-xs rounded-xl p-3">
                  Il proprietario ha accettato la tua candidatura.
                </div>
                <Link
                  href={`/chat/${selezionata.id}`}
                  className="w-full text-center bg-moss text-paper font-bold text-sm py-3 rounded-xl"
                >
                  Apri chat
                </Link>
              </div>
            )}
            {selezionata.status === "in_attesa" && (
              <div className="bg-ink/5 text-ink/60 text-xs rounded-xl p-3 mt-2">
                Il proprietario non ha ancora valutato questa candidatura.
              </div>
            )}
            {selezionata.status === "rifiutata" && (
              <div className="bg-ink/5 text-ink/50 text-xs rounded-xl p-3 mt-2">
                Il proprietario ha scelto un altro profilo per questo
                annuncio.
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function Gruppo({
  titolo,
  items,
  onSelect,
}: {
  titolo: string;
  items: CandidaturaConAnnuncio[];
  onSelect: (c: CandidaturaConAnnuncio) => void;
}) {
  return (
    <div className="mb-6">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-ink/50">
        {titolo} · {items.length}
      </div>
      <div className="flex flex-col gap-3">
        {items.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className="w-full text-left bg-white border border-ink/10 rounded-2xl p-4"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-display font-bold text-sm text-ink">
                {c.listings?.titolo ?? "Immobile"}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-1 rounded-full ${STATO_COLOR[c.status]}`}
              >
                {STATO_LABEL[c.status]}
              </span>
            </div>
            <div className="text-xs text-ink/50">
              {c.listings?.zona ?? ""}
              {c.listings?.prezzo && ` · €${c.listings.prezzo.toLocaleString("it-IT")}/mese`}
              {c.match_pct !== null && ` · ${c.match_pct}% compatibile`}
            </div>
          </button>
        ))}
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
