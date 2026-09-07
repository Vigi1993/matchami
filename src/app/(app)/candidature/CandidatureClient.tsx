"use client";

import { useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import type { CandidaturaConAnnuncio, StatoCandidatura } from "@/lib/types";
import { PageContainer } from "@/components/ui/PageContainer";
import { IconChat } from "@/components/icons";

const STATO_LABEL: Record<StatoCandidatura, string> = {
  in_attesa: "In attesa",
  accettata: "Match",
  rifiutata: "Non accettata",
};

const STATO_BADGE: Record<StatoCandidatura, string> = {
  in_attesa: "is-wait",
  accettata: "is-match",
  rifiutata: "is-off",
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
    <PageContainer wide>
      <h1 className="screen-title">I tuoi match</h1>
      <p className="screen-sub">
        {candidature.length === 0
          ? "Gli annunci a cui ti candidi arrivano qui."
          : `${candidature.length} candidatur${candidature.length === 1 ? "a inviata" : "e inviate"}${
              accettate.length > 0 ? ` · ${accettate.length} match` : ""
            }.`}
      </p>

      {candidature.length === 0 ? (
        <div className="empty-inline">
          <IconChat className="icon-empty" />
          <h3>Ancora nessuna candidatura</h3>
          <p>
            Torna su &quot;Cerca&quot; e scorri gli annunci: le tue candidature
            e gli eventuali match finiscono qui.
          </p>
        </div>
      ) : (
        <>
          {accettate.length > 0 && (
            <Gruppo titolo="Match" items={accettate} onSelect={setSelezionata} />
          )}
          {inAttesa.length > 0 && (
            <Gruppo
              titolo="In attesa di risposta"
              items={inAttesa}
              onSelect={setSelezionata}
            />
          )}
          {rifiutate.length > 0 && (
            <Gruppo
              titolo="Non andate a buon fine"
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
          <>
            <div className="mb-4">
              <span className={`mc-pct ${STATO_BADGE[selezionata.status]}`}>
                {STATO_LABEL[selezionata.status]}
              </span>
            </div>

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
              <DettaglioRow
                label="Compatibilità"
                value={`${selezionata.match_pct}%`}
              />
            )}

            {selezionata.status === "accettata" && (
              <div className="flex flex-col gap-3 mt-5">
                <div className="note-ok">
                  Il proprietario ha accettato la tua candidatura.
                </div>
                <Link
                  href={`/chat/${selezionata.id}`}
                  className="opp-cta block text-center"
                >
                  Apri chat
                </Link>
              </div>
            )}
            {selezionata.status === "in_attesa" && (
              <div className="note-box mt-5">
                Il proprietario non ha ancora valutato questa candidatura.
              </div>
            )}
            {selezionata.status === "rifiutata" && (
              <div className="note-box mt-5">
                Il proprietario ha scelto un altro profilo per questo annuncio.
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
}: {
  titolo: string;
  items: CandidaturaConAnnuncio[];
  onSelect: (c: CandidaturaConAnnuncio) => void;
}) {
  return (
    <>
      <div className="pref-label" style={{ marginTop: 20 }}>
        <span>
          {titolo} — {items.length}
        </span>
      </div>
      {items.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c)}
          className="match-card"
          style={c.status === "rifiutata" ? { opacity: 0.55 } : undefined}
        >
          <div className="mc-avatar">
            {(c.listings?.titolo ?? "IM").slice(0, 2).toUpperCase()}
          </div>
          <div className="mc-body">
            <div className="mc-zona">{c.listings?.zona ?? ""}</div>
            <div className="mc-title">{c.listings?.titolo ?? "Immobile"}</div>
            <div className="mc-meta">
              {c.listings?.prezzo
                ? `€${c.listings.prezzo.toLocaleString("it-IT")}/mese`
                : "—"}
              {c.match_pct !== null && ` · ${c.match_pct}% compatibile`}
            </div>
          </div>
          <div className={`mc-pct ${STATO_BADGE[c.status]}`}>
            {STATO_LABEL[c.status]}
          </div>
        </button>
      ))}
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
