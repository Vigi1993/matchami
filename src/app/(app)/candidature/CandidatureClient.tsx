"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import type { CandidaturaConAnnuncio } from "@/lib/types";
import {
  NOTA_RITIRATA,
  STATO_BADGE,
  STATO_LABEL,
  puoRitirare,
  raggruppaCandidature,
  riepilogoCandidature,
} from "@/lib/candidature";
import { RitiraCandidatura } from "@/components/RitiraCandidatura";
import { PageContainer } from "@/components/ui/PageContainer";
import { messaggioMotivoRifiuto } from "@/lib/motivi-rifiuto";
import { IconChat } from "@/components/icons";

export function CandidatureClient({
  candidature,
}: {
  candidature: CandidaturaConAnnuncio[];
}) {
  const router = useRouter();
  const [selezionata, setSelezionata] = useState<CandidaturaConAnnuncio | null>(
    null
  );

  const { inAttesa, accettate, rifiutate, ritirate } = raggruppaCandidature(candidature);

  return (
    <PageContainer wide>
      <h1 className="screen-title">I tuoi match</h1>
      <p className="screen-sub">
        {riepilogoCandidature(candidature)}
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
          {ritirate.length > 0 && (
            <Gruppo titolo="Ritirate" items={ritirate} onSelect={setSelezionata} />
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
              <>
                <div className="note-box mt-5">
                  Il proprietario non ha ancora valutato questa candidatura.
                </div>
                {puoRitirare(selezionata.status) && (
                  <RitiraCandidatura
                    key={selezionata.id}
                    candidaturaId={selezionata.id}
                    titolo={selezionata.listings?.titolo ?? null}
                    onFatto={() => {
                      setSelezionata(null);
                      router.refresh();
                    }}
                  />
                )}
              </>
            )}
            {selezionata.status === "ritirata" && (
              <div className="note-box mt-5">{NOTA_RITIRATA}</div>
            )}
            {selezionata.status === "rifiutata" && (
              <div className="note-box mt-5">
                {messaggioMotivoRifiuto(selezionata.motivo_rifiuto)}
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
      <div className="card-grid">
        {items.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className="match-card"
            style={c.status === "rifiutata" || c.status === "ritirata" ? { opacity: 0.55 } : undefined}
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
